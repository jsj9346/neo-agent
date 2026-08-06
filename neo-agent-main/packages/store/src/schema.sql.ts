/**
 * 스키마 v1 DDL — `docs/SESSION-STORE.md` §2 그대로.
 *
 * **컬럼을 임의로 추가하지 않는다.** 이 DDL은 계약이고, 여기서 벗어난 컬럼은
 * 마이그레이션 없이 사라지지 않는다.
 *
 * 전 테이블 `STRICT`이고 boolean은 `INTEGER` + `CHECK (… IN (0, 1))`이다 —
 * STRICT를 채택한 이유가 타입 오염 차단이므로 값 범위까지 못박아야 일관된다.
 * 다만 STRICT는 **무손실 변환을 허용한다**(`bind.ts` 참조): 방어의 1차선은
 * 바인딩 지점의 타입 보장이고, DDL은 2차선이다.
 */

/**
 * `schema_version`은 v1부터 존재한다 — 나중에 넣는 마이그레이션 체계는 이미 늦다
 * (`docs/SESSION-STORE.md` §2 마이그레이션 규율).
 */
export const SCHEMA_V1 = `
CREATE TABLE schema_version (
  version    INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  id                TEXT    PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  title             TEXT,
  workspace_root    TEXT    NOT NULL,
  system_prompt     TEXT    NOT NULL,
  model             TEXT    NOT NULL,
  parent_session_id TEXT    REFERENCES sessions(id),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE messages (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE UNIQUE INDEX messages_session_seq   ON messages(session_id, seq);
CREATE INDEX        messages_session_order ON messages(session_id, active, seq);
CREATE INDEX        sessions_recent        ON sessions(active, updated_at DESC);
`;
