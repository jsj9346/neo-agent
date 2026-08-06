/**
 * 스키마 DDL — `docs/SESSION-STORE.md` §2 그대로.
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

/**
 * 스키마 v2 — `messages`의 PK를 `id` → `(session_id, id)`로 바꾼다
 * (`docs/SESSION-STORE.md` §2 "스키마 v2", `docs/COMPACTION.md` §2).
 *
 * 이유는 압축 분기가 유지 메시지를 **같은 id로** 자식 세션에 복사하기 때문이다 —
 * 메시지 동일성 보존. 코어 불변 조건 8("한 트랜스크립트 안의 유일성")은 세션 간
 * 같은 id를 금지하지 않으므로 계약 위반이 아니고, `INSERT OR IGNORE`의 멱등 범위가
 * 세션 내로 좁아질 뿐 사라지지 않는다(§4 구독 계약이 그 위에 선다).
 *
 * **SQLite는 PK 변경을 지원하지 않으므로 테이블 재생성 복사다.** 순서가 계약의
 * 일부다: 새 테이블 → 전량 복사 → 옛 테이블 DROP → RENAME → 인덱스 재생성.
 * `DROP TABLE`이 그 테이블의 인덱스도 함께 지우므로 인덱스는 반드시 뒤에 만든다.
 *
 * 이 문자열은 `applyMigration`이 여는 **한 트랜잭션** 안에서 실행된다(§2 마이그레이션
 * 규율). SQLite는 DDL도 롤백하므로 실패한 마이그레이션이 테이블 절반을 남기지 않는다.
 *
 * **`PRAGMA foreign_keys`를 끄지 않는다.** SQLite의 12단계 ALTER 절차는 FK를 끄고
 * 시작하라고 권하지만, PRAGMA는 트랜잭션 안에서 **조용히 무시된다** — 여기서 끄는
 * 시늉을 하면 silent 폴백이 된다(§6이 금지한 형태). 끌 필요도 없다: `messages`를
 * 참조하는 테이블이 없고 복사가 `session_id`를 그대로 옮기므로 고아 행이 생길 경로가
 * 없다. FK가 켜진 채로 통과하는 것이 오히려 증거다.
 *
 * [미규정 E-21] **PK 외의 열 정의는 v1 그대로 둔다** — `id`에 `NOT NULL`을 붙이지
 * 않는다. rowid 테이블에서 `TEXT PRIMARY KEY`는 NULL을 허용하는 것이 SQLite의 오래된
 * 동작이라 v1 DB에 NULL id 행이 존재할 수 **있고**, 여기서 `NOT NULL`로 조이면 그런
 * DB는 **마이그레이션 자체가 실패해 앱이 아예 열리지 않는다.** §7이 정한 손상 처리의
 * 폭발 반경은 "그 세션을 열지 못한다"까지이며(비활성 행의 손상은 열기를 막지 않는다고
 * 명시), DB 전체를 봉쇄하는 것은 그보다 넓다. NULL id는 이미 `load.ts`의 `readRow`가
 * 그 세션을 열 때 진단과 함께 던진다 — 소리는 이미 나고 있고, 반경만 좁게 유지한다.
 * 계약이 요구한 변경은 PK 하나이므로 그 하나만 바꾼다.
 *
 * [미규정 E-22] **`WITHOUT ROWID`를 채택하지 않는다**(QA-B B-3). §2는 어느 쪽도
 * 정하지 않았고, 현행 스키마 어디도 rowid에 의미를 두지 않는다(순서의 진실은 `seq`
 * 하나). 근거가 없는 저장 형태 변경은 하지 않는다는 쪽으로 닫았다 — v1이 rowid
 * 테이블이었으므로 유지가 최소 변경이고, 나중에 실측(DB 크기·조회 성능)이 나오면
 * 그때 마이그레이션 하나로 옮길 수 있다. 재생성이 rowid 값을 바꾸는 것은 부수 효과이며
 * 계약이 그것에 의존하지 않는다.
 */
export const SCHEMA_V2 = `
CREATE TABLE messages_v2 (
  id         TEXT,
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (session_id, id)
) STRICT;

INSERT INTO messages_v2 (id, session_id, seq, role, timestamp, body, active)
  SELECT id, session_id, seq, role, timestamp, body, active FROM messages;

DROP TABLE messages;

ALTER TABLE messages_v2 RENAME TO messages;

CREATE UNIQUE INDEX messages_session_seq   ON messages(session_id, seq);
CREATE INDEX        messages_session_order ON messages(session_id, active, seq);
`;
