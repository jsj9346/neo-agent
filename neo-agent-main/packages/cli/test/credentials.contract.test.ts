/**
 * 크리덴셜 로더 계약 — `docs/CLI-INTERFACE.md` §4 + `docs/SAFE-DEFAULTS.md` §3.
 *
 * 검증하는 계약:
 *   §4 로드 우선순위 — env `ANTHROPIC_API_KEY`가 있으면 **파일을 읽지 않는다**
 *   §4 dotenv형 파일 (`KEY=value`, `#` 주석 허용)
 *   §4 보호 계약 1 — "파일이 **존재하면 사용 여부와 무관하게** 권한을 검사하고,
 *      600이 아니면 수정 명령 안내와 함께 기동 거부"
 *   SAFE-DEFAULTS §3-1 — "자동 chmod로 조용히 고치지 않는다"
 *   §4 보호 계약 3 — "로더는 로드한 시크릿 값 목록을 executor 생성 시 전달한다"
 *   §4 "두 경로 모두 없으면 설정 방법을 안내하고 종료한다"
 *   §4 보호 계약 4 — 워크스페이스 `.env`를 읽는 코드 자체가 없다
 */

import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCliModule, pickExport } from "./harness.ts";
import { type CallStyle, callWith, makeTempHome, probeCallStyle } from "./support.ts";

interface CredCtx {
  home: string;
  credentialsPath: string;
}

const CANDIDATES: readonly CallStyle<CredCtx>[] = [
  // env를 주입받는 형태 — `process.env`를 넘겨 `vi.stubEnv`가 그대로 보이게 한다
  {
    label: "loadCredentials(env, credentialsPath)",
    args: (ctx) => [process.env, ctx.credentialsPath],
  },
  {
    label: "loadCredentials({ env, credentialsPath })",
    args: (ctx) => [{ env: process.env, credentialsPath: ctx.credentialsPath }],
  },
  { label: "loadCredentials()  (HOME 경유)", args: () => [] },
  { label: "loadCredentials(credentialsPath)", args: (ctx) => [ctx.credentialsPath] },
  {
    label: "loadCredentials({ credentialsPath })",
    args: (ctx) => [{ credentialsPath: ctx.credentialsPath }],
  },
  { label: "loadCredentials({ path })", args: (ctx) => [{ path: ctx.credentialsPath }] },
  { label: "loadCredentials(homeDir)", args: (ctx) => [ctx.home] },
  { label: "loadCredentials({ home })", args: (ctx) => [{ home: ctx.home }] },
];

let loadCredentials: unknown;
let style: CallStyle<CredCtx>;

interface HomeSetup extends CredCtx {
  cleanup: () => void;
}

/** 임시 홈. `file`이 있으면 그 내용으로 credentials를 만들고 mode를 적용한다 */
function setupHome(file?: { content: string; mode: number }): HomeSetup {
  const { home, cleanup } = makeTempHome();
  const dir = join(home, ".neo-agent");
  mkdirSync(dir, { recursive: true });
  const credentialsPath = join(dir, "credentials");
  if (file) {
    writeFileSync(credentialsPath, file.content, "utf8");
    chmodSync(credentialsPath, file.mode);
  }
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  return { home, credentialsPath, cleanup };
}

function load(ctx: CredCtx): unknown {
  return callWith<CredCtx, unknown>(loadCredentials, style, ctx);
}

function modeOf(path: string): string {
  return (statSync(path).mode & 0o777).toString(8);
}

/** 반환값 어딘가에 이 문자열이 담겨 있는가 — 필드 이름은 구현 세부라 값으로 찾는다 */
function containsValue(value: unknown, needle: string, depth = 0): boolean {
  if (depth > 6) return false;
  if (typeof value === "string") return value === needle || value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => containsValue(item, needle, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsValue(item, needle, depth + 1),
    );
  }
  return false;
}

