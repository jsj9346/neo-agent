/**
 * 시스템 프롬프트 내용 계약의 **독립 재검증** — T-006(QA).
 *
 * 기대값의 출처는 `docs/CLI-INTERFACE.md` §3.1이고, 스캐폴드와 메모리 블록의 합성 형태
 * 하나만 `docs/MEMORY.md` §3.2에서 온다. 구현 주석은 기대값의 출처가 아니다 — §3.1이
 * 그 실패 형태를 이름으로 든다.
 *
 * **이 파일은 `system-prompt.contract.test.ts`(축 A·B)를 대체하지 않는다.** 그 두 축이
 * §3.1의 「기계가 지는 것」 둘을 그대로 잰다. 여기 서는 축은 **T-006의 뮤테이션 실측이
 * 드러낸 자리 넷**이고, 넷 다 그 두 축이 재지 않는 곳이다:
 *
 *   QA-1  조립이 프롬프트에 무엇을 더하는가 — 축 B는 두 갈래의 **차이**만 재므로,
 *         모든 갈래에 똑같이 얹히는 오염과 축이 없는 설정 키의 오염을 못 잡는다.
 *         실측: 조립이 compactionThreshold를 프롬프트에 실어도 두 파일 43축이 전부 그린이었다.
 *   QA-2  축 A가 재는 문자열이 **모델에게 가는 문자열**과 같은가 — 그 연결이 없으면
 *         단위 축의 0건은 모델이 무엇을 보는지에 대해 아무것도 말하지 않는다.
 *   QA-3  설정 키 모집단이 늙지 않는가 — 계약 1의 「어떤 값도」는 키가 늘 때마다 넓어지고,
 *         갈래를 손으로 든 축은 그 순간 조용히 좁아진다.
 *   QA-4  프롬프트를 가르는 **설정 키 자체**가 생기는 경로 — 계약 1을 값이 아니라
 *         표면에서 막는다(`K-429`가 memoryDir에 대해 세운 것과 같은 형태).
 *
 * **문면을 리터럴로 고정하는 단정을 두지 않는다.** 각 층을 어떤 문장으로 표현하는가는
 * 문서 머리의 「조정 가능」이고, 계약 3의 세 층이 실제로 서 있는가는 §3.1이 리뷰의 몫으로
 * 남겼다. 그 판정은 이 파일이 아니라 `plans/20260902-system-prompt-qa-report.md`에 있다.
 *
 * **모집단은 스캐폴드다.** 여기 실리는 메모리 텍스트는 전부 이 검사가 고른 것이고,
 * 실사용자의 메모리를 읽는 자리는 없다 — 홈은 tmpdir이고 주입이다.
 *
 * **네트워크를 쓰지 않는다.** 모델은 대역이고 Docker 판정은 명시 주입이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 그래서 이 파일은
 * 정본 문면을 인용부호로 감싸지 않고 전부 서술로 쓴다. 형식 축(`D-3`~`D-5`)은 이 자리에
 * 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의 게이트가
 * 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelRequest, ModelStreamEvent } from "@neo-agent/core";
import { renderMemoryBlock } from "@neo-agent/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliConfig } from "../src/config.ts";
import { buildSystemPrompt } from "../src/system-prompt.ts";
import type { CliApp, CliDeps, WiringFactories } from "../src/wiring.ts";
import { startCli } from "../src/wiring.ts";
import { dockerAvailable, dockerProbeForbidden } from "./probe-docker.ts";

/** §3.1이 이름으로 든 다섯. **리터럴이다** — 구현 상수를 참조하면 이름이 바뀌어도 안 붉어진다 */
const TOOL_IDENTIFIERS = [
  "read_file",
  "write_file",
  "edit_file",
  "web_fetch",
  "web_search",
] as const;

/** §4가 든 리터럴. 구현 상수를 쓰면 이름이 바뀌어도 안 붉어진다 */
const MODEL_KEY = "ANTHROPIC_API_KEY";

