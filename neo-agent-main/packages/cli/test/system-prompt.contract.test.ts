/**
 * 시스템 프롬프트의 **내용 계약** — 독립 검증(T-004).
 *
 * **기대값의 출처는 `docs/CLI-INTERFACE.md` §3.1뿐이다.** `packages/cli/src/system-prompt.ts`의
 * 문자열도 주석도 읽지 않았다 — 그 절이 그 실패 형태를 이름으로 든다: 정본이 없으면 QA가
 * 구현 주석에서 기대값을 읽게 되고, 그것이 수행자·검증자 분리가 막으려는 형태다.
 *
 * 이 파일이 세우는 축은 **둘**이고, 그 수는 §3.1이 정했다 — "기계가 지는 것은 둘"이다.
 *
 *   축 A — "식별자 다섯의 리터럴 0건"          (계약 2의 기계화 가능 부분)
 *   축 B — "구성을 바꿔 만든 스캐폴드가 바이트 동일"  (계약 1)
 *
 * **셋째 축을 두지 않는다.** 계약 3의 세 층이 실제로 서 있는가와, `shell`·`remember` 같은
 * 영어 낱말이 능력 서술인가 등록 여부 주장인가는 §3.1이 리뷰의 몫으로 남겼다. 축으로
 * 만들면 정당한 능력 서술이 레드가 되고, 문서 머리의 「조정 가능」(프롬프트 스캐폴드의
 * 문면)을 어긴다. 그래서 이 파일에는 **스캐폴드 문면을 리터럴로 고정하는 단정이 없다.**
 *
 * **모집단은 스캐폴드다** — "계약이 걸리는 것은 스캐폴드이지 `buildSystemPrompt`의 출력
 * 전체가 아니다". 메모리 블록은 사용자가 쓴 파일 텍스트를 그대로 싣고, 그것을 재는 축은
 * 이 계약을 재는 축이 아니다: "실사용자의 메모리를 읽어 재는 축을 새로 두면 그 축은 이
 * 계약을 재는 것이 아니다". 그래서 **주입하는 메모리 텍스트는 이 검사가 고른다.**
 *
 * **소스 텍스트는 이 파일의 소관이 아니다.** 모듈 소스(주석 포함)에 검색 도구 이름이
 * 0건인가를 재는 축은 `WEB-ACCESS.md` §3.2가 소유하고 `web-search-wiring.contract.test.ts`
 * §6에 산다. 이 파일은 `system-prompt.ts`를 **임포트만 하고 파일로 읽지 않는다** — 그것이
 * 기대값을 구현에서 읽지 않았다는 것의 기계적 근거다.
 *
 * **네트워크를 쓰지 않는다.** 모델은 대역이고 Docker 판정은 명시 주입이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliConfig } from "../src/config.ts";
import { buildSystemPrompt } from "../src/system-prompt.ts";
import type { CliApp, CliDeps, ShellWiring, WiringFactories } from "../src/wiring.ts";
import { startCli } from "../src/wiring.ts";
import { dockerAvailable, dockerProbeForbidden, dockerUnavailable } from "./probe-docker.ts";

/**
 * §3.1이 이름으로 든 다섯. **리터럴 배열이다** — 구현의 상수를 참조하면 이름이 바뀌어도
 * 아무것도 붉어지지 않는다.
 *
 * `shell`·`remember`가 여기 없는 것은 누락이 아니라 §3.1의 판정이다: 언더스코어를 가진
 * 식별자가 아니라 영어 낱말이라 리터럴 0건이라는 수단이 안 통하고, 그 자리는 리뷰가 진다.
 */
const TOOL_IDENTIFIERS = [
  "read_file",
  "write_file",
  "edit_file",
  "web_fetch",
  "web_search",
] as const;

/** 키 이름은 §4가 든 리터럴이다 — 구현 상수를 쓰면 이름이 바뀌어도 안 붉어진다 */
const MODEL_KEY = "ANTHROPIC_API_KEY";
const SEARCH_KEY = "TAVILY_API_KEY";

