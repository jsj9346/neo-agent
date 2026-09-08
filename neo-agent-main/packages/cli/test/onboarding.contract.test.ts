/**
 * 첫 실행 온보딩 계약 테스트 — `docs/CLI-INTERFACE.md` §2.3.
 *
 * **이 파일은 화면을 모른다.** §2.3이 계약으로 든 것은 `OnboardingIo`가 주고받는 값이고,
 * 문면·색·입력 판독은 §12가 위임한 표시 세부다(소유는 Codex). 그래서 여기의 `ask`는
 * 스크립트된 대역이고, 재는 것은 **무엇을 물었는가 · 무엇을 썼는가 · 무엇을 안 썼는가**다.
 *
 * §2.1의 관문이 «계약 표면은 키를 알지 않는다»를 지킨 것과 같은 규율이다 — 그쪽은 키
 * 바이트를, 이쪽은 화면 문면을 모른다.
 *
 * **이 파일은 문면을 인용부호로 고정하지 않는다** — `DOC-CITATION.md` §6 U-b가 대조 축을
 * 각 패키지의 테스트 디렉터리까지 넓혔고 이 파일이 그 자리 안이다. 대조받지 않는 인용부호는
 * 원문이 이렇다는 신호만 주고 그 신호가 참인지 아무도 묻지 않는다. 여기 나오는 겹화살괄호는
 * 정본 §2.3·§2.1의 문면을 그대로 든 것이고, 갈리면 그 문서 편에 선다.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelKeyVerdict } from "@neo-agent/providers";
import type { SearchKeyVerdict } from "@neo-agent/web";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfigPath } from "../src/config.ts";
import { defaultCredentialsPath, probeCredentials } from "../src/credentials.ts";
import {
  ONBOARDING_STEPS,
  type OnboardingAnswer,
  type OnboardingIo,
  type OnboardingPrompt,
  type OnboardingSkipSource,
  type OnboardingStepId,
  type OnboardingVerifier,
  persistOnboarding,
  runOnboarding,
} from "../src/onboarding.ts";

const homes: string[] = [];

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "neo-onboarding-"));
  homes.push(home);
  // mkdtemp가 만든 것은 홈의 **부모**가 아니라 홈 자체의 대역이다. `~/.neo-agent/`는
  // 아직 없어야 한다 — 그 부재가 이 파일의 여러 단정이 재는 것이다.
  return home;
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

/** 스크립트된 표현 계층. 물어온 프롬프트를 전부 기록한다 */
function scriptedIo(answers: readonly OnboardingAnswer[]): OnboardingIo & {
  readonly asked: OnboardingPrompt[];
  readonly skipped: { step: OnboardingStepId; source: OnboardingSkipSource }[];
} {
  const asked: OnboardingPrompt[] = [];
  const skipped: { step: OnboardingStepId; source: OnboardingSkipSource }[] = [];
  let index = 0;
  return {
    asked,
    skipped,
    ask(prompt) {
      asked.push(prompt);
      const answer = answers[index++];
      if (answer === undefined) throw new Error(`대역 답이 모자란다 — ${index}번째 물음`);
      return Promise.resolve(answer);
    },
    noteSkipped(step, source) {
      skipped.push({ step, source });
    },
  };
}

function verifier(overrides: Partial<OnboardingVerifier> = {}): OnboardingVerifier {
  return {
    modelKey: () => Promise.resolve<ModelKeyVerdict>({ kind: "ok" }),
    searchKey: () => Promise.resolve<SearchKeyVerdict>({ kind: "ok" }),
    ...overrides,
  };
}

const value = (v: string): OnboardingAnswer => ({ kind: "value", value: v });
const skip: OnboardingAnswer = { kind: "skip" };
const abort: OnboardingAnswer = { kind: "abort" };

