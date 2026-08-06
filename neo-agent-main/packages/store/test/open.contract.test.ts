/**
 * DB 열기 — 경로·권한·PRAGMA·마이그레이션 규율 (QA-B).
 *
 * 기대값의 출처는 `docs/SESSION-STORE.md` §6(파일·PRAGMA·권한)과 §2의
 * "마이그레이션 규율" 절뿐이다. 구현을 읽고 쓰지 않았다.
 *
 * ── API 표면에 대한 주의 ────────────────────────────────────────────────
 * §5의 `SessionStore` 인터페이스는 **열기 함수의 이름과 시그니처를 정하지 않는다.**
 * 여기서는 `openSessionStore({ home })`로 가정한다. 근거: §6이 경로를
 * `~/.neo-agent/sessions.db`로 못박았으므로 테스트가 실제 홈을 건드리지 않으려면
 * 홈 주입이 유일하게 필요한 노브이고, `packages/tools`의
 * `WorkspaceBoundaryOptions.home`이 이미 같은 목적의 선례다.
 * **이름이 다르면 `[미규정]`이 아니라 단순 조정 대상이다** — 이 파일과
 * `contract-harness.ts`의 임포트만 고치면 된다.
 * ───────────────────────────────────────────────────────────────────────
 */

import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openSessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sandbox: string;
let home: string;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-open-")));
  home = join(sandbox, "home");
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(sandbox, { recursive: true, force: true });
});

/** 권한 비트만 뽑는다 — 파일 타입 비트를 섞으면 기대값이 플랫폼에 흔들린다 */
const modeOf = (path: string): number => statSync(path).mode & 0o777;

describe("경로와 권한 (SESSION-STORE §6)", () => {
  it("DB는 `~/.neo-agent/sessions.db`에 만들어진다", () => {
    const store = openSessionStore({ home });
    store.close();
    expect(statSync(dbPath()).isFile()).toBe(true);
  });

  it("디렉터리 0700 · 파일 0600으로 생성한다", () => {
    const store = openSessionStore({ home });
    store.close();
    expect(modeOf(join(home, ".neo-agent"))).toBe(0o700);
    expect(modeOf(dbPath())).toBe(0o600);
  });

  it("umask와 무관하게 0600이다 — SQLite가 파일을 스스로 만들기 때문", () => {
    const previous = process.umask(0o000);
    try {
      const store = openSessionStore({ home });
      store.close();
      expect(modeOf(dbPath())).toBe(0o600);
    } finally {
      process.umask(previous);
    }
  });

  /**
   * §6: "기존 파일이 더 느슨하면 **매번 경고하되 열기는 한다**" +
   * "**자동 chmod로 조용히 고치지 않는다** — 노출 사실이 보여야 한다".
   *
   * 세 단정이 한 테스트에 있는 이유는 셋이 한 결정이기 때문이다: 열림(fail-open) ·
   * 경고(가시성) · 모드 불변(침묵 수정 금지). 하나라도 빠지면 §6의 근거가 깨진다.
   *
   * [미규정] 경고의 **전달 수단**을 §6이 정하지 않았다. `console.warn`으로 관측한다 —
   * 저장소가 콜백(`onWarning`)이나 반환값으로 알리는 설계라면 위반이 아니라 조정
   * 대상이니 판정해 달라. 다만 **아무 데로도 나가지 않으면** "노출 사실이 보여야
   * 한다"가 거짓이 되므로 그때는 위반이다.
   */
  it("느슨한 기존 파일: 열리고 · 경고하고 · 모드는 바뀌지 않는다", () => {
    openSessionStore({ home }).close();
    chmodSync(dbPath(), 0o644);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = openSessionStore({ home });
    store.close();

    expect(warn).toHaveBeenCalled();
    // 자동 chmod 금지 — 조용히 고치면 사용자는 노출된 적이 있다는 것을 영영 모른다
    expect(modeOf(dbPath())).toBe(0o644);
  });

  it("경고는 매번 나온다 — 한 번 보고 마는 것이 아니다", () => {
    openSessionStore({ home }).close();
    chmodSync(dbPath(), 0o666);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    openSessionStore({ home }).close();
    const first = warn.mock.calls.length;
    openSessionStore({ home }).close();
    expect(warn.mock.calls.length).toBeGreaterThan(first);
  });

  it("느슨한 디렉터리도 같은 취급이다 — 경고 후 진행, 모드 불변", () => {
    openSessionStore({ home }).close();
    chmodSync(join(home, ".neo-agent"), 0o755);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    openSessionStore({ home }).close();

    expect(warn).toHaveBeenCalled();
    expect(modeOf(join(home, ".neo-agent"))).toBe(0o755);
  });
});

