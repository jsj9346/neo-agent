/**
 * T-014 CLI 통합 시나리오 — 샌드박스 조건부 노출 · 웹 오염 런 · 승인 학습 (QA-C).
 *
 * **실물을 조립해 끝에서 끝까지 돌린다.** `startCli`가 조립하는 그대로 — 실제 SQLite
 * 저장소, 실제 설정 로더, 실제 승인 게이트·파이프라인, 실제 `web_fetch` 도구, 실제
 * REPL 상태 머신과 승인 프롬프트다. 대역은 셋뿐이며 셋 다 **계약이 열어 둔 주입점**이다:
 *
 *   1. 모델 (`createModelClient`) — 네트워크로 나갈 수 없다.
 *   2. Docker 가용 판정 (`probeDocker`) — 세 갈래를 머신 상태와 무관하게 고정한다.
 *      주입점이 열려 있는 이유가 정확히 이것이다(`src/wiring.ts` 주석).
 *   3. `web_fetch`의 전송 계층 (`CreateWebFetchToolOptions.fetch`) — 차단 대역이
 *      루프백을 포함하므로 **로컬 테스트 서버는 설계상 도달 불가능한 주소에 있고**
 *      (`WEB-ACCESS.md` §4), 외부 도메인에 의존하면 게이트가 네트워크 상태로
 *      깜빡인다. 도구·게이트·오염 배선은 전부 실물이다.
 *
 * 기대값의 출처는 정본 문서뿐이다(전부 2026-08-09 개정분):
 *   - `CLI-INTERFACE.md` §2(시작 시퀀스 5b·도구 목록 표시·등록 순서 고정)·§3(설정 키
 *     `sandbox`·`sandboxImage`·미지 키)·§7(렌더링)
 *   - `SANDBOX.md` §3(기본 `"on"`·조건부 노출·**세션 중 목록 불변**)·§4(강제 지점은
 *     CLI 설정 검증 하나 / docker 실패는 실행 실패로 승격)
 *   - `WEB-ACCESS.md` §4(주입점을 CLI가 채우지 않는다)·§5(오염 수명·배선)·§6(게이트 접점)
 *   - `TOOLS-INTERFACE.md` §5(프로필 테이블 소유 규칙 — 패키지별 소유 + 호스트 병합)
 *   - `APPROVAL-GATE.md` §2(계층 4b)·§4(`noteToolResult`/`resetTaint`, `webFetch:<origin>`)
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 C-n]`(C-7부터 — C-1~C-6은
 * 판정 완료)에 모았다.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type {
  AssistantMessage,
  ModelAssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
  TokenUsage,
} from "@neo-agent/core";
import { createApprovalGate } from "@neo-agent/gate";
import type { DockerProcess, DockerRunner } from "@neo-agent/sandbox";
import { createDockerShellExecutor } from "@neo-agent/sandbox";
import type { ShellExecResult, ShellExecutor } from "@neo-agent/tools";
import type { FetchOutcome } from "@neo-agent/web";
import { createWebFetchTool } from "@neo-agent/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliArgs } from "../src/args.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import type { CliApp, CliDeps, WiringFactories } from "../src/wiring.ts";
import { EXIT_STARTUP_FAILED, runCli, startCli } from "../src/wiring.ts";
import { dockerAvailable, dockerProbeForbidden, dockerUnavailable } from "./probe-docker.ts";

/** `contextWindowForModel`이 아는 모델 — 기동 경고가 화면을 흐리지 않게 한다 */
const MODEL_ID = "claude-haiku-4-5-20251001";
const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** 파일 3종은 항상 등록된다. `shell`만 5b 판정에 따라 붙거나 빠진다(§2) */
const ALWAYS_TOOLS = ["read_file", "write_file", "edit_file"] as const;
/** `web_fetch`는 **항상** 등록되고 위치가 고정이다(§2 — 파일 3종 → (shell) → web_fetch) */
const FULL_TOOLS = [...ALWAYS_TOOLS, "shell", "web_fetch"] as const;
const NO_SHELL_TOOLS = [...ALWAYS_TOOLS, "web_fetch"] as const;

// ───────────────────────────────────────────────────────────────────────────
// 대역 — 모델 · 셸 실행자 · 웹 전송
// ───────────────────────────────────────────────────────────────────────────

interface ScriptTurn {
  text?: string;
  toolCalls?: readonly { toolCallId: string; toolName: string; args: unknown }[];
  stopReason?: StopReason;
}

/**
 * 대본대로 한 턴씩 재생하는 모델. `CORE-INTERFACE.md` §8 계약만 지킨다 —
 * throw/reject하지 않고, `done.message`에 id가 없으며, `usage`는 항상 실린다.
 *
 * 커서가 **런을 넘어 이어진다**는 것이 이 파일에 중요하다: 오염 시나리오는 여러
 * 런에 걸친 상태 변화를 재기 때문이다.
 */
class ScriptModel implements ModelClient {
  readonly modelId = MODEL_ID;
  readonly requests: ModelRequest[] = [];
  #cursor = 0;
  readonly #script: readonly ScriptTurn[];

  constructor(script: readonly ScriptTurn[]) {
    this.#script = [...script];
  }

  async *stream(request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(structuredClone(request) as ModelRequest);
    const turn = this.#script[this.#cursor];
    this.#cursor += 1;

    if (!turn) {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: `ScriptModel: 대본 소진 (호출 ${this.#cursor}회 / 준비 ${this.#script.length}개)`,
          usage: { ...ZERO_USAGE },
          timestamp: Date.now(),
        } satisfies ModelAssistantMessage,
      };
      return;
    }

    const content: AssistantMessage["content"] = [];
    if (turn.text !== undefined) {
      content.push({ type: "text", text: turn.text });
      yield { type: "text_delta", text: turn.text };
    }
    for (const call of turn.toolCalls ?? []) {
      content.push({ type: "toolCall", ...call });
      yield { type: "toolcall", ...call };
    }

    yield {
      type: "done",
      message: {
        role: "assistant",
        content,
        stopReason:
          turn.stopReason ?? ((turn.toolCalls?.length ?? 0) > 0 ? "tool_use" : "end_turn"),
        usage: { ...ZERO_USAGE },
        timestamp: Date.now(),
      },
    };
  }
}

