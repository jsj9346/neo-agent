/**
 * 압축 분기 — `docs/SESSION-STORE.md` §5 `branchSession`, `docs/COMPACTION.md` §2·§6.
 *
 * **압축은 과거를 고쳐 쓰지 않는다**(COMPACTION 머리). 이 파일의 어떤 문장도 부모
 * 세션의 행을 UPDATE하지 않는다 — `updated_at` 갱신도, `active` 변경도 없다. 분기의
 * 산출물은 언제나 새 세션이고, 부모가 목록에서 사라지는 것은 **부모를 표시해서가
 * 아니라** 자식이 `parent_session_id`로 부모를 가리키기 때문이다(구조적 사실).
 * superseded 판정을 컬럼으로 두지 않은 것이 그래서 중요하다 — 표시할 것이 없으면
 * 표시가 새어 부모를 변조하는 경로도 없다.
 *
 * **한 트랜잭션이다**(§6): 자식 세션 행 + 요약(seq 1) + 유지 복사가 전부 반영되거나
 * 전부 안 된다. 반쯤 분기된 세션은 손상이다.
 */

import type { DatabaseSync } from "node:sqlite";
import type { AgentMessage, UserMessage } from "@neo-agent/core";
import { integerParam, textParam } from "./bind.ts";
import { indexMessage } from "./extract.ts";
import { getSession, type StoredSession } from "./sessions.ts";

/**
 * 분기의 재료 — §5 시그니처 그대로.
 *
 * `systemPrompt`·`model`이 인자인 이유는 분기가 **새 세션의 시작**이기 때문이다.
 * 부모의 값을 복사하면 압축을 계기로 모델을 바꾸는 경로가 막힌다. 반대로
 * `workspaceRoot`·`title`은 부모에서 복사한다 — 같은 워크스페이스의 같은 대화가
 * 이어지는 것이므로 호출자가 정할 값이 아니다.
 */
export interface SessionBranch {
  /** 코어 `createUserMessage`로 만든 합성 요약. 자식의 seq 1이 된다 */
  summaryMessage: UserMessage;
  /** 부모에서 **id 그대로** — 메시지 동일성 보존(COMPACTION §2) */
  keptMessages: readonly AgentMessage[];
  systemPrompt: string;
  model: string;
}

/**
 * 부모 세션에서 자식 세션을 분기하고 자식 행을 돌려준다.
 *
 * 자식 트랜스크립트는 `[요약, ...keptMessages]`이며 `seq`는 1부터 배열 순서대로
 * **재발급**된다. id는 보존하고 seq는 재발급하는 비대칭이 계약의 핵심이다 —
 * **id가 동일성이고 seq는 세션 내 위치**다(§2). 유지 메시지가 부모에서 5·6·7번째였다
 * 해도 자식에서는 2·3·4번이다.
 */
