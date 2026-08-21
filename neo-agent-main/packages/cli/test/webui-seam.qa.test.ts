/**
 * 독립 QA — 웹 UI 절개선 사이클(`T-001`~`T-006`)이 `docs/CLI-INTERFACE.md`의 계약을
 * 깨지 않았는가.
 *
 * **기대값의 출처는 정본 문서뿐이다.** `src/wiring.ts`나 `test/seam.contract.test.ts`를
 * 읽어 기대값을 정하지 않는다 — 그렇게 하면 구현이 옳았다는 것을 구현으로 증명하는
 * 순환이 된다. 대상이 문서와 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * 재는 축:
 *
 * - `CLI-INTERFACE.md` §2 — 시작 시퀀스 열거의 **상대 순서**. 기존 배선 테스트가 재는
 *   것은 3·4·6·7의 일부이고, 같은 절이 별도 불릿으로 계약이라 못박은 3b가 4보다 앞·
 *   5b가 6보다 앞은 어느 테스트도 재지 않았다. 여기서 그 빈 곳을 잰다.
 * - `CLI-INTERFACE.md` §1 · `SESSION-STORE.md` §4 · `CORE-INTERFACE.md` §3 — 저장소
 *   구독이 **항상** 첫째인가. 주입 목록의 길이·순서와 무관해야 한다.
 * - `CLI-INTERFACE.md` §7 · §1 — 렌더러는 예외를 삼키지 않고, 추가 구독자의 예외는
 *   조립이 감싸지 않는다. 두 규율이 서로 반대인 것이 §1이 의도로 든 것이다.
 * - `CORE-INTERFACE.md` §7 — 프롬프트 구현만 갈리고 게이트 모듈은 그대로인가.
 * - `CLI-INTERFACE.md` §7.1 — 주입이 없을 때 리스너 수가 늘지 않았는가.
 *
 * **전 순서를 배열 하나로 못박지 않는다.** §2 열거가 계약으로 든 것은 단계 사이의
 * 상대 순서이지 조립 내부의 호출 하나하나가 아니다 — 배열로 고정하면 계약이 아닌 것을
 * 기계가 불변으로 지키게 되고, 그 형태를 §1·§7이 각각 부패의 원인으로 지목한다.
 * 그래서 단언은 쌍(먼저·나중)으로 하고 관측한 전 순서는 실패 메시지에만 싣는다.
 *
 * **표시 문구를 리터럴로 고정하지 않는다**(§7의 마지막 불릿). 이 파일이 문자열을
 * 단정하는 자리는 셋이고 전부 그 금지 밖이다: ① 이 파일이 주입한 값, ② 이 파일이
 * 세운 트레이스 마커, ③ 닫힌 유니온의 태그값(`ToolCallDecision` — `CORE-INTERFACE.md`
 * §7). 화면 문면 자체는 재지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. **이 파일은 정본
 * 문면을 인용부호로 감싸지 않는다** — 전부 서술로 옮겼다. 문서를 줄번호로 가리키는
 * 자리는 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  Agent,
  type AgentEvent,
  type AgentEventListener,
  type AgentTool,
  type ModelClient,
  type ModelStreamEvent,
  type Unsubscribe,
} from "@neo-agent/core";
import type { ApprovalPrompt, ApprovalRequest } from "@neo-agent/gate";
import { MEMORY_FILE_NAME } from "@neo-agent/memory";
import {
  type OpenSessionStoreOptions,
  openSessionStore,
  type SessionStore,
} from "@neo-agent/store";
import type { StandardToolsOptions } from "@neo-agent/tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_ENV } from "../src/credentials.ts";
import { defaultMemoryDir } from "../src/memory.ts";
import type { OutputSink } from "../src/terminal.ts";
import { type CliApp, type CliDeps, resolveFactories, startCli } from "../src/wiring.ts";
import { dockerAvailable, dockerUnavailable } from "./probe-docker.ts";

/** 등록에 없는 모델 id — 주입 데이터. 컨텍스트 창 미지 갈래를 연다 */
const UNKNOWN_MODEL = "webui-seam-qa/unregistered-model";
/** 게이트 프로필에 없는 도구 이름 — 미등록은 fail-closed로 항상 묻는다(`APPROVAL-GATE.md` §3) */
const UNREGISTERED_TOOL = "webui_seam_qa_unregistered_tool";

