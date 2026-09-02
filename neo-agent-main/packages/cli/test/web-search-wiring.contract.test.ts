/**
 * `web_search` 배선 계약 — 독립 검증(T-012 ⑵).
 *
 * **기대값의 출처는 정본 문서뿐이다.** 구현 소스에서 기대값을 읽지 않았다 —
 * 아래 절 번호가 이 파일의 모든 단정의 출처다.
 *
 *   `docs/CLI-INTERFACE.md` §2  — 도구 열거·등록 순서 고정·시작 화면의 도구 집합 표시
 *   `docs/CLI-INTERFACE.md` §4  — 키별 독립 우선순위(2026-09-02 개정) · 600 fail-closed의 자리 ·
 *                                 `secretValues` 합집합 · 키 부재 안내의 범위
 *   `docs/WEB-ACCESS.md` §3.2   — 「등록」(조건부 등록·자리 고정·시스템 프롬프트 금지) ·
 *                                 「시크릿」(키마다 독립)
 *   `docs/WEB-ACCESS.md` §4     — 허용되는 주입점 3개 · CLI는 채우지 않는다 · 주입이 상수를 못 바꾼다
 *   `docs/SAFE-DEFAULTS.md` §3  — 보호 계약 1(600 fail-closed) · 3(자식 프로세스 env 스크러빙)
 *
 * **역검증** (2026-09-02 수행): 「없어야 한다」 축 셋 — 프롬프트의 `web_search` 부재(§6),
 * 배선 소스의 심 주입 부재(§5), 주석 제거 술어 — 에 일부러 위반을 심어 술어가 실제로
 * 붉어지는 것을 확인했다. 그 확인은 이 파일 안의 `역검증` 단정으로 상주한다(일회 실험이
 * 아니라 축이다): 술어가 나중에 무뎌지면 그 자리가 먼저 붉어진다.
 *
 * **네트워크를 쓰지 않는다.** 검색 도구는 생성만 하고 호출하지 않으며, 모델은 대역이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_ENV, loadCredentials, SEARCH_API_KEY_ENV } from "../src/credentials.ts";
import { buildSystemPrompt } from "../src/system-prompt.ts";
import type { CliApp, CliDeps, WiringFactories } from "../src/wiring.ts";
import { startCli } from "../src/wiring.ts";
import { dockerAvailable, dockerProbeForbidden, dockerUnavailable } from "./probe-docker.ts";

/**
 * 키 이름은 **문서가 든 리터럴**이다 — 구현의 상수를 그대로 쓰면 이름이 바뀌어도
 * 아무것도 붉어지지 않는다(`CLI-INTERFACE.md` §4 「대상 키 둘」). 상수와의 일치는
 * 아래 첫 축이 따로 잰다.
 */
const MODEL_KEY = "ANTHROPIC_API_KEY";
const SEARCH_KEY = "TAVILY_API_KEY";

/** §2 등록 순서 — 파일 3종 → (shell) → web_fetch → web_search → remember */
const TOOLS_WITH_SEARCH = [
  "read_file",
  "write_file",
  "edit_file",
  "shell",
  "web_fetch",
  "web_search",
  "remember",
] as const;
const TOOLS_WITHOUT_SEARCH = [
  "read_file",
  "write_file",
  "edit_file",
  "shell",
  "web_fetch",
  "remember",
] as const;
const TOOLS_NO_SHELL_WITH_SEARCH = [
  "read_file",
  "write_file",
  "edit_file",
  "web_fetch",
  "web_search",
  "remember",
] as const;

let root: string;
let home: string;
let workspace: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-cli-search-wiring-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(workspace, { recursive: true });
  // 3c 첫 기동 관문(§2.1)을 이미 지난 홈. 판정은 `sessions.db`의 부재 하나뿐이라
  // 빈 파일 하나면 «returning»이다. 모드를 명시하는 것은 umask가 깎은 권한이
  // 엉뚱한 경고를 화면에 올려 배너 단정을 깨뜨리는 것을 막기 위해서다.
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  chmodSync(join(home, ".neo-agent"), 0o700);
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(settings: Record<string, unknown>): void {
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify(settings));
}

/** `~/.neo-agent/credentials`를 쓴다. 모드 기본값은 계약이 요구하는 600이다 */
function writeCredentials(content: string, mode = 0o600): string {
  const path = join(home, ".neo-agent", "credentials");
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
  return path;
}

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