describe("§2.3 무엇을 묻는가 — 닫힌 셋, 순서가 계약이다", () => {
  it("묻는 순서는 모델 → 모델 키 → 검색 키다", async () => {
    const io = scriptedIo([value("m"), value("k"), value("s")]);
    const outcome = await runOnboarding({
      io,
      verifier: verifier(),
      defaultModel: "default-model",
      existing: {},
    });

    expect(outcome.kind).toBe("completed");
    expect(io.asked.map((p) => p.step)).toEqual(["model", "model-key", "search-key"]);
  });

  it("단계 목록이 닫힌 셋이고 그 순서와 같다", () => {
    // 넷째가 생기려면 §2.3의 표와 §2.1 비용 상한의 기능 층 문장이 함께 개정된다.
    expect([...ONBOARDING_STEPS]).toEqual(["model", "model-key", "search-key"]);
  });

  it("건너뛸 수 있는 단계는 검색 키 하나다", async () => {
    const io = scriptedIo([value("m"), value("k"), skip]);
    await runOnboarding({ io, verifier: verifier(), defaultModel: "d", existing: {} });

    const skippable = io.asked.filter((p) => p.skippable).map((p) => p.step);
    expect(skippable).toEqual(["search-key"]);
  });

  it("기본값을 드는 단계는 모델 하나이고 그 값은 주입된 기본 모델이다", async () => {
    const io = scriptedIo([value("m"), value("k"), skip]);
    await runOnboarding({ io, verifier: verifier(), defaultModel: "default-model", existing: {} });

    const withDefault = io.asked.filter((p) => p.defaultValue !== undefined);
    expect(withDefault.map((p) => p.step)).toEqual(["model"]);
    expect(withDefault[0]?.defaultValue).toBe("default-model");
  });

  it("키 둘은 되비추지 않는다 — echo가 거짓이다", async () => {
    const io = scriptedIo([value("m"), value("k"), value("s")]);
    await runOnboarding({ io, verifier: verifier(), defaultModel: "d", existing: {} });

    const echoing = io.asked.filter((p) => p.echo).map((p) => p.step);
    expect(echoing).toEqual(["model"]);
  });
});

describe("§2.3 이미 있는 값은 묻지 않는다", () => {
  it("모델 키가 이미 있으면 그 단계를 묻지 않고 출처를 알린다", async () => {
    const io = scriptedIo([value("m"), skip]);
    const outcome = await runOnboarding({
      io,
      verifier: verifier(),
      defaultModel: "d",
      existing: { apiKey: "already", apiKeySource: "env" },
    });

    expect(io.asked.map((p) => p.step)).toEqual(["model", "search-key"]);
    expect(io.skipped).toContainEqual({ step: "model-key", source: "env" });
    // **받은 값만 든다** — 이미 있던 키는 결과에 없다(§2.3 계약 표면).
    expect(outcome.kind === "completed" && outcome.values.apiKey).toBeUndefined();
  });

  it("검색 키가 이미 있으면 그 단계를 묻지 않고 결과에도 없다", async () => {
    const io = scriptedIo([value("m"), value("k")]);
    const outcome = await runOnboarding({
      io,
      verifier: verifier(),
      defaultModel: "d",
      existing: { searchApiKey: "already", searchApiKeySource: "file" },
    });

    expect(io.asked.map((p) => p.step)).toEqual(["model", "model-key"]);
    expect(io.skipped).toContainEqual({ step: "search-key", source: "file" });
    expect(outcome.kind === "completed" && outcome.values.searchApiKey).toBeUndefined();
  });

  it("모델은 언제나 묻는다 — 기본값이 있는 선택 키라 「있음」이 「골랐음」이 아니다", async () => {
    const io = scriptedIo([value("m")]);
    await runOnboarding({
      io,
      verifier: verifier(),
      defaultModel: "d",
      existing: { apiKey: "a", searchApiKey: "s" },
    });

    expect(io.asked.map((p) => p.step)).toEqual(["model"]);
  });

  it("이미 있는 모델 키는 확인하지 않는다 — 되물을 자리가 없기 때문이다", async () => {
    let called = 0;
    const io = scriptedIo([value("m"), skip]);
    await runOnboarding({
      io,
      verifier: verifier({
        modelKey: () => {
          called += 1;
          return Promise.resolve<ModelKeyVerdict>({ kind: "invalid-key", cause: "거부" });
        },
      }),
      defaultModel: "d",
      existing: { apiKey: "already", apiKeySource: "env" },
    });

    expect(called).toBe(0);
  });
});