// ── 트레이스 마커. 이 파일이 세운 이름이고 화면 문면이 아니다 ────────────────
const M = {
  boundary: "3:createBoundary",
  openStore: "4:openStore",
  createSession: "5:createSession",
  probeDocker: "5b:probeDocker",
  executor: "5b:executor",
  modelClient: "6:createModelClient",
  gate: "6:createGate",
  tools: "6:createTools",
  attach: "7:store.attach",
  subscribe: "7:subscribe",
  replStart: "8:repl.start",
} as const;

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function waitUntil(
  predicate: () => boolean,
  describeFailure: () => string,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(describeFailure());
}

/** 한 턴을 그대로 되돌려주는 최소 모델. 네트워크로 나가지 않는다 */
function localModel(): ModelClient {
  let turn = 0;
  return {
    modelId: UNKNOWN_MODEL,
    async *stream(): AsyncIterable<ModelStreamEvent> {
      turn += 1;
      const text = `turn-${turn}`;
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

let root: string;
let home: string;
let workspace: string;
let app: CliApp | undefined;
let running: Promise<void> | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-cli-seamqa-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  // 3c 첫 기동 관문(`CLI-INTERFACE.md` §2.1)을 이미 지난 홈으로 만든다 — 판정은
  // `~/.neo-agent/sessions.db`의 부재 하나뿐이라 빈 파일 하나면 «returning»이 된다
  // (0바이트는 SQLite가 유효한 빈 DB로 취급한다). 없으면 조립이 관문에서 키를
  // 기다리며 끝나지 않는다. 모드를 명시하는 것은 umask가 writeFileSync의 mode를
  // 깎아 `loose-file-permissions` 경고가 새로 나가는 것을 막기 위해서다.
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify({ model: UNKNOWN_MODEL }));
  app = undefined;
  running = undefined;
});

afterEach(async () => {
  await app?.shutdown().catch(() => undefined);
  await running?.catch(() => undefined);
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

interface Rig {
  deps: CliDeps;
  input: PassThrough;
  terminal(): string;
  model: ModelClient;
  /** 관측한 조립 호출의 순서. 마커는 위 `M` */
  marks: string[];
  /** `createTools`가 실제로 받은 인자 — 5b 판정이 6으로 흘렀는가의 관측점 */
  toolOptions: StandardToolsOptions[];
  storePath: string;
}

interface RigOptions {
  /** 5b의 Docker 판정. 기본은 가용 */
  docker?: "available" | "unavailable";
  deps?: Partial<CliDeps>;
  /** 주입 리스너 — `CliDeps.listeners` */
  listeners?: readonly AgentEventListener[];
}

/**
 * 전부 실물에 위임하는 관측 래퍼 — 대체가 아니라 감싸기다. 모의로 갈아치우면
 * 조립된 것이 실제로 도는가가 검증 대상에서 빠진다. 유일한 예외가 모델 클라이언트다
 * (네트워크로 나갈 수 없다).
 */
function createRig(options: RigOptions = {}): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const marks: string[] = [];
  const toolOptions: StandardToolsOptions[] = [];
  const model = localModel();

  const defaults = resolveFactories();
  const probe = options.docker === "unavailable" ? dockerUnavailable() : dockerAvailable();

  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "seam-qa-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-test",
    ...(options.listeners === undefined ? {} : { listeners: options.listeners }),
    factories: {
      createBoundary: (boundaryOptions) => {
        marks.push(M.boundary);
        return defaults.createBoundary(boundaryOptions);
      },
      openStore: (storeOptions: OpenSessionStoreOptions): SessionStore => {
        marks.push(M.openStore);
        const store = openSessionStore(storeOptions);
        return {
          ...store,
          createSession: (context) => {
            marks.push(M.createSession);
            return store.createSession(context);
          },
          loadSession: (id, context) => {
            marks.push(M.createSession);
            return store.loadSession(id, context);
          },
          attach: (agent: Agent, sessionId: string): Unsubscribe => {
            marks.push(M.attach);
            return store.attach(agent, sessionId);
          },
        };
      },
      probeDocker: async () => {
        marks.push(M.probeDocker);
        return probe();
      },
      createExecutor: (executorOptions) => {
        marks.push(M.executor);
        return defaults.createExecutor(executorOptions);
      },
      createSandboxExecutor: (executorOptions) => {
        marks.push(M.executor);
        return defaults.createSandboxExecutor(executorOptions);
      },
      createModelClient: () => {
        marks.push(M.modelClient);
        return model;
      },
      createGate: (gateConfig) => {
        marks.push(M.gate);
        return defaults.createGate(gateConfig);
      },
      createTools: (standardOptions: StandardToolsOptions): AgentTool[] => {
        marks.push(M.tools);
        toolOptions.push(standardOptions);
        return defaults.createTools(standardOptions);
      },
      ...(options.deps?.factories ?? {}),
    },
    ...options.deps,
  };

  return {
    deps,
    input,
    model,
    marks,
    toolOptions,
    terminal: () => chunks.join(""),
    storePath: join(home, ".neo-agent", "sessions.db"),
  };
}