export function branchSession(
  db: DatabaseSync,
  parentId: string,
  branch: SessionBranch,
): StoredSession {
  // `keptMessages`가 실제로 부모에 있는 메시지인지 **검증하지 않는다** — SESSION-STORE
  // §5 `branchSession`의 세부 의미론이 정한다(판정 E-31 / QA-B B-9). 검사 규칙을 세울
  // 수도 없다는 것이 그 근거다 — `summaryMessage`부터가
  // 정의상 부모에 없는 합성 메시지이므로 "부모에 있어야 한다"는 규칙은 같은 트랜잭션
  // 안에서 스스로 모순된다. §5의 태도("저장소는 코어가 보장한 것을 재검증하지
  // 않는다")와도 결이 같다. 부모에 없는 메시지가 섞여도 유실되는 것은 없다 — 자식이
  // 그 메시지를 갖게 될 뿐이고, 그것은 압축 계획을 만든 쪽의 책임이다.
  const parent = requireBranchableParent(db, parentId);

  // `keptMessages`가 빈 배열이면 거부한다 — SESSION-STORE §5가 정한다
  // (판정 E-24 / QA-B B-7). 허용하면
  // 요약만 실린 자식이 만들어지고, 사용자에게는 **대화 전체가 요약 한 줄로 사라진
  // 것**과 구별되지 않는다 — 침묵 유실의 형상이다(ARCHITECTURE §2.6). 정상 경로가
  // 이 형상을 만들지도 않는다: `planCompaction`의 cut은 뒤에서 K번째 user 경계이므로
  // 유지 구간에 최소 그 user 메시지 하나가 남고, 남길 것이 없으면 `not-possible`로
  // 끝나 분기 자체에 도달하지 않는다(COMPACTION §4). 즉 빈 배열은 호출자의 결함이며
  // 결함은 조용히 성공하는 것보다 거부되는 편이 낫다.
  if (branch.keptMessages.length === 0) {
    throw new Error(
      `Cannot branch session ${parentId} with an empty kept-message list — ` +
        "the child would consist of nothing but the summary, which a user cannot tell apart " +
        "from having lost the conversation. Compaction keeps at least the most recent user turn.",
    );
  }

  const id = crypto.randomUUID();

  // 자식의 `created_at`·`updated_at`은 **분기 시각**이다 — SESSION-STORE §5가 정한다
  // (판정 E-25 / QA-B B-11). 부모 복사를 택하지 않은 근거 둘: (1) 자식은 방금 만들어진
  // 행이므로 "생성 시각"의 사실이 지금이고, (2) `listSessions`가 `updated_at DESC`
  // 정렬이라 부모 값을 복사하면 **방금 압축한 세션이 목록 아래에 묻힌다** — 압축
  // 직후 `/sessions`를 연 사용자가 자기 대화를 찾지 못한다. 부모의 시각은 부모 행에
  // 그대로 남아 있으므로 이력이 유실되지도 않는다.
  const now = Date.now();

  // `BEGIN IMMEDIATE`는 쓰기 잠금을 즉시 잡는다 — 지연 트랜잭션이면 잠금 승격
  // 시점에 `SQLITE_BUSY`가 나고 `busy_timeout`이 그 경우를 돕지 못한다
  // (`messages.ts`의 같은 선택과 같은 근거).
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO sessions
         (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      textParam(id, "sessions.id"),
      integerParam(now, "sessions.created_at"),
      integerParam(now, "sessions.updated_at"),
      // title은 부모에서 복사한다(§5). 첫 UserMessage 자동 제목 규칙을 쓰면 자식의
      // 첫 메시지가 요약이므로 **제목이 요약문이 된다** — 목록에서 대화를 알아볼 수
      // 없게 된다. 이 경로가 `appendMessage`를 지나지 않는 것이 그 규칙을 구조적으로
      // 차단한다(규약이 아니라 구조).
      parent.title === null ? null : textParam(parent.title, "sessions.title"),
      textParam(parent.workspaceRoot, "sessions.workspace_root"),
      textParam(branch.systemPrompt, "sessions.system_prompt"),
      textParam(branch.model, "sessions.model"),
      textParam(parentId, "sessions.parent_session_id"),
    );

    // 메시지 삽입은 **`INSERT OR IGNORE`가 아니라 일반 INSERT다** — SESSION-STORE §5가
    // 정한다(판정 E-26 / QA-B B-8). `summaryMessage.id`가 유지 메시지와 충돌하거나 `keptMessages`
    // 안에 중복 id가 있으면 v2 PK `(session_id, id)`가 거부하고 분기 전체가
    // 롤백된다. `OR IGNORE`를 쓰면 **자식 트랜스크립트가 조용히 한 건 짧아진다** —
    // 안내 없는 유실이고, 그 세션은 이후 계속 그 상태로 재개된다.
    // `messages.ts`가 `OR IGNORE`를 쓰는 것과 상충하지 않는다: 거기서 멱등은
    // 이벤트를 두 번 구독해도 무해하게 만드는 **구독 계약의 요구**(§4)이고, 여기
    // 입력은 이벤트가 아니라 호출자가 한 번 건네는 목록이라 중복은 결함이다.
    const insert = db.prepare(
      `INSERT INTO messages (id, session_id, seq, role, timestamp, body, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );

    // 복사된 유지 메시지의 `active`는 항상 1이다 — SESSION-STORE §5가 정한다
    // (판정 E-27 / QA-B B-10). 입력이 `AgentMessage`라 `active`를 실어 오지 않아 값을
    // 정할 근거가 입력에 없고, §5가 `loadSession`은 `active = 1`만 돌려준다고 정했으므로 0으로 쓰면
    // 자식이 열자마자 유지 구간을 잃는다. 정상 경로에서도 `keptMessages`는
    // `loadSession`이 걸러낸 활성 행에서 오므로 1이 사실과 일치한다.
    let seq = 1;
    for (const message of [branch.summaryMessage, ...branch.keptMessages]) {
      insert.run(
        textParam(message.id, "messages.id"),
        textParam(id, "messages.session_id"),
        integerParam(seq, "messages.seq"),
        textParam(message.role, "messages.role"),
        integerParam(message.timestamp, "messages.timestamp"),
        // `body`가 정본이고 `role`·`timestamp`는 거기서 뽑은 사본이라는 단방향
        // 파생(§2)은 여기서도 같다 — 세 값이 전부 같은 객체에서 나온다.
        textParam(JSON.stringify(message), "messages.body"),
      );

      // 요약과 유지 복사를 **자식 세션 행으로** 색인한다(`SEARCH.md` §3). 같은 id의
      // 메시지가 부모·자식 양쪽 FTS에 존재하게 되는데 그것이 정상이다 — 중복 제거는
      // 저장이 아니라 **검색 쿼리의 책임**이고(§4), 색인 쪽에 예외를 두면 "messages
      // 행과 FTS 행의 대칭"이 깨져 재구축 로직에 분기가 생긴다.
      //
      // 압축 요약도 여기를 그냥 지난다 — 합성 `UserMessage`라 콘텐츠 기준 판정에
      // 자동으로 걸린다(§3). 요약을 특별 취급하는 분기를 두면 압축이 역할을 신설하지
      // 않기로 한 근거가 색인 쪽에서 무너진다.
      indexMessage(db, id, message);

      seq += 1;
    }

    db.exec("COMMIT");
  } catch (error) {
    // 롤백 자체의 실패가 원인을 덮어쓰지 않게 한다.
    try {
      db.exec("ROLLBACK");
    } catch {
      // 트랜잭션이 이미 자동 중단됐거나 DB가 닫혔다. 원인 에러를 그대로 던진다.
    }
    throw error;
  }

  return {
    id,
    title: parent.title,
    workspaceRoot: parent.workspaceRoot,
    systemPrompt: branch.systemPrompt,
    model: branch.model,
    createdAt: now,
    updatedAt: now,
    parentSessionId: parentId,
  };
}

interface ParentState {
  active: number;
  superseded: number;
}

/**
 * 분기의 출발점이 될 수 있는 부모인지 확인한다. **트랜잭션 시작 전에** 판정하므로
 * 거부는 DB를 전혀 건드리지 않는다.
 *
 * 세 거부 모두 SESSION-STORE §5가 정하며(첫 불릿), 셋 다 정상 경로에서는 발생하지 않고
 * 발생했다면 호출자의 결함이라는 같은 성격이다. CLI는 언제나 지금 열려 있는 세션
 * (체인의 tip)에서 분기한다.
 */
function requireBranchableParent(db: DatabaseSync, parentId: string): StoredSession {
  const parent = getSession(db, parentId);

  // 아래 세 거부는 각각 E-28·E-29·E-30이며 QA-B의 B-4·B-6·B-5에 대응한다.

  // 없는 `parentId`는 **진단 가능한 저장소 에러로 감싼다** — §5가 정한다
  // (판정 E-28 / QA-B B-4).
  // `sessions.parent_session_id`의 FK가 켜져 있어 거부 자체는 구조적으로 보장되지만,
  // FK 위반이 그대로 새면 사용자가 보는 것은 "FOREIGN KEY constraint failed" 한 줄
  // 이고 **어느 id가 문제인지조차 없다**. 진단 불가능한 실패는 침묵 실패와 같은
  // 문제를 남긴다는 것이 §7·`load.ts`가 이미 택한 방향이다.
  if (parent === undefined) {
    throw new Error(
      `Cannot branch from session "${parentId}" — no such session. ` +
        "Compaction branches from the session it just read; a missing parent means the caller " +
        "lost track of which session is open.",
    );
  }

  const state = db
    .prepare(
      `SELECT active,
              EXISTS (SELECT 1 FROM sessions child WHERE child.parent_session_id = sessions.id)
                AS superseded
         FROM sessions WHERE id = ?`,
    )
    .get(textParam(parentId, "sessions.id")) as ParentState | undefined;

  // 바로 위에서 행을 읽었으므로 여기서 사라졌다면 동시 삭제다 — 지어내지 않고 던진다.
  if (state === undefined) {
    throw new Error(`Cannot branch from session "${parentId}" — it disappeared while reading it.`);
  }

  // soft-delete된 부모(`active = 0`)에서는 분기하지 않는다 — §5가 정한다
  // (판정 E-29 / QA-B B-6). 허용하는 쪽이면 **지운 대화에서 살아 있는 자식이 태어나고**
  // 그 자식은 목록에 뜨므로, 사용자 눈에는 삭제가 되돌려진 것으로 보인다. 삭제의
  // 의미를 뒤집는 결과라 거부한다. 정상 경로는 열려 있는 세션에서만 분기한다.
  if (state.active !== 1) {
    throw new Error(
      `Cannot branch from session "${parentId}" — it is deleted. ` +
        "Branching would create a live child of a conversation the user removed.",
    );
  }

  // 이미 superseded인 부모에서 다시 분기하지 않는다 — §5가 정한다
  // (판정 E-30 / QA-B B-5).
  // 허용하면 한 부모가 자식 둘을 갖고 **형제 둘이 모두 목록에 남는다** — `COMPACTION`
  // §6이 막으려던 바로 그 형상("같은 대화가 `/sessions`에 두 줄로 보이면 어느 쪽을
  // 재개해야 하는지가 사용자 문제가 된다")이 부모 제외를 우회해 되살아난다. 압축
  // 체인은 선형이라는 것이 §2 그림의 전제이므로, 트리가 되는 입력을 여기서 막는다.
  if (state.superseded !== 0) {
    throw new Error(
      `Cannot branch from session "${parentId}" — it has already been superseded by a compaction. ` +
        "Branch from the newest session in the chain instead; branching twice from the same parent " +
        "would leave two sibling sessions of the same conversation in the list.",
    );
  }

  return parent;
}