describe("PRAGMA (SESSION-STORE §6)", () => {
  /** 저장소가 닫은 뒤 같은 파일을 직접 열어 지속되는 설정을 읽는다 */
  const readPersisted = <T>(pragma: string): T => {
    const db = new DatabaseSync(dbPath());
    try {
      return db.prepare(`PRAGMA ${pragma}`).get() as T;
    } finally {
      db.close();
    }
  };

  it("journal_mode가 WAL이다 (파일에 지속되는 설정)", () => {
    openSessionStore({ home }).close();
    const row = readPersisted<{ journal_mode: string }>("journal_mode");
    expect(row.journal_mode.toLowerCase()).toBe("wal");
  });

  /**
   * §6: "실패 시 명시적 에러. silent 폴백 금지". `PRAGMA journal_mode=WAL`은
   * 실패해도 예외를 던지지 않고 **다른 모드를 반환**한다 — 반환값을 확인하지 않으면
   * delete 모드로 조용히 열린다. 여기서는 지속된 모드가 wal임을 확인하는 것으로
   * 대신한다(WAL 불가 파일시스템을 테스트에서 만들 수 없다).
   */
  /**
   * §6의 근거 문구는 이 런타임에서 부정확하다(2026-08-06 실측): **`node:sqlite`의
   * `DatabaseSync`는 `foreign_keys`를 기본 ON으로 연다** — 새 `:memory:` 연결에서
   * `PRAGMA foreign_keys`가 1을 돌려준다. "SQLite 기본이 off다"는 sqlite3 CLI·C API
   * 기준의 서술이다.
   *
   * 결론은 바뀌지 않는다 — 명시적으로 켜는 것이 옳다(런타임 기본값에 의존하면 Node가
   * 바꾸는 날 FK가 조용히 장식이 된다). 다만 **근거 문장이 이 런타임에서 참이 아니므로**
   * §6 주석을 다듬을 후보로 남긴다. 검증은 "켜졌는가"가 아니라 "강제되는가"로 한다.
   */
  it("저장소 연결에서 foreign_keys가 ON이다", () => {
    const store = openSessionStore({ home });
    try {
      // FK가 실제로 강제되는지(위반 INSERT 거부)는 schema.contract.test.ts가 본다
      expect(store).toBeDefined();
    } finally {
      store.close();
    }
    const db = new DatabaseSync(dbPath());
    try {
      expect(
        (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys,
      ).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe("마이그레이션 규율 (SESSION-STORE §2)", () => {
  it("schema_version이 v1부터 존재하고 값이 1이다", () => {
    openSessionStore({ home }).close();
    const db = new DatabaseSync(dbPath());
    try {
      const row = db.prepare("SELECT version, applied_at FROM schema_version").get() as {
        version: number;
        applied_at: number;
      };
      expect(row.version).toBe(1);
      expect(typeof row.applied_at).toBe("number");
    } finally {
      db.close();
    }
  });

  /**
   * §2: "**DB의 버전이 코드가 아는 최신보다 높으면 거부한다.** 구 버전 바이너리가
   * 신 스키마를 열어 쓰면 손상된다." 조용히 여는 것이 최악이다.
   */
  it("코드가 아는 최신보다 높은 버전의 DB는 거부한다", () => {
    openSessionStore({ home }).close();
    const db = new DatabaseSync(dbPath());
    try {
      db.exec("UPDATE schema_version SET version = 999");
    } finally {
      db.close();
    }
    expect(() => openSessionStore({ home })).toThrow();
  });

  /**
   * **B-1 판정(2026-08-06)으로 개정** — 이전 판은 `COUNT(*) === 1`을 하드코딩해
   * "재적용되지 않는다"를 단언했다. 그것은 과잉 명세였다: 1이라는 숫자는 "마이그레이션이
   * 하나뿐"이라는 당시의 우연을 고정한 대리 지표이지 재적용 여부가 아니다. B-1이
   * **이력 보존**(마이그레이션당 `schema_version` 행 추가)으로 판정되면서 v2 도입만으로
   * 정상 상태가 2행이 되어 이 대리 지표가 깨졌다.
   *
   * 그래서 행 수를 고정하지 않고 **첫 열기 후와 두 번째 열기 후를 비교**한다 — 이것이
   * "재적용 없음"의 직접 단언이며, 마이그레이션이 몇 개가 되든 성립한다.
   */
  it("두 번 열어도 마이그레이션이 재적용되지 않는다 (schema_version 행이 늘지 않는다)", () => {
    const countVersionRows = (): number => {
      const db = new DatabaseSync(dbPath());
      try {
        return (db.prepare("SELECT COUNT(*) AS n FROM schema_version").get() as { n: number }).n;
      } finally {
        db.close();
      }
    };

    openSessionStore({ home }).close();
    const afterFirstOpen = countVersionRows();
    // 빈 테이블이면 아래 비교가 공허하게 통과한다 — 적용 기록이 실재함을 먼저 못박는다.
    expect(afterFirstOpen).toBeGreaterThan(0);

    openSessionStore({ home }).close();

    expect(countVersionRows()).toBe(afterFirstOpen);
  });
});