/**
 * `beforeEach`가 3c 관문(`CLI-INTERFACE.md` §2.1)을 건너뛰려고 심어 둔 `sessions.db`를
 * 걷는다.
 *
 * 「4가 돌지 않았다」를 **파일의 부재**로 재는 테스트에만 쓴다 — 픽스처가 그 자리를
 * 차지하고 있으면 부재가 더는 증거가 아니기 때문이다. 이 테스트들은 3c보다 **앞선**
 * 단계(1·2·3b)에서 실패하므로 관문에 닿지 않는다: 관문의 자리는 §2.1이 «3b 뒤·4 앞»으로
 * 못박았다.
 */
function clearFirstRunFixture(): void {
  rmSync(join(home, ".neo-agent", "sessions.db"), { force: true });
}

/** 조립 단계의 고지를 받아 두는 최소 싱크. 터미널을 모른다 */
function captureSink(): OutputSink & { text(): string } {
  const written: string[] = [];
  return {
    write(text: string): void {
      written.push(text);
    },
    text: () => written.join(""),
  };
}

/** 관측한 마커의 상대 순서 확인 — 실패 메시지에 전 순서를 싣는다 */
function assertBefore(marks: readonly string[], earlier: string, later: string): void {
  const a = marks.indexOf(earlier);
  const b = marks.indexOf(later);
  expect(
    a >= 0 && b >= 0 && a < b,
    `${earlier} 가 ${later} 보다 먼저여야 한다. 관측된 전 순서: ${JSON.stringify(marks)}`,
  ).toBe(true);
}

