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
import { SCHEMA_V1 } from "./schema.sql.ts";

/** 이 코드가 아는 최신 스키마 버전 */
export const LATEST_SCHEMA_VERSION = 1;

interface Migration {
  readonly version: number;
  readonly sql: string;
}

/**
 * 버전 오름차순. `schema_version` 테이블 자체가 v1 DDL 안에 있으므로 v1은
 * "테이블이 없는 상태"에서 시작한다 — 러너가 버전 0을 그렇게 읽는다.
 */
const MIGRATIONS: readonly Migration[] = [{ version: 1, sql: SCHEMA_V1 }];

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