describe("§2.3 키 확인 — 받은 값만, 되묻기 하나", () => {
  it("확인 호출은 사용자가 고른 모델로 1회 간다", async () => {
    const seen: { apiKey: string; model: string }[] = [];
    const io = scriptedIo([value("my-model"), value("my-key"), skip]);
    await runOnboarding({
      io,
      verifier: verifier({
        modelKey: (apiKey, model) => {
          seen.push({ apiKey, model });
          return Promise.resolve<ModelKeyVerdict>({ kind: "ok" });
        },
      }),
      defaultModel: "default-model",
      existing: {},
    });

    // 기본 모델이 아니라 **사용자가 고른 모델**로 재는 것이 §2.3의 순서 계약이 사는 이유다.
    expect(seen).toEqual([{ apiKey: "my-key", model: "my-model" }]);
  });

  it("키가 거부되면 키 단계를 다시 묻고 사유를 함께 준다", async () => {
    let attempt = 0;
    const io = scriptedIo([value("m"), value("bad"), value("good"), skip]);
    const outcome = await runOnboarding({
      io,
      verifier: verifier({
        modelKey: () => {
          attempt += 1;
          return Promise.resolve<ModelKeyVerdict>(
            attempt === 1 ? { kind: "invalid-key", cause: "401" } : { kind: "ok" },
          );
        },
      }),
      defaultModel: "d",
      existing: {},
    });

    expect(io.asked.map((p) => p.step)).toEqual(["model", "model-key", "model-key", "search-key"]);
    expect(io.asked[2]?.rejection).toEqual({
      step: "model-key",
      kind: "invalid-key",
      cause: "401",
    });
    expect(outcome.kind === "completed" && outcome.values.apiKey).toBe("good");
  });

  it("모델을 못 찾으면 **모델 단계**로 돌아간다 — 되묻는 대상만 원인이 고른다", async () => {
    let attempt = 0;
    const io = scriptedIo([value("wrong"), value("k"), value("right"), value("k2"), skip]);
    const outcome = await runOnboarding({
      io,
      verifier: verifier({
        modelKey: () => {
          attempt += 1;
          return Promise.resolve<ModelKeyVerdict>(
            attempt === 1 ? { kind: "unknown-model", cause: "404" } : { kind: "ok" },
          );
        },
      }),
      defaultModel: "d",
      existing: {},
    });

    expect(io.asked.map((p) => p.step)).toEqual([
      "model",
      "model-key",
      "model",
      "model-key",
      "search-key",
    ]);
    expect(io.asked[2]?.rejection).toEqual({ step: "model", kind: "unknown-model", cause: "404" });
    expect(outcome.kind === "completed" && outcome.values.model).toBe("right");
  });

  it("확인 자체가 안 되면 되묻되 「키가 틀렸다」로 접지 않는다", async () => {
    let attempt = 0;
    const io = scriptedIo([value("m"), value("k"), value("k"), skip]);
    await runOnboarding({
      io,
      verifier: verifier({
        modelKey: () => {
          attempt += 1;
          return Promise.resolve<ModelKeyVerdict>(
            attempt === 1 ? { kind: "unverifiable", cause: "ETIMEDOUT" } : { kind: "ok" },
          );
        },
      }),
      defaultModel: "d",
      existing: {},
    });

    expect(io.asked[2]?.rejection?.kind).toBe("unverifiable");
  });

  it("검색 키의 확인 실패는 건너뛰기로 빠져나갈 수 있고 저장되지 않는다", async () => {
    const io = scriptedIo([value("m"), value("k"), value("bad"), skip]);
    const outcome = await runOnboarding({
      io,
      verifier: verifier({
        searchKey: () => Promise.resolve<SearchKeyVerdict>({ kind: "invalid-key", cause: "401" }),
      }),
      defaultModel: "d",
      existing: {},
    });

    expect(io.asked.map((p) => p.step)).toEqual(["model", "model-key", "search-key", "search-key"]);
    expect(outcome.kind === "completed" && outcome.values.searchApiKey).toBeUndefined();
  });
});

describe("§2.3 중단 — 어느 단계에서든 같은 귀결이다", () => {
  for (const [name, answers] of [
    ["모델 단계", [abort]],
    ["모델 키 단계", [value("m"), abort]],
    ["검색 키 단계", [value("m"), value("k"), abort]],
  ] as const) {
    it(`${name}의 중단은 aborted이고 값을 하나도 안 남긴다`, async () => {
      const io = scriptedIo([...answers]);
      const outcome = await runOnboarding({
        io,
        verifier: verifier(),
        defaultModel: "d",
        existing: {},
      });

      expect(outcome).toEqual({ kind: "aborted" });
    });
  }
});

