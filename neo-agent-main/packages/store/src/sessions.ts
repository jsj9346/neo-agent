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
 * `active` 여부로 거르지 않는다 — 식별은 목록 조회와 다른 일이고, 지워진 세션을
 * 가리키는 접두가 "없는 세션"으로 보이면 그 사실 자체를 알 수 없게 된다.
 * [미규정] 대소문자 처리. 현재는 정확 일치이며, 대문자로 입력한 UUID 접두는 찾지
 * 못한다. 세션 id를 사용자가 손으로 타이핑하는 표면(CLI)이 정해질 때 결정한다.
 */
export function resolveSessionId(db: DatabaseSync, prefix: string): string {
  const needle = textParam(prefix, "prefix");

  const rows = db
    .prepare("SELECT id FROM sessions WHERE substr(id, 1, ?) = ? ORDER BY id LIMIT 2")
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
