/**
 * 크리덴셜 로더 계약 — `docs/CLI-INTERFACE.md` §4 + `docs/SAFE-DEFAULTS.md` §3.
 *
 * 검증하는 계약:
 *   §4 로드 우선순위 — **키마다 독립이다**(2026-09-02 개정). env의 그 키가
 *      "있으면 그 키에 한해 파일 값을 쓰지 않는다" — 한 키를 env로 준 것이 다른 키의
 *      파일 값을 가리지 않는다(`WEB-ACCESS.md` §3.2 시크릿 항)
 *   §4 dotenv형 파일 (`KEY=value`, `#` 주석 허용)
 *   §4 보호 계약 1 — "파일이 **존재하면 사용 여부와 무관하게** 권한을 검사하고,
 *      600이 아니면 수정 명령 안내와 함께 기동 거부"
 *   SAFE-DEFAULTS §3-1 — "자동 chmod로 조용히 고치지 않는다"
 *   §4 보호 계약 3 — "로더는 로드한 시크릿 값 목록을 executor 생성 시 전달한다"
 *   §4 "두 경로 모두 없으면 설정 방법을 안내하고 종료한다"
 *   §4 보호 계약 4 — 워크스페이스 `.env`를 읽는 코드 자체가 없다
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// 「읽기」쪽(`probeCredentials`)은 **정적 임포트로 잡는다** — 아래 출처 축이 재는 것이
// 값이 아니라 **필드 이름**(`apiKeySource`·`searchApiKeySource`)이라, 이름을 모른 채
// 값으로 훑는 위 `CallStyle` 방식으로는 그 계약을 못 잰다. 선례는
// `onboarding.contract.test.ts`가 같은 함수를 정적으로 부르는 자리다.
import { probeCredentials } from "../src/credentials.ts";
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

/**
 * **배열 밖**의 문자열 값 중 needle과 같은 것이 있는가 — 「이 값이 키로 배달됐는가」의 술어.
 *
 * 배열을 건너뛰는 것이 이 술어의 전부다: 스크러빙용 값 목록(§4 보호 계약 3)은 배열로
 * 오고, 그 목록에 있다는 것과 **그 값이 키로 쓰였다**는 것은 2026-09-02 개정 이후
 * 서로 다른 사실이다. 둘을 한 술어로 재면 아래 우선순위 축이 스크러빙 계약과 충돌한다.
 */
