/**
 * 메시지 쓰기 — `docs/SESSION-STORE.md` §4.
 *
 * **여기가 `body`·`role`·`timestamp`·`id`를 만드는 유일한 지점이다.** §2가 정한
 * 단방향 파생("`body`가 정본이고 두 컬럼은 사본이다")은 규약으로 지킬 수 없다 —
 * 컬럼만 갱신하는 다른 경로가 존재하면 언젠가 어긋난다. 그래서 파생은 이 파일의
 * `appendMessage` 한 함수 안에서만 일어나고, 컬럼을 개별로 쓰는 공개 함수를 두지
 * 않는다.
 */

import type { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@neo-agent/core";
import { integerParam, textParam } from "./bind.ts";
import { indexMessage } from "./extract.ts";

/**
 * 세션 title의 최대 길이. 모델 요약은 API 호출 비용이 붙어 MVP에서 뺐고(§2),
 * 첫 사용자 발화의 앞부분을 그대로 쓴다.
 */
const TITLE_MAX_LENGTH = 60;

/**
 * 메시지 한 건을 트랜스크립트 끝에 붙인다. 이미 있는 id면 아무 일도 하지 않는다.
 *
 * INSERT와 `sessions.updated_at`·`title` UPDATE는 **한 트랜잭션**이다(§4). 나누면
 * "메시지는 없는데 세션은 갱신된" 상태가 남고, 목록 화면에서 방금 대화한 것처럼
 * 보이지만 열면 비어 있는 세션이 된다.
 *
 * 실패는 삼키지 않는다(§7) — 호출자(리스너)로 그대로 던져 런이 실패하게 한다.
 * 저장이 안 되는데 대화가 계속되면 사용자는 저장된 줄 안다.
 *
 * @returns 실제로 행이 생겼으면 true, 이미 있어 무시됐으면 false
 */
export function appendMessage(db: DatabaseSync, sessionId: string, message: AgentMessage): boolean {
  // 파생은 여기 한 곳. 세 값이 전부 같은 객체에서 나오므로 어긋날 수가 없다.
  const body = JSON.stringify(message);

  // `BEGIN IMMEDIATE`는 쓰기 잠금을 즉시 잡는다. 지연 트랜잭션이면 잠금 승격
  // 시점에 `SQLITE_BUSY`가 나고 `busy_timeout`이 그 경우를 돕지 못한다 —
  // 두 터미널 동시 실행(§6)을 대비한 선택이다.
  db.exec("BEGIN IMMEDIATE");
  try {
    const seq = nextSeq(db, sessionId);

    // `INSERT OR IGNORE` — 중복 방지가 규약이 아니라 구조다(§3). `agent_end`·
    // `turn_end`를 실수로 함께 구독해도 데이터 손상이 아니라 무해한 no-op이 된다.
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO messages (id, session_id, seq, role, timestamp, body, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        textParam(message.id, "messages.id"),
        textParam(sessionId, "messages.session_id"),
        integerParam(seq, "messages.seq"),
        textParam(message.role, "messages.role"),
        integerParam(message.timestamp, "messages.timestamp"),
        textParam(body, "messages.body"),
      ).changes;

    // 무시된 INSERT는 아무 일도 없었던 것이다 — 세션까지 갱신하면 "새 대화가
    // 있었다"는 거짓 신호가 목록 화면에 뜬다. `seq`도 이 경로에서는 소비되지
    // 않으므로 다음 메시지가 같은 번호를 받아 구멍이 생기지 않는다.
    if (inserted === 0) {
      db.exec("COMMIT");
      return false;
    }

    // 검색 색인은 **같은 트랜잭션**이다(`SEARCH.md` §3). 메시지는 저장됐는데 색인만
    // 빠진 상태가 침묵 드리프트이고, 같은 트랜잭션에 두면 인덱스 드리프트가 구조적으로
    // 불가능해진다 — 별도 동기화 절차·트리거·재색인 데몬이 전부 불필요해지는 것이
    // 이 한 줄의 위치가 사는 이유다.
    //
    // 무시된 INSERT(`inserted === 0`)가 위에서 이미 돌아갔으므로 여기는 **행이 실제로
    // 생긴 경로뿐이다.** 중복 id로 재호출됐을 때 FTS만 늘어나면 재구독 한 번에 검색
    // 결과가 중복된다 — `messages` 행과 FTS 행의 대칭은 멱등에서도 유지된다.
    //
    // 실패는 잡지 않는다. 아래 `catch`가 롤백하고 그대로 던지므로 색인 실패는 저장
    // 트랜잭션 전체의 실패가 된다(§3·§6, SESSION-STORE §7).
    indexMessage(db, sessionId, message);

    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(
      integerParam(Date.now(), "sessions.updated_at"),
      textParam(sessionId, "sessions.id"),
    );

    // title이 아직 없으면 첫 사용자 발화에서 만든다(§2). `title IS NULL` 조건이
    // "첫 UserMessage로만 정해진다"를 SQL 수준에서 보장한다 — 애플리케이션에서
    // 먼저 조회해 판단하면 같은 트랜잭션 밖의 경합이 생긴다.
    if (message.role === "user") {
      const title = deriveTitle(message);
      if (title !== undefined) {
        db.prepare("UPDATE sessions SET title = ? WHERE id = ? AND title IS NULL").run(
          textParam(title, "sessions.title"),
          textParam(sessionId, "sessions.id"),
        );
      }
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    // 롤백 자체의 실패가 원인을 덮어쓰지 않게 한다.
    try {
      db.exec("ROLLBACK");
    } catch {
      // 트랜잭션이 이미 자동 중단됐거나 DB가 닫혔다. 원인 에러를 그대로 던진다.
    }
    throw error;
  }
}

/**
 * 다음 트랜스크립트 순서. **쓰기 트랜잭션 안에서** `MAX(seq)+1`로 발급한다(§2) —
 * 밖에서 읽으면 두 프로세스가 같은 번호를 받는다.
 *
 * `active = 0` 행도 센다. `seq`는 "지금 보이는 목록에서 몇 번째인가"가 아니라
 * 트랜스크립트에서의 위치이고, soft-delete된 자리를 재사용하면 유니크 인덱스와
 * 충돌한다.
 */
function nextSeq(db: DatabaseSync, sessionId: string): number {
  const row = db
    .prepare("SELECT MAX(seq) AS maxSeq FROM messages WHERE session_id = ?")
    .get(textParam(sessionId, "messages.session_id"));
  const maxSeq = (row as { maxSeq?: unknown } | undefined)?.maxSeq;
  return typeof maxSeq === "number" ? maxSeq + 1 : 1;
}

/**
 * 첫 사용자 발화의 앞부분. 텍스트 블록이 하나도 없으면(이미지만 보낸 경우)
 * `undefined`를 돌려 title을 비워 둔다 — 다음 사용자 발화가 채운다.
 */
function deriveTitle(message: AgentMessage): string | undefined {
  const text = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    // 줄바꿈이 섞인 프롬프트가 목록 한 줄을 깨뜨리지 않게 공백을 접는다.
    .replace(/\s+/g, " ")
    .trim();

  if (text.length === 0) return undefined;
  return text.length <= TITLE_MAX_LENGTH ? text : `${text.slice(0, TITLE_MAX_LENGTH)}…`;
}
