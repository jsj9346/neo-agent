/**
 * 세션 행 CRUD — `docs/SESSION-STORE.md` §5.
 *
 * 저장소가 세션에 대해 아는 것은 계보·워크스페이스·시스템 프롬프트·모델까지다.
 * 프롬프트 내용의 의미도, 프로바이더도 모른다(§1).
 */

import type { DatabaseSync } from "node:sqlite";
import { integerParam, textParam } from "./bind.ts";

export interface StoredSession {
  id: string;
  title: string | null;
  workspaceRoot: string;
  systemPrompt: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  parentSessionId: string | null;
}

/**
 * 생성 시 호출자가 정하는 것만. `id`는 저장소가 발급하고, 시각은 지금이고,
 * `title`은 첫 `UserMessage`에서 나중에 채우고, `parentSessionId`는 v1에서 NULL이다.
 */
export type SessionInit = Omit<
  StoredSession,
  "id" | "createdAt" | "updatedAt" | "title" | "parentSessionId"
>;

/** `listSessions`가 limit 없이 불렸을 때. SQLite에서 음수 LIMIT은 "제한 없음"이다 */
const NO_LIMIT = -1;

const SESSION_COLUMNS = `
  id, title, workspace_root, system_prompt, model, created_at, updated_at, parent_session_id
`;

/**
 * **superseded 제외** — 다른 세션의 `parent_session_id`로 참조되는 세션은 압축으로
 * 대체된 것이며 `listSessions`·`resolveSessionId`에서 빠진다(§5, `COMPACTION.md` §6).
 * 자식의 `active` 여부와 무관하다 — 대체는 구조적 사실이라 자식을 soft-delete해도
 * 부모가 목록에 재등장하지 않는다. 그래서 아래 서브쿼리는 `child.active`를 보지 않는다.
 *
 * **조회 조건이지 사후 필터가 아니다.** `resolveSessionId`가 모호 판정을 위해
 * `LIMIT 2`로 후보를 세므로, 결과를 받아 놓고 걸러내면 superseded 부모가 자리를
 * 차지해 **살아 있는 세션 하나가 "모호"로 거부된다.** `listSessions(limit)`도 같은
 * 이유로 자리를 잃는다. 두 경우 모두 사용자에게는 멀쩡한 세션이 사라지거나 열리지
 * 않는 것으로 보인다 — SQL 안에 두는 것이 계약의 요구다.
 *
 * `sessions.` 접두는 바깥 쿼리의 테이블을 가리킨다(안쪽은 `child`로 별칭을 준다).
 */
const NOT_SUPERSEDED = `
  NOT EXISTS (SELECT 1 FROM sessions child WHERE child.parent_session_id = sessions.id)
`;

/**
 * 세션을 만들고 그 행을 돌려준다.
 *
 * `workspaceRoot`는 **realpath여야 한다** — 재개 검증이 이 값과 현재 워크스페이스를
 * 비교하므로(§5), 심링크가 섞인 경로를 저장하면 같은 디렉터리인데도 재개가 막힌다.
 * 정규화 책임은 호출자에 있다(도구 쪽 `WorkspaceBoundary.root`가 이미 동결된 realpath다).
 */
export function createSession(db: DatabaseSync, init: SessionInit): StoredSession {
  // 형식은 `crypto.randomUUID()` — Node 24의 Web Crypto 전역이라 임포트가 없다(§3).
  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO sessions
       (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 1)`,
  ).run(
    textParam(id, "sessions.id"),
    integerParam(now, "sessions.created_at"),
    integerParam(now, "sessions.updated_at"),
    textParam(init.workspaceRoot, "sessions.workspace_root"),
    textParam(init.systemPrompt, "sessions.system_prompt"),
    textParam(init.model, "sessions.model"),
  );

  return {
    id,
    title: null,
    workspaceRoot: init.workspaceRoot,
    systemPrompt: init.systemPrompt,
    model: init.model,
    createdAt: now,
    updatedAt: now,
    // v1에서 항상 NULL. 압축을 세션 분기로 구현할 때 채워진다(§2).
    parentSessionId: null,
  };
}

/**
 * 최근 갱신 순. `active = 0`은 목록에서 빠진다 — `sessions_recent` 인덱스와 같은
 * 순서다. superseded 부모도 빠진다(`NOT_SUPERSEDED` 주석 참조).
 */
export function listSessions(db: DatabaseSync, limit?: number): StoredSession[] {
  const bound = limit === undefined ? NO_LIMIT : integerParam(limit, "limit");
  const rows = db
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sessions
        WHERE active = 1 AND ${NOT_SUPERSEDED}
        ORDER BY updated_at DESC, id
        LIMIT ?`,
    )
    .all(bound);
  return rows.map(toStoredSession);
}

/**
 * id로 세션 하나. 없으면 `undefined`.
 *
 * **여기서는 `active`도 superseded도 거르지 않는다.** 목록·접두 해석의 제외는
 * "목록 제외 ≠ 접근 봉쇄"이며(§5), 전체 id를 아는 호출자에게는 열려 있어야 한다 —
 * soft-delete된 세션의 복구 경로이자 압축 부모의 열람 경로다.
 */