/** 프로세스도 컨테이너도 띄우지 않는 셸 실행자 — 오염 시나리오는 셸의 **판정**만 잰다 */
function stubExecutor(): ShellExecutor {
  return {
    async exec(request): Promise<ShellExecResult> {
      return {
        exitCode: 0,
        stdout: `stub:${request.command}`,
        stderr: "",
        truncated: false,
        timedOut: false,
      };
    },
  };
}

/** `web_fetch`의 전송 계층 대역. 판정·피닝은 `packages/web`의 계약 테스트가 본다 */
function stubFetch(body = "<html><body>가져온 페이지 본문</body></html>") {
  return async (url: string): Promise<FetchOutcome> => ({
    ok: true,
    url,
    contentType: "text/html; charset=utf-8",
    body,
    truncated: false,
    hops: 0,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 리그
// ───────────────────────────────────────────────────────────────────────────

let sandboxDir: string;
let home: string;
let workspace: string;

beforeEach(() => {
  sandboxDir = realpathSync(mkdtempSync(join(tmpdir(), "neo-qac-t014-")));
  home = join(sandboxDir, "home");
  workspace = join(sandboxDir, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
});

afterEach(() => {
  rmSync(sandboxDir, { recursive: true, force: true });
});

/** `~/.neo-agent/config.json`. 설정은 시작 시 1회 읽히므로 `startCli` 전에 쓴다(§3) */
function writeConfig(settings: Record<string, unknown>): void {
  writeFileSync(
    join(home, ".neo-agent", "config.json"),
    JSON.stringify({ model: MODEL_ID, compactionAuto: false, ...settings }),
    { mode: 0o600 },
  );
}

interface RigOptions {
  script?: readonly ScriptTurn[];
  probeDocker?: WiringFactories["probeDocker"];
  /** 셸 실행자 대역. 지정하지 않으면 프로세스를 띄우지 않는 스텁이다 */
  executor?: ShellExecutor;
  /** 컨테이너 실행자 대역. 세션 중 Docker 사망 시나리오가 쓴다 */
  sandboxExecutor?: (options: { image: string; workspaceRoot: string }) => ShellExecutor;
}

interface Rig {
  deps: CliDeps;
  args: CliArgs;
  input: PassThrough;
  model: ScriptModel;
  text(): string;
  /** 게이트가 관측한 `noteToolResult`의 `source` 값 순서 */
  notedSources: (string | undefined)[];
  /** `resetTaint` 호출 횟수 — 런 시작마다 1회여야 한다 */
  resets: { count: number };
  /** 호스트 실행자가 받은 시크릿 목록 (`sandbox: "off"` 갈래에서만 채워진다) */
  hostSecrets: (readonly string[] | undefined)[];
  /** 컨테이너 실행자가 받은 옵션 — 시크릿 키의 **부재**를 재는 자리다 */
  sandboxOptions: Record<string, unknown>[];
}

function createRig(options: RigOptions = {}): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 100;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const model = new ScriptModel(options.script ?? [{ text: "응답" }]);
  const notedSources: (string | undefined)[] = [];
  const resets = { count: 0 };
  const hostSecrets: (readonly string[] | undefined)[] = [];
  const sandboxOptions: Record<string, unknown>[] = [];
  const executor = options.executor ?? stubExecutor();

  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qac",
    factories: {
      createModelClient: () => model,
      // Docker 판정은 **명시 주입**이다(`./probe-docker.ts`).
      probeDocker: options.probeDocker ?? dockerAvailable(),
      createExecutor: (opts) => {
        hostSecrets.push(opts.secretValues);
        return executor;
      },
      createSandboxExecutor: (opts) => {
        sandboxOptions.push({ ...opts });
        return options.sandboxExecutor?.(opts) ?? executor;
      },
      // 전송 계층만 대역이고 도구·boundary 래핑·`source: "network"`는 실물이다.
      createWebTool: () => createWebFetchTool({ fetch: stubFetch() }),
      /**
       * 게이트는 **실물**이고 오염 2메서드만 관측한다. 모의로 갈아치우면 "배선은
       * 맞는데 판정은 안 도는" 상태를 통과시킨다 — 이 파일이 재려는 것이 정확히
       * 그 접합부다.
       */
      createGate: (config) => {
        const gate = createApprovalGate(config);
        return {
          beforeToolCall: gate.beforeToolCall,
          noteToolResult: (result) => {
            notedSources.push(result.source);
            gate.noteToolResult(result);
          },
          resetTaint: () => {
            resets.count += 1;
            gate.resetTaint();
          },
          // 읽기 노출(APPROVAL-GATE §4)은 관측 대상이 아니라 그대로 넘긴다 —
          // 이 대역이 재는 것은 오염 **쓰기** 2메서드의 배선이다
          isTainted: () => gate.isTainted(),
        };
      },
    },
  };

  return {
    deps,
    args: { kind: "run" },
    input,
    model,
    text: () => stripAnsi(chunks.join("")),
    notedSources,
    resets,
    hostSecrets,
    sandboxOptions,
  };
}

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** "일어나지 않았다"를 재려면 시간을 줘야 한다 — 즉시 단정은 공허하다 */
async function settle(rounds = 60): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

async function waitFor(rig: Rig, needle: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (rig.text().includes(needle)) return;
    await tick();
  }
  throw new Error(`"${needle}"가 화면에 나타나지 않았다. 지금까지의 출력:\n${rig.text()}`);
}

/** n번째 승인 프롬프트가 뜰 때까지 기다린다 — 프롬프트 횟수가 이 파일의 주 관측량이다 */
async function waitForPromptCount(rig: Rig, count: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (promptCount(rig) >= count) return;
    await tick();
  }
  throw new Error(
    `승인 프롬프트가 ${count}회에 이르지 않았다 (현재 ${promptCount(rig)}회). 출력:\n${rig.text()}`,
  );
}

function promptCount(rig: Rig): number {
  return rig.text().split("● 승인 필요").length - 1;
}

