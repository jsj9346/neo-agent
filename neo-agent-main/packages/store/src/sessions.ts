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

/** 최근 갱신 순. `active = 0`은 목록에서 빠진다 — `sessions_recent` 인덱스와 같은 순서다 */
export function listSessions(db: DatabaseSync, limit?: number): StoredSession[] {
  const bound = limit === undefined ? NO_LIMIT : integerParam(limit, "limit");
  const rows = db
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sessions
        WHERE active = 1
        ORDER BY updated_at DESC, id
        LIMIT ?`,
    )
    .all(bound);
  return rows.map(toStoredSession);
}

/** id로 세션 하나. 없으면 `undefined` */
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
 */
export function resolveSessionId(db: DatabaseSync, prefix: string): string {
  // 길이는 정규화 **후**에 센다. `toLowerCase()`는 길이를 바꿀 수 있고(예: "İ"),
  // 그때 원본 길이로 `substr`를 자르면 비교 대상이 어긋난다.
  const needle = textParam(prefix, "prefix").toLowerCase();

  const rows = db
    .prepare(
      "SELECT id FROM sessions WHERE active = 1 AND substr(id, 1, ?) = ? ORDER BY id LIMIT 2",
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
 * [미규정] U-2 — `messages.active`는 건드리지 않는다. §5가 규정한 것은 세션 행의
 * `active`뿐이다. 메시지까지 0으로 내리면 되살리는 경로가 생겼을 때 트랜스크립트가
 * 빈 채로 돌아온다(§7이 "검증 범위는 반환되는 행(`active = 1`)"이라 정했으므로
 * `loadSession`이 아무것도 읽지 않는다). 규정되지 않은 파괴는 하지 않는다.
 *
 * [미규정] U-3·U-4 — 없는 id도, 이미 삭제된 id도 **no-op**이다(UPDATE가 0행에 닿을
 * 뿐). 둘을 한 규칙으로 닫은 근거: 반환이 `void`라 호출자에게 "무엇이 일어났는지"를
 * 알릴 채널이 애초에 없고, §5의 판정 기준("틀린 결과가 나오는가, 비싼 결과가
 * 나오는가")을 적용하면 어느 쪽도 틀린 결과를 만들지 않는다 — 호출 후의 사후 조건
 * ("그 id는 목록·해석에 없다")이 두 경우 모두 이미 성립한다. 던지면 `/delete`를 두 번
 * 누른 사용자가 이유 없이 에러를 본다.
 *
 * [미규정] U-5 — `updated_at`을 갱신하지 않는다. §5는 `active`만 규정한다.
 * `listSessions`가 `updated_at DESC` 정렬이므로 갱신하면 목록 순서가 "마지막 대화
 * 시각"이 아니라 "마지막 삭제 시각"으로 오염된다 — 되살리는 경로가 생기면 드러난다.
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
