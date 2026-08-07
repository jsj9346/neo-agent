/**
 * 스키마 v3 백필 — 기존 `messages` 전량을 검색 인덱스에 채운다 (`docs/SEARCH.md` §2).
 *
 * 마이그레이션 v3의 **코드 단계**다. DDL이 만드는 것은 빈 FTS 테이블뿐이고, 여기서
 * body 파싱 → Zod 검증 → §3 추출 → INSERT를 수행한다. SQL로 표현할 수 없는 이유는
 * `body`가 JSON 통짜이기 때문이다(§2) — 트리거로 추출하려 들면 메시지 계약이 TS와
 * 트리거 SQL 두 곳에 존재하게 된다.
 *
 * **호출자가 연 트랜잭션 안에서 실행된다**(`migrate.ts`의 `applyMigration`). 여기서
 * 트랜잭션을 열거나 닫지 않는다 — "각 마이그레이션은 트랜잭션 하나"(SESSION-STORE §2)가
 * 성립하려면 DDL과 백필이 같은 `BEGIN`~`COMMIT` 안에 있어야 한다.
 */

import type { DatabaseSync } from "node:sqlite";
import { agentMessageSchema } from "@neo-agent/core";
import { textParam } from "./bind.ts";
import { extractSearchText, INSERT_SEARCH_ROW_SQL } from "./extract.ts";

/**
 * 손상 행 통지 — 값으로 모아 두고 호출자가 **커밋 성공 후에** 내보낸다.
 *
 * 트랜잭션 안에서 바로 핸들러를 부르지 않는 이유: 이후 단계가 실패해 롤백되면
 * 아무 행도 실제로 건너뛰어지지 않았는데 "손상 행을 색인에서 뺐다"는 통지만 남는다.
 * 일어나지 않은 일을 보고하는 것은 침묵 유실의 거울상이다.
 */
export interface SkippedRow {
  sessionId: string;
  messageId: string | null;
  seq: number;
  reason: string;
}

interface MessageRow {
  id: unknown;
  session_id: unknown;
  seq: unknown;
  body: unknown;
}

/**
 * `messages` 전량을 `messages_fts`에 색인하고, 읽을 수 없어 건너뛴 행을 돌려준다.
 *
 * **모든 행을 읽는다 — `active`로 거르지 않는다.** 색인은 대칭이고(messages 행 ⇔ FTS
 * 후보) 제외는 검색 쿼리의 책임이다(§3·§4). 백필이 미리 걸러 내면 그 대칭이 깨져
 * 재구축 로직에 분기가 생기고, soft-delete를 되돌리는 경로가 생겼을 때 인덱스가
 * 비어 있게 된다.
 *
 * **읽기 순서를 `(session_id, seq)`로 고정한다.** `messages_session_seq`가 그 쌍에
 * UNIQUE라 전순서이며, 같은 입력이면 삽입 순서(rowid)까지 같은 인덱스가 나온다.
 * 순서를 놓아 두면 bm25가 동점 문서를 rowid로 가르는 탓에 **같은 질의의 결과 순서가
 * DB마다 달라진다** — 사용자에게는 검색이 재현 불가능해 보인다. FTS가 "원본에서
 * 언제든 재구축 가능한 파생 데이터"(§1)라는 성격도 결정성을 요구한다.
 */
export function backfillSearchIndex(db: DatabaseSync): SkippedRow[] {
  const rows = db
    .prepare(
      `SELECT id, session_id, seq, body FROM messages
        ORDER BY session_id, seq`,
    )
    .all() as unknown as MessageRow[];

  // `indexMessage`(저장 경로)와 **같은 INSERT 문장**을 쓴다 — 컬럼 순서가 두 경로에서
  // 어긋날 자리를 만들지 않는다. 여기서 함수가 아니라 문장 상수를 재사용하는 이유는
  // 수백 행을 도는 루프라 prepare를 한 번만 하기 위해서다.
  const insert = db.prepare(INSERT_SEARCH_ROW_SQL);

  const skipped: SkippedRow[] = [];

  for (const row of rows) {
    const sessionId = typeof row.session_id === "string" ? row.session_id : "(unknown)";
    const seq = typeof row.seq === "number" ? row.seq : -1;

    // [미규정 ES-32] QA-A **A-3(백필의 NULL id 처리)은 실측으로 닫힌다** — 그런 행은
    // 존재할 수 없다. `STRICT` 테이블은 PK 열에 NOT NULL을 강제하며, 이 예외가
    // 비STRICT 테이블에만 적용된다는 것을 SQLite 3.51.1에서 확인했다(표는
    // `schema.sql.ts`의 E-21). `messages`는 v1부터 STRICT였으므로 v1·v2 어느 DB에도
    // NULL id 행이 없다.
    //
    // 그럼에도 분기를 남기는 이유는 **SQLite 행이 TS 경계에서 `unknown`이기 때문**이다.
    // 타입을 좁히는 일은 어차피 해야 하고, 좁히다 실패했을 때 조용히 NULL을 색인하는
    // 것보다는 통지가 낫다 — 색인된 NULL은 검색 결과의 `messageId`를 NULL로 만들고
    // §4의 "같은 id는 1회" dedupe 기준을 무너뜨린다. 도달하지 않는 것이 정상인 가지다.
    const messageId = typeof row.id === "string" ? row.id : null;
    if (messageId === null) {
      skipped.push({
        sessionId,
        messageId: null,
        seq,
        reason: "id 컬럼이 문자열이 아니다 (NULL이거나 타입이 어긋난다)",
      });
      continue;
    }

    if (typeof row.body !== "string") {
      skipped.push({ sessionId, messageId, seq, reason: "body 컬럼이 TEXT가 아니다" });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.body);
    } catch (error) {
      skipped.push({
        sessionId,
        messageId,
        seq,
        reason: `body가 올바른 JSON이 아니다 — ${(error as Error).message}`,
      });
      continue;
    }

    // 검증은 **코어가 공개한 `agentMessageSchema`** 하나를 쓴다 — `load.ts`의 행 파싱과
    // 같은 스키마다. 실패 시의 처리만 다르다(그쪽은 던지고 여기는 건너뛴다): §7의
    // 폭발 반경이 "그 세션을 열지 못한다"까지이고, 백필은 DB 전체가 걸린 자리다.
    const result = agentMessageSchema.safeParse(parsed);
    if (!result.success) {
      skipped.push({
        sessionId,
        messageId,
        seq,
        reason: `body가 올바른 AgentMessage가 아니다 — ${result.error.message}`,
      });
      continue;
    }

    const text = extractSearchText(result.data);
    // 색인 대상이 아닌 메시지(도구 결과·이미지만·도구 호출만)는 손상이 아니다.
    // 통지하지 않고 조용히 넘어가는 것이 정상 경로다 — §3의 대칭이 그렇게 정의된다.
    if (text === undefined) continue;

    insert.run(
      textParam(text, "messages_fts.text"),
      textParam(sessionId, "messages_fts.session_id"),
      textParam(messageId, "messages_fts.message_id"),
    );
  }

  return skipped;
}