interface Rig {
  deps: CliDeps;
  text(): string;
  /** `createSearchTool`이 받은 인자 — 부르지 않았으면 빈 배열이다 */
  searchToolDeps: Record<string, unknown>[];
  executorSecrets: (readonly string[] | undefined)[];
}

function createRig(
  options: { env?: NodeJS.ProcessEnv; probeDocker?: WiringFactories["probeDocker"] } = {},
): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 120;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const searchToolDeps: Record<string, unknown>[] = [];
  const executorSecrets: (readonly string[] | undefined)[] = [];

  const deps: CliDeps = {
    argv: [],
    env: options.env ?? { [MODEL_KEY]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qa-search",
    factories: {
      createModelClient: () => fakeModel(),
      // Docker 판정은 **명시 주입**이다(`./probe-docker.ts`).
      probeDocker: options.probeDocker ?? dockerAvailable(),
      createExecutor: (opts) => {
        executorSecrets.push(opts.secretValues);
        return realFactories.createExecutor(opts);
      },
      createSearchTool: (searchDeps) => {
        searchToolDeps.push({ ...searchDeps });
        return realFactories.createSearchTool(searchDeps);
      },
    },
  };

  return {
    deps,
    text: () => stripAnsi(chunks.join("")),
    searchToolDeps,
    executorSecrets,
  };
}

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function settle(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

/** 배너는 `run()`에서 나간다 — 화면을 재는 축은 이것을 통해야 한다 */
async function start(rig: Rig): Promise<{ app: CliApp; running: Promise<void> }> {
  const app = await startCli(rig.deps, { kind: "run" });
  const running = app.run();
  await settle();
  return { app, running };
}

const realFactories = await (async () => {
  const { resolveFactories } = await import("../src/wiring.ts");
  return resolveFactories();
})();

function toolNames(app: CliApp): string[] {
  return app.parts.tools.map((tool) => tool.name);
}

/** 문자열에 needle이 몇 번 나오는가 — 「0건」 축의 술어 */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 크리덴셜 — 우선순위는 키마다 독립이다 (CLI-INTERFACE §4 · WEB-ACCESS §3.2)
// ═══════════════════════════════════════════════════════════════════════════

describe("1. 키별 독립 우선순위 (CLI-INTERFACE §4)", () => {
  /**
   * 근거: §4 「대상 키 둘」이 `ANTHROPIC_API_KEY`와 `TAVILY_API_KEY`를 이름으로 든다.
   * 상수 이름이 갈리면 사용자가 문서대로 파일을 써도 키가 안 읽힌다 — 조용한 실패다.
   */
  it("env 변수 이름 둘이 문서가 든 리터럴과 같다", () => {
    expect(API_KEY_ENV).toBe(MODEL_KEY);
    expect(SEARCH_API_KEY_ENV).toBe(SEARCH_KEY);
  });

  /**
   * **이 축이 개정의 이유 자체다.** 근거: §4 우선순위 블록 —
   * "있으면 그 키에 한해 파일 값을 쓰지 않는다".
   * `WEB-ACCESS.md` §3.2 시크릿 항이 같은 것을
   * "한 키를 env로 준 것이 다른 키의 파일 값을 가리지 않는다"로 든다.
   */
  it("모델 키를 env로 줘도 파일의 검색 키가 읽힌다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const loaded = loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    expect(loaded.apiKey).toBe("모델-env");
    expect(loaded.searchApiKey).toBe("검색-파일");
  });

  /** 반대 방향도 같다 — 검색 키를 env로 준 것이 모델 키의 파일 값을 가리지 않는다 */
  it("검색 키를 env로 줘도 파일의 모델 키가 읽힌다", () => {
    const path = writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const loaded = loadCredentials({ [SEARCH_KEY]: "검색-env" }, path);
    expect(loaded.apiKey).toBe("모델-파일");
    expect(loaded.searchApiKey).toBe("검색-env");
  });

  /** 키 단위로 env가 이긴다 — 검색 키가 양쪽에 있으면 env 값이다 */
  it("검색 키가 env와 파일 양쪽에 있으면 env가 이긴다", () => {
    const path = writeCredentials([`${MODEL_KEY}=모델-파일`, `${SEARCH_KEY}=검색-파일`].join("\n"));
    const loaded = loadCredentials({ [SEARCH_KEY]: "검색-env" }, path);
    expect(loaded.searchApiKey).toBe("검색-env");
  });

  /** 파일이 아예 없어도 두 키 모두 env로 로드된다 (일회 실행 경로 — §4 env 우선의 근거) */
  it("파일이 없어도 두 키가 env에서 로드된다", () => {
    const loaded = loadCredentials(
      { [MODEL_KEY]: "모델-env", [SEARCH_KEY]: "검색-env" },
      join(home, ".neo-agent", "credentials"),
    );
    expect(loaded.apiKey).toBe("모델-env");
    expect(loaded.searchApiKey).toBe("검색-env");
  });

  /**
   * 근거: §4 「대상 키 둘」 — 검색 키는
   * "없으면 web_search를 등록하지 않고 기동은 계속한다".
   * 로더 층에서 그것은 **던지지 않고 `searchApiKey`가 없는 채로 돌아간다**로 나타난다.
   */
  it("검색 키가 어디에도 없어도 로드는 성공한다", () => {
    const path = writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const loaded = loadCredentials({}, path);
    expect(loaded.apiKey).toBe("모델-파일");
    expect(loaded.searchApiKey).toBeUndefined();
  });

  /**
   * 근거: §4 키 부재 항 — "검색 키의 부재는 이 안내에 끼지 않는다".
   * 검색은 없어도 도는 것이 계약이므로 기동 실패 안내에 낄 자리가 아니다.
   */
  it("모델 키 부재 안내에 검색 키 이름이 끼지 않는다", () => {
    let message = "";
    try {
      loadCredentials({}, join(home, ".neo-agent", "credentials"));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(MODEL_KEY);
    expect(message).not.toContain(SEARCH_KEY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 600 fail-closed는 갈래와 무관하게 앞에 선다
//    (SAFE-DEFAULTS §3 보호 계약 1 · CLI-INTERFACE §4)
// ═══════════════════════════════════════════════════════════════════════════

describe("2. 600 fail-closed의 자리 (SAFE-DEFAULTS §3 보호 계약 1)", () => {
  /**
   * 근거: §4 — "600 fail-closed 검사는 갈래와 무관하게 앞에 선다".
   * 같은 절이 실패 양태까지 적는다: 키별 우선순위를 «env로 받은 키가 있으면 파일
   * 갈래로 안 간다»의 형태로 짜면 검사가 갈래 안으로 밀려 보호 계약 1이 함께 무너진다.
   */
  it("모델 키가 env에 있고 파일에 검색 키만 있어도 느슨한 파일은 기동을 거부한다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`, 0o644);
    expect(() => loadCredentials({ [MODEL_KEY]: "모델-env" }, path)).toThrow(/chmod/);
  });

  /**
   * **두 키가 모두 env인 구성이 이 계약의 가장 얇은 자리다** — 파일의 어느 값도 쓰이지
   * 않으므로 「안 읽으면 그만」이 가장 자연스러운 최적화이고, 그때 노출된 파일이 영영
   * 보고되지 않는다. §4는 그 경우에도 검사가 앞이라고 정한다.
   */
  it("두 키가 모두 env여도 느슨한 파일은 기동을 거부한다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`, 0o644);
    expect(() =>
      loadCredentials({ [MODEL_KEY]: "모델-env", [SEARCH_KEY]: "검색-env" }, path),
    ).toThrow(/chmod/);
  });

  /** 근거: SAFE-DEFAULTS §3-1 — 자동 chmod로 조용히 고치지 않는다. 거부 뒤에도 권한 그대로 */
  it("거부 뒤에도 파일 권한을 고치지 않는다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`, 0o644);
    try {
      loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    } catch {
      // 거부는 기대된 결과다
    }
    expect((statSync(path).mode & 0o777).toString(8)).toBe("644");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. `secretValues`는 두 갈래의 합집합이다
//    (CLI-INTERFACE §4 · SAFE-DEFAULTS §3 보호 계약 3)
// ═══════════════════════════════════════════════════════════════════════════

describe("3. secretValues 합집합 (CLI-INTERFACE §4)", () => {
  /**
   * 근거: §4 — "파일을 읽었으면 키 이름과 무관하게 그 파일의 모든 값이 들어가고,
   * env로 온 값도 함께 들어간다". 그래야 보호 계약 3(자식 프로세스 env에서 시크릿
   * 제거)이 **env 갈래에서도** 참이 된다.
   */
  it("env로 온 값과 파일의 모든 값이 함께 실린다", () => {
    const path = writeCredentials(
      [`${MODEL_KEY}=모델-파일`, `${SEARCH_KEY}=검색-파일`, "OTHER_TOKEN=기타-파일"].join("\n"),
    );
    const loaded = loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    expect([...loaded.secretValues].sort()).toEqual(
      ["기타-파일", "검색-파일", "모델-env", "모델-파일"].sort(),
    );
  });

  /**
   * **가려진 파일 값이 빠지면 그 갈래에서만 시크릿이 자식 프로세스로 샌다.**
   * 위 축의 부분집합이지만 이름을 따로 세운다 — 실패했을 때 무엇이 깨졌는지가
   * 「집합이 다르다」보다 「가려진 값이 스크러빙 대상에서 빠졌다」로 읽혀야 한다.
   */
  it("env가 가린 파일의 모델 키 값도 스크러빙 대상에 남는다", () => {
    const path = writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const loaded = loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    expect(loaded.secretValues).toContain("모델-파일");
    expect(loaded.secretValues).toContain("모델-env");
  });

  /**
   * 통합 — 그 합집합이 실제로 호스트 실행자에게 간다(§2 시퀀스 6 ·
   * SAFE-DEFAULTS §3 보호 계약 3 「자식 프로세스 env에서 시크릿 제거」).
   * `sandbox: "off"`인 것은 호스트 실행자 갈래를 골라야 관측되기 때문이다.
   */
  it("호스트 실행자가 합집합을 그대로 받는다", async () => {
    writeConfig({ sandbox: "off" });
    writeCredentials([`${MODEL_KEY}=모델-파일`, `${SEARCH_KEY}=검색-파일`].join("\n"));
    const rig = createRig({
      env: { [MODEL_KEY]: "모델-env" },
      probeDocker: dockerProbeForbidden(),
    });
    const app = await startCli(rig.deps, { kind: "run" });

    expect(rig.executorSecrets).toHaveLength(1);
    expect([...(rig.executorSecrets[0] ?? [])].sort()).toEqual(
      ["검색-파일", "모델-env", "모델-파일"].sort(),
    );
    await app.shutdown();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 등록 — 조건부이되 자리는 고정이다
//    (WEB-ACCESS §3.2 「등록」 · CLI-INTERFACE §2)
// ═══════════════════════════════════════════════════════════════════════════

describe("4. 조건부 등록과 자리 고정 (WEB-ACCESS §3.2 등록)", () => {
  /**
   * 근거: §2 — 등록 위치는 파일 3종 → (shell) → web_fetch → web_search → remember이고
   * "조건부인 것과 자리가 고정인 것은 모순이 아니며" 순서 계약이 그대로 걸린다.
   * 개수가 아니라 **순서 있는 이름 목록**을 단정한다 — 개수만 세면 자리가 바뀌어도 통과하고,
   * 그때 깨지는 것은 프롬프트 캐시의 바이트 안정성이라 화면에 아무것도 안 뜬다.
   */
  it("검색 키가 있으면 web_fetch 뒤·remember 앞에 등록된다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_WITH_SEARCH]);
    await app.shutdown();
    await running;
  });

  /**
   * 근거: `WEB-ACCESS.md` §3.2 등록 항 —
   * "검색 키가 없으면 도구를 등록하지 않는다. 기동은 막지 않는다".
   * **기동이 성공한다는 것이 계약의 절반이다** — 여기서 죽으면 오늘 잘 도는 설치가
   * 업그레이드만으로 멈춘다.
   */
  it("검색 키가 없으면 등록하지 않고, 남은 도구의 순서는 변하지 않는다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const rig = createRig({ env: {} });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_WITHOUT_SEARCH]);
    expect(toolNames(app)).not.toContain("web_search");
    await app.shutdown();
    await running;
  });

  /** 검색 키가 없으면 검색 도구 팩토리가 **아예 불리지 않는다** */
  it("검색 키가 없으면 검색 도구 팩토리를 부르지 않는다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const rig = createRig({ env: {} });
    const { app, running } = await start(rig);

    expect(rig.searchToolDeps).toHaveLength(0);
    await app.shutdown();
    await running;
  });

  /**
   * 자리 고정이 **다른 조건부 도구의 부재와 겹칠 때도** 성립하는지 —
   * §2: shell이 빠져도 "남은 도구의 순서는 변하지 않는다".
   */
  it("shell이 빠져도 web_search의 자리는 그대로다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig({ probeDocker: dockerUnavailable() });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_NO_SHELL_WITH_SEARCH]);
    await app.shutdown();
    await running;
  });

  /**
   * 근거: §2 — "등록되는 도구 집합이 시작 화면에 보여야 한다"
   * (숨겨진 도구가 조용히 빠지면 사용자는 왜 안 되는지 모른다).
   * `WEB-ACCESS.md` §3.2가 이 도구를 그 계약의 새 소비 지점으로 든다.
   */
  it("배너가 등록된 도구 집합을 그대로 싣는다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    const screen = rig.text();
    for (const name of TOOLS_WITH_SEARCH) expect(screen).toContain(name);
    expect(screen).toContain(`도구 ${TOOLS_WITH_SEARCH.length}종`);
    await app.shutdown();
    await running;
  });

  /** 반대 갈래 — 등록되지 않은 도구는 화면에도 없다(있다고 보이면 그것이 거짓 고지다) */
  it("검색 키가 없으면 배너에도 web_search가 없다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const rig = createRig({ env: {} });
    const { app, running } = await start(rig);

    const screen = rig.text();
    expect(screen).toContain(`도구 ${TOOLS_WITHOUT_SEARCH.length}종`);
    expect(countOf(screen, "web_search")).toBe(0);
    await app.shutdown();
    await running;
  });

  /**
   * env로만 준 검색 키도 도구까지 간다 — 파일 생성 없는 일회 실행이 §4가 env 우선을
   * 정한 근거이고(라이브 스모크·CI), 그 경로가 도구 등록까지 닿는지는 여기서만 보인다.
   */
  it("크리덴셜 파일이 없어도 env의 검색 키로 등록된다", async () => {
    writeConfig({});
    const rig = createRig({ env: { [MODEL_KEY]: "모델-env", [SEARCH_KEY]: "검색-env" } });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_WITH_SEARCH]);
    expect(rig.searchToolDeps[0]?.apiKey).toBe("검색-env");
    await app.shutdown();
    await running;
  });

  /**
   * 키별 독립 우선순위의 **통합 귀결**: 모델 키를 env로 준 설치에서도 파일의 검색 키가
   * 도구까지 흘러간다. 로더 단위 축(§1)이 참이어도 배선이 다른 값을 넘기면 여기서만 보인다.
   */
  it("모델 키가 env여도 파일의 검색 키가 도구 배선까지 흘러간다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig({ env: { [MODEL_KEY]: "모델-env" } });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toContain("web_search");
    expect(rig.searchToolDeps).toHaveLength(1);
    expect(rig.searchToolDeps[0]?.apiKey).toBe("검색-파일");
    await app.shutdown();
    await running;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CLI는 전송 심을 채우지 않는다 (WEB-ACCESS §4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). **문자열 리터럴은 남긴다** —
 * 이 판정이 보는 것은 호출 형태와 시그니처이지 문자열이 아니지만, 문자열을 건너뛰지
 * 않으면 그 안의 `//`를 주석 시작으로 오독한다.
 *
 * **파일-로컬 복제다.** 같은 술어가 다른 CLI 테스트에도 있고 공유하지 않았다 —
 * 독립 검증이 검증 대상과 같은 도구를 공유하면 같은 오해를 함께 갖는다.
 *
 * **이것 없이는 아래 축이 주석 한 줄에 뒤집힌다**: 「없어야 한다」 축은 설명 주석이
 * 이름을 부르기만 해도 붉어지고, 「있어야 한다」 축은 주석에 그 형태를 적어 두면
 * 실물이 없어도 통과한다. 두 방향 모두 판정을 텍스트가 정하게 된다.
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function readSource(name: string): string {
  return readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
}

/**
 * 검색 도구를 만드는 호출의 **인자 텍스트 전체**를 꺼낸다(공백은 한 칸으로 접는다).
 * 없으면 `undefined` — 부재는 통과가 아니라 대조군 실패로 다뤄야 한다.
 */
function searchToolCallArgs(strippedSource: string): string | undefined {
  return /createWebSearchTool\(([^)]*)\)/.exec(strippedSource)?.[1]?.replace(/\s+/g, " ").trim();
}

describe("5. CLI는 전송 심을 채우지 않는다 (WEB-ACCESS §4)", () => {
  /**
   * 근거: §4 — "허용되는 주입점 3개" 중 세 번째가 검색 전송의 `request` 심이고,
   * 그 항이 "같은 코드 리뷰 기준이고 같은 통합 테스트의 대상이다"로 위 둘과 같은
   * 규율을 건다(위 둘은 "CLI는 둘 중 어느 것도 채우지 않는다").
   *
   * **런타임 관측이 먼저다.** 배선이 넘기는 객체의 키가 정확히 하나여야 한다 —
   * 옵션 객체를 통째로 흘려보내면 호출자가 실은 값이 심으로 새는 경로가 열린다.
   */
  it("검색 도구 팩토리에 넘어가는 키가 apiKey 하나뿐이다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(rig.searchToolDeps).toHaveLength(1);
    expect(Object.keys(rig.searchToolDeps[0] ?? {})).toEqual(["apiKey"]);
    await app.shutdown();
    await running;
  });

  /**
   * 소스 단정 — 런타임으로는 "채우지 않았다"를 관측할 수 없다(기본값이 실물이라
   * 채운 경우와 결과가 같다). §4의 주입점 이름이 배선 코드에 등장하지 않아야 한다.
   */
  it("배선 소스에 전송 심 주입이 없다", () => {
    const wiring = stripComments(readSource("wiring.ts"));

    // 대조군 — 읽는 대상이 비면 아래 부정 단정이 전부 공허하게 통과한다
    expect(wiring.length).toBeGreaterThan(1000);
    expect(searchToolCallArgs(wiring)).not.toBeUndefined();

    /**
     * **재는 것은 호출 인자 전체다.** 「금지된 이름이 콜론과 함께 나오지 않는다」로만
     * 재면 축약 프로퍼티(`{ apiKey, request }`)와 스프레드(`{ ...deps }`)가 그대로
     * 통과한다 — 둘 다 심을 채우는 실제 형태다. 아래 역검증 축이 그 셋을 전부 든다.
     */
    expect(searchToolCallArgs(wiring)).toBe("{ apiKey }");

    // 두 번째 그물 — 호출 밖(다른 자리)에서의 콜론 주입.
    // `request` 단독 토큰은 승인 프롬프트가 이미 쓰므로 이름만으로 재지 않는다.
    expect(wiring).not.toMatch(/\brequest\s*:/);
    expect(wiring).not.toMatch(/\bsearchTransport\b/);
    expect(wiring).not.toMatch(/\btransport\s*:/);
    // §4가 든 나머지 둘도 같은 자리에서 함께 잰다 — 같은 규율이기 때문이다
    expect(wiring).not.toMatch(/\bverify\s*:/);
    expect(wiring).not.toMatch(/\bfetch\s*:/);
  });

  /**
   * 근거: §4 — "주입이 상수를 바꾸지 못한다". CLI 쪽 이행은 **시그니처**다:
   * 심이 인자에 없으면 배선이 실수로 채울 방법이 구조적으로 없다.
   * 검색 도구 팩토리의 선언이 `apiKey` 하나만 받는지를 소스로 잰다.
   */
  it("검색 도구 팩토리의 시그니처에 심 자리가 없다", () => {
    const wiring = stripComments(readSource("wiring.ts"));
    const declaration = /createSearchTool\(\s*deps\s*:\s*\{([^}]*)\}\s*\)\s*:/.exec(wiring);

    expect(declaration).not.toBeNull();
    const fields = (declaration?.[1] ?? "")
      .split(";")
      .map((field) => field.trim())
      .filter((field) => field !== "");
    expect(fields).toEqual(["apiKey: string"]);
  });

  /**
   * **역검증** — 위 두 축의 술어가 실제로 위반을 잡는가. 실물 배선 소스에 위반을
   * 심은 사본에 같은 술어를 적용해 반대 결과가 나오는 것을 단정한다.
   *
   * **이 축이 초판의 구멍을 찾았다** (2026-09-02): 처음 쓴 술어는
   * `/\brequest\s*:/` 하나였는데, 심을 채우는 가장 자연스러운 형태인 **축약
   * 프로퍼티**(`{ apiKey, request }`)에는 콜론이 없어 조용히 통과했다. 스프레드
   * (`{ ...deps }`)도 같다. 그래서 위 축이 **호출 인자 전체**를 재는 형태로 바뀌었다.
   * 세 형태를 여기 전부 세워 둔다 — 다음에 술어가 무뎌지면 이 자리가 먼저 붉어진다.
   */
  it("역검증 — 심 주입 세 형태를 술어가 전부 잡는다", () => {
    const real = stripComments(readSource("wiring.ts"));
    const mutate = (replacement: string): string =>
      real.replace("createWebSearchTool({ apiKey })", replacement);

    // ① 콜론 주입 ② 축약 프로퍼티 ③ 스프레드 — 셋 다 심이 채워지는 실제 형태다
    expect(searchToolCallArgs(mutate("createWebSearchTool({ apiKey, request: fake })"))).not.toBe(
      "{ apiKey }",
    );
    expect(searchToolCallArgs(mutate("createWebSearchTool({ apiKey, request })"))).not.toBe(
      "{ apiKey }",
    );
    expect(searchToolCallArgs(mutate("createWebSearchTool({ ...deps })"))).not.toBe("{ apiKey }");

    // 주석 제거가 코드까지 지우지 않는다 — 지우면 위 부정 단정이 공허해진다
    const commented = stripComments(
      ["// request: 이것은 주석이라 잡히면 안 된다", "createWebSearchTool({ apiKey });"].join("\n"),
    );
    expect(commented).not.toMatch(/이것은 주석이라/);
    expect(searchToolCallArgs(commented)).toBe("{ apiKey }");

    // 시그니처 축 — 심 자리가 열리면 필드 목록이 갈린다
    const widened = stripComments(
      "createSearchTool(deps: { apiKey: string; request?: unknown }): AgentTool;",
    );
    const declaration = /createSearchTool\(\s*deps\s*:\s*\{([^}]*)\}\s*\)\s*:/.exec(widened);
    const fields = (declaration?.[1] ?? "")
      .split(";")
      .map((field) => field.trim())
      .filter((field) => field !== "");
    expect(fields).not.toEqual(["apiKey: string"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. 시스템 프롬프트가 검색의 존재를 전제하지 않는다 (WEB-ACCESS §3.2 등록)
// ═══════════════════════════════════════════════════════════════════════════

describe("6. 시스템 프롬프트 (WEB-ACCESS §3.2 등록)", () => {
  /**
   * 근거: §3.2 등록 항 —
   * "시스템 프롬프트가 검색의 존재를 전제하는 문장을 갖지 않는다".
   * 도구가 조건부인 이상 그런 문장은 키가 없는 설치에서
   * "있지도 않은 도구를 부르라는 지시"가 된다.
   */
  it("생성된 프롬프트에 web_search가 0건이다", () => {
    expect(countOf(buildSystemPrompt("/tmp/ws"), "web_search")).toBe(0);
    expect(countOf(buildSystemPrompt("/tmp/ws", "## 메모리\n- 항목"), "web_search")).toBe(0);
  });

  /** 소스 텍스트로도 잰다 — 주석에 들어가도 사람이 다음 사이클에 옮겨 적는다 */
  it("시스템 프롬프트 모듈 소스에 web_search가 0건이다", () => {
    const source = readSource("system-prompt.ts");
    // 대조군 — 읽은 것이 비었으면 아래 0건은 아무것도 재지 않는다
    expect(countOf(source, "web_fetch")).toBeGreaterThan(0);
    expect(countOf(source, "web_search")).toBe(0);
  });

  /**
   * **검색 키가 있는 기동에서도** 프롬프트는 그대로다 — 세션에 기록되는 문자열로 잰다.
   * 도구가 실제로 등록된 갈래에서 프롬프트가 갈리면 프롬프트 캐시가 구성마다 나뉜다.
   */
  it("검색 키가 있는 기동에서도 세션 프롬프트에 web_search가 0건이다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(toolNames(app)).toContain("web_search");
    // 대조군 — 세션에 실제로 프롬프트가 실려 있다
    expect(countOf(app.parts.session.systemPrompt, "web_fetch")).toBeGreaterThan(0);
    expect(countOf(app.parts.session.systemPrompt, "web_search")).toBe(0);
    await app.shutdown();
    await running;
  });

  /**
   * **역검증** — 부재 축은 「읽는 대상이 비면 조용히 그린」인 형태다. 술어가 실제로
   * 잡는지와, 재는 대상이 비어 있지 않은지를 함께 단정한다.
   */
  it("역검증 — 프롬프트에 web_search가 들어가면 술어가 잡는다", () => {
    const prompt = buildSystemPrompt("/tmp/ws");
    // 대상이 비어 있지 않다 — 빈 문자열이면 위 0건 축은 아무것도 재지 않는다
    expect(prompt.length).toBeGreaterThan(200);
    expect(countOf(prompt, "web_fetch")).toBeGreaterThan(0);
    // 같은 술어가 위반을 잡는다. **증분으로 잰다** — 절대값으로 재면 이 축 자신이
    // 프롬프트의 현재 내용에 결합해, 실물이 오염된 날 부재 축과 함께 붉어지며
    // «술어가 살아 있는가»라는 이 축의 물음이 답을 잃는다.
    const injected = `${prompt}\nUse web_search when you need fresh information.`;
    expect(countOf(injected, "web_search")).toBe(countOf(prompt, "web_search") + 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정] 판정 요청 — 이 파일이 임의로 정하지 않은 것 (T-012 독립 검증)
 *
 * ── U-1: 두 키가 **모두** env일 때 크리덴셜 파일을 파싱하는가 ────────────────
 *   `CLI-INTERFACE.md` §4는 600 검사가 갈래와 무관하게 앞이라는 것까지만 정하고,
 *   그 뒤 **파일 내용을 읽는지**는 정하지 않는다. 구현은 읽는다(그래야 `secretValues`
 *   합집합이 그 구성에서도 성립한다). 귀결: 두 키를 모두 env로 준 사용자의 홈에
 *   형식이 어긋난 `credentials`가 남아 있으면 **기동이 실패한다** — 개정 전(파일을
 *   아예 안 읽던 시절)에는 통과하던 구성이다.
 *   이 파일은 그 방향을 단정하지 않는다. fail-closed 방향이라 위반으로도 보지 않았다.
 *   판정: 회귀로 볼 것인가, 「형식 오류는 갈래와 무관하게 기동 실패」를 §4에 명문화할 것인가.
 *
 * ── U-2: 빈 문자열·공백뿐인 키 값 ───────────────────────────────────────────
 *   §4는 값의 형태를 정하지 않는다. 구현은 부재로 보고 다음 자리로 넘어간다.
 *   검색 키에서 그것은 키를 적었는데도 도구가 뜨지 않는 형태로 나타난다 — 도구 집합 표시가
 *   있으므로 완전한 침묵은 아니나(§2), **사유는 어디에도 안 보인다.**
 *   판정: 빈 값을 형식 오류로 볼 것인가, 부재로 두되 사유를 고지할 것인가.
 *
 * ── U-3: 크리덴셜 **객체**의 동결 범위 ──────────────────────────────────────
 *   `WEB-ACCESS.md` §3.2 시크릿 항이 검색 키를 «시작 시 1회 읽고 동결한다»
 *   (`SAFE-DEFAULTS.md` §4) 규율 안이라 든다. 그런데 §4의 문면이 드는 모집단은
 *   «보안에 영향을 주는 모든 설정(승인 모드, denylist, 샌드박스 방침)»이고,
 *   크리덴셜 객체를 `Object.freeze`할 것인지는 어느 절도 정하지 않는다. 구현은
 *   값 목록 배열만 동결한다(개정 전부터 그렇다 — 이 사이클의 변경이 아니다).
 *   설정은 `CLI-INTERFACE.md` §3이 깊은 동결을 명시로 받았으므로 둘이 비대칭이다.
 *   판정: 크리덴셜에도 같은 동결을 요구할 것인가(요구하면 그 자리는 로더다).
 * ═══════════════════════════════════════════════════════════════════════════ */