describe("§2.3 `0d` 영속화 — 얹기이고 통째 교체가 아니다", () => {
  it("완주는 두 파일을 남기고 모드가 600·700이다", () => {
    const home = makeHome();
    persistOnboarding({
      credentialsPath: defaultCredentialsPath(home),
      configPath: defaultConfigPath(home),
      values: { model: "chosen-model", apiKey: "sk-test", searchApiKey: "tv-test" },
    });

    const credentialsPath = defaultCredentialsPath(home);
    const configPath = defaultConfigPath(home);
    expect(existsSync(credentialsPath)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    expect(statSync(credentialsPath).mode & 0o777).toBe(0o600);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".neo-agent")).mode & 0o777).toBe(0o700);
  });

  it("고른 모델이 config.json에 실리고 나머지 키는 안 실린다", () => {
    const home = makeHome();
    persistOnboarding({
      credentialsPath: defaultCredentialsPath(home),
      configPath: defaultConfigPath(home),
      values: { model: "chosen-model", apiKey: "sk-test" },
    });

    const record = JSON.parse(readFileSync(defaultConfigPath(home), "utf8"));
    // 「안 만진 상태가 가장 안전」(§3) — 기본값을 파일에 박지 않는다.
    expect(Object.keys(record)).toEqual(["model"]);
    expect(record.model).toBe("chosen-model");
  });

  it("받지 않은 키는 credentials에 안 쓴다 — env 시크릿이 파일로 복사되지 않는다", () => {
    const home = makeHome();
    persistOnboarding({
      credentialsPath: defaultCredentialsPath(home),
      configPath: defaultConfigPath(home),
      values: { model: "m", searchApiKey: "tv-only" },
    });

    const text = readFileSync(defaultCredentialsPath(home), "utf8");
    expect(text).toContain("TAVILY_API_KEY=tv-only");
    expect(text).not.toContain("ANTHROPIC_API_KEY");
  });

  it("기존 키와 주석을 보존하고 받은 키만 얹는다", () => {
    const home = makeHome();
    const credentialsPath = defaultCredentialsPath(home);
    mkdirSync(join(home, ".neo-agent"), { recursive: true, mode: 0o700 });
    // §4 안내를 따랐으나 완주는 못 한 홈 — §2.3이 흔하다고 든 그 조합이다.
    writeFile(credentialsPath, "# 내 메모\nANTHROPIC_API_KEY=sk-existing\n");

    persistOnboarding({
      credentialsPath,
      configPath: defaultConfigPath(home),
      values: { model: "m", searchApiKey: "tv-new" },
    });

    const text = readFileSync(credentialsPath, "utf8");
    expect(text).toContain("# 내 메모");
    expect(text).toContain("ANTHROPIC_API_KEY=sk-existing");
    expect(text).toContain("TAVILY_API_KEY=tv-new");
  });

  it("같은 키를 다시 받으면 줄을 갈아끼우고 늘리지 않는다", () => {
    const home = makeHome();
    const credentialsPath = defaultCredentialsPath(home);
    mkdirSync(join(home, ".neo-agent"), { recursive: true, mode: 0o700 });
    writeFile(credentialsPath, "ANTHROPIC_API_KEY=old\n");

    persistOnboarding({
      credentialsPath,
      configPath: defaultConfigPath(home),
      values: { model: "m", apiKey: "new" },
    });

    const lines = readFileSync(credentialsPath, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("ANTHROPIC_API_KEY"));
    expect(lines).toEqual(["ANTHROPIC_API_KEY=new"]);
  });

  it("쓴 값을 §4의 로더가 그대로 읽는다 — 첫 세션과 다음 세션이 같은 코드를 지난다", () => {
    const home = makeHome();
    persistOnboarding({
      credentialsPath: defaultCredentialsPath(home),
      configPath: defaultConfigPath(home),
      values: { model: "m", apiKey: "sk-roundtrip", searchApiKey: "tv-roundtrip" },
    });

    const probe = probeCredentials({}, defaultCredentialsPath(home));
    expect(probe.apiKey).toBe("sk-roundtrip");
    expect(probe.searchApiKey).toBe("tv-roundtrip");
  });
});

/**
 * 모드를 600으로 못박아 쓴다 — 느슨하게 만들면 로더의 fail-closed가 이 파일의 다른
 * 단정을 먼저 죽인다(§4 보호 계약 1).
 */
function writeFile(path: string, text: string): void {
  writeFileSync(path, text, { encoding: "utf8", mode: 0o600 });
}