/** 문자열에 needle이 몇 번 나오는가 — 「0건」 축의 술어 */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** 다섯 중 실제로 나타난 이름들. 축 A의 술어 본체 */
function identifiersIn(text: string): string[] {
  return TOOL_IDENTIFIERS.filter((name) => countOf(text, name) > 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 축 A — 스캐폴드에 식별자 다섯이 0건 (§3.1 계약 2 · 기계가 지는 것 ①)
// ═══════════════════════════════════════════════════════════════════════════

/** 축 A가 쓰는 워크스페이스 루트. 값은 검사가 고르고 아무 의미도 싣지 않는다 */
const AXIS_A_ROOT = "/tmp/neo-agent-qa-workspace";

/**
 * **검사가 고른** 메모리 텍스트 — 다섯을 전부 담는다.
 *
 * 사용자가 자기 메모에 도구 이름을 적는 것은 이 계약이 막는 대상이 아니므로, 이 텍스트가
 * 실린 출력이 레드가 되면 그것이 곧 모집단 경계의 위반이다.
 */
const CHOSEN_MEMORY_BLOCK = [
  "## Memory",
  "- 사용자가 자기 메모에 적은 도구 이름들:",
  "  read_file write_file edit_file web_fetch web_search",
].join("\n");

/** 이름을 하나도 안 담은 메모리 — 같은 갈래의 반대편 */
const CHOSEN_MEMORY_BLOCK_CLEAN = ["## Memory", "- 오늘 배포는 금요일에 하지 않는다"].join("\n");

describe("축 A — 스캐폴드에 식별자 다섯이 0건 (CLI-INTERFACE §3.1 계약 2)", () => {
  /**
   * 근거: §3.1 계약 2 — 스캐폴드는 어느 도구도 이름으로 적지 않는다. 기계가 지는 자리는
   * 식별자 다섯의 리터럴 0건이다.
   *
   * **대조군은 내용 독립이다** — 길이 하한과 워크스페이스 루트의 존재로만 잰다. 특정
   * 낱말의 존재로 재면 그 대조군이 스캐폴드 문면에 결합하고, 문면은 세부다(문서 머리).
   */
  it("메모리 없는 스캐폴드에 다섯이 0건이다", () => {
    const scaffold = buildSystemPrompt(AXIS_A_ROOT);

    // 대조군 — 재는 대상이 비어 있지 않다. 없으면 아래 0건이 아무것도 안 잰다
    expect(scaffold.length).toBeGreaterThan(200);
    expect(scaffold).toContain(AXIS_A_ROOT);

    expect(identifiersIn(scaffold)).toEqual([]);
  });

  /**
   * 근거: §3.1 「모집단」 — 계약이 걸리는 것은 스캐폴드이지 `buildSystemPrompt`의 출력
   * 전체가 아니다.
   *
   * **술어가 절대값이 아니라 차분인 것이 요점이다.** 출력의 히트 수가 검사가 고른 메모리
   * 텍스트의 히트 수와 같으면, 스캐폴드가 기여한 것이 0이다. 「출력 전체에 0건」으로 재면
   * 사용자의 메모를 검열하는 축이 되고, §3.1이 그 축을 금지했다.
   */
  it("메모리 블록이 이름을 담아도 스캐폴드의 기여는 0이다", () => {
    const output = buildSystemPrompt(AXIS_A_ROOT, CHOSEN_MEMORY_BLOCK);

    // 대조군 — 고른 메모리가 실제로 실렸고 다섯을 전부 담는다.
    // 이것이 없으면 아래 차분 단정이 0 === 0으로 공허해진다
    expect(output).toContain(CHOSEN_MEMORY_BLOCK);
    for (const name of TOOL_IDENTIFIERS) {
      expect(countOf(CHOSEN_MEMORY_BLOCK, name), `고른 메모리에 ${name}이 없다`).toBeGreaterThan(0);
    }

    for (const name of TOOL_IDENTIFIERS) {
      expect(countOf(output, name), `${name} — 스캐폴드가 기여했다`).toBe(
        countOf(CHOSEN_MEMORY_BLOCK, name),
      );
    }

    // **이 줄이 모집단 경계 자체다.** 출력 전체에는 이름이 있고, 그것은 위반이 아니다
    expect(countOf(output, "web_search")).toBeGreaterThan(0);
  });

  /** 이름을 안 담은 메모리를 준 갈래에서는 출력 전체가 0건이다 */
  it("이름 없는 메모리를 준 갈래의 출력에 다섯이 0건이다", () => {
    const output = buildSystemPrompt(AXIS_A_ROOT, CHOSEN_MEMORY_BLOCK_CLEAN);

    // 대조군 — 내용 독립
    expect(output.length).toBeGreaterThan(200);
    expect(output).toContain(AXIS_A_ROOT);
    expect(output).toContain(CHOSEN_MEMORY_BLOCK_CLEAN);

    expect(identifiersIn(output)).toEqual([]);
  });

  /**
   * **역검증** — 「없어야 한다」 축은 대상이 비면 조용히 그린이다. 다섯 **각각**에 대해
   * 주입하면 술어가 잡는 것을 단정한다.
   *
   * **증분으로 잰다.** 절대값으로 재면 이 역검증 자신이 스캐폴드의 현재 내용에 결합해,
   * 실물이 오염된 날 축과 함께 붉어지며 「술어가 살아 있는가」라는 물음이 답을 잃는다.
   * 그래서 둘로 나눈다: 주입이 실물에 실제로 얹혔는가는 실물 기준의 **차분**으로,
   * 술어가 살아 있는가는 **검사가 고른 기저 문자열**로 잰다. 후자는 실물이 오염돼도
   * 답을 잃지 않는다 — 2026-09-02 실측에서 절대값 형태가 정확히 그 방식으로 함께
   * 붉어지는 것을 확인하고 이 형태로 바꿨다.
   */
  it("역검증 — 다섯 각각을 심으면 술어가 잡는다", () => {
    const scaffold = buildSystemPrompt(AXIS_A_ROOT);
    /** 검사가 고른 기저. 실물과 무관하고 다섯을 하나도 안 담는다 */
    const base = "A base line chosen by this check. It names no tool.";

    // 술어 자신의 생존 — 기저가 깨끗하다는 것부터 잰다
    expect(identifiersIn(base)).toEqual([]);

    for (const name of TOOL_IDENTIFIERS) {
      // ① 실물 기준 차분 — 주입이 스캐폴드 위에 정확히 하나 얹혔다
      const injected = `${scaffold}\nThe ${name} tool is always available.`;
      expect(countOf(injected, name), `${name} — 주입이 증분 1을 안 냈다`).toBe(
        countOf(scaffold, name) + 1,
      );

      // ② 술어 생존 — 기저에 심으면 그 이름 하나가 잡힌다
      expect(identifiersIn(`${base} The ${name} tool exists.`), `${name} — 술어가 죽었다`).toEqual([
        name,
      ]);
    }
  });

  /**
   * **역검증 (모집단 경계)** — 차분 술어가 스캐폴드 오염을 실제로 잡는가. 메모리에만
   * 있는 히트는 통과하고 스캐폴드에 하나 더해진 히트는 잡혀야 한다.
   */
  it("역검증 — 메모리 갈래에서도 스캐폴드 오염을 차분이 잡는다", () => {
    const clean = buildSystemPrompt(AXIS_A_ROOT, CHOSEN_MEMORY_BLOCK);

    for (const name of TOOL_IDENTIFIERS) {
      const polluted = clean.replace(AXIS_A_ROOT, `${AXIS_A_ROOT} — use ${name} first`);
      expect(countOf(polluted, name), `${name} — 오염이 증분 1을 안 냈다`).toBe(
        countOf(clean, name) + 1,
      );
      expect(countOf(polluted, name), `${name} — 차분 술어가 오염을 놓쳤다`).not.toBe(
        countOf(CHOSEN_MEMORY_BLOCK, name),
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 축 B — 스캐폴드는 구성에 불변이다 (§3.1 계약 1 · 기계가 지는 것 ②)
// ═══════════════════════════════════════════════════════════════════════════

let root: string;
let home: string;
let workspace: string;

/** 검사가 고른 메모리 파일 내용. 두 갈래가 같은 메모리를 보게 해 변수를 구성 하나로 줄인다 */
const RIG_MEMORY_LINE = "- 축 B가 고른 메모리 한 줄이다";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-cli-system-prompt-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(workspace, { recursive: true });
  // `0b` 첫 기동 관문(§2.1)을 이미 지난 홈 — 판정 재료는 `sessions.db`의 부재 하나뿐이다
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  chmodSync(join(home, ".neo-agent"), 0o700);
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
  // 메모리는 두 갈래에서 **같다**. 구성만 갈리게 하는 것이 이 축의 전제다
  mkdirSync(join(home, ".neo-agent", "memory"), { recursive: true });
  writeFileSync(join(home, ".neo-agent", "memory", "MEMORY.md"), `${RIG_MEMORY_LINE}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function fakeModel(): ModelClient {
  return {
    modelId: "fake-model",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "." }],
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function settle(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

const realFactories = await (async () => {
  const { resolveFactories } = await import("../src/wiring.ts");
  return resolveFactories();
})();

interface Branch {
  /** `~/.neo-agent/config.json`에 쓸 내용. 빠지면 `{}` */
  config?: Record<string, unknown>;
  /** 프로세스 env. 빠지면 모델 키 하나만 */
  env?: NodeJS.ProcessEnv;
  /** `~/.neo-agent/credentials` 내용. 빠지면 파일을 지운다 */
  credentials?: string;
  probeDocker?: WiringFactories["probeDocker"];
}

interface Observed {
  /** 세션에 기록된 프롬프트 — 이 축이 비교하는 바이트다 */
  prompt: string;
  toolNames: string[];
  shell: ShellWiring;
  config: CliConfig;
  contextWindowTokens: number;
  apiKey: string;
  hasSearchKey: boolean;
}

/** 한 갈래를 기동해 관측치를 뽑고 정리한다. 프로세스 env를 만지지 않는다 — 주입이다 */
async function observe(branch: Branch): Promise<Observed> {
  const configPath = join(home, ".neo-agent", "config.json");
  writeFileSync(configPath, JSON.stringify(branch.config ?? {}));

  const credentialsPath = join(home, ".neo-agent", "credentials");
  rmSync(credentialsPath, { force: true });
  if (branch.credentials !== undefined) {
    writeFileSync(credentialsPath, branch.credentials, { mode: 0o600 });
    chmodSync(credentialsPath, 0o600);
  }

  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 120;
  output.resume();

  const deps: CliDeps = {
    argv: [],
    env: branch.env ?? { [MODEL_KEY]: "sk-ant-축B" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qa-system-prompt",
    factories: {
      createModelClient: () => fakeModel(),
      // Docker 판정은 **명시 주입**이다(`./probe-docker.ts`)
      probeDocker: branch.probeDocker ?? dockerAvailable(),
      createExecutor: realFactories.createExecutor,
      createSearchTool: realFactories.createSearchTool,
    },
  };

  const app: CliApp = await startCli(deps, { kind: "run" });
  const running = app.run();
  await settle();

  const observed: Observed = {
    prompt: app.parts.session.systemPrompt,
    toolNames: app.parts.tools.map((tool) => tool.name),
    shell: app.parts.shell,
    config: app.parts.config,
    contextWindowTokens: app.parts.contextWindow.tokens,
    apiKey: app.parts.credentials.apiKey,
    hasSearchKey: app.parts.credentials.searchApiKey !== undefined,
  };

  await app.shutdown();
  await running;
  return observed;
}

/**
 * 두 갈래의 프롬프트가 **바이트 동일**한지와, 대상이 비지 않았는지를 함께 잰다.
 *
 * 대조군을 여기 두는 것은 「둘 다 빈 문자열이라 같다」가 조용한 그린이기 때문이다.
 * 워크스페이스 루트와 검사가 고른 메모리 줄의 존재로 잰다 — 둘 다 내용 독립이다.
 */
function expectSamePrompt(a: Observed, b: Observed, label: string): void {
  expect(a.prompt.length, `${label} — 프롬프트가 비었다`).toBeGreaterThan(200);
  // 기대값을 `realpathSync`로 정규화한다 — 경계가 realpath로 동결되므로
  // (`WorkspaceBoundary.root`) 그러지 않으면 tmpdir이 심링크인 플랫폼에서 대조군만
  // 거짓 레드가 된다.
  expect(a.prompt, `${label} — 워크스페이스 루트가 안 실렸다`).toContain(realpathSync(workspace));
  expect(a.prompt, `${label} — 메모리 블록이 안 실렸다`).toContain(RIG_MEMORY_LINE);
  expect(b.prompt, `${label} — 프롬프트가 갈렸다`).toBe(a.prompt);
}

describe("축 B — 스캐폴드는 구성에 불변이다 (CLI-INTERFACE §3.1 계약 1)", () => {
  /**
   * **대조군 — 계약 1의 첫 문장은 시그니처 주장이다.** `buildSystemPrompt`가 받는 것은
   * 워크스페이스 루트와 메모리 블록 둘뿐이다. 행위만 재고 이것을 안 재면 셋째 인자가
   * 생겨도 아래 고른 갈래들에서만 안 갈리면 조용히 통과한다.
   *
   * **이것은 셋째 축이 아니라 축 B의 대조군이다** — §3.1이 닫은 기계의 몫 둘은 그대로다.
   *
   * 소스를 읽지 않고 재는 수단 둘을 함께 쓴다: 선언된 인자 수와, 인자를 더 줘도 출력이
   * 안 갈린다는 것. 후자가 있어야 기본값을 가진 셋째 인자(선언 인자 수에 안 잡힌다)도 걸린다.
   */
  it("대조군 — buildSystemPrompt의 인자는 둘뿐이다", () => {
    expect(buildSystemPrompt.length).toBe(2);

    const withExtras = (buildSystemPrompt as unknown as (...args: unknown[]) => string)(
      AXIS_A_ROOT,
      undefined,
      { sandbox: "off", approvalMode: "off" },
      { dockerAvailable: false },
      "TAVILY_API_KEY=있음",
    );
    expect(withExtras).toBe(buildSystemPrompt(AXIS_A_ROOT));
  });

  /**
   * 근거: §3.1 계약 1 — Docker 가용성도 프롬프트를 가르지 않는다. 조립 순서가 그것을
   * 강제한다: 프롬프트는 3b에서 만들어지고 셸 판정은 5b다.
   *
   * 대조군: 이 갈래는 **도구 집합을 실제로 가른다**(`shell` 등록 여부).
   */
  it("Docker 가용/불가용이 프롬프트를 가르지 않는다", async () => {
    const available = await observe({ config: { sandbox: "on" }, probeDocker: dockerAvailable() });
    const unavailable = await observe({
      config: { sandbox: "on" },
      probeDocker: dockerUnavailable(),
    });

    // 대조군 — 구성이 실제로 적용됐다
    expect(available.toolNames).toContain("shell");
    expect(unavailable.toolNames).not.toContain("shell");
    expect(unavailable.shell.kind).toBe("unavailable");

    expectSamePrompt(available, unavailable, "Docker 가용성");
  });

  /**
   * 근거: §3.1 계약 1 — 크리덴셜의 유무도 프롬프트를 가르지 않는다.
   *
   * 대조군: 이 갈래도 **도구 집합을 가른다**(`web_search` 등록 여부).
   */
  it("검색 키의 유무가 프롬프트를 가르지 않는다", async () => {
    const withKey = await observe({
      env: { [MODEL_KEY]: "sk-ant-축B", [SEARCH_KEY]: "검색-키" },
    });
    const withoutKey = await observe({ env: { [MODEL_KEY]: "sk-ant-축B" } });

    // 대조군 — 구성이 실제로 적용됐다
    expect(withKey.hasSearchKey).toBe(true);
    expect(withoutKey.hasSearchKey).toBe(false);
    expect(withKey.toolNames).toContain("web_search");
    expect(withoutKey.toolNames).not.toContain("web_search");

    expectSamePrompt(withKey, withoutKey, "검색 키");
  });

  /**
   * 근거: §3.1 계약 1 — `config.json`의 어떤 값도 프롬프트를 가르지 않는다.
   *
   * 대조군: 도구 집합은 **안 갈린다.** 실행자 종류로 잰다 — `sandbox: "off"`는 호스트
   * 실행 옵트아웃이고 판정 자체를 하지 않으므로 그 갈래에 `dockerProbeForbidden`을 준다.
   */
  it("샌드박스 on/off가 프롬프트를 가르지 않는다", async () => {
    const on = await observe({ config: { sandbox: "on" }, probeDocker: dockerAvailable() });
    const off = await observe({ config: { sandbox: "off" }, probeDocker: dockerProbeForbidden() });

    // 대조군 — 실행자 종류가 갈렸다(도구 집합은 안 갈린다)
    expect(on.shell.kind).toBe("sandbox");
    expect(off.shell.kind).toBe("host");
    expect(on.toolNames).toEqual(off.toolNames);

    expectSamePrompt(on, off, "샌드박스 모드");
  });

  /**
   * 근거: §3.1 계약 1 — `config.json`의 어떤 값도.
   *
   * 대조군: 도구 집합은 안 갈린다. **로드된 설정값**으로 잰다.
   */
  it("승인 모드 manual/off가 프롬프트를 가르지 않는다", async () => {
    const manual = await observe({ config: { approvalMode: "manual" } });
    const off = await observe({ config: { approvalMode: "off" } });

    // 대조군 — 설정이 실제로 로드됐다
    expect(manual.config.approvalMode).toBe("manual");
    expect(off.config.approvalMode).toBe("off");
    expect(manual.toolNames).toEqual(off.toolNames);

    expectSamePrompt(manual, off, "승인 모드");
  });

  /**
   * 근거: §3.1 계약 1 — 크리덴셜의 유무도. 여기서 갈리는 것은 **로드 경로**다.
   *
   * 대조군: 두 갈래에 **서로 다른 키 값**을 준다. 값이 갈린 것이 관측되면 두 갈래가
   * 실제로 다른 경로로 로드됐다는 뜻이다 — 「둘 다 env로 읽혔다」가 조용히 통과하지 않는다.
   */
  it("모델 키가 env에서 왔는지 파일에서 왔는지가 프롬프트를 가르지 않는다", async () => {
    const fromEnv = await observe({ env: { [MODEL_KEY]: "sk-ant-env-갈래" } });
    const fromFile = await observe({
      env: {},
      credentials: `${MODEL_KEY}=sk-ant-파일-갈래\n`,
    });

    // 대조군 — 로드 경로가 실제로 갈렸다
    expect(fromEnv.apiKey).toBe("sk-ant-env-갈래");
    expect(fromFile.apiKey).toBe("sk-ant-파일-갈래");
    expect(fromEnv.toolNames).toEqual(fromFile.toolNames);

    expectSamePrompt(fromEnv, fromFile, "모델 키 출처");
  });

  /**
   * **갈래 여섯째 — 모집단 보강 (R-4 실측).** 플랜이 든 다섯에 없다.
   *
   * 근거는 같다(§3.1 계약 1 — `config.json`의 어떤 값도). 이 갈래를 더한 이유는 `model`이
   * **모델에게 가는 문자열에 실릴 개연성이 다섯 중 어느 것보다 높은** 설정값이기 때문이다:
   * 프롬프트에 자기 모델 id를 적는 것은 흔한 형태이고, 그 순간 계약 1이 조용히 깨지며
   * 프롬프트 캐시가 모델마다 나뉜다.
   *
   * 대조군: 도구 집합은 안 갈린다. 로드된 설정값 + **하류 효과**(컨텍스트 창)로 잰다.
   * 둘 다 기지 모델이라 미지 경고 경로가 섞이지 않는다.
   */
  it("모델 id가 프롬프트를 가르지 않는다", async () => {
    const haiku = await observe({ config: { model: "claude-haiku-4-5" } });
    const opus = await observe({ config: { model: "claude-opus-5" } });

    // 대조군 — 설정이 로드됐고 하류에서 실제로 갈렸다
    expect(haiku.config.model).toBe("claude-haiku-4-5");
    expect(opus.config.model).toBe("claude-opus-5");
    expect(haiku.contextWindowTokens).not.toBe(opus.contextWindowTokens);
    expect(haiku.toolNames).toEqual(opus.toolNames);

    expectSamePrompt(haiku, opus, "모델 id");
  });

  /**
   * **갈래 일곱째 — 모집단 보강 (R-4 실측).** 플랜이 든 다섯에 없다.
   *
   * `denyRules`를 고른 이유는 스캐폴드가 드는 층 중 하나가 **능력 서술**(무엇이 승인
   * 게이트를 지나고 무엇이 승인으로도 불가한가)이라, 거부 규칙을 그 문장에 펼쳐 적는
   * 형태가 자연스러운 유혹이기 때문이다. 그렇게 되면 계약 1이 깨지고, 다섯 갈래는
   * 그것을 하나도 안 잰다.
   *
   * 대조군: 도구 집합은 안 갈린다. 로드된 설정값으로 잰다.
   */
  it("denyRules가 프롬프트를 가르지 않는다", async () => {
    const empty = await observe({ config: { denyRules: [] } });
    const rules = await observe({
      config: { denyRules: ["**/*.pem", "축B가 고른 거부 규칙"] },
    });

    // 대조군 — 설정이 실제로 갈려 로드됐다
    expect(empty.config.denyRules).toEqual([]);
    expect(rules.config.denyRules).toEqual(["**/*.pem", "축B가 고른 거부 규칙"]);
    expect(empty.toolNames).toEqual(rules.toolNames);

    expectSamePrompt(empty, rules, "denyRules");
  });

  /**
   * **역검증** — 비교 술어가 실제로 갈림을 잡는가. 축 B의 무게는 대조군에 있지만
   * (형식적 역검증은 「구성이 안 갈렸는데 같다」는 조용한 그린 경로를 안 잰다),
   * 비교가 무뎌지는 것도 막아 둔다: `expectSamePrompt`가 쓰는 술어에 한 글자 차이를
   * 주면 붉어져야 한다.
   */
  it("역검증 — 한 글자만 갈려도 비교 술어가 잡는다", async () => {
    const observedBranch = await observe({});
    const mutated = `${observedBranch.prompt} `;

    expect(mutated).not.toBe(observedBranch.prompt);
    // 대조군 — 비교의 대상이 비지 않았다
    expect(observedBranch.prompt.length).toBeGreaterThan(200);
    expect(observedBranch.prompt).toContain(realpathSync(workspace));
    expect(observedBranch.prompt).toContain(RIG_MEMORY_LINE);
  });
});