async function start(rig: Rig): Promise<{ app: CliApp; running: Promise<void> }> {
  const app = await startCli(rig.deps, rig.args);
  const running = app.run();
  await settle(10);
  return { app, running };
}

// ═══════════════════════════════════════════════════════════════════════════
// S1. 조건부 노출 — 세 갈래 (SANDBOX §3, CLI-INTERFACE §2 단계 5b)
// ═══════════════════════════════════════════════════════════════════════════

describe("S1. 조건부 노출 세 갈래 (SANDBOX §3)", () => {
  /**
   * §3: 기본값 `"on"` + Docker 가용 → `DockerShellExecutor`.
   * §2: "도구 수는 구성에 따라 다르다: 파일 3종 + `web_fetch`는 항상, `shell`은 5b
   * 판정에 따라. 등록되는 도구 집합이 시작 화면에 보여야 한다."
   */
  it('sandbox "on" + Docker 가용 → 도구 5종 등록 + 시작 화면 표시', async () => {
    writeConfig({});
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(app.parts.tools.map((tool) => tool.name)).toEqual([...FULL_TOOLS]);
    expect(app.parts.shell.kind).toBe("sandbox");
    // 컨테이너 실행자가 선택됐고 호스트 실행자는 아예 만들어지지 않았다
    expect(rig.sandboxOptions).toHaveLength(1);
    expect(rig.hostSecrets).toHaveLength(0);

    const screen = rig.text();
    expect(screen).toContain("도구 5종");
    for (const name of FULL_TOOLS) expect(screen).toContain(name);

    await app.shutdown();
    await running;
  });

  /**
   * `SANDBOX.md` §4: 컨테이너는 env가 비어서 시작하는 **화이트리스트**이므로
   * 시크릿을 애초에 받지 않는다. `sandbox: "off"`의 대응 단언(호스트 실행자는
   * 값을 받는다)은 `wiring.test.ts`에 있다 — 두 갈래가 짝이다.
   */
  it("컨테이너 실행자에는 시크릿 값이 전달되지 않는다 (SANDBOX §4 화이트리스트)", async () => {
    writeConfig({});
    const rig = createRig();
    const { app, running } = await start(rig);

    const [opts] = rig.sandboxOptions;
    expect(opts).toBeDefined();
    expect(Object.keys(opts ?? {})).not.toContain("secretValues");
    expect(opts?.image).toBe(app.parts.config.sandboxImage);
    expect(opts?.workspaceRoot).toBe(app.parts.boundary.root);

    await app.shutdown();
    await running;
  });

  /**
   * §3: "`"on"`인데 Docker가 없으면 셸 도구를 등록하지 않는다(**숨긴다,
   * 실패시키지 않는다**). 시작 시 두 갈래를 명시한다: Docker 설치 또는 명시적
   * `sandbox: "off"` 옵트아웃."
   *
   * **에러로 죽지 않는 것이 계약의 절반이다** — 여기서 기동을 실패시키면 파일
   * 도구와 `web_fetch`까지 함께 못 쓰게 된다.
   */
  it('sandbox "on" + Docker 불가용 → 도구 4종 + 두 갈래 안내 + 에러로 죽지 않는다', async () => {
    writeConfig({});
    const rig = createRig({ probeDocker: dockerUnavailable() });
    const { app, running } = await start(rig);

    expect(app.parts.tools.map((tool) => tool.name)).toEqual([...NO_SHELL_TOOLS]);
    expect(app.parts.shell.kind).toBe("unavailable");
    // 실행자는 어느 쪽도 만들어지지 않는다 — 등록하지 않을 도구의 실행자다
    expect(rig.sandboxOptions).toHaveLength(0);
    expect(rig.hostSecrets).toHaveLength(0);

    const screen = rig.text();
    expect(screen).toContain("도구 4종");
    expect(screen).not.toMatch(/도구 \d+종:[^\n]*\bshell\b/);
    // 두 갈래: (1) Docker를 쓸 수 있게 (2) 명시적 옵트아웃
    expect(screen).toContain("Docker");
    expect(screen).toContain('"sandbox": "off"');
    // `reason`은 감추지 않는다 — 미설치와 권한 없음은 사용자가 할 일이 다르다(§3)
    expect(screen).toContain("permission denied");

    await app.shutdown();
    await running;
  });

  /** §3: `"off"`는 명시적 호스트 실행 옵트아웃. 판정 자체를 하지 않는다(§2 5b) */
  it('sandbox "off" → 도구 5종 + HostShellExecutor 배선 + Docker 판정 없음', async () => {
    writeConfig({ sandbox: "off" });
    const rig = createRig({ probeDocker: dockerProbeForbidden() });
    const { app, running } = await start(rig);

    expect(app.parts.tools.map((tool) => tool.name)).toEqual([...FULL_TOOLS]);
    expect(app.parts.shell.kind).toBe("host");
    expect(rig.hostSecrets).toEqual([["sk-ant-테스트"]]);
    expect(rig.sandboxOptions).toHaveLength(0);

    // 옵트아웃은 사용자의 선택이지만 **무엇을 포기했는지**는 매번 보여야 한다(§2.6)
    expect(rig.text()).toContain("격리 없이");

    await app.shutdown();
    await running;
  });

  /**
   * §2: "도구 등록 **순서는 고정**이다(프롬프트 캐시 바이트 안정성 — `ARCHITECTURE.md`
   * 불변 조건 6): **`shell`이 빠져도 남은 도구의 순서는 변하지 않는다.**"
   *
   * 세 갈래의 도구 목록에서 `shell`을 덜어낸 나열이 **바이트 단위로 같아야** 한다.
   * 구성에 따라 도구를 재배치하면 같은 도구 집합의 직렬화가 갈려 캐시가 이유 없이
   * 빗나간다 — 이 단정이 없으면 "web_fetch를 shell 자리에 끼워 넣는" 리팩터가
   * 조용히 통과한다.
   */
  it("세 갈래에서 shell을 뺀 도구 순서가 동일하다 (불변 조건 6)", async () => {
    const orders: string[][] = [];

    for (const branch of ["on-available", "on-unavailable", "off"] as const) {
      writeConfig(branch === "off" ? { sandbox: "off" } : {});
      const rig = createRig({
        probeDocker:
          branch === "on-available"
            ? dockerAvailable()
            : branch === "on-unavailable"
              ? dockerUnavailable()
              : dockerProbeForbidden(),
      });
      const { app, running } = await start(rig);
      orders.push(app.parts.tools.map((tool) => tool.name));
      await app.shutdown();
      await running;
    }

    const withoutShell = orders.map((names) => names.filter((name) => name !== "shell"));
    expect(withoutShell[0]).toEqual([...NO_SHELL_TOOLS]);
    expect(withoutShell[1]).toEqual(withoutShell[0]);
    expect(withoutShell[2]).toEqual(withoutShell[0]);
    // 셸이 붙는 자리도 고정이다 — 끝에서 덜어내는 형태여야 나머지가 안 밀린다
    expect(orders[0]).toEqual([...FULL_TOOLS]);
    expect(orders[2]).toEqual([...FULL_TOOLS]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S2. 세션 중 Docker 사망 — 목록은 바뀌지 않는다 (SANDBOX §3)
// ═══════════════════════════════════════════════════════════════════════════

describe("S2. 세션 중 Docker가 죽어도 도구 목록은 바뀌지 않는다 (SANDBOX §3)", () => {
  /**
   * ⚠ **이 테스트의 목적은 귀결을 고정하는 것이다.**
   *
   * `SANDBOX.md` §3: *"따라서 세션 중 Docker가 죽어도 셸 도구는 목록에서 사라지지
   * 않는다. 그때는 도구가 실행 실패로 보고한다(에러 텍스트에 Docker 부재를 명시).
   * 도구 목록을 동적으로 줄이는 것은 캐시를 깨는 일이고, 그 비용이 '쓸 수 없는
   * 도구가 목록에 남는' 비용보다 크다. **이 귀결을 명시해 두는 이유는, 나중에
   * 누군가 이것을 결함으로 보고 '고치려' 할 수 있기 때문이다.**"*
   *
   * 즉 아래 단정은 "쓸 수 없는 도구가 목록에 남는다"를 **요구**한다. 이것이
   * 버그로 보여 재판정 경로(`probeDocker` 재호출·도구 목록 축소·세션 중
   * `sandbox` 재읽기)를 넣고 싶어졌다면, 그것은 `ARCHITECTURE.md` §2.4(프롬프트
   * 캐시 보존)와 `CORE-INTERFACE.md`의 "`tools`는 생성 시 동결, setter 없음"을
   * 함께 뒤집는 일이다 — 코드가 아니라 `SANDBOX.md` §3을 먼저 고쳐야 한다.
   */
  it("Docker가 죽어도 도구 목록은 그대로이고 실패는 실행 시점에 보고된다", async () => {
    writeConfig({ approvalMode: "off" });

    /** 기동 후 데몬이 사라진 상태 — `docker` 스폰 자체가 실패한다 */
    const deadDaemon: DockerRunner = {
      run(): DockerProcess {
        throw Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" });
      },
    };

    const rig = createRig({
      script: [
        { toolCalls: [{ toolCallId: "c1", toolName: "shell", args: { command: "echo hi" } }] },
        { text: "끝" },
      ],
      // 실행자는 **실물**이다 — Docker 부재를 에러 텍스트에 명시하는 것이 그쪽 계약이고,
      // 스텁으로 갈아치우면 이 테스트는 자기가 쓴 문자열을 되읽는 것이 된다.
      sandboxExecutor: (opts) =>
        createDockerShellExecutor({
          image: opts.image,
          workspaceRoot: opts.workspaceRoot,
          docker: deadDaemon,
        }),
    });
    const { app, running } = await start(rig);

    const before = app.parts.tools.map((tool) => tool.name);
    expect(before).toEqual([...FULL_TOOLS]);

    rig.input.write("셸 좀 돌려줘\r");
    await waitFor(rig, "끝");
    await app.parts.agent.waitForIdle();

    // 1) 목록이 그대로다 — 같은 배열이고 같은 순서다
    expect(app.parts.tools.map((tool) => tool.name)).toEqual(before);
    expect(app.parts.shell.kind).toBe("sandbox");

    // 2) 실패는 **실행 실패**로 보고되고 에러 텍스트가 Docker 부재를 명시한다
    const failed = app.parts.agent.state.messages.find(
      (message) => message.role === "toolResult" && message.isError,
    );
    expect(failed).toBeDefined();
    const text = JSON.stringify(failed);
    expect(text).toContain("docker");
    expect(text).toContain("Docker가 없거나 접근할 수 없다");

    // 3) 화면에도 실패가 남는다 — 침묵 실패 금지(§2.6)
    expect(rig.text()).toContain("shell 실패");

    await app.shutdown();
    await running;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S3. 설정 검증 — `latest` 금지의 유일한 강제 지점 (SANDBOX §4, CLI-INTERFACE §3)
// ═══════════════════════════════════════════════════════════════════════════

describe("S3. sandboxImage 고정 태그 강제 (SANDBOX §4 — 강제 지점은 CLI 하나)", () => {
  /**
   * `SANDBOX.md` §4: "고정 태그를 쓴다. **`latest` 금지** — 같은 설정이 시점마다
   * 다르게 동작하는 것은 `auto`를 기각한 것과 같은 이유로 기각한다.
   * **강제 지점은 CLI의 설정 검증 하나다**(시작 에러). **실행자는 겸하지 않는다**."
   *
   * ⚠ **이 요구는 원래 sandbox 실행자 계약 테스트에 있었고 판정 B-1로 CLI에
   * 이관됐다.** 즉 여기가 이 계약의 **유일한** 강제 지점이다 — 이 describe가
   * 지워지면 `latest` 금지는 코드베이스 어디에서도 검사되지 않는다.
   */
  const rejected = [
    { image: "debian:latest", why: "명시적 latest 태그" },
    { image: "debian", why: "태그 없음 — docker가 암묵적으로 latest를 붙인다" },
    { image: "ghcr.io/x/y:latest", why: "레지스트리 경로가 붙은 latest" },
  ];

  for (const { image, why } of rejected) {
    it(`sandboxImage "${image}"는 시작 에러다 (${why})`, async () => {
      writeConfig({ sandboxImage: image });
      const rig = createRig();

      await expect(startCli(rig.deps, rig.args)).rejects.toThrow(/sandboxImage/);
      // 사유와 다음 행동이 담긴다(§2) — "고쳐라"만으로는 무엇으로 고칠지 모른다
      await expect(startCli(rig.deps, rig.args)).rejects.toThrow(/고정 태그/);
    });
  }

  it("고정 태그는 통과하고 그 값이 컨테이너 실행자로 넘어간다", async () => {
    writeConfig({ sandboxImage: "debian:bookworm-20260101-slim" });
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(app.parts.config.sandboxImage).toBe("debian:bookworm-20260101-slim");
    expect(rig.sandboxOptions[0]?.image).toBe("debian:bookworm-20260101-slim");

    await app.shutdown();
    await running;
  });

  /** 기동 실패는 종료 코드와 함께 원인이 화면에 남는다(§2) */
  it("runCli는 latest 설정에서 기동 실패 코드로 끝난다", async () => {
    writeConfig({ sandboxImage: "debian:latest" });
    const rig = createRig();

    expect(await runCli(rig.deps)).toBe(EXIT_STARTUP_FAILED);
    expect(rig.text()).toContain("sandboxImage");
  });

  /**
   * §3: "미지의 키는 시작 시 에러다." 기존 규율의 회귀 확인 — 설정 키가 2개
   * 늘어난 뒤에도 닫힌 목록이 열리지 않았는지 본다.
   */
  it("미지의 설정 키는 여전히 시작 에러다 (기존 규율 회귀)", async () => {
    writeConfig({ sandboxMode: "on" }); // `sandbox`의 그럴듯한 오타
    const rig = createRig();

    await expect(startCli(rig.deps, rig.args)).rejects.toThrow(/모르는 키/);
    await expect(startCli(rig.deps, rig.args)).rejects.toThrow(/sandboxMode/);
  });

  it("sandbox 값이 닫힌 유니온 밖이면 시작 에러다", async () => {
    writeConfig({ sandbox: "auto" }); // §3: `auto`는 없다
    const rig = createRig();

    await expect(startCli(rig.deps, rig.args)).rejects.toThrow(/sandbox/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S4. 오염 런 통합 (WEB-ACCESS §5, APPROVAL-GATE §2 계층 4b·§4)
// ═══════════════════════════════════════════════════════════════════════════

describe("S4. 오염 런 — 학습된 allowlist가 무효화되고 런이 끝나면 복구된다", () => {
  /** 셸 호출 한 턴 + 마무리 한 턴 */
  function shellRun(id: string, command: string): ScriptTurn[] {
    return [
      { toolCalls: [{ toolCallId: id, toolName: "shell", args: { command } }] },
      { text: id },
    ];
  }

  /**
   * `WEB-ACCESS.md` §5 + `APPROVAL-GATE.md` §2 계층 4b의 끝에서 끝까지:
   *
   *   런1: 셸 명령을 `allow-always`로 학습한다 → allowlist에 남는다
   *   런2: `web_fetch`(`source: "network"`) 뒤의 **같은 셸 명령이 다시 프롬프트**된다
   *   런3: `agent_start`의 `resetTaint`로 복구 — 같은 명령이 자동 허용된다
   *
   * 런3이 이 테스트의 절반이다. 오염이 풀리지 않으면 정책은 "allowlist 기능 삭제"와
   * 같아지고, 그 상태의 마찰은 승인 피로를 거쳐 무조건 allow로 간다(§2 4b 주석).
   */
  it("web_fetch 뒤의 학습된 셸이 다시 프롬프트되고, 다음 런에서 복구된다", async () => {
    writeConfig({});
    const rig = createRig({
      script: [
        ...shellRun("run1", "echo one"),
        {
          toolCalls: [
            { toolCallId: "w1", toolName: "web_fetch", args: { url: "https://example.test/a" } },
          ],
        },
        { toolCalls: [{ toolCallId: "run2", toolName: "shell", args: { command: "echo one" } }] },
        { text: "run2" },
        ...shellRun("run3", "echo one"),
      ],
    });
    const { app, running } = await start(rig);

    // ── 런1 — 학습 (allow-always)
    rig.input.write("첫 요청\r");
    await waitForPromptCount(rig, 1);
    expect(rig.text()).toContain("항상 허용"); // allowAlwaysKey가 있는 요청이다
    rig.input.write("a");
    await waitFor(rig, "run1");
    await app.parts.agent.waitForIdle();
    expect(app.parts.allowlist.has("shell:echo one")).toBe(true);

    // ── 런2 — web_fetch 승인(최초 호스트) 후 같은 셸이 **다시** 묻는다
    rig.input.write("둘째 요청\r");
    await waitForPromptCount(rig, 2);
    expect(rig.text()).toContain("example.test");
    rig.input.write("y"); // web_fetch allow-once

    await waitForPromptCount(rig, 3); // ← 학습돼 있는데도 세 번째 프롬프트가 뜬다
    const tainted = rig.text().slice(rig.text().lastIndexOf("● 승인 필요"));
    // 경고가 "이 런이 외부 페이지를 가져왔다"는 취지로 읽혀야 한다(§2 4b, 판정 C-5)
    expect(tainted).toContain("오염");
    expect(tainted).toContain("외부");
    rig.input.write("y");
    await waitFor(rig, "run2");
    await app.parts.agent.waitForIdle();

    // 오염원이 실제로 network였는지 — 게이트가 본 것으로 확인한다
    expect(rig.notedSources).toContain("network");

    // ── 런3 — `agent_start`가 오염을 풀어 같은 명령이 자동 허용된다
    const beforeRun3 = promptCount(rig);
    rig.input.write("셋째 요청\r");
    await waitFor(rig, "run3");
    await app.parts.agent.waitForIdle();
    await settle();

    expect(promptCount(rig)).toBe(beforeRun3);

    await app.shutdown();
    await running;
  });

  /**
   * `APPROVAL-GATE.md` §4 + `CLI-INTERFACE.md` §2 단계 7: 호스트가 `agent_start`에서
   * `resetTaint`를 부른다. 그 구독은 **세션마다 새로 만들어지는 Agent**에 붙으므로
   * `/new`·`/resume`의 Agent 교체를 따라가야 한다.
   *
   * **리스너가 안 붙은 Agent가 생기면 그 세션은 오염이 영원히 안 풀린다** — 게이트도
   * allowlist도 세션이 바뀌어도 그대로라(프로세스 수명 하나) 오염 상태 역시 하나이기
   * 때문이다. 그래서 세션을 갈아탄 뒤에도 자동 허용이 살아 있는지를 잰다.
   */
  it("/new·/resume으로 세션을 바꿔도 resetTaint 구독이 따라간다", async () => {
    writeConfig({});
    const rig = createRig({
      script: [
        ...shellRun("run1", "echo one"),
        {
          toolCalls: [
            { toolCallId: "w1", toolName: "web_fetch", args: { url: "https://example.test/a" } },
          ],
        },
        { text: "run2" },
        ...shellRun("new-run", "echo one"),
        ...shellRun("resumed-run", "echo one"),
      ],
    });
    const { app, running } = await start(rig);

    // 학습
    rig.input.write("첫 요청\r");
    await waitForPromptCount(rig, 1);
    rig.input.write("a");
    await waitFor(rig, "run1");
    await app.parts.agent.waitForIdle();
    const firstSession = app.parts.session.id;

    // 오염만 남기고 런 종료
    rig.input.write("둘째 요청\r");
    await waitForPromptCount(rig, 2);
    rig.input.write("y");
    await waitFor(rig, "run2");
    await app.parts.agent.waitForIdle();
    expect(rig.notedSources).toContain("network");

    const resetsBeforeSwitch = rig.resets.count;

    // ── /new — 새 Agent. 리스너가 따라붙지 않으면 아래 셸이 다시 묻는다
    rig.input.write("/new\r");
    await waitFor(rig, "새 세션");
    expect(app.parts.session.id).not.toBe(firstSession);

    const promptsBefore = promptCount(rig);
    rig.input.write("새 세션 요청\r");
    await waitFor(rig, "new-run");
    await app.parts.agent.waitForIdle();
    await settle();
    expect(promptCount(rig)).toBe(promptsBefore);
    expect(rig.resets.count).toBeGreaterThan(resetsBeforeSwitch);

    // ── /resume — 되돌아간 세션도 마찬가지다
    rig.input.write(`/resume ${firstSession.slice(0, 8)}\r`);
    await waitFor(rig, "이어가기");
    expect(app.parts.session.id).toBe(firstSession);

    const promptsBeforeResume = promptCount(rig);
    rig.input.write("재개 후 요청\r");
    await waitFor(rig, "resumed-run");
    await app.parts.agent.waitForIdle();
    await settle();
    expect(promptCount(rig)).toBe(promptsBeforeResume);

    await app.shutdown();
    await running;
  });

  /**
   * `src/wiring.ts`의 계약 주석: *"**모든 도구 결과에 대해 부른다.** 조건을 붙이면
   * (예: `web_fetch`만) 오염이 조용히 새고, 그 순간 allowlist 무효화 정책은 있으나
   * 마나가 된다(WEB-ACCESS §5)."*
   *
   * 하나라도 빠지면 오염이 조용히 샌다 — 조용히 새는 것은 테스트가 없으면 영영
   * 발견되지 않으므로, **결과 개수와 호출 개수가 같은지**를 직접 센다.
   */
  it("afterToolCall이 모든 도구 결과에 noteToolResult를 부른다", async () => {
    writeConfig({ approvalMode: "off" });
    writeFileSync(join(workspace, "읽을-파일.txt"), "내용");

    const rig = createRig({
      script: [
        {
          toolCalls: [
            {
              toolCallId: "t1",
              toolName: "read_file",
              args: { path: join(workspace, "읽을-파일.txt") },
            },
          ],
        },
        {
          toolCalls: [
            { toolCallId: "t2", toolName: "web_fetch", args: { url: "https://example.test/a" } },
          ],
        },
        { toolCalls: [{ toolCallId: "t3", toolName: "shell", args: { command: "echo hi" } }] },
        {
          toolCalls: [
            { toolCallId: "t4", toolName: "read_file", args: { path: "/없는/파일.txt" } },
          ],
        },
        { text: "전부 끝" },
      ],
    });
    const { app, running } = await start(rig);

    rig.input.write("여러 도구를 써줘\r");
    await waitFor(rig, "전부 끝");
    await app.parts.agent.waitForIdle();

    const results = app.parts.agent.state.messages.filter(
      (message) => message.role === "toolResult",
    );
    expect(results).toHaveLength(4);
    // 실패한 결과(t4)도 빠지지 않는다 — 조건이 붙는 순간 그것이 곧 새는 구멍이다
    expect(rig.notedSources).toHaveLength(results.length);
    expect(rig.notedSources.filter((source) => source === "network")).toHaveLength(1);
    expect(rig.notedSources.filter((source) => source === "local")).toHaveLength(3);

    await app.shutdown();
    await running;
  });

  /** 오염 수명은 런 단위다 — 런 시작마다 정확히 1회 초기화된다(§5) */
  it("resetTaint는 런마다 불린다", async () => {
    writeConfig({ approvalMode: "off" });
    const rig = createRig({ script: [{ text: "A" }, { text: "B" }] });
    const { app, running } = await start(rig);

    expect(rig.resets.count).toBe(0);
    rig.input.write("하나\r");
    await waitFor(rig, "A");
    await app.parts.agent.waitForIdle();
    expect(rig.resets.count).toBe(1);

    rig.input.write("둘\r");
    await waitFor(rig, "B");
    await app.parts.agent.waitForIdle();
    expect(rig.resets.count).toBe(2);

    await app.shutdown();
    await running;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S5. web_fetch 승인 학습 — origin 단위 (APPROVAL-GATE §4, WEB-ACCESS §6)
// ═══════════════════════════════════════════════════════════════════════════

describe("S5. web_fetch 호스트 학습 (WEB-ACCESS §6)", () => {
  function fetchTurn(id: string, url: string): ScriptTurn {
    return { toolCalls: [{ toolCallId: id, toolName: "web_fetch", args: { url } }] };
  }

  /**
   * §6 표: 최초 호스트 → 승인 / 학습된 호스트(오염 없음) → 자동 허용.
   * §4(게이트): 키는 `webFetch:<origin>`이고 **경로·쿼리는 키에 들어가지 않는다**.
   * **도메인 접미사로 넓히지 않는다** — 서브도메인 탈취에 열지 않기 위해서다.
   *
   * 학습 뒤의 두 번째 fetch는 **런을 갈아서** 한다: 같은 런 안이면 첫 fetch가 그 런을
   * 오염시켜 계층 4b가 학습을 무효화하므로(§5 — `web_fetch` 자신도 예외가 아니다,
   * 판정 C-1) 자동 허용을 관찰할 수 없다.
   */
  it("allow-always 뒤 같은 호스트의 다른 경로는 자동 허용, 다른 호스트·서브도메인은 다시 묻는다", async () => {
    writeConfig({});
    const rig = createRig({
      script: [
        fetchTurn("f1", "https://example.test/first?q=1"),
        { text: "런1 끝" },
        fetchTurn("f2", "https://example.test/second/deep?q=2"),
        { text: "런2 끝" },
        fetchTurn("f3", "https://other.test/x"),
        { text: "런3 끝" },
        fetchTurn("f4", "https://sub.example.test/y"),
        { text: "런4 끝" },
      ],
    });
    const { app, running } = await start(rig);

    // ── 런1: 최초 호스트 → 승인 → allow-always로 학습
    rig.input.write("가져와줘\r");
    await waitForPromptCount(rig, 1);
    rig.input.write("a");
    await waitFor(rig, "런1 끝");
    await app.parts.agent.waitForIdle();

    // 키는 origin이다 — 경로·쿼리가 들어가면 쿼리마다 학습이 무효가 된다
    expect(app.parts.allowlist.has("webFetch:https://example.test")).toBe(true);

    // ── 런2: 같은 호스트, 다른 경로 → 자동 허용 (프롬프트 증가 없음)
    let before = promptCount(rig);
    rig.input.write("같은 사이트 다른 페이지\r");
    await waitFor(rig, "런2 끝");
    await app.parts.agent.waitForIdle();
    await settle();
    expect(promptCount(rig)).toBe(before);

    // ── 런3: 다른 호스트 → 다시 묻는다
    before = promptCount(rig);
    rig.input.write("다른 사이트\r");
    await waitForPromptCount(rig, before + 1);
    expect(rig.text()).toContain("other.test");
    rig.input.write("y");
    await waitFor(rig, "런3 끝");
    await app.parts.agent.waitForIdle();

    // ── 런4: 서브도메인 → 다른 키다. 접미사로 넓히지 않는다
    before = promptCount(rig);
    rig.input.write("서브도메인\r");
    await waitForPromptCount(rig, before + 1);
    expect(rig.text()).toContain("sub.example.test");
    rig.input.write("n");
    await waitFor(rig, "런4 끝");
    await app.parts.agent.waitForIdle();

    expect(app.parts.allowlist.has("webFetch:https://sub.example.test")).toBe(false);

    await app.shutdown();
    await running;
  });

  /**
   * §10(CLI): allowlist는 `~/.neo-agent/allowlist`에 한 줄 = 키 하나로 영속된다.
   * 학습이 파일까지 닿지 않으면 다음 세션에서 조용히 사라진다.
   */
  it("학습된 webFetch 키가 allowlist 파일에 남는다", async () => {
    writeConfig({});
    const rig = createRig({
      script: [fetchTurn("f1", "https://example.test/first"), { text: "끝" }],
    });
    const { app, running } = await start(rig);

    rig.input.write("가져와줘\r");
    await waitForPromptCount(rig, 1);
    rig.input.write("a");
    await waitFor(rig, "끝");
    await app.parts.agent.waitForIdle();
    await app.shutdown();
    await running;

    const lines = readFileSync(join(home, ".neo-agent", "allowlist"), "utf8")
      .split("\n")
      .filter((line) => line !== "");
    expect(lines).toContain("webFetch:https://example.test");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S6. 배선 회귀 — 같은 판정기 인스턴스 · 프로필 병합 · 주입 부재
// ═══════════════════════════════════════════════════════════════════════════

describe("S6. 배선 회귀 (TOOLS-INTERFACE §3·§5, WEB-ACCESS §4)", () => {
  /**
   * 기존 배선 계약의 회귀 — 도구가 5종이 된 뒤에도 판정기는 **하나**여야 한다.
   * 판정기가 둘이면 "게이트는 안이라 했는데 도구는 밖을 읽는" 불일치가 생긴다.
   */
  it("게이트 classifier와 도구가 같은 WorkspaceBoundary 인스턴스를 받는다", async () => {
    writeConfig({});
    let gateClassifier: unknown;
    let toolsBoundary: unknown;

    const rig = createRig();
    const base = rig.deps.factories ?? {};
    rig.deps.factories = {
      ...base,
      createTools: (options) => {
        toolsBoundary = options.boundary;
        return realCreateTools(options);
      },
      createGate: (config) => {
        gateClassifier = config.classifier;
        return (base.createGate as NonNullable<typeof base.createGate>)(config);
      },
    };

    const { app, running } = await start(rig);

    expect(toolsBoundary).toBe(app.parts.boundary);
    expect(gateClassifier).toBe(app.parts.boundary);
    expect(gateClassifier).toBe(toolsBoundary);

    await app.shutdown();
    await running;
  });

  /**
   * `TOOLS-INTERFACE.md` §5(2026-08-09 신설): 각 도구 패키지가 자기 프로필을
   * 소유하고 **호스트가 병합한다**. `web_fetch`가 병합에서 빠지면 게이트는 그것을
   * fail-closed(항상 프롬프트)로 다루므로 **동작은 안전한 채 계약만 어긋난다** —
   * 그래서 관측 가능한 실패가 아니라 키 집합으로 잰다.
   */
  it("게이트가 tools+web 병합 프로필을 받는다 (키 집합 단정)", async () => {
    writeConfig({});
    let profiles: Record<string, unknown> | undefined;

    const rig = createRig();
    const base = rig.deps.factories ?? {};
    rig.deps.factories = {
      ...base,
      createGate: (config) => {
        profiles = config.toolProfiles as Record<string, unknown>;
        return (base.createGate as NonNullable<typeof base.createGate>)(config);
      },
    };
    const { app, running } = await start(rig);

    expect(Object.keys(profiles ?? {}).sort()).toEqual([
      "edit_file",
      "read_file",
      "shell",
      "web_fetch",
      "write_file",
    ]);
    expect((profiles?.web_fetch as { kind?: string } | undefined)?.kind).toBe("webFetch");

    await app.shutdown();
    await running;
  });

  /**
   * `WEB-ACCESS.md` §4: *"**CLI는 둘 중 어느 것도 채우지 않는다.** 이것은 코드 리뷰
   * 기준이자 통합 테스트의 검증 대상이다."*
   *
   * 런타임으로는 "채우지 않았다"를 관측할 수 없다 — 기본값이 실제 판정기이므로 채운
   * 경우와 안 채운 경우의 **결과가 같기 때문**이다. 그래서 소스 스캔으로 고정한다.
   * 구현이 같은 보호를 **시그니처**로도 걸어 뒀다(`createWebTool()`이 인자를 받지
   * 않는다) — 그 성질까지 함께 잰다.
   */
  it("CLI 소스 어디에도 verify·resolveHostname·fetch 주입이 없다", () => {
    const wiring = readFileSync(new URL("../src/wiring.ts", import.meta.url), "utf8");

    // 1) 주입점 이름이 배선 코드에 등장하지 않는다
    expect(wiring).not.toMatch(/\bresolveHostname\b/);
    expect(wiring).not.toMatch(/\bverifyUrl\b/);
    expect(wiring).not.toMatch(/\bverify\s*:/);
    expect(wiring).not.toMatch(/\bfetch\s*:/);

    // 2) `createWebFetchTool`은 **인자 없이** 불린다
    expect(wiring).toMatch(/createWebFetchTool\(\s*\)/);

    // 3) 주입점 자체가 시그니처에 없다 — 실수로 채울 방법이 구조적으로 막혀 있다
    expect(wiring).toMatch(/createWebTool\(\s*\)\s*:/);
  });
});

// 순환 임포트를 피하려고 실물 팩토리는 여기서 한 번만 꺼낸다
const realCreateTools = await (async () => {
  const { resolveFactories } = await import("../src/wiring.ts");
  return resolveFactories().createTools;
})();

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정] 판정 요청 — 이 파일이 임의로 정하지 않은 것 (QA-C / T-014)
 *
 * C-1~C-6은 판정 완료(정본에 반영됨). 아래는 T-014에서 새로 만난 회색지대다.
 *
 * ── C-7: 조건부 노출 안내를 **어디에** 표시할지 ─────────────────────────────
 *   `SANDBOX.md` §3과 `CLI-INTERFACE.md` §2는 "시작 시 두 갈래를 명시한다"까지만
 *   정하고, 그것이 **시작 배너의 일부**인지 별도 경고 줄인지는 정하지 않는다.
 *   구현은 배너에 붙였고(`startupBanner`), 그 결과 `app.run()`을 부르지 않으면
 *   안내가 나오지 않는다 — 즉 `startCli`만 부르고 REPL에 들어가지 않는 호스트가
 *   생기면 안내가 조용히 사라진다. 이 파일의 단정은 배너 위치에 결합하지 않으려고
 *   "화면 어딘가에 나온다"로만 본다.
 *   판정: 안내 표시를 §2 시퀀스의 어느 단계에 못박을 것인가.
 *
 * ── C-8: `probeDocker` 판정 실패(가용 판정 자체가 던지는 경우)의 처리 ───────
 *   `SANDBOX.md` §3은 "가용/불가용" 두 갈래만 정한다. `probeDocker`가 **reject**
 *   하는 경우(패키지 내부 버그·주입 실수)의 계약은 어디에도 없다. 현재 배선은
 *   그 예외를 그대로 흘려 기동을 실패시킨다 — 이 파일은 그 성질을 `sandbox: "off"`
 *   갈래에서 "판정이 불리면 안 된다"의 관측 수단으로만 이용하고, 계약으로
 *   단언하지 않았다.
 *   판정: 판정기 자신의 실패를 "불가용"으로 흡수할 것인가(조건부 노출로 계속
 *   기동), 아니면 기동 실패로 둘 것인가. 전자는 §3의 "숨긴다, 실패시키지 않는다"와
 *   같은 방향이고, 후자는 "부분 기동을 만들지 않는다"(§2)와 같은 방향이다.
 *
 * ── C-9: 오염 경고와 위험 패턴 경고의 **구분 가능성**을 무엇으로 재는가 ─────
 *   `APPROVAL-GATE.md` §2 4b(판정 C-5)는 "문구는 구현 재량이되 위험 패턴 경고와
 *   구분 가능해야 한다"고 정했다. 구분 가능성은 사람이 읽는 성질이라 기계적으로
 *   잴 수 없다 — 이 파일은 오염 경고에 "오염"·"외부"가 들어 있는지까지만 본다.
 *   문구가 바뀌면 이 단정이 깨진다(문구는 조정 가능한 세부인데 테스트가 결합한
 *   상태다). 판정: 경고에 **안정된 식별자**(코드·접두)를 둘 것인가. 두면 문구를
 *   자유롭게 고치면서 구분 가능성을 계약으로 검사할 수 있다.
 *
 * ── C-10: `sandbox: "off"` 배너 문구의 지위 ─────────────────────────────────
 *   §5(SANDBOX)는 "끄는 경로는 명시적이고 가시적이다"라고만 하고 옵트아웃 상태를
 *   **매 기동 표시**할 것을 명시하지 않는다. 구현은 노란색 경고 줄로 매번 보인다.
 *   이 파일은 "격리 없이"라는 취지가 화면에 있는지만 본다.
 *   판정: 매 기동 표시를 §2.6의 요구로 명문화할 것인가(그러면 문구가 아니라
 *   표시 의무가 계약이 된다).
 * ═══════════════════════════════════════════════════════════════════════════ */
