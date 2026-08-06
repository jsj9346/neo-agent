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
import { integerParam } from "./bind.ts";
import { SCHEMA_V1, SCHEMA_V2 } from "./schema.sql.ts";

/** 이 코드가 아는 최신 스키마 버전 */
export const LATEST_SCHEMA_VERSION = 2;

interface Migration {
  readonly version: number;
  readonly sql: string;
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
export function migrate(db: DatabaseSync): number {
  const current = readSchemaVersion(db);

  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Session database schema is v${current} but this build only knows v${LATEST_SCHEMA_VERSION}. ` +
        "Upgrade neo-agent — an older build must not write to a newer schema.",
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    applyMigration(db, migration);
  }

  return LATEST_SCHEMA_VERSION;
}

function applyMigration(db: DatabaseSync, migration: Migration): void {
  db.exec("BEGIN");
  try {
    // SQLite는 DDL도 트랜잭션 안에서 롤백된다 — 실패한 마이그레이션이 테이블
    // 절반만 남기지 않는다.
    db.exec(migration.sql);
    // [미규정 E-23] `schema_version`은 **이력 테이블이다** — 각 마이그레이션이 행을
    // 하나씩 쌓고 `readSchemaVersion`이 `MAX(version)`을 읽는다(QA-B B-1). §2는
    // 이력 보존 여부를 정하지 않았으나, v1이 이미 이 형태이고 `applied_at` 컬럼의
    // 존재 자체가 "언제 적용됐는가"를 남기려는 설계다 — 한 행을 UPDATE로 덮으면
    // 그 컬럼의 의미가 "최초 생성 시각"과 "마지막 마이그레이션 시각" 사이에서
    // 모호해진다. 기존 형태를 바꾸지 않는 쪽으로 닫았다(v2 DB는 행이 2개다).
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
      integerParam(migration.version, "schema_version.version"),
      integerParam(Date.now(), "schema_version.applied_at"),
    );
    db.exec("COMMIT");
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
