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
 * [미규정 E-21] **PK 외의 열 정의는 v1 그대로 둔다** — `id`에 `NOT NULL`을 명시하지
 * 않는다. 계약이 요구한 변경은 PK 하나이므로 그 하나만 바꾼다.
 *
 * ⚠️ **이 판정의 최초 근거는 틀렸다** (2026-08-07 v3 작업 중 실측으로 정정). 원래
 * 근거는 "rowid 테이블에서 `TEXT PRIMARY KEY`는 NULL을 허용하는 것이 SQLite의 오래된
 * 동작이므로 v1 DB에 NULL id 행이 존재할 수 있다"였다. **그 전제가 거짓이다** — 그
 * 예외는 **비STRICT 테이블에만** 적용되고, `STRICT` 테이블은 PK 열에 NOT NULL을
 * 그대로 강제한다. SQLite 3.51.1 실측:
 *
 * | 선언 | NULL id |
 * |---|---|
 * | `id TEXT PRIMARY KEY` + STRICT (v1) | **거부** — "NOT NULL constraint failed" |
 * | `PRIMARY KEY (session_id, id)` + STRICT (v2) | **거부** — 동일 |
 * | 같은 복합 PK, 비STRICT | 허용 |
 *
 * 즉 v1·v2 어느 쪽에서도 NULL id 행은 **애초에 존재할 수 없었다.** 결론(NOT NULL을
 * 따로 적지 않는다)은 그대로 유효하지만 이유가 다르다: 없어도 되는 것이 아니라
 * **STRICT + PK가 이미 강제하고 있어 중복이기 때문**이다. 여기 적힌 판단이 뒤에
 * QA-A의 A-3(백필의 NULL id 처리)을 미규정으로 만들었는데, 그 회색지대도 같은
 * 실측으로 닫힌다 — `backfill.ts`의 ES-32 참조.
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

/**
 * 스키마 v3 — 대화 전문 검색 인덱스 `messages_fts` (`docs/SEARCH.md` §2).
 *
 * **파생 데이터다.** 정본은 `messages.body`이고 이 테이블은 원본에서 언제든 재구축
 * 가능하다 — §2·§3의 결정 대부분이 이 성격에서 나온다.
 *
 * **독립 FTS 테이블이며 external-content가 아니다.** `body`가 JSON 통짜라
 * external-content 방식은 JSON 전문(키 이름·base64·id)을 색인하게 된다. 검색 대상
 * 텍스트는 Zod 검증된 `AgentMessage`에서 TS 코드 한 곳(`extract.ts`)이 추출해야 하고,
 * SQL 트리거로는 그 추출을 표현할 수 없다.
 *
 * **컬럼은 최소다 — role·timestamp를 넣지 않는다.** soft-delete 제외(§4)가 조회
 * 조건이라 검색 쿼리는 어차피 `sessions`·`messages`와 JOIN한다. 그 JOIN에서 role·
 * timestamp·title이 전부 나오므로 여기 중복 저장하면 정본 아닌 사본이 한 벌 더 생긴다.
 * `session_id`·`message_id`는 그 JOIN의 키라서 남고, 검색어가 세션 id에 걸리면 안
 * 되므로 `UNINDEXED`다.
 *
 * **STRICT가 아닌 것은 명시된 예외다.** SESSION-STORE §2의 "전 테이블 STRICT" 규율은
 * FTS5 가상 테이블에 적용할 수 없다(SQLite 제약) — 규율 위반이 아니라 SEARCH §2가
 * 명문화한 예외다. 타입 안전은 쓰기 지점이 store 한 곳뿐인 것으로 갈음한다.
 *
 * DDL이 만드는 것은 빈 테이블뿐이고, **기존 `messages` 전량의 백필은 코드 단계**
 * (`backfill.ts`)가 같은 트랜잭션에서 수행한다 — body 파싱·Zod 검증·추출이 필요해
 * SQL로 표현할 수 없다.
 */
export const SCHEMA_V3 = `
CREATE VIRTUAL TABLE messages_fts USING fts5(
  text,
  session_id UNINDEXED,
  message_id UNINDEXED,
  tokenize = 'trigram'
);
`;