/** 문자열에 needle이 몇 번 나오는가 */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function identifiersIn(text: string): string[] {
  return TOOL_IDENTIFIERS.filter((name) => countOf(text, name) > 0);
}

/**
 * §3 표의 여덟 키 전부를 **한 갈래에서 동시에** 가른다.
 *
 * 계약 1이 드는 것은 어떤 설정값도 프롬프트를 가르지 않는다는 것이고, 갈래를 키마다
 * 하나씩 세운 축은 **든 키에 대해서만** 그 계약을 잰다. 한 갈래에 전부 실으면 든
 * 키의 목록이 그대로 모집단이 되고, 아래 QA-3이 그 목록이 늙는 것을 막는다.
 */
const CONFIG_KEYS = [
  "approvalMode",
  "denyRules",
  "model",
  "compactionAuto",
  "compactionThreshold",
  "compactionKeepRecentTurns",
  "sandbox",
  "sandboxImage",
] as const;

const CONFIG_BRANCH_A: Record<(typeof CONFIG_KEYS)[number], unknown> = {
  approvalMode: "manual",
  denyRules: [],
  model: "claude-haiku-4-5",
  compactionAuto: true,
  compactionThreshold: 0.75,
  compactionKeepRecentTurns: 2,
  sandbox: "on",
  sandboxImage: "debian:bookworm-slim",
};

const CONFIG_BRANCH_B: Record<(typeof CONFIG_KEYS)[number], unknown> = {
  approvalMode: "off",
  denyRules: ["**/*.pem", "QA가 고른 거부 규칙"],
  model: "claude-opus-5",
  compactionAuto: false,
  compactionThreshold: 0.5,
  compactionKeepRecentTurns: 5,
  sandbox: "off",
  sandboxImage: "debian:bookworm-20260101-slim",
};

/** 검사가 고른 메모리 파일 내용. 도구 이름을 하나도 담지 않는다 */
const CHOSEN_MEMORY_LINE = "- QA가 고른 메모리 한 줄이다";

/** 검사가 고른 메모리 — 다섯을 전부 담는다. 사용자의 글은 이 계약이 막는 대상이 아니다 */
const CHOSEN_MEMORY_WITH_NAMES = `- 사용자가 자기 메모에 적었다: ${TOOL_IDENTIFIERS.join(" ")}`;

let root: string;
let home: string;
let workspace: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-cli-prompt-qa-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(workspace, { recursive: true });
  // `0b` 첫 기동 관문(§2.1)을 이미 지난 홈 — 판정 재료는 sessions.db의 부재 하나뿐이다
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  chmodSync(join(home, ".neo-agent"), 0o700);
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeMemory(text: string): void {
  mkdirSync(join(home, ".neo-agent", "memory"), { recursive: true });
  writeFileSync(join(home, ".neo-agent", "memory", "MEMORY.md"), `${text}\n`);
}

/** 모델이 **실제로 본** 요청을 남기는 대역 */
class CapturingModel implements ModelClient {
  readonly modelId = "fake-model";
  readonly requests: ModelRequest[] = [];

