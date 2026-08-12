/**
 * 마이그레이션 러너 — `docs/SESSION-STORE.md` §2 "마이그레이션 규율".
 *
 * 규율 세 가지를 그대로 구현한다:
 * 1. **앞으로만 간다.** 다운그레이드 경로를 만들지 않는다.
 * 2. **각 마이그레이션은 트랜잭션 하나다.** 중간에 실패하면 그 버전은 통째로 없다.
 * 3. **DB의 버전이 코드가 아는 최신보다 높으면 거부한다.** 구 버전 바이너리가 신
 *    스키마를 열어 쓰면 손상된다 — 열지 못하는 편이 낫다.
 */

import type { DatabaseSync } from "node:sqlite";
import { backfillSearchIndex, type SkippedRow } from "./backfill.ts";
import { integerParam } from "./bind.ts";
import type { StoreWarningHandler } from "./open.ts";
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from "./schema.sql.ts";

/** 이 코드가 아는 최신 스키마 버전 */
export const LATEST_SCHEMA_VERSION = 3;

/**
 * **마이그레이션의 코드 단계.** SESSION-STORE §2 마이그레이션 규율이 정한다(판정 ES-31)
 * — *"마이그레이션은 SQL 단계 + 선택적 코드 단계로 구성된다"*, 두 단계는 같은 트랜잭션
 * 안에서 실행되고 코드 단계의 실패도 전량 롤백이다.
 *
 * v3 백필은 body 파싱 → Zod 검증 → 추출이라 SQL로 표현할 수 없다(`SEARCH.md` §2).
 * 그래서 `sql` **다음에** 같은 트랜잭션에서 도는 선택적 단계를 둔다. 형태를 이렇게
 * 고른 근거 셋:
 *
 * - **`sql`을 대체하지 않고 뒤따른다.** DDL은 SQL 문자열로 남아 스키마의 진실이 한
 *   곳에서 읽힌다 — 코드 단계가 DDL까지 삼키면 "이 버전이 무슨 테이블을 만드는가"를
 *   코드를 실행해 봐야 알게 된다.
 * - **반환값이 통지 목록이다.** 부수효과로 핸들러를 직접 부르지 않는 이유는
 *   `backfill.ts`의 `SkippedRow` 주석에 있다 — 롤백된 마이그레이션이 통지만 남기는
 *   것을 막는다.
 * - **`db`만 받는다.** 코드 단계가 트랜잭션 경계를 알 필요가 없어야 "한 마이그레이션 =
 *   한 트랜잭션"이 러너 한 곳에서만 강제된다.
 *
 * §2가 함께 못박은 경계: **DDL로 표현 가능한 것을 코드 단계로 옮기지 않는다** — 변환
 * 로직이 SQL과 TS 두 곳에 흩어지면 스키마의 진실이 나뉜다.
 */
interface Migration {
  readonly version: number;
  readonly sql: string;
  /** `sql` 이후 **같은 트랜잭션**에서 실행된다. 돌려준 목록은 커밋 후 통지된다 */
  readonly apply?: (db: DatabaseSync) => readonly SkippedRow[];
}

/** `migrate`가 바깥으로 내보내는 두 신호 — 승격 사실과 백필이 건너뛴 행 */
export interface MigrationHooks {
  /** 기존 DB가 승격됐을 때 1회 (B-13). 신규 생성은 부르지 않는다 */
  onUpgrade?: (from: number, to: number) => void;
  /** 손상 행 통지 등 마이그레이션 중 발생한 경고의 수신자 */
  onWarning?: StoreWarningHandler;
}

/**
 * 버전 오름차순. `schema_version` 테이블 자체가 v1 DDL 안에 있으므로 v1은
 * "테이블이 없는 상태"에서 시작한다 — 러너가 버전 0을 그렇게 읽는다.
 *
 * **새 DB도 v1 → v2를 순서대로 지난다.** 최신 형상을 한 번에 만드는 지름길을 두지
 * 않는 이유는 두 가지다. 마이그레이션 경로가 신규 설치마다 실행되어 늘 검증되고,
 * DDL의 진실이 "v1 + 변경분"이라는 한 줄기로 유지된다 — 지름길을 두면 최신 형상이
 * 두 곳(지름길 DDL, 마이그레이션 사슬)에 존재해 어긋날 수 있다.
 */
const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: SCHEMA_V1 },
  { version: 2, sql: SCHEMA_V2 },
  { version: 3, sql: SCHEMA_V3, apply: backfillSearchIndex },
];

