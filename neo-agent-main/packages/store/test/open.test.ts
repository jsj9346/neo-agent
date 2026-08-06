import {
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LATEST_SCHEMA_VERSION, readSchemaVersion } from "../src/migrate.ts";
import { defaultDatabasePath, openDatabase, type StoreWarning } from "../src/open.ts";

/**
 * 테스트는 tmpdir만 쓴다 — 실제 `~/.neo-agent/`를 만들거나 만지지 않는다.
 * `home` 주입 지점이 있는 이유가 이것이다.
 */
describe("openDatabase", () => {
  let sandbox: string;
  let warnings: StoreWarning[];

  beforeEach(() => {
    // macOS tmpdir은 `/var` → `/private/var` 심링크다. 모드 검사에는 영향이 없지만
    // 경로 단정을 위해 고정한다.
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-store-")));
    warnings = [];
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function open(path: string) {
    return openDatabase({ path, onWarning: (warning) => warnings.push(warning) });
  }

  function modeOf(path: string): number {
    return statSync(path).mode & 0o777;
  }

  describe("경로", () => {
    it("기본 경로는 `~/.neo-agent/sessions.db`다", () => {
      expect(defaultDatabasePath("/home/someone")).toBe("/home/someone/.neo-agent/sessions.db");
    });
  });

  describe("권한", () => {
    it("새 DB 파일은 0600, 디렉터리는 0700으로 만든다", () => {
      const path = join(sandbox, ".neo-agent", "sessions.db");
      const db = open(path);
      db.close();

      expect(modeOf(path)).toBe(0o600);
      expect(modeOf(join(sandbox, ".neo-agent"))).toBe(0o700);
      expect(warnings).toEqual([]);
    });

    it("WAL 부산물도 본 파일의 권한을 물려받는다", () => {
      const path = join(sandbox, ".neo-agent", "sessions.db");
      const db = open(path);
      // WAL 파일이 실제로 생기도록 쓰기를 한 번 일으킨다.
      db.exec("CREATE TABLE probe (x INTEGER) STRICT");

      const directory = join(sandbox, ".neo-agent");
      const artifacts = readdirSync(directory).filter((name) => name.startsWith("sessions.db"));
      expect(artifacts).toContain("sessions.db-wal");
      for (const name of artifacts) {
        expect({ name, mode: modeOf(join(directory, name)) }).toEqual({ name, mode: 0o600 });
      }
      db.close();
    });

    it("느슨한 기존 파일은 경고하되 열고, 모드를 바꾸지 않는다", () => {
      const directory = join(sandbox, ".neo-agent");
      mkdirSync(directory, { mode: 0o700, recursive: true });
      const path = join(directory, "sessions.db");
      closeSync(openSync(path, "wx", 0o600));
      chmodSync(path, 0o644);

      const db = open(path);
      db.close();

      // 자동 chmod 금지 — 노출 사실이 보여야 한다(§6).
      expect(modeOf(path)).toBe(0o644);
      expect(warnings).toHaveLength(1);
      const warning = warnings[0];
      expect(warning?.kind).toBe("loose-file-permissions");
      // 권한 경고와 재개 경고는 필드가 다르다 — 좁혀서 본다.
      if (warning?.kind !== "loose-file-permissions") throw new Error("경고 종류가 다르다");
      expect(warning.mode).toBe(0o644);
      expect(warning.path).toBe(path);
    });

    it("느슨한 기존 디렉터리도 경고하되 모드를 바꾸지 않는다", () => {
      const directory = join(sandbox, ".neo-agent");
      mkdirSync(directory, { recursive: true });
      chmodSync(directory, 0o755);

      const db = open(join(directory, "sessions.db"));
      db.close();

      expect(modeOf(directory)).toBe(0o755);
      expect(warnings.map((warning) => warning.kind)).toEqual(["loose-directory-permissions"]);
    });

    it("권한이 이미 0600인 기존 파일에는 경고하지 않는다", () => {
      const path = join(sandbox, ".neo-agent", "sessions.db");
      open(path).close();
      warnings = [];

      open(path).close();
      expect(warnings).toEqual([]);
    });
  });

  describe("PRAGMA", () => {
    it("journal_mode가 wal이다", () => {
      const db = open(join(sandbox, "sessions.db"));
      expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
      db.close();
    });

    it("foreign_keys가 켜져 있다", () => {
      const db = open(join(sandbox, "sessions.db"));
      expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      db.close();
    });

    it("busy_timeout·synchronous가 설정값이다", () => {
      const db = open(join(sandbox, "sessions.db"));
      expect(db.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
      // NORMAL = 1
      expect(db.prepare("PRAGMA synchronous").get()).toEqual({ synchronous: 1 });
      db.close();
    });

    it("WAL이 되지 않으면 조용히 폴백하지 않고 던진다", () => {
      // `:memory:`는 WAL을 지원하지 않고 `"memory"`를 돌려준다 — PRAGMA가 예외를
      // 던지지 않는다는 사실 자체의 회귀 검사다.
      expect(() => openDatabase({ path: ":memory:", onWarning: () => {} })).toThrowError(/WAL/);
    });
  });

  describe("마이그레이션", () => {
    /**
     * `schema_version`은 이력 테이블이라 마이그레이션 하나당 행이 하나 쌓인다 —
     * 버전이 1부터 빈틈없이 이어지므로 행 수는 곧 최신 버전이다. 숫자를 그대로 적지
     * 않는 이유는 v2를 넣을 때 이 단정이 낡은 리터럴로 깨졌기 때문이다.
     */
    it("새 DB를 최신 버전으로 올린다", () => {
      const db = open(join(sandbox, "sessions.db"));
      expect(readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(db.prepare("SELECT COUNT(*) AS n FROM schema_version").get()).toEqual({
        n: LATEST_SCHEMA_VERSION,
      });
      db.close();
    });

    /** 검사할 성질은 "행이 늘지 않는다"이지 특정 행 수가 아니다 */
    it("다시 열어도 마이그레이션을 되풀이하지 않는다", () => {
      const path = join(sandbox, "sessions.db");
      const first = open(path);
      const afterFirst = first.prepare("SELECT COUNT(*) AS n FROM schema_version").get();
      first.close();

      const db = open(path);
      expect(db.prepare("SELECT COUNT(*) AS n FROM schema_version").get()).toEqual(afterFirst);
      db.close();
    });

    it("DB 버전이 코드가 아는 최신보다 높으면 거부한다", () => {
      const path = join(sandbox, "sessions.db");
      const db = open(path);
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
        LATEST_SCHEMA_VERSION + 1,
        Date.now(),
      );
      db.close();

      expect(() => open(path)).toThrowError(
        new RegExp(
          `schema is v${LATEST_SCHEMA_VERSION + 1} but this build only knows v${LATEST_SCHEMA_VERSION}`,
        ),
      );
    });

    it("거부된 뒤에도 DB는 손상되지 않고 그대로 남는다", () => {
      const path = join(sandbox, "sessions.db");
      const db = open(path);
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
        99,
        Date.now(),
      );
      db.close();

      expect(() => open(path)).toThrow();

      // 거부는 "열지 않는다"이지 "망가뜨린다"가 아니다 — 미래 버전 행만 걷어내면
      // 다시 열려야 한다.
      const raw = new DatabaseSync(path);
      raw.exec("DELETE FROM schema_version WHERE version = 99");
      raw.close();
      expect(() => open(path).close()).not.toThrow();
    });

    it("`:memory:`는 거부하되 그 이름의 파일을 만들지 않는다", () => {
      const before = readdirSync(process.cwd());
      expect(() => openDatabase({ path: ":memory:", onWarning: () => {} })).toThrow();
      expect(readdirSync(process.cwd())).toEqual(before);
    });
  });
});