export function getSession(db: DatabaseSync, id: string): StoredSession | undefined {
  const row = db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`)
    .get(textParam(id, "sessions.id"));
  return row === undefined ? undefined : toStoredSession(row);
}

/**
 * git 스타일 접두 매칭. **모호하면 throw — 조용히 하나를 고르지 않는다**(§5).
 *
 * `LIKE`를 쓰지 않는 이유: 세션 id는 UUID지만 접두는 사용자 입력이고, `LIKE`에서
 * `_`는 임의의 한 글자에 매칭되는 와일드카드다. `a_c`가 `abc`를 찾아내면 그것은
 * 접두 매칭이 아니다. `substr` 비교에는 와일드카드가 없다.
 *
 * **입력은 소문자로 정규화한 뒤 매칭한다**(§5, 2026-08-06 확정). id는
 * `crypto.randomUUID()`의 소문자 hex뿐이라 정규화에 정보 손실이 없고, UUID 표기의
 * 대소문자는 구별 의미가 없다(RFC 9562). 대문자화된 접두를 거부하면 복사 과정에서
 * 대문자가 된 id를 이유 없이 막는다.
 *
 * 정규화는 **입력에만** 적용한다 — 저장 측(`lower(id)`)은 건드리지 않는다. id는
 * 발급 시점부터 소문자이므로 양쪽을 내리면 인덱스만 못 쓰게 되고, 대문자 id가
 * 존재한다는 계약에 없는 전제를 코드가 스스로 만들어 낸다.
 *
 * **`active = 0`인 세션은 후보에서 뺀다**(§5 "삭제된 세션은 listSessions·
 * resolveSessionId에서 제외"). 이전 구현은 반대로("`active` 여부로 거르지 않는다")
 * 주석에 명시하고 있었으나, 그 근거(지워진 세션의 접두가 "없는 세션"으로 보인다)는
 * 문서 개정으로 재론할 사안이고 현행 정본은 제외다.
 *
 * **superseded 부모도 같은 자리에서 뺀다** — 사후 필터가 아니라 `LIMIT 2` **이전의**
 * 조회 조건이어야 하는 이유는 `NOT_SUPERSEDED` 주석에 있다.
 */
export function resolveSessionId(db: DatabaseSync, prefix: string): string {
  // 길이는 정규화 **후**에 센다. `toLowerCase()`는 길이를 바꿀 수 있고(예: "İ"),
  // 그때 원본 길이로 `substr`를 자르면 비교 대상이 어긋난다.
  const needle = textParam(prefix, "prefix").toLowerCase();

  const rows = db
    .prepare(
      `SELECT id FROM sessions
        WHERE active = 1 AND ${NOT_SUPERSEDED} AND substr(id, 1, ?) = ?
        ORDER BY id LIMIT 2`,
    )
    .all(integerParam(needle.length, "prefix length"), needle);

  const first = rows[0];
  if (first === undefined) {
    throw new Error(`No session matches "${prefix}".`);
  }
  if (rows.length > 1) {
    throw new Error(
      `Session prefix "${prefix}" is ambiguous — it matches more than one session. Use more characters.`,
    );
  }
  return requireText(first, "id");
}

/**
 * 세션 soft-delete — `sessions.active = 0`(§5). **물리 삭제가 아니다.**
 *
 * 행이 남는 것이 계약의 내용 그 자체다: 물리 삭제 시점은 §9 미결이고, 행이 사라지면
 * 그 미결이 성립할 수 없다. 삭제된 세션은 `listSessions`·`resolveSessionId`에서 빠진다.
 *
 * **세부 의미론 셋은 §5가 정한다** — 메시지 행 불변(`messages.active`), 없는 id·이미
 * 삭제된 id의 no-op, `updated_at` 미갱신. 근거는 거기 있으므로 여기서 되풀이하지
 * 않는다(두 곳에 두면 한쪽만 고쳐질 때 갈라진다).
 *
 * 셋 다 한때 이 자리에 열린 물음으로 달려 있었고 §5가 확정했으나, 답만 문서에 적히고
 * 물음은 남아 있던 것을 2026-08-12에 걷었다.
 *
 * 계약에 없어서 여기 남기는 구현 사실 하나 — **no-op은 분기가 아니라 UPDATE가 0행에
 * 닿는 것으로 성립한다.** 없는 id와 이미 삭제된 id를 코드가 따로 구분하지 않는다는
 * 뜻이고, 그래서 §5가 둘을 한 규칙으로 묶은 것이 구현에서도 한 줄이다.
 */
export function deleteSession(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE sessions SET active = 0 WHERE id = ?").run(textParam(id, "sessions.id"));
}

function toStoredSession(row: unknown): StoredSession {
  return {
    id: requireText(row, "id"),
    title: optionalText(row, "title"),
    workspaceRoot: requireText(row, "workspace_root"),
    systemPrompt: requireText(row, "system_prompt"),
    model: requireText(row, "model"),
    createdAt: requireInteger(row, "created_at"),
    updatedAt: requireInteger(row, "updated_at"),
    parentSessionId: optionalText(row, "parent_session_id"),
  };
}

/**
 * DB에서 나온 행은 외부 입력처럼 다룬다(§2의 Zod 검증과 같은 방향). 여기서
 * 조용히 `undefined`를 통과시키면 `StoredSession`의 타입이 거짓말이 된다.
 */
function column(row: unknown, name: string): unknown {
  return (row as Record<string, unknown>)[name];
}

function requireText(row: unknown, name: string): string {
  const value = column(row, name);
  if (typeof value !== "string") {
    throw new Error(`Corrupt session row: ${name} should be TEXT, got ${describe(value)}.`);
  }
  return value;
}

function optionalText(row: unknown, name: string): string | null {
  const value = column(row, name);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Corrupt session row: ${name} should be TEXT or NULL, got ${describe(value)}.`);
  }
  return value;
}

function requireInteger(row: unknown, name: string): number {
  const value = column(row, name);
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Corrupt session row: ${name} should be INTEGER, got ${describe(value)}.`);
  }
  return value;
}

function describe(value: unknown): string {
  return value === null ? "NULL" : `${typeof value} ${JSON.stringify(value)}`;
}