function hasScalarValue(value: unknown, needle: string, depth = 0): boolean {
  if (depth > 6) return false;
  if (typeof value === "string") return value === needle;
  if (Array.isArray(value)) return false;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      hasScalarValue(item, needle, depth + 1),
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
  it("모델 키가 env에 있으면 그 키에 한해 env 값이 이긴다", () => {
    // 근거: §4 우선순위 블록 — "있으면 그 키에 한해 파일 값을 쓰지 않는다".
    //
    // **2026-09-02 갱신 — 재는 것을 좁혔다.** 이 축은 그전까지 "파일 값이 결과
    // 어디에도 없다"를 단정했고, 그 문면은 우선순위가 키별 독립이 되기 전의 §4
    // ("있으면 파일을 읽지 않는다")를 그대로 굳힌 것이었다. 개정 뒤 그 단정은 같은 절의
    // 스크러빙 계약과 **정면으로 충돌한다** — §4가 "파일을 읽었으면 키 이름과 무관하게
    // 그 파일의 모든 값이 들어가고, env로 온 값도 함께 들어간다"로 `secretValues`를
    // 두 갈래의 합집합으로 정하기 때문이다(보호 계약 3이 env 갈래에서도 참이 되는 자리).
    //
    // 그래서 단정을 **갈라 세운다**: 키로 배달되는 값과 스크러빙 목록에 실리는 값은
    // 서로 다른 물음이고, 아래 셋째 줄은 느슨해진 것이 아니라 **새로 생긴 요구**다.
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-FROM-FILE\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", "VALUE-FROM-ENV");
    try {
      const result = load(ctx);
      // ① 키로 배달되는 것은 env 값이다
      expect(hasScalarValue(result, "VALUE-FROM-ENV")).toBe(true);
      // ② 가려진 파일 값은 키로 배달되지 않는다
      expect(hasScalarValue(result, "VALUE-FROM-FILE")).toBe(false);
      // ③ 그러나 스크러빙 목록에는 **있어야 한다** — 빠지면 이 갈래에서만 시크릿이
      //    자식 프로세스로 샌다(§4 합집합 · SAFE-DEFAULTS §3 보호 계약 3)
      expect(hasSecretValueList(result, "VALUE-FROM-FILE")).toBe(true);
      expect(hasSecretValueList(result, "VALUE-FROM-ENV")).toBe(true);
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

describe("크리덴셜 로더 — 찾은 자리의 고지 (CLI-INTERFACE §2.3 · §4)", () => {
  // 근거: §2.3 「이미 있는 값은 묻지 않는다」 — "건너뛴 단계마다 그 사실과 값을 어디서
  //       찾았는지가 화면에 있다"가 계약이고, 같은 소절이 "판정기를 새로 만들지 않고
  //       §4의 로더를 그대로 쓴다"를 든다.
  //
  // **이 축이 재는 것은 출처가 §4의 우선순위 판정과 같은 자리에서 나오는가**다. 배선이
  // env를 다시 들여다봐 파생하면 판정기가 둘이 되고, 갈리는 날 화면이 거짓을 말한다
  // (`ARCHITECTURE.md` §2.6). 값이 맞는지는 위 우선순위 축이 이미 재므로 여기서는
  // **어디서 왔다고 말하는가**만 본다.

  it("env에서 찾은 키의 출처는 env다 — 파일에 같은 키가 있어도 그렇다", () => {
    const content = [
      "ANTHROPIC_API_KEY=VALUE-FROM-FILE",
      "TAVILY_API_KEY=SEARCH-FROM-FILE",
      "",
    ].join("\n");
    const ctx = setupHome({ content, mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", "VALUE-FROM-ENV");
    vi.stubEnv("TAVILY_API_KEY", "SEARCH-FROM-ENV");
    try {
      const probe = probeCredentials(process.env, ctx.credentialsPath);
      expect(probe.apiKey).toBe("VALUE-FROM-ENV");
      expect(probe.apiKeySource).toBe("env");
      expect(probe.searchApiKey).toBe("SEARCH-FROM-ENV");
      expect(probe.searchApiKeySource).toBe("env");
    } finally {
      ctx.cleanup();
    }
  });

  it("파일에서 찾은 키의 출처는 file이다 — 못 찾은 키에는 출처가 없다", () => {
    // 검색 키를 일부러 안 둔다: 「출처는 값이 있을 때만 있다」가 이 조합에서 갈린다.
    // 값 없이 출처만 서면 화면이 «어디선가 찾았다»를 말할 재료를 갖게 된다.
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-FROM-FILE\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("TAVILY_API_KEY", undefined);
    try {
      const probe = probeCredentials(process.env, ctx.credentialsPath);
      expect(probe.apiKey).toBe("VALUE-FROM-FILE");
      expect(probe.apiKeySource).toBe("file");
      expect(probe.searchApiKey).toBeUndefined();
      expect(probe.searchApiKeySource).toBeUndefined();
    } finally {
      ctx.cleanup();
    }
  });

  it("「부재 판정」쪽 반환에는 출처가 실리지 않는다 — 레코드 둘의 분할이 유지된다", () => {
    // 근거: §4 로더 분할 — 두 레코드가 갈리는 것은 "모델 키의 부재를 실패로 옮기는가"
    //       하나다. 출처는 온보딩 고지 하나가 쓰는 것이므로 「읽기」쪽에만 산다.
    const ctx = setupHome({ content: "ANTHROPIC_API_KEY=VALUE-FROM-FILE\n", mode: 0o600 });
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      const result = load(ctx) as Record<string, unknown>;
      expect(result.apiKeySource).toBeUndefined();
      expect(result.searchApiKeySource).toBeUndefined();
    } finally {
      ctx.cleanup();
    }
  });
});