/**
 * 적용된 최신 버전. `schema_version` 테이블이 없으면 0 — 빈 DB와 v0을 구분할
 * 필요가 없다(v1이 첫 마이그레이션이므로 둘 다 "전부 적용" 대상이다).
 */
export function readSchemaVersion(db: DatabaseSync): number {
  const table = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get();
  if (table === undefined) return 0;

  const row = db.prepare("SELECT MAX(version) AS version FROM schema_version").get();
  const version = (row as { version?: unknown } | undefined)?.version;
  return typeof version === "number" ? version : 0;
}

/**
 * 미적용 마이그레이션을 순서대로 적용하고 최종 버전을 돌려준다.
 *
 * 이미 최신이면 아무것도 하지 않는다 — 매 실행마다 지나가는 경로이므로 no-op이
 * 정상이다.
 */
export function migrate(db: DatabaseSync, hooks: MigrationHooks = {}): number {
  const current = readSchemaVersion(db);

  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Session database schema is v${current} but this build only knows v${LATEST_SCHEMA_VERSION}. ` +
        "Upgrade neo-agent — an older build must not write to a newer schema.",
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    // 통지는 **커밋 성공 후에만** 나간다 — 롤백된 마이그레이션은 아무 행도 건너뛰지
    // 않았으므로 보고할 것이 없다(`backfill.ts`의 `SkippedRow` 주석).
    for (const row of applyMigration(db, migration)) {
      hooks.onWarning?.({
        kind: "corrupt-message-skipped",
        sessionId: row.sessionId,
        messageId: row.messageId,
        seq: row.seq,
        message:
          `세션 ${row.sessionId}의 메시지 ${row.messageId ?? "(id 없음)"}(seq ${row.seq})를 ` +
          `검색 색인에서 제외했다 — ${row.reason}. ` +
          "대화 자체는 그대로이며 이 메시지만 검색에 걸리지 않는다.",
      });
    }
  }

  // 기존 DB의 승격만 알린다(2026-08-06 B-13 판정) — `current === 0`(신규 DB 생성)은
  // 승격이 아니므로 침묵이 맞고, 매 실행의 no-op 경로(current === LATEST)도 마찬가지다.
  if (current > 0 && current < LATEST_SCHEMA_VERSION) {
    hooks.onUpgrade?.(current, LATEST_SCHEMA_VERSION);
  }

  return LATEST_SCHEMA_VERSION;
}

function applyMigration(db: DatabaseSync, migration: Migration): readonly SkippedRow[] {
  let skipped: readonly SkippedRow[] = [];

  db.exec("BEGIN");
  try {
    // SQLite는 DDL도 트랜잭션 안에서 롤백된다 — 실패한 마이그레이션이 테이블
    // 절반만 남기지 않는다.
    db.exec(migration.sql);

    // 코드 단계는 DDL **다음**, 버전 기록 **이전**이다. 셋이 같은 트랜잭션 안에 있는
    // 것이 "각 마이그레이션은 트랜잭션 하나"(§2)의 실체다 — 백필이 중간에 실패하면
    // FTS 테이블도 버전 행도 남지 않고 v2 형상이 온전히 보존된다.
    skipped = migration.apply?.(db) ?? [];

    // `schema_version`은 **이력 테이블이다** — 각 마이그레이션이 행을 하나씩 쌓고
    // `readSchemaVersion`이 `MAX(version)`을 읽는다. SESSION-STORE §2 마이그레이션
    // 규율이 정한다(판정 E-23 / QA-B B-1). 한 행을 UPDATE로 덮으면 `applied_at`의
    // 의미가 "최초 생성 시각"과 "마지막 마이그레이션 시각" 사이에서 모호해진다 —
    // 그 컬럼의 존재 자체가 버전별 적용 시각을 남기려는 설계다(v2 DB는 행이 2개다).
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
      integerParam(migration.version, "schema_version.version"),
      integerParam(Date.now(), "schema_version.applied_at"),
    );
    db.exec("COMMIT");
    return skipped;
  } catch (error) {
    // 롤백 자체의 실패는 원인을 덮어쓴다 — 원래 에러를 살린다.
    try {
      db.exec("ROLLBACK");
    } catch {
      // 트랜잭션이 이미 자동 중단된 경우. 원인 에러를 그대로 던진다.
    }
    throw new Error(
      `Session database migration to v${migration.version} failed: ${(error as Error).message}`,
      { cause: error },
    );
  }
}