  get lastSystemPrompt(): string | undefined {
    return this.requests[this.requests.length - 1]?.systemPrompt;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    this.requests.push(structuredClone(request) as ModelRequest);
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
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function settle(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

const realFactories = await (async () => {
  const { resolveFactories } = await import("../src/wiring.ts");
  return resolveFactories();
})();

interface Booted {
  app: CliApp;
  model: CapturingModel;
  running: Promise<void>;
  /** 조립이 프롬프트에 실은 문자열 — 세션에 기록된 그 값 */
  prompt: string;
  config: CliConfig;
  toolNames: string[];
}

interface BootOptions {
  config?: Record<string, unknown>;
  probeDocker?: WiringFactories["probeDocker"];
}

function makeDeps(options: BootOptions, model: CapturingModel): CliDeps {
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify(options.config ?? {}));

  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 120;
  output.resume();

  return {
    argv: [],
    env: { [MODEL_KEY]: "sk-ant-qa" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qa-prompt-scaffold",
    factories: {
      createModelClient: () => model,
      probeDocker: options.probeDocker ?? dockerAvailable(),
      createExecutor: realFactories.createExecutor,
      createSearchTool: realFactories.createSearchTool,
    },
  };
}

async function boot(options: BootOptions = {}): Promise<Booted> {
  const model = new CapturingModel();
  const app: CliApp = await startCli(makeDeps(options, model), { kind: "run" });
  const running = app.run();
  await settle();
  return {
    app,
    model,
    running,
    prompt: app.parts.session.systemPrompt,
    config: app.parts.config,
    toolNames: app.parts.tools.map((tool) => tool.name),
  };
}

async function stop(booted: Booted): Promise<void> {
  await booted.app.shutdown();
  await booted.running;
}

// ═══════════════════════════════════════════════════════════════════════════
// QA-1 — 조립은 스캐폴드와 메모리 블록 말고 아무것도 싣지 않는다
//        (CLI-INTERFACE §3.1 계약 1 · 합성 형태는 MEMORY.md §3.2)
// ═══════════════════════════════════════════════════════════════════════════

describe("QA-1 — 조립이 프롬프트에 더하는 것이 없다 (CLI-INTERFACE §3.1 계약 1)", () => {
  /**
   * 근거: §3.1 계약 1은 어떤 설정값도·크리덴셜의 유무도·Docker 가용성도 프롬프트를
   * 가르지 않는다고 정하고, `MEMORY.md` §3.2는 시스템 프롬프트가 고정 스캐폴드와
   * 메모리 블록(있을 때만)의 합이라고 정한다. **둘을 합치면 등식이 된다** — 조립이
   * 실은 문자열은 `buildSystemPrompt`의 출력과 바이트 동일해야 한다.
   *
   * **차이가 아니라 등식으로 재는 것이 이 축의 값이다.** 두 갈래를 비교하는 축은
   * 모든 갈래에 똑같이 얹히는 오염을 못 본다 — 조립이 프롬프트 뒤에 한 줄을 붙이면
   * 갈래 비교는 여전히 통과한다(T-006 뮤테이션 실측에서 그 형태가 43축 전부 그린이었다).
   */
  it("설정 여덟 키를 전부 갈라도 프롬프트는 두 갈래에서 바이트 동일하다", async () => {
    writeMemory(CHOSEN_MEMORY_LINE);
    const a = await boot({ config: { ...CONFIG_BRANCH_A }, probeDocker: dockerAvailable() });
    const b = await boot({ config: { ...CONFIG_BRANCH_B }, probeDocker: dockerProbeForbidden() });

    // 대조군 — 설정이 실제로 여덟 키 전부에서 갈려 로드됐다
    for (const key of CONFIG_KEYS) {
      const left = JSON.stringify((a.config as unknown as Record<string, unknown>)[key]);
      const right = JSON.stringify((b.config as unknown as Record<string, unknown>)[key]);
      expect(left, `${key} — 두 갈래가 같은 값으로 로드됐다`).not.toBe(right);
    }
    // 대조군 — 재는 대상이 비지 않았고 이 기동의 것이다. 내용 독립으로 잰다
    expect(a.prompt.length).toBeGreaterThan(200);
    expect(a.prompt).toContain(realpathSync(workspace));
    expect(a.prompt).toContain(CHOSEN_MEMORY_LINE);

    expect(b.prompt).toBe(a.prompt);
    await stop(a);
    await stop(b);
  });

  /**
   * 근거: 위와 같다. **등식 자체**를 잰다 — 조립이 실은 값이 스캐폴드 + 메모리 블록의
   * 합과 문자 하나까지 같은가.
   */
  it("메모리가 있는 기동의 프롬프트가 스캐폴드 + 메모리 블록과 바이트 동일하다", async () => {
    writeMemory(CHOSEN_MEMORY_LINE);
    const booted = await boot();

    const block = renderMemoryBlock(booted.app.parts.memory);
    // 대조군 — 블록이 실제로 붙는 갈래다(빈 메모리면 undefined이고 이 축이 공허해진다)
    expect(block).not.toBeUndefined();
    expect(block).toContain(CHOSEN_MEMORY_LINE);

    expect(booted.prompt).toBe(buildSystemPrompt(realpathSync(workspace), block));
    await stop(booted);
  });

  /** 메모리가 없는 갈래에서는 스캐폴드 하나와 바이트 동일하다 */
  it("메모리가 없는 기동의 프롬프트가 스캐폴드와 바이트 동일하다", async () => {
    const booted = await boot();

    // 대조군 — 블록이 안 붙는 갈래다
    expect(renderMemoryBlock(booted.app.parts.memory)).toBeUndefined();
    expect(booted.prompt.length).toBeGreaterThan(200);

    expect(booted.prompt).toBe(buildSystemPrompt(realpathSync(workspace)));
    await stop(booted);
  });

  /**
   * **역검증** — 등식 술어가 조립이 더한 한 줄을 잡는가. 실물을 고치지 않고 재기 위해
   * 관측치 쪽에 오염을 심는다: 조립이 프롬프트 뒤에 설정값 한 줄을 붙인 형태다.
   */
  it("역검증 — 조립이 한 줄을 더한 형태를 등식이 잡는다", async () => {
    writeMemory(CHOSEN_MEMORY_LINE);
    const booted = await boot({ config: { model: "claude-opus-5" } });

    const expected = buildSystemPrompt(
      realpathSync(workspace),
      renderMemoryBlock(booted.app.parts.memory),
    );
    // 대조군 — 오염 전에는 등식이 성립한다
    expect(booted.prompt).toBe(expected);

    const polluted = `${booted.prompt}\nContext is compacted at 0.75.`;
    expect(polluted).not.toBe(expected);
    await stop(booted);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QA-2 — 모델이 실제로 본 문자열 (CLI-INTERFACE §3.1 계약 2의 착지 지점)
// ═══════════════════════════════════════════════════════════════════════════

describe("QA-2 — 모델이 본 프롬프트 (CLI-INTERFACE §3.1 계약 2)", () => {
  /**
   * 근거: §3.1 계약 2가 금하는 것은 스캐폴드가 도구를 이름으로 적는 것이고, 그 금지가
   * 값을 내는 자리는 **모델에게 가는 요청**이다. 단위 축(축 A)이 재는 것은 함수의
   * 반환값이므로, 그 값이 요청에 그대로 실린다는 것이 함께 서지 않으면 0건은 모델이
   * 무엇을 보는지에 대해 아무것도 말하지 않는다.
   *
   * 관측 지점 셋을 함께 잰다 — 함수의 반환값 · 세션에 기록된 값 · 모델이 본 값.
   */
  it("모델이 본 프롬프트가 세션의 값과 같고 식별자 다섯이 0건이다", async () => {
    writeMemory(CHOSEN_MEMORY_LINE);
    const booted = await boot();

    await booted.app.prompt("QA가 고른 한 줄");
    await booted.app.parts.agent.waitForIdle();

    // 대조군 — 모델이 실제로 불렸고 요청에 프롬프트가 실렸다
    expect(booted.model.requests.length).toBeGreaterThan(0);
    const seen = booted.model.lastSystemPrompt ?? "";
    expect(seen.length).toBeGreaterThan(200);
    expect(seen).toContain(realpathSync(workspace));

    expect(seen).toBe(booted.prompt);
    expect(identifiersIn(seen)).toEqual([]);
    await stop(booted);
  });

  /**
   * 근거: §3.1 모집단 — 계약이 걸리는 것은 스캐폴드이지 출력 전체가 아니다. 사용자가
   * 자기 메모에 적은 이름은 모델에게 그대로 간다. **차분으로 잰다** — 스캐폴드의
   * 기여가 0인가만 묻고 사용자의 글은 재지 않는다.
   */
  it("사용자의 메모가 이름을 담아도 스캐폴드의 기여는 0이다 — 모델이 본 값 기준", async () => {
    writeMemory(CHOSEN_MEMORY_WITH_NAMES);
    const booted = await boot();

    await booted.app.prompt("QA가 고른 한 줄");
    await booted.app.parts.agent.waitForIdle();
    const seen = booted.model.lastSystemPrompt ?? "";

    // 대조군 — 고른 메모리가 실제로 실렸고 다섯을 전부 담는다
    expect(seen).toContain(CHOSEN_MEMORY_WITH_NAMES);
    for (const name of TOOL_IDENTIFIERS) {
      expect(
        countOf(CHOSEN_MEMORY_WITH_NAMES, name),
        `고른 메모리에 ${name}이 없다`,
      ).toBeGreaterThan(0);
    }

    for (const name of TOOL_IDENTIFIERS) {
      expect(countOf(seen, name), `${name} — 스캐폴드가 기여했다`).toBe(
        countOf(CHOSEN_MEMORY_WITH_NAMES, name),
      );
    }
    await stop(booted);
  });

  /** **역검증** — 모델이 본 값 기준의 술어가 실제 오염을 잡는다 */
  it("역검증 — 모델이 본 값에 이름이 하나 늘면 차분이 잡는다", async () => {
    writeMemory(CHOSEN_MEMORY_WITH_NAMES);
    const booted = await boot();

    await booted.app.prompt("QA가 고른 한 줄");
    await booted.app.parts.agent.waitForIdle();
    const seen = booted.model.lastSystemPrompt ?? "";
    expect(seen.length).toBeGreaterThan(200);

    for (const name of TOOL_IDENTIFIERS) {
      const polluted = `${seen}\nAlways call ${name} first.`;
      expect(countOf(polluted, name), `${name} — 오염이 증분 1을 안 냈다`).toBe(
        countOf(seen, name) + 1,
      );
      expect(countOf(polluted, name), `${name} — 차분 술어가 오염을 놓쳤다`).not.toBe(
        countOf(CHOSEN_MEMORY_WITH_NAMES, name),
      );
    }
    await stop(booted);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QA-3 — 설정 키 모집단이 늙지 않는다 (CLI-INTERFACE §3.1 계약 1 · §3 표)
// ═══════════════════════════════════════════════════════════════════════════

describe("QA-3 — 계약 1의 모집단 (CLI-INTERFACE §3.1 계약 1)", () => {
  /**
   * 근거: 계약 1이 드는 것은 어떤 설정값도 프롬프트를 가르지 않는다는 것이고, 그
   * 모집단은 §3 표의 키 전부다. 갈래를 손으로 드는 축은 키가 늘면 조용히 좁아진다 —
   * 새 키가 프롬프트를 갈라도 아무것도 안 붉어진다.
   *
   * **그래서 모집단 자체를 잰다.** 조립이 든 설정 객체의 키 집합이 위 여덟과 다르면
   * 이 축이 붉어지고, 그때 QA-1의 두 갈래를 함께 늘리게 된다.
   */
  it("로드된 설정의 키 집합이 QA-1이 가르는 여덟과 같다", async () => {
    const booted = await boot();

    const keys = Object.keys(booted.config).sort();
    expect(keys).toEqual([...CONFIG_KEYS].sort());
    await stop(booted);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QA-4 — 프롬프트를 가르는 설정 키 자체가 없다
//        (CLI-INTERFACE §3.1 계약 1 · §3의 미지 키 거부)
// ═══════════════════════════════════════════════════════════════════════════

describe("QA-4 — 프롬프트 오버라이드 키는 설정 키가 아니다 (CLI-INTERFACE §3.1)", () => {
  /**
   * 근거: §3.1 머리가 시스템 프롬프트를 CLI 내장 상수로 두고 config 오버라이드를 MVP
   * 밖으로 미루며, 계약 1이 어떤 설정값도 프롬프트를 가르지 않는다고 정한다. 오버라이드
   * 키가 열리는 순간 그 둘이 함께 깨지므로, **값이 아니라 표면에서** 막힌 것을 잰다.
   *
   * 이것은 새 판단이 아니라 계약 1의 기계화다: 프롬프트를 정하는 설정 키는 정의상
   * 프롬프트를 설정에 따라 가른다. 형태는 `K-429`가 memoryDir에 대해 세운 회귀 축과 같다 —
   * 그 키가 KNOWN_KEYS에 추가되는 순간 붉어진다.
   */
  for (const key of ["systemPrompt", "prompt", "systemPromptPath", "promptOverride"]) {
    it(`${key}는 설정 키가 아니다 — 미지 키로 기동이 거부된다`, async () => {
      const model = new CapturingModel();
      const deps = makeDeps({ config: { approvalMode: "manual", [key]: "QA가 고른 값" } }, model);

      await expect(startCli(deps, { kind: "run" })).rejects.toThrow();
    });
  }

  /** **역검증** — 같은 리그에서 미지 키가 없으면 기동이 선다. 그래야 위 거부가 공허하지 않다 */
  it("역검증 — 미지 키가 없으면 같은 리그로 기동한다", async () => {
    const booted = await boot({ config: { approvalMode: "manual" } });
    expect(booted.prompt.length).toBeGreaterThan(200);
    await stop(booted);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QA-5 — 소스 텍스트 축이 읽는 것이 정의 모듈이다
//        (WEB-ACCESS §3.2 등록의 재발 경로 축이 서는 전제)
// ═══════════════════════════════════════════════════════════════════════════

describe("QA-5 — 소스 축의 대상 (WEB-ACCESS §3.2 등록)", () => {
  /**
   * `web-search-wiring.contract.test.ts` §6 둘째 축은 모듈 소스에 검색 도구 이름이
   * 0건임을 잰다. 그 축의 대조군은 2026-09-02에 내용 독립으로 바뀌었고(길이 하한 +
   * export 이름의 존재), 그 교체로 **다른 모듈을 읽는 오독**이 대조군을 통과하게 됐다:
   * 배럴은 길이 하한을 넘고 같은 이름을 담으며 검색 이름은 0건이라 조용한 그린이 된다.
   *
   * 여기서 그 자리를 메운다 — 읽은 것이 **정의 모듈**인지를 구조적 표지로 잰다.
   * 문면이 아니라 정의 형태이므로 프롬프트 문장이 바뀌어도 무관하다.
   */
  const DEFINITION_MARK = "export function buildSystemPrompt(";

  function readSrc(name: string): string {
    return readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
  }

  it("소스 축이 읽는 파일이 buildSystemPrompt의 정의를 담는다", () => {
    const source = readSrc("system-prompt.ts");

    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain(DEFINITION_MARK);
  });

  /**
   * **역검증** — 이 표지가 오독을 실제로 가르는가. 배럴은 오늘의 대조군 둘(길이 하한 +
   * export 이름)을 통과하지만 정의를 담지 않는다.
   */
  it("역검증 — 배럴은 오늘의 대조군을 통과하지만 정의 표지에 걸린다", () => {
    const barrel = readSrc("index.ts");

    // 오늘의 대조군 둘은 배럴에서도 참이다 — 그것이 이 축이 서는 이유다
    expect(barrel.length).toBeGreaterThan(500);
    expect(barrel).toContain("buildSystemPrompt");

    expect(barrel).not.toContain(DEFINITION_MARK);
  });
});