/** 스크러빙용 "값 목록" — 문자열 배열 중 needle을 담은 것이 있는가 */
function hasSecretValueList(value: unknown, needle: string, depth = 0): boolean {
  if (depth > 6) return false;
  if (Array.isArray(value)) {
    if (value.some((item) => typeof item === "string" && item === needle)) return true;
    return value.some((item) => hasSecretValueList(item, needle, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      hasSecretValueList(item, needle, depth + 1),
    );
  }
  return false;
}

beforeAll(async () => {
  const module = await loadCliModule("credentials.ts");
  loadCredentials = pickExport(
    module,
    ["loadCredentials", "loadCredential", "readCredentials"],
    "크리덴셜 로더",
  );

  const ctx = setupHome({ content: "ANTHROPIC_API_KEY=sk-probe\n", mode: 0o600 });
  vi.stubEnv("ANTHROPIC_API_KEY", undefined);
  try {
    style = probeCallStyle<CredCtx>(loadCredentials, ctx, CANDIDATES, "loadCredentials");
  } finally {
    vi.unstubAllEnvs();
    ctx.cleanup();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("크리덴셜 로더 — 우선순위 (CLI-INTERFACE §4)", () => {
  it("env에 키가 있으면 파일을 읽지 않는다", () => {
    // 근거: §4 "1. 프로세스 env의 ANTHROPIC_API_KEY — 있으면 파일을 읽지 않는다"
    // 관찰: 파일의 값이 결과 어디에도 나타나지 않아야 한다.
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-FROM-FILE\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", "VALUE-FROM-ENV");
    try {
      const result = load(ctx);
      expect(containsValue(result, "VALUE-FROM-ENV")).toBe(true);
      expect(containsValue(result, "VALUE-FROM-FILE")).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it("env가 없으면 dotenv형 파일에서 로드한다 (# 주석 허용)", () => {
    // 근거: §4 "2. ~/.neo-agent/credentials — dotenv형 (KEY=value, # 주석 허용)"
    const content = [
      "# neo-agent credentials",
      "# ANTHROPIC_API_KEY=COMMENTED-OUT",
      "",
      "ANTHROPIC_API_KEY=VALUE-FROM-FILE",
      "",
    ].join("\n");
    const ctx = setupHome({ content, mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      const result = load(ctx);
      expect(containsValue(result, "VALUE-FROM-FILE")).toBe(true);
      // 주석 줄이 파싱되면 잘못된 키로 기동한다
      expect(containsValue(result, "COMMENTED-OUT")).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it("두 경로 모두 없으면 설정 방법을 안내하는 에러로 종료한다", () => {
    // 근거: §4 "키 부재 시: 두 경로 모두 없으면 설정 방법(파일 생성 예시 포함)을
    //       안내하고 종료한다"
    const ctx = setupHome();
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      let message = "";
      expect(() => {
        try {
          load(ctx);
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
          throw error;
        }
      }).toThrow();
      // 안내다워야 한다 — 어디에 무엇을 만들지가 메시지에 있어야 사용자가 복구한다
      expect(message).toContain("ANTHROPIC_API_KEY");
      expect(message).toContain("credentials");
    } finally {
      ctx.cleanup();
    }
  });
});

describe("크리덴셜 로더 — 600 fail-closed (SAFE-DEFAULTS §3 보호 계약 1)", () => {
  it("파일이 600이면 정상 로드된다", () => {
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-600\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      expect(() => load(ctx)).not.toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("파일이 644면 기동을 거부한다", () => {
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-644\n", mode: 0o644 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      expect(() => load(ctx)).toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("644 파일 + env 키 제공이어도 기동을 거부한다 — 사용 여부와 무관한 검사다", () => {
    // 근거: §4 보호 계약 1 "credentials 파일이 **존재하면 사용 여부와 무관하게** 권한을
    //       검사하고 ... env로 키를 받았어도 느슨한 파일의 존재는 노출 사실이므로
    //       검사를 건너뛰지 않는다"
    // 이 케이스가 이 계약의 존재 이유다 — env 우선 최적화가 검사를 건너뛰게 만드는
    // 것이 자연스러운 구현 실수이고, 그러면 노출된 파일이 영영 보고되지 않는다.
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-644\n", mode: 0o644 });
    vi.stubEnv("ANTHROPIC_API_KEY", "VALUE-FROM-ENV");
    try {
      expect(() => load(ctx)).toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("거부 메시지에 수정 명령 안내가 있다", () => {
    // 근거: §4 보호 계약 1 "600이 아니면 수정 명령 안내와 함께 기동 거부"
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-644\n", mode: 0o644 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      let message = "";
      try {
        load(ctx);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("600");
      expect(message.toLowerCase()).toContain("chmod");
    } finally {
      ctx.cleanup();
    }
  });

  it("자동 chmod로 조용히 고치지 않는다 — 거부 후에도 권한은 그대로다", () => {
    // 근거: SAFE-DEFAULTS §3-1 "자동 chmod로 조용히 고치지 않는다 — 노출돼 있었다는
    //       사실 자체가 사용자에게 보여야 한다(§2.6)"
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-644\n", mode: 0o644 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      try {
        load(ctx);
      } catch {
        // 거부는 기대된 결과다
      }
      expect(modeOf(ctx.credentialsPath)).toBe("644");
    } finally {
      ctx.cleanup();
    }
  });

  it("정상 로드 경로에서도 권한을 건드리지 않는다", () => {
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-600\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      load(ctx);
      expect(modeOf(ctx.credentialsPath)).toBe("600");
    } finally {
      ctx.cleanup();
    }
  });
});

describe("크리덴셜 로더 — 스크러빙용 값 목록 (CLI-INTERFACE §4 보호 계약 3)", () => {
  it("로드된 시크릿 '값'의 목록을 반환한다", () => {
    // 근거: §4 보호 계약 3 "로더는 로드한 시크릿 값 목록을 executor 생성 시 전달한다 —
    //       값 기반 제거가 성립하려면 executor가 값을 알아야 한다"
    // 키 이름 목록이 아니라 **값** 목록이어야 스크러빙이 성립한다.
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-FROM-FILE\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      const result = load(ctx);
      expect(hasSecretValueList(result, "VALUE-FROM-FILE")).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("env 경로로 로드해도 값 목록이 나온다", () => {
    // env로 받은 키도 자식 프로세스에서 제거 대상이다(SAFE-DEFAULTS §3-3).
    const ctx = setupHome();
    vi.stubEnv("ANTHROPIC_API_KEY", "VALUE-FROM-ENV");
    try {
      const result = load(ctx);
      expect(hasSecretValueList(result, "VALUE-FROM-ENV")).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });
});

describe("크리덴셜 로더 — 워크스페이스 .env 무시 (SAFE-DEFAULTS §3 보호 계약 4)", () => {
  it("cwd의 .env에 든 키는 읽지 않는다 — 스캔 코드 자체가 없어야 한다", () => {
    // 근거: §4 보호 계약 4 "로더는 구조적으로 이행: 읽는 곳이 위 두 경로뿐이다.
    //       `.env` 스캔 코드 자체가 없다"
    // 악성 저장소의 `.env`가 트래픽을 자기 엔드포인트로 돌리는 경로를 차단한다.
    const ctx = setupHome();
    const dotenv = join(ctx.home, ".env");
    writeFileSync(dotenv, "ANTHROPIC_API_KEY=VALUE-FROM-DOTENV\n", "utf8");
    const originalCwd = process.cwd();
    process.chdir(ctx.home);
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      // 두 정규 경로가 모두 비었으므로 키 부재 에러가 나야 한다.
      // `.env`를 읽는 구현이라면 성공해 버린다.
      let result: unknown;
      let threw = false;
      try {
        result = load(ctx);
      } catch {
        threw = true;
      }
      expect(threw || !containsValue(result, "VALUE-FROM-DOTENV")).toBe(true);
    } finally {
      process.chdir(originalCwd);
      ctx.cleanup();
    }
  });
});