// ───────────────────────────────────────────────────────────────────────────
// Q1. §2 시작 시퀀스 — 열거의 상대 순서
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 시작 시퀀스의 순서 (CLI-INTERFACE §2)", () => {
  /**
   * §2 열거의 관측 가능한 단계가 전부 열거 순서대로인가. 3·4·5·5b·6·7이 대상이고
   * 1·2·3b는 팩토리 표면이 없어 아래 실패 주입으로 잰다.
   */
  it("3 → 4 → 5 → 5b → 6 → 7이 열거 순서대로다", async () => {
    const rig = createRig();
    app = await startCli(rig.deps, { kind: "run" });

    assertBefore(rig.marks, M.boundary, M.openStore);
    assertBefore(rig.marks, M.openStore, M.createSession);
    assertBefore(rig.marks, M.createSession, M.probeDocker);
    assertBefore(rig.marks, M.probeDocker, M.executor);
    // 5b가 6보다 앞인 것이 §2의 별도 계약이다 — 도구 목록은 `new Agent()` 시점에
    // 동결되므로 등록 여부 판정이 그 전에 끝나야 한다.
    assertBefore(rig.marks, M.probeDocker, M.tools);
    assertBefore(rig.marks, M.probeDocker, M.modelClient);
    assertBefore(rig.marks, M.probeDocker, M.gate);
    // 6이 7보다 앞 — 구독은 조립이 끝난 Agent에 붙는다.
    assertBefore(rig.marks, M.tools, M.attach);
    assertBefore(rig.marks, M.gate, M.attach);

    await app.shutdown();
    app = undefined;
  });

  /**
   * **5b의 판정이 실제로 6으로 흘렀는가** — 순서만 맞고 값이 안 흐르면 계약의 목적이
   * 죽는다. `sandbox`의 기본값이 on이므로(§3) 불가용 갈래에서 셸은 등록되지 않는다.
   */
  it("5b의 불가용 판정이 6의 도구 등록에 반영된다", async () => {
    const rig = createRig({ docker: "unavailable" });
    app = await startCli(rig.deps, { kind: "run" });

    assertBefore(rig.marks, M.probeDocker, M.tools);
    expect(rig.toolOptions).toHaveLength(1);
    expect(rig.toolOptions[0]?.includeShell).toBe(false);
    expect(app.parts.shell.kind).toBe("unavailable");

    await app.shutdown();
    app = undefined;
  });

  /**
   * **3b가 4보다 앞이다**(§2의 별도 계약). 그 절이 든 이득은 이 시점에 아직 연 자원이
   * 없어 정리할 것 없이 종료된다는 것이므로, 3b가 실패했을 때 4가 아예 돌지 않은 것이
   * 그 계약의 관측 가능한 형태다.
   *
   * 메모리 읽기 실패를 만드는 수단은 `MEMORY.md` 자리에 디렉터리를 두는 것이다 —
   * `MEMORY.md` §2.2가 읽기 실패를 기동 실패로 못박았다.
   */
  it("3b가 실패하면 4가 돌지 않는다 — sessions.db도 생기지 않는다", async () => {
    clearFirstRunFixture();
    const memoryDir = defaultMemoryDir(home);
    mkdirSync(join(memoryDir, MEMORY_FILE_NAME), { recursive: true });

    const rig = createRig();
    await expect(startCli(rig.deps, { kind: "run" })).rejects.toThrow();

    expect(rig.marks).not.toContain(M.openStore);
    expect(existsSync(rig.storePath)).toBe(false);
    // 3은 이미 지났다 — 단언이 공허하지 않다는 확인(3b가 아예 안 불린 것이 아니다).
    expect(rig.marks).toContain(M.boundary);
  });

  /**
   * **2가 3b보다 앞이다.** §2 말미가 앞 단계를 fail-closed 검증으로 두므로 두 실패를
   * 함께 심으면 먼저 도는 쪽의 실패만 보인다. 크리덴셜 파일의 노출 비트는 §4의
   * fail-closed 대상이고, env로 키를 받았어도 검사를 건너뛰지 않는다.
   */
  it("2가 실패하면 3b도 4도 돌지 않는다", async () => {
    clearFirstRunFixture();
    const credentials = join(home, ".neo-agent", "credentials");
    writeFileSync(credentials, `${API_KEY_ENV}=file-key\n`);
    chmodSync(credentials, 0o644);
    const memoryDir = defaultMemoryDir(home);
    mkdirSync(join(memoryDir, MEMORY_FILE_NAME), { recursive: true });

    const rig = createRig();
    const failure = await startCli(rig.deps, { kind: "run" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    // 3b의 실패가 아니라 2의 실패다 — 메시지 문면이 아니라 어느 파일을 지목했는가로
    // 가른다. 두 실패가 함께 심겨 있으므로 이 구별이 곧 순서의 관측이다.
    expect(String((failure as Error).message)).toContain(credentials);
    expect(String((failure as Error).message)).not.toContain(MEMORY_FILE_NAME);
    expect(rig.marks).not.toContain(M.openStore);
    expect(existsSync(rig.storePath)).toBe(false);
  });

  /**
   * **1이 2보다 앞이다.** 같은 방식 — 설정 파싱 실패와 크리덴셜 권한 실패를 함께 심고
   * 먼저 도는 쪽이 보이는지 본다(§3: 파싱 실패는 시작 시 에러).
   */
  it("1이 실패하면 2도 4도 돌지 않는다", async () => {
    clearFirstRunFixture();
    writeFileSync(join(home, ".neo-agent", "config.json"), "{ not json");
    const credentials = join(home, ".neo-agent", "credentials");
    writeFileSync(credentials, `${API_KEY_ENV}=file-key\n`);
    chmodSync(credentials, 0o644);

    const rig = createRig();
    const failure = await startCli(rig.deps, { kind: "run" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).not.toContain(credentials);
    expect(rig.marks).not.toContain(M.openStore);
    expect(existsSync(rig.storePath)).toBe(false);
  });

  /**
   * **7이 8보다 앞이다.** §2 열거의 8은 REPL 진입이고, 그것은 `run()`이 한다 —
   * `startCli`가 돌아온 시점에 구독이 이미 서 있다는 것이 이 순서의 관측 가능한 형태다.
   *
   * 여기서 재는 것은 두 가지다: 반환 시점에 7이 끝나 있다는 것과, 8이 그 뒤에
   * 일어난다는 것. 감시자를 조립 뒤에 걸므로 이 단언이 8의 유일성까지 재지는 않는다.
   */
  it("startCli 반환 시점에 7이 끝나 있고 8은 그 뒤다", async () => {
    const rig = createRig();
    app = await startCli(rig.deps, { kind: "run" });

    expect(rig.marks).toContain(M.attach);
    expect(rig.marks).not.toContain(M.replStart);

    const repl = app.parts.repl;
    const originalStart = repl.start.bind(repl);
    vi.spyOn(repl, "start").mockImplementation(() => {
      rig.marks.push(M.replStart);
      originalStart();
    });

    running = app.run();
    await waitUntil(
      () => rig.marks.includes(M.replStart),
      () => `run()이 REPL에 진입하지 않았다: ${JSON.stringify(rig.marks)}`,
    );
    assertBefore(rig.marks, M.attach, M.replStart);

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Q2. 저장소 구독이 **항상** 첫째 (SESSION-STORE §4 · CORE-INTERFACE §3 · CLI §1)
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 저장소 구독의 우선 (SESSION-STORE §4)", () => {
  /**
   * 리스너를 여럿 주입해도 저장소가 첫째인가. §1은 순서를 주입 목록이 아니라 구조가
   * 정한다고 못박았으므로, 목록 길이·순서를 바꿔도 결과가 같아야 한다.
   */
  it("리스너를 다섯 주입해도 attach가 첫째, 렌더러가 둘째다", async () => {
    const listeners: AgentEventListener[] = Array.from({ length: 5 }, () => () => undefined);

    /**
     * 한 트레이스에 `attach` 호출 지점과 `subscribe` 호출을 함께 싣는다 — `attach`는
     * 내부에서 `subscribe`를 부르므로(`packages/store/src/attach.ts`) 저장소 자신의
     * 리스너가 한 칸을 차지한다. 그래서 한 번의 활성화가 남기는 칸은 일곱이다.
     */
    const seen: string[] = [];
    const original = Agent.prototype.subscribe;
    vi.spyOn(Agent.prototype, "subscribe").mockImplementation(function (
      this: Agent,
      listener: AgentEventListener,
    ): Unsubscribe {
      const index = listeners.indexOf(listener);
      seen.push(index >= 0 ? `extra-${index}` : M.subscribe);
      return original.call(this, listener);
    });

    const rig = createRig({ listeners });
    const wrapped = rig.deps.factories?.openStore as (o: OpenSessionStoreOptions) => SessionStore;
    rig.deps.factories = {
      ...rig.deps.factories,
      openStore: (options: OpenSessionStoreOptions): SessionStore => {
        const store = wrapped(options);
        return {
          ...store,
          attach: (agent: Agent, sessionId: string): Unsubscribe => {
            seen.push(M.attach);
            return store.attach(agent, sessionId);
          },
        };
      },
    };
    app = await startCli(rig.deps, { kind: "run" });

    // 저장소가 첫째, 렌더러가 둘째, 주입 다섯이 그 뒤에 목록 순서대로.
    expect(seen).toEqual([
      M.attach,
      M.subscribe,
      M.subscribe,
      "extra-0",
      "extra-1",
      "extra-2",
      "extra-3",
      "extra-4",
    ]);

    await app.shutdown();
    app = undefined;
  });

  /**
   * **순서의 뜻까지 잰다** — `SESSION-STORE.md` §4가 그 순서에 부여한 의미는 사용자가
   * 화면에서 본 것이 이미 저장된 것이라는 것이고, `CORE-INTERFACE.md` §3의 구독 순서대로
   * await가 그 보장의 근거다. 호출 순서만 재면 저장이 비동기로 밀리는 구현을 통과시킨다.
   *
   * 그래서 주입 리스너가 `message_end`를 받는 시점에 그 메시지가 **이미 DB에 있는지**를
   * 본다. 주입 리스너는 저장소·렌더러 뒤이므로 이 단언은 둘 다에 대해 성립해야 한다.
   */
  it("주입 리스너가 message_end를 볼 때 그 메시지는 이미 저장돼 있다", async () => {
    const observed: { id: string; persisted: boolean }[] = [];
    let read: ((id: string) => boolean) | undefined;

    const listener: AgentEventListener = (event: AgentEvent) => {
      if (event.type !== "message_end" || read === undefined) return;
      observed.push({ id: event.message.id, persisted: read(event.message.id) });
    };

    const rig = createRig({ listeners: [listener] });
    let store: SessionStore | undefined;
    const wrapped = rig.deps.factories?.openStore as (o: OpenSessionStoreOptions) => SessionStore;
    rig.deps.factories = {
      ...rig.deps.factories,
      openStore: (options: OpenSessionStoreOptions): SessionStore => {
        store = wrapped(options);
        return store;
      },
    };

    app = await startCli(rig.deps, { kind: "run" });
    const session = app.parts.session;
    read = (id: string): boolean =>
      store === undefined
        ? false
        : store
            .loadSession(session.id, {
              workspaceRoot: session.workspaceRoot,
              systemPrompt: session.systemPrompt,
              model: session.model,
            })
            .messages.some((message) => message.id === id);
    running = app.run();

    rig.input.write("질문\r");
    await waitUntil(
      () => observed.length >= 2,
      () => `주입 리스너가 message_end를 두 번 보지 못했다: ${JSON.stringify(observed)}`,
    );

    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every((entry) => entry.persisted)).toBe(true);

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  /**
   * **§4의 뜻이 걸린 상대는 렌더러다.** 바로 위 단언은 주입 리스너와 저장소의 관계를
   * 재므로, 저장소가 렌더러 **뒤**·주입 리스너 앞으로 밀린 배선을 통과시킨다(2026-08-21
   * 역검증으로 실측). 그래서 렌더러 자신이 `message_end`를 받는 시점을 직접 잰다.
   *
   * 렌더러는 조립 안에 있어 주입점이 없으므로 **구독 순서로 지목한다** — 저장소가
   * 첫째·렌더러가 둘째라는 것이 §2 열거 7과 §4의 문면이고, 그래서 두 번째 구독이 곧
   * 렌더러다. 그 지목이 틀리면(순서가 뒤집히면) 이 단언이 재는 대상도 함께 바뀌지만,
   * 그 경우는 위 단언이 먼저 잡는다.
   */
  it("렌더러가 message_end를 볼 때 그 메시지는 이미 저장돼 있다", async () => {
    const observed: boolean[] = [];
    let read: ((id: string) => boolean) | undefined;

    const original = Agent.prototype.subscribe;
    let index = 0;
    vi.spyOn(Agent.prototype, "subscribe").mockImplementation(function (
      this: Agent,
      listener: AgentEventListener,
    ): Unsubscribe {
      index += 1;
      // 두 번째 구독 = 렌더러(§2 열거 7). 첫째는 `store.attach` 안의 저장소 자신이다.
      if (index !== 2) return original.call(this, listener);
      return original.call(this, (event: AgentEvent, signal: AbortSignal) => {
        if (event.type === "message_end" && read !== undefined) {
          observed.push(read(event.message.id));
        }
        return listener(event, signal);
      });
    });

    const rig = createRig();
    let store: SessionStore | undefined;
    const wrapped = rig.deps.factories?.openStore as (o: OpenSessionStoreOptions) => SessionStore;
    rig.deps.factories = {
      ...rig.deps.factories,
      openStore: (options: OpenSessionStoreOptions): SessionStore => {
        store = wrapped(options);
        return store;
      },
    };

    app = await startCli(rig.deps, { kind: "run" });
    const session = app.parts.session;
    read = (id: string): boolean =>
      store === undefined
        ? false
        : store
            .loadSession(session.id, {
              workspaceRoot: session.workspaceRoot,
              systemPrompt: session.systemPrompt,
              model: session.model,
            })
            .messages.some((message) => message.id === id);
    running = app.run();

    rig.input.write("질문\r");
    await waitUntil(
      () => observed.length >= 2,
      () => `렌더러가 message_end를 두 번 보지 못했다: ${JSON.stringify(observed)}`,
    );
    expect(observed.every((persisted) => persisted)).toBe(true);

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Q3. 예외 규율 — 렌더러와 추가 구독자가 반대인가 (CLI §7 · §1 · CORE §3)
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 예외 규율 (CLI-INTERFACE §7 · §1)", () => {
  /**
   * §1은 추가 구독자의 예외를 조립이 감싸지 않는다고 못박았다 — 삼키는 자리는
   * 구독자 쪽이라는 것이 그 절의 판정이다. 그래서 삼키지 않는 구독자를 주면 그 예외는
   * 런을 끝내야 한다(`CORE-INTERFACE.md` §3).
   *
   * 동시에 §3은 한 이벤트가 항상 모든 리스너에게 전달된다고 못박으므로, 던진 구독자
   * 뒤의 구독자도 그 이벤트를 받아야 하고 저장소는 저장을 마쳐야 한다.
   */
  it("주입 구독자가 던지면 런이 실패하고, 나머지 전달과 저장은 취소되지 않는다", async () => {
    const later: string[] = [];
    const thrower: AgentEventListener = (event: AgentEvent) => {
      if (event.type === "message_end") throw new Error("qa-listener-boom");
    };
    const follower: AgentEventListener = (event: AgentEvent) => {
      later.push(event.type);
    };

    const rig = createRig({ listeners: [thrower, follower] });
    app = await startCli(rig.deps, { kind: "run" });

    const failure = await app.parts.agent.prompt("질문").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);

    // 뒤 구독자에게도 같은 이벤트가 갔다.
    expect(later).toContain("message_end");

    await app.shutdown();
    app = undefined;
  });

  /**
   * 대비 축 — 렌더러의 예외는 삼키지 않는다(§7). 렌더러가 쓰는 싱크가 던지면 런이
   * 실패해야 한다. 렌더링이 안 되는데 대화가 계속되는 것 자체가 침묵 실패라는 것이
   * 그 절의 근거다.
   *
   * 조립 단계의 고지에는 던지지 않고 런에 들어간 뒤부터 던진다 — 그러지 않으면
   * 조립 자체가 실패해 렌더러 경로를 못 본다.
   */
  it("렌더러가 쓰는 싱크가 던지면 런이 실패한다", async () => {
    let armed = false;
    const sink: OutputSink = {
      write(): void {
        if (armed) throw new Error("qa-sink-boom");
      },
    };

    const rig = createRig({ deps: { out: sink } });
    app = await startCli(rig.deps, { kind: "run" });
    armed = true;

    const failure = await app.parts.agent.prompt("질문").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);

    armed = false;
    await app.shutdown();
    app = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Q4. 프롬프트만 갈리고 게이트는 그대로인가 (CORE-INTERFACE §7)
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 승인 프롬프트 교체 (CORE-INTERFACE §7)", () => {
  /**
   * §7은 웹 UI 도입 시 같은 게이트 모듈에 다른 프롬프트 구현만 붙는다고 못박았다.
   * 프롬프트가 갈렸는데 정책·allowlist까지 갈리면 그것은 프롬프트 교체가 아니다.
   *
   * `allow-always`가 allowlist에 남아 **두 번째 호출에서는 묻지 않는** 것이 그 관측이다.
   */
  it("주입 프롬프트의 allow-always가 allowlist에 남아 두 번째는 묻지 않는다", async () => {
    const asked: ApprovalRequest[] = [];
    const prompt: ApprovalPrompt = {
      ask: async (request: ApprovalRequest) => {
        asked.push(request);
        return "allow-always";
      },
    };

    const rig = createRig({ deps: { approvalPrompt: prompt } });
    app = await startCli(rig.deps, { kind: "run" });

    // 게이트 프로필에 **있는** 도구를 쓴다 — allowlist 키는 프로필에서 나오므로
    // 미등록 도구는 `allow-always`를 남길 자리가 없다(`APPROVAL-GATE.md` §3·§5).
    const context = {
      toolCallId: "qa-1",
      toolName: "write_file",
      args: { path: "qa.txt", content: "x" },
    };
    const first = await app.parts.gate.beforeToolCall(context, new AbortController().signal);
    const second = await app.parts.gate.beforeToolCall(
      { ...context, toolCallId: "qa-2" },
      new AbortController().signal,
    );

    expect(first.decision).toBe("allow");
    expect(second.decision).toBe("allow");
    // 두 번째는 프롬프트를 지나지 않았다 — 정책·allowlist가 그대로라는 관측이다.
    expect(asked).toHaveLength(1);

    // 대비 축 — 프로필에 **없는** 도구는 학습 키가 없으므로 `allow-always`를 줘도
    // 매번 묻는다(`APPROVAL-GATE.md` §3: 자동 허용·allowlist 없이 항상 프롬프트로 간다).
    // 프롬프트가 갈려도 이 fail-closed가 그대로라는 것이 이 쌍의 뜻이다.
    for (const id of ["qa-3", "qa-4"]) {
      await app.parts.gate.beforeToolCall(
        { toolCallId: id, toolName: UNREGISTERED_TOOL, args: {} },
        new AbortController().signal,
      );
    }
    expect(asked).toHaveLength(3);

    await app.shutdown();
    app = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Q5. 주입이 없을 때의 무변경 (CLI-INTERFACE §7.1 — 구독 미증가)
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 주입 없는 기본 갈래 (CLI-INTERFACE §7.1)", () => {
  /**
   * §7.1은 상태줄이 자기 구독을 갖지 않는다고 못박고, 그 근거로 리스너 수가 곧 런의
   * 실패 표면이라는 것을 든다. 절개선이 열렸어도 **주입이 없으면** 구독 수는 그대로
   * 둘(저장소 자신 · 렌더러)이어야 한다.
   */
  it("주입이 없으면 한 Agent의 구독은 정확히 둘이다", async () => {
    const counted: number[] = [];
    const original = Agent.prototype.subscribe;
    let count = 0;
    vi.spyOn(Agent.prototype, "subscribe").mockImplementation(function (
      this: Agent,
      listener: AgentEventListener,
    ): Unsubscribe {
      count += 1;
      return original.call(this, listener);
    });

    const rig = createRig();
    app = await startCli(rig.deps, { kind: "run" });
    counted.push(count);

    expect(counted[0]).toBe(2);

    await app.shutdown();
    app = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Q6. 주입 싱크의 폭 — 미규정 SM 계열 (판정 필요)
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 주입 싱크가 받는 것의 범위 (판정 필요)", () => {
  /**
   * **[미규정 SM-1] `CliDeps.out`이 받는 것의 범위와 그 예외 규율을 정본이 정하지 않았다.**
   * **정해야 하는 곳: `CLI-INTERFACE.md` §1의 출력 싱크 불릿**(`MARKERS.md` §4.1 셋째 항).
   *
   * §1이 이름으로 연 것은 조립 단계의 고지가 나갈 출력 싱크이고, 그 절이 예로 든 것도
   * 열거의 앞 단계들이 내는 경고다. 실물에서 이 싱크는 그 고지 말고 **렌더러의 이벤트
   * 출력**도 함께 받는다. 그 결과 두 번째 호스트가 준 싱크의 예외가 §7의 렌더러 규율을
   * 타고 런을 끝낼 수 있는데(위 Q3의 둘째), `WEB-UI.md` §8은 클라이언트 연결이 끊겨도
   * 진행 중인 런은 계속된다를 계약으로 든다. §1이 `listeners`에 대해서는 그 대가를
   * 구독자 쪽에 지웠으나 `out`에 대해서는 아무 규율도 두지 않았다.
   *
   * 이 테스트는 판정하지 않는다 — **오늘의 사실만 고정한다.** 범위가 갈리면 이 단언이
   * 갱신 대상임을 드러내는 것이 목적이다.
   */
  it("주입 싱크가 조립 고지와 렌더러 출력을 함께 받는다 (판정 필요)", async () => {
    const sink = captureSink();
    const rig = createRig({ deps: { out: sink } });
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();

    const beforeRun = sink.text();
    // 조립 단계의 고지 — 이 파일이 주입한 모델 id가 그대로 왔다.
    expect(beforeRun).toContain(UNKNOWN_MODEL);

    rig.input.write("질문\r");
    await waitUntil(
      () => sink.text().length > beforeRun.length,
      () => "런의 출력이 주입 싱크로 나가지 않았다.",
    );
    // 모델이 낸 델타(이 파일이 주입한 값)가 같은 싱크로 왔다 — 고지 전용이 아니다.
    expect(sink.text()).toContain("turn-1");

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  /**
   * **[미규정 SM-2] 종료 인사와 시작 실패 에러가 주입 싱크를 지나지 않는다.**
   * **정해야 하는 곳: `CLI-INTERFACE.md` §1의 출력 싱크 불릿**(§2가 계약으로 든 마지막 항목의
   * 출구가 그 절의 범위 밖에 있다 — `MARKERS.md` §4.1 셋째 항).
   *
   * §2는 종료 시퀀스의 마지막 항목(세션 id와 재개 방법)이 REPL 반납 뒤에 나간다는 것을
   * 계약으로 들고, 그 목적을 종료가 대화의 끝이 아니라 중단임을 화면에 남기는 것이라
   * 밝힌다. 실물에서 그 표시는 `CliDeps.io`의 출력으로 직접 나가므로 `out`을 준 호스트는
   * 나머지 출력과 다른 곳에서 그것을 받는다. §1이 `out`의 범위를 정하지 않았으므로
   * 여기서 판정하지 않고 사실만 고정한다 — 갈래가 갈리는 자리라는 것이 요점이다.
   */
  it("종료 인사는 io로 나가고 주입 싱크로는 오지 않는다 (판정 필요)", async () => {
    const sink = captureSink();
    const rig = createRig({ deps: { out: sink } });
    app = await startCli(rig.deps, { kind: "run" });
    const app0Prefix = app.parts.session.id.slice(0, 8);
    running = app.run();
    await waitUntil(
      () => rig.terminal().length > 0,
      () => "REPL에 진입하지 않았다.",
    );

    // 종료 **직전**의 두 관측점을 떠 두고 차분으로 잰다 — 세션 id 접두는 시작 배너에도
    // 실리므로 절대값으로는 인사를 가려낼 수 없다.
    const sinkBefore = sink.text().length;
    const terminalBefore = rig.terminal().length;

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;

    const prefix = app0Prefix;
    expect(rig.terminal().slice(terminalBefore)).toContain(prefix);
    expect(sink.text().slice(sinkBefore)).not.toContain(prefix);
  });
});
