/**
 * 절개선 계약 — `CliDeps`의 주입점 셋이 두 번째 호스트에 실제로 열려 있는가.
 *
 * 기대값의 출처는 `docs/CLI-INTERFACE.md` §1(`CliDeps`의 주입점 불릿)·§2(시작 시퀀스의
 * 구독 배선)·§6(세션 수명주기 — Agent 교체의 계기)·§7(이벤트 렌더링 계약과 단언의
 * 경계)·§7.1(Agent 교체를 든 표) · `docs/CORE-INTERFACE.md` §3(구독 순서대로 await ·
 * 나중에 웹 UI도 같은 자리에 앉는다) · `docs/SESSION-STORE.md` §4(저장소가 CLI 렌더러보다
 * 먼저 구독한다) · `docs/COMPACTION.md` §3(자동 판정 시점 둘과 수동 발동)·§6(분기 실행의
 * 3단계 — 폐기 후 재생성)·§7(요약 실패는 압축 포기, 세션 무손상)다.
 *
 * **`startCli`를 부르는 것이 이 파일의 전제다.** 조립을 다른 이름으로 부르면
 * `scripts/check-core-budget.mjs`의 교차 검사 5번(`probeDocker` 주입 강제)이 이 파일을
 * 대상에서 빼고, 그러면 시작 시퀀스 5b가 실제 `docker version`을 스폰해 결과가 테스트
 * 머신 상태에 좌우된다(`./probe-docker.ts` 머리말 · `docs/SANDBOX.md` §3).
 *
 * **표시 문구를 리터럴로 고정하지 않는다**(§7의 마지막 불릿). 여기서 문자열을 단정하는
 * 자리는 셋뿐이고 전부 그 금지 밖이다: ① 이 파일이 **주입한 값**(모델 id·도구 이름)이
 * 그대로 돌아왔는가, ② 같은 고지가 어느 경로로 나갔는가의 **구별 쌍**(주입 싱크 대
 * 터미널), ③ 관측 수단이 비어 있지 않다는 **비침묵 프로브**. 화면 문면 자체는 재지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  Agent,
  type AgentEvent,
  type AgentEventListener,
  type ModelClient,
  type ModelStreamEvent,
  type StopReason,
  type TokenUsage,
  type Unsubscribe,
} from "@neo-agent/core";
import type { ApprovalPrompt, ApprovalRequest } from "@neo-agent/gate";
import { openSessionStore, type SessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_ENV } from "../src/credentials.ts";
import type { OutputSink } from "../src/terminal.ts";
import { type CliApp, type CliDeps, startCli } from "../src/wiring.ts";
import { dockerAvailable } from "./probe-docker.ts";

/**
 * 등록에 없는 모델 id — 조립 단계가 컨텍스트 창을 모른다고 고지하는 갈래를 연다.
 *
 * **고지가 나갈 경로를 재기 위한 주입 데이터다.** 이 파일이 넣은 값이 그대로 어느
 * 싱크에서 관측되는가만 보고, 고지의 문면은 재지 않는다(§7).
 */
const UNKNOWN_MODEL = "seam-t006/unregistered-model";

/** 게이트 프로필에 없는 도구 이름 — 미등록은 항상 승인을 묻는다(`APPROVAL-GATE.md` §3) */
const UNREGISTERED_TOOL = "seam_t006_unregistered_tool";

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

/** 압축 판정을 건드리지 않는 usage */
const LOW_USAGE: TokenUsage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };

/**
 * 자동 압축 임계를 넘기는 usage — `COMPACTION.md` §3.
 *
 * 그 절이 컨텍스트 크기를 *"`input + cacheRead + cacheWrite + output`"*으로 정하고
 * 임계를 `contextWindowTokens × threshold`(기본 0.75)로 정한다. 여기 합은 1,600,000이라
 * **어떤 컨텍스트 창을 조회하든** 임계를 넘는다(providers 테이블의 최댓값이 1,000,000).
 * 값을 창에 맞춰 계산하지 않는 것이 의도다 — 미지 모델의 보수 기본값은 이 파일이 재는
 * 계약이 아니고, 그 상수에 기대면 테이블이 바뀌는 날 이 시나리오가 조용히 무력해진다.
 *
 * 네 필드에 흩어 놓은 이유는 어느 부분합도 총계와 같지 않게 하기 위해서다.
 */
const OVER_THRESHOLD_USAGE: TokenUsage = {
  input: 900_000,
  output: 100_000,
  cacheRead: 400_000,
  cacheWrite: 200_000,
};

/** 호출 순번(1부터)으로 그 응답의 usage·stopReason을 정한다 */
interface ScriptedCall {
  readonly usage?: TokenUsage;
  readonly stopReason?: StopReason;
}

/**
 * 한 턴을 그대로 되돌려주는 최소 모델. 네트워크로 나가지 않는다.
 *
 * `script`에 적히지 않은 호출은 전부 `end_turn` + `LOW_USAGE`다. 요약 생성도 같은
 * 클라이언트를 지나므로(`COMPACTION.md` §5 — 주입된 `ModelClient`) **요약 호출도 이
 * 순번을 한 칸 쓴다** — 각 시나리오의 주석이 어느 번호가 요약인지 든다.
 */
function localModel(script: Readonly<Record<number, ScriptedCall>> = {}): ModelClient {
  let turn = 0;
  return {
    modelId: UNKNOWN_MODEL,
    async *stream(): AsyncIterable<ModelStreamEvent> {
      turn += 1;
      const scripted: ScriptedCall = script[turn] ?? {};
      const text = `turn-${turn}`;
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: scripted.stopReason ?? "end_turn",
          usage: scripted.usage ?? LOW_USAGE,
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
  root = mkdtempSync(join(tmpdir(), "neo-cli-seam-"));
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
  // 설정은 시작 시 1회 읽혀 동결되므로(`SAFE-DEFAULTS.md` §4) `startCli` 전에 써 둔다.
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify({ model: UNKNOWN_MODEL }));
  app = undefined;
  running = undefined;
});

afterEach(async () => {
  await app?.shutdown();
  await running?.catch(() => undefined);
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

interface Rig {
  deps: CliDeps;
  input: PassThrough;
  /** 터미널로 나간 것 전부 */
  terminal(): string;
  model: ModelClient;
}

function createRig(overrides: Partial<CliDeps> = {}): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const model = localModel();
  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "seam-test-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-test",
    factories: {
      // 시작 시퀀스 5b의 Docker 판정은 **명시 주입**이다 — 생략하면 실제
      // `docker version`이 스폰된다(`./probe-docker.ts`).
      probeDocker: dockerAvailable(),
      // 네트워크 금지. 나머지 팩토리는 실물 그대로 둔다 — 조립되는 것이 실물이어야
      // 절개선이 실물 조립에서 열렸다는 것이 증명된다.
      createModelClient: () => model,
    },
    ...overrides,
  };

  return { deps, input, model, terminal: () => chunks.join("") };
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

// ───────────────────────────────────────────────────────────────────────────
// S1. 출력 싱크 — `CliDeps.out` (CLI-INTERFACE §1 · §2)
// ───────────────────────────────────────────────────────────────────────────

describe("절개선 — 출력 싱크 (CLI-INTERFACE §1)", () => {
  /**
   * 터미널을 모르는 싱크(`{ write }` 하나뿐인 객체)를 주고 조립이 끝까지 가는가.
   *
   * 관측 대상은 §2 열거의 앞 단계가 내는 고지 중 하나다 — 미지 모델의 컨텍스트 창
   * 가정. 이 파일이 주입한 모델 id가 싱크에 나타나고 터미널에는 나타나지 않는 것이
   * 경로가 갈렸다는 관측이고, 바로 아래 대비쌍이 그 관측 수단이 공허하지 않다는 것을
   * 함께 세운다.
   */
  it("주입한 싱크로 조립 단계의 고지가 나가고, 조립은 끝까지 간다", async () => {
    const sink = captureSink();
    const rig = createRig({ out: sink });
    app = await startCli(rig.deps, { kind: "run" });

    // 조립이 끝났다 — 부품이 서 있고, 넣은 모델 클라이언트가 그대로 실렸다.
    expect(app.parts.modelClient).toBe(rig.model);
    expect(app.parts.session.id.length).toBeGreaterThan(0);
    expect(app.parts.contextWindow.known).toBe(false);

    // 고지가 주입 싱크로 나갔다.
    expect(sink.text()).toContain(UNKNOWN_MODEL);
    // 그리고 터미널로는 안 나갔다 — 경로가 갈린 것이 이 쌍의 뜻이다.
    expect(rig.terminal()).not.toContain(UNKNOWN_MODEL);

    await app.shutdown();
    app = undefined;
  });

  /**
   * 대비쌍 — 주입하지 않으면 오늘 그대로 REPL을 뿌리로 하는 싱크가 만들어지고, 같은
   * 고지가 터미널로 나간다. 위 `not.toContain`이 **고지가 아예 없어서** 참이 되는
   * 경우를 이 쌍이 배제한다.
   */
  it("주입하지 않으면 같은 고지가 터미널로 나간다", async () => {
    const rig = createRig();
    app = await startCli(rig.deps, { kind: "run" });

    expect(rig.terminal()).toContain(UNKNOWN_MODEL);

    await app.shutdown();
    app = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// S2. 승인 프롬프트 — `CliDeps.approvalPrompt` (CLI-INTERFACE §1 · §8)
// ───────────────────────────────────────────────────────────────────────────

describe("절개선 — 승인 프롬프트 (CLI-INTERFACE §1)", () => {
  /**
   * 주입한 프롬프트가 **그대로** 게이트에 배선되는가, 그리고 터미널의 입력 소유권
   * 이양(`repl.withApprovalWait`)을 지나지 않는가.
   *
   * 관측 지점은 `CliParts.gate`의 `beforeToolCall` 하나다 — 게이트가 프롬프트에
   * 닿는 유일한 경로이므로, 여기를 지나면 배선이 실물이라는 뜻이다. 도구 이름은
   * 게이트 프로필에 없는 것을 쓴다: 미등록은 fail-closed로 항상 묻는다.
   *
   * `withApprovalWait`를 **조립 뒤에** 감시할 수 있는 근거는 기본 갈래가 그 메서드를
   * 호출 시점에 조회하기 때문이다(`wiring.ts`의 `createReplApprovalPrompt`) — 기본
   * 갈래를 탔다면 이 감시자가 반드시 걸린다. 그 사실은 아래 대비쌍이 실증한다.
   */
  it("주입한 프롬프트가 불리고 withApprovalWait를 타지 않는다", async () => {
    const asked: ApprovalRequest[] = [];
    const prompt: ApprovalPrompt = {
      ask: async (request: ApprovalRequest) => {
        asked.push(request);
        return "allow-once";
      },
    };
    const rig = createRig({ approvalPrompt: prompt });
    app = await startCli(rig.deps, { kind: "run" });

    const wait = vi.spyOn(app.parts.repl, "withApprovalWait");
    const decision = await app.parts.gate.beforeToolCall(
      { toolCallId: "seam-1", toolName: UNREGISTERED_TOOL, args: {} },
      new AbortController().signal,
    );

    // 불렸고, 이 파일이 넣은 도구 이름이 그대로 왔다.
    expect(asked).toHaveLength(1);
    expect(asked[0]?.toolName).toBe(UNREGISTERED_TOOL);
    // 그리고 그 응답이 게이트의 판정이 됐다 — 배선이 실물이라는 비침묵 확인이다.
    expect(decision.decision).toBe("allow");
    // 터미널의 입력 소유권 이양은 지나지 않았다.
    expect(wait).not.toHaveBeenCalled();

    await app.shutdown();
    app = undefined;
  });

  /**
   * 대비쌍 — 주입하지 않으면 오늘 그대로 터미널 프롬프트가 `withApprovalWait`로
   * 감싸인다. 이 쌍이 없으면 위 `not.toHaveBeenCalled()`는 **감시자가 애초에 걸릴 수
   * 없는 자리**여서 참일 수도 있다.
   *
   * 기본 프롬프트는 키를 기다리므로 응답을 지어내지 않고 중단으로 끝낸다 — 게이트가
   * 그것을 block으로 옮긴다(`APPROVAL-GATE.md` §2).
   */
  it("주입하지 않으면 withApprovalWait를 탄다", async () => {
    const rig = createRig();
    app = await startCli(rig.deps, { kind: "run" });

    const wait = vi.spyOn(app.parts.repl, "withApprovalWait");
    const controller = new AbortController();
    const pending = app.parts.gate.beforeToolCall(
      { toolCallId: "seam-2", toolName: UNREGISTERED_TOOL, args: {} },
      controller.signal,
    );

    await waitUntil(
      () => wait.mock.calls.length > 0,
      () => "기본 갈래가 repl.withApprovalWait를 부르지 않았다.",
    );
    controller.abort();
    const decision = await pending;
    expect(decision.decision).toBe("block");

    await app.shutdown();
    app = undefined;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// S3. 추가 구독자 — `CliDeps.listeners` (CLI-INTERFACE §1·§2 · CORE-INTERFACE §3 ·
//     SESSION-STORE §4)
// ───────────────────────────────────────────────────────────────────────────

/** 한 번의 구독 — 어느 Agent에 무엇이 붙었고 떼졌는가 */
interface Subscription {
  label: string;
  agent: Agent;
  released: boolean;
}

/**
 * 구독 순서를 재는 기준 — **`store.attach` 호출 지점**이다.
 *
 * `attach`는 내부에서 `agent.subscribe`를 부르므로(`packages/store/src/attach.ts`),
 * `Agent.prototype.subscribe`만 가로채면 저장소 자신의 리스너가 한 칸을 차지한다.
 * 그래서 한 번의 활성화가 남기는 라벨은 넷이 아니라 **다섯**이다:
 *
 *   attach → subscribe(저장소 자신) → subscribe(렌더러) → extra-0 → extra-1
 *
 * `SESSION-STORE.md` §4가 든 저장소 먼저·렌더러 나중은 이 열의 1·2번과 3번의 관계이고,
 * 주입 리스너가 그 뒤라는 것은 4·5번이다. 기준을 바꾸면(예: `attach` 마커를 빼면) 같은
 * 계약이 다른 열로 보이므로, 어느 기준으로 쟀는지가 단언과 함께 있어야 한다.
 *
 * **`released`는 `subscribe` 항목에만 뜻이 있다.** `attach`가 돌려주는 해지자는 그
 * 내부 구독의 해지자 자신이므로(같은 파일), 마커에 따로 달면 같은 사실을 두 번 센다.
 */
const ATTACH = "attach";
const SUBSCRIBE = "subscribe";

interface ListenerRig extends Rig {
  seen: [AgentEvent["type"][], AgentEvent["type"][]];
  subscriptions: Subscription[];
  labels(): string[];
}

function createListenerRig(options: { readonly model?: ModelClient } = {}): ListenerRig {
  const seen: [AgentEvent["type"][], AgentEvent["type"][]] = [[], []];
  const listeners: readonly AgentEventListener[] = [
    (event: AgentEvent) => {
      seen[0].push(event.type);
    },
    (event: AgentEvent) => {
      seen[1].push(event.type);
    },
  ];

  const subscriptions: Subscription[] = [];
  const original = Agent.prototype.subscribe;
  vi.spyOn(Agent.prototype, "subscribe").mockImplementation(function (
    this: Agent,
    listener: AgentEventListener,
  ): Unsubscribe {
    const index = listeners.indexOf(listener);
    const entry: Subscription = {
      label: index >= 0 ? `extra-${index}` : SUBSCRIBE,
      agent: this,
      released: false,
    };
    subscriptions.push(entry);
    const release = original.call(this, listener);
    return () => {
      entry.released = true;
      release();
    };
  });

  const base = createRig({ listeners });
  // 압축 시나리오는 usage를 순번으로 지어야 하므로 모델을 갈아끼울 수 있게 연다.
  // 넘기지 않으면 `createRig`가 세운 그대로다.
  const model = options.model ?? base.model;
  base.deps.factories = {
    ...base.deps.factories,
    createModelClient: () => model,
    openStore: (storeOptions) => {
      const store: SessionStore = openSessionStore(storeOptions);
      return {
        ...store,
        attach: (agent: Agent, sessionId: string): Unsubscribe => {
          subscriptions.push({ label: ATTACH, agent, released: false });
          return store.attach(agent, sessionId);
        },
      };
    },
  };

  return {
    ...base,
    model,
    seen,
    subscriptions,
    labels: () => subscriptions.map((entry) => entry.label),
  };
}

/**
 * 활성화 한 번이 남기는 다섯 칸 — 위 선언부의 기준(`attach` 마커) 그대로.
 *
 * 이 상수는 위 `/new` 케이스가 인라인으로 쓰는 배열과 같은 값이다. 아래 계기별
 * 케이스가 같은 열을 네 번 되풀이하게 되므로 여기서 이름을 준다.
 */
const ACTIVATION_LABELS: readonly string[] = [ATTACH, SUBSCRIBE, SUBSCRIBE, "extra-0", "extra-1"];

/** 활성화 한 번이 통째로 그 Agent에 붙었는가 — 순서와 귀속을 함께 잰다 */
function expectActivation(rig: ListenerRig, from: number, agent: Agent): void {
  const activation = rig.subscriptions.slice(from, from + ACTIVATION_LABELS.length);
  expect(activation.map((entry) => entry.label)).toEqual(ACTIVATION_LABELS);
  expect(activation.every((entry) => entry.agent === agent)).toBe(true);
}

/** 그 활성화의 구독이 전부 떼졌는가(`ATTACH`는 마커라 제외 — 선언부 참조) */
function expectReleased(rig: ListenerRig, from: number): void {
  const activation = rig.subscriptions.slice(from, from + ACTIVATION_LABELS.length);
  expect(
    activation.filter((entry) => entry.label !== ATTACH).every((entry) => entry.released),
  ).toBe(true);
}

const endedRuns = (types: readonly AgentEvent["type"][]): number =>
  types.filter((type) => type === "agent_end").length;

/**
 * 한 턴을 돌리고 **그 런의 `agent_end`가 두 주입 리스너에 닿을 때까지** 기다린다.
 *
 * 교체 뒤에 이것이 늘어난다는 것이 「이벤트가 실제로 닿는다」의 관측이다 — 앞선
 * 활성화의 구독은 교체가 이미 뗐으므로(`switchTo`의 `previous.release()`), 늘어난
 * `agent_end`의 출처는 새 Agent뿐이다.
 */
async function runTurn(rig: ListenerRig, text: string): Promise<void> {
  const before: [number, number] = [endedRuns(rig.seen[0]), endedRuns(rig.seen[1])];
  rig.input.write(`${text}\r`);
  await waitUntil(
    () => endedRuns(rig.seen[0]) > before[0] && endedRuns(rig.seen[1]) > before[1],
    () => `턴이 두 주입 리스너에 닿지 않았다: ${JSON.stringify(rig.seen)}`,
  );
}

/**
 * REPL이 `idle-input`으로 돌아올 때까지 기다린다.
 *
 * 자동 압축은 **런 프로미스 안**에서 돌므로(`COMPACTION.md` §3의 판정 시점 1) 런의
 * `agent_end`만 보고 다음 입력을 밀어 넣으면 `compacting` 구간에 부딪혀 제출이 거부된다.
 * 상태가 돌아온 것이 곧 그 판정까지 끝났다는 뜻이다.
 */
async function waitIdle(): Promise<void> {
  await waitUntil(
    () => app?.parts.repl.state === "idle-input",
    () => `REPL이 idle-input으로 돌아오지 않았다: ${String(app?.parts.repl.state)}`,
  );
}

describe("절개선 — 추가 구독자 (CLI-INTERFACE §1 · SESSION-STORE §4)", () => {
  it("주입 리스너는 저장소·렌더러 뒤에 붙는다", async () => {
    const rig = createListenerRig();
    app = await startCli(rig.deps, { kind: "run" });

    // 기준은 위 선언부 — `attach` 호출 지점을 마커로 두고 잰 다섯 칸이다.
    expect(rig.labels()).toEqual([ATTACH, SUBSCRIBE, SUBSCRIBE, "extra-0", "extra-1"]);
    // 다섯 칸 전부 같은 Agent에 붙었다 — 한 번의 활성화라는 확인.
    const agents = new Set(rig.subscriptions.map((entry) => entry.agent));
    expect(agents.size).toBe(1);

    await app.shutdown();
    app = undefined;
  });

  /**
   * 이 작업의 존재 이유를 직접 재는 자리 — `/new`가 Agent를 갈아치운 **뒤에도** 주입
   * 리스너가 붙어 있는가(`CLI-INTERFACE.md` §6 · `CORE-INTERFACE.md` §3).
   *
   * 붙어 있다는 것을 두 겹으로 잰다: ① 새 Agent에 대해 같은 다섯 칸이 다시 기록되는가,
   * ② 그 Agent가 실제로 낸 이벤트가 두 리스너에 닿는가. ①만 재면 구독은 했으나 전달이
   * 끊긴 경우를 놓치고, ②만 재면 순서가 뒤집힌 경우를 놓친다.
   */
  it("/new로 Agent가 바뀌어도 주입 리스너가 새 Agent에 붙는다", async () => {
    const rig = createListenerRig();
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();

    const firstAgent = app.parts.agent;
    const firstSession = app.parts.session.id;

    rig.input.write("첫 질문\r");
    await waitUntil(
      () => rig.seen[0].includes("agent_end") && rig.seen[1].includes("agent_end"),
      () => `첫 턴이 주입 리스너에 닿지 않았다: ${JSON.stringify(rig.seen)}`,
    );
    const beforeSwitch: [number, number] = [rig.seen[0].length, rig.seen[1].length];

    rig.input.write("/new\r");
    await waitUntil(
      () => app?.parts.session.id !== firstSession,
      () => "/new가 세션을 교체하지 않았다.",
    );
    const secondAgent = app.parts.agent;
    expect(secondAgent).not.toBe(firstAgent);

    // ① 두 번째 활성화도 같은 다섯 칸이고, 그 다섯이 전부 **새** Agent에 붙었다.
    const second = rig.subscriptions.slice(5);
    expect(second.map((entry) => entry.label)).toEqual([
      ATTACH,
      SUBSCRIBE,
      SUBSCRIBE,
      "extra-0",
      "extra-1",
    ]);
    expect(second.every((entry) => entry.agent === secondAgent)).toBe(true);

    // ② 새 Agent의 이벤트가 실제로 두 리스너에 닿는다.
    rig.input.write("둘째 질문\r");
    await waitUntil(
      () => rig.seen[0].length > beforeSwitch[0] && rig.seen[1].length > beforeSwitch[1],
      () => `교체 뒤의 턴이 주입 리스너에 닿지 않았다: ${JSON.stringify(rig.seen)}`,
    );
    await waitUntil(
      () =>
        rig.seen[0].lastIndexOf("agent_end") >= beforeSwitch[0] &&
        rig.seen[1].lastIndexOf("agent_end") >= beforeSwitch[1],
      () => `교체 뒤의 런이 끝나지 않았다: ${JSON.stringify(rig.seen)}`,
    );

    // 교체는 이전 활성화의 구독을 전부 떼고 지나갔다(`switchTo`의 `previous.release()`).
    const first = rig.subscriptions.slice(0, 5);
    expect(first.filter((entry) => entry.label !== ATTACH).every((entry) => entry.released)).toBe(
      true,
    );

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  /**
   * ── 계기 ②: 재개 (`CLI-INTERFACE.md` §6 · §7.1)
   *
   * §6이 «압축 시 Agent 교체는 `/resume`·`/new`와 같은» 경로라고 이름을 든 셋 중
   * 둘째다. §7.1도 갱신 계기를 «세션 생성·재개·압축의 Agent 교체(§6)»로 든다 —
   * 계기 목록은 이 둘이 같다.
   *
   * 위 `/new` 케이스와 **같은 두 겹**으로 잰다: ① 새 Agent에 같은 다섯 칸이 다시
   * 기록되는가, ② 그 Agent의 이벤트가 실제로 두 리스너에 닿는가. 재개는 트랜스크립트를
   * 실어 Agent를 세우므로 `/new`(빈 트랜스크립트)와 코드 경로가 갈릴 수 있는 자리다.
   */
  it("/resume으로 Agent가 바뀌어도 주입 리스너가 새 Agent에 붙는다", async () => {
    const rig = createListenerRig();
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();

    const firstSession = app.parts.session.id;
    const firstAgent = app.parts.agent;
    await runTurn(rig, "첫 질문");
    await waitIdle();

    // 돌아올 자리를 만든다 — 떠나야 `/resume`이 잴 대상이 된다.
    rig.input.write("/new\r");
    await waitUntil(
      () => app?.parts.session.id !== firstSession,
      () => "/new가 세션을 교체하지 않았다.",
    );
    await waitIdle();

    const mark = rig.subscriptions.length;
    rig.input.write(`/resume ${firstSession.slice(0, 8)}\r`);
    await waitUntil(
      () => app?.parts.session.id === firstSession,
      () => "/resume이 원래 세션으로 돌아가지 않았다.",
    );
    await waitIdle();

    // ① 재개도 같은 다섯 칸이고, 그 다섯이 전부 재개가 세운 Agent에 붙었다.
    const resumedAgent = app.parts.agent;
    expect(resumedAgent).not.toBe(firstAgent);
    expectActivation(rig, mark, resumedAgent);
    // 그 다섯이 전부다 — 더 붙거나 덜 붙지 않았다.
    expect(rig.subscriptions.length).toBe(mark + ACTIVATION_LABELS.length);

    // ② 새 Agent의 이벤트가 실제로 두 리스너에 닿는다.
    await runTurn(rig, "재개 후 질문");

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  /**
   * ── 계기 ③-a: 압축 — 수동 `/compact` (`COMPACTION.md` §3 · §6)
   *
   * §3이 *"`/compact`는 같은 경로의 수동 발동이다(임계 미달이어도 실행)"*라 정하고,
   * §6의 3단계가 그 교체를 *"구 Agent 폐기(구독 해지) → 새 Agent 생성(messages =
   * [요약, ...kept]) → 재배선"*으로 든다. 즉 압축은 `/new`·`/resume`과 **같은** 계기
   * 목록에 있고 별도 교체 경로가 없다 — 그래서 주입 리스너도 따라가야 한다.
   *
   * 턴을 셋 돌리는 것은 §4의 계획 규칙 때문이다: 유지 구간이 «뒤에서부터
   * `keepRecentTurns`번째 user 메시지»(기본 2)에서 시작하므로, 요약할 것이 남으려면
   * user 턴이 셋 이상이어야 한다. 둘이면 `toSummarize`가 비어 `not-possible`이 된다.
   * 요약 생성은 같은 모델의 **4번째** 호출이다.
   */
  it("/compact(수동 압축)로 Agent가 바뀌어도 주입 리스너가 새 Agent에 붙는다", async () => {
    const rig = createListenerRig();
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();

    const parentSession = app.parts.session.id;
    const parentAgent = app.parts.agent;
    await runTurn(rig, "첫 질문");
    await waitIdle();
    await runTurn(rig, "둘째 질문");
    await waitIdle();
    await runTurn(rig, "셋째 질문");
    await waitIdle();

    const mark = rig.subscriptions.length;
    rig.input.write("/compact\r");
    await waitUntil(
      () => app?.parts.session.id !== parentSession,
      () => "/compact가 세션을 분기하지 않았다.",
    );
    await waitIdle();

    // 분기가 실제로 일어났다 — 자식이 부모를 가리킨다(`SESSION-STORE.md` §5).
    expect(app.parts.session.parentSessionId).toBe(parentSession);

    const compactedAgent = app.parts.agent;
    expect(compactedAgent).not.toBe(parentAgent);
    expectActivation(rig, mark, compactedAgent);
    expect(rig.subscriptions.length).toBe(mark + ACTIVATION_LABELS.length);
    // 교체는 이전 활성화의 구독을 전부 떼고 지나갔다 — 아래 ②의 출처가 새 Agent뿐인 근거.
    expectReleased(rig, mark - ACTIVATION_LABELS.length);

    await runTurn(rig, "압축 후 질문");

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  /**
   * ── 계기 ③-b: 압축 — 자동, 판정 시점 1 (`COMPACTION.md` §3)
   *
   * §3이 판정 시점을 둘로 들고 첫째가 *"**런 종료 후 idle** — `agent_end` settlement
   * 뒤"*다. 수동과 갈리는 것은 **누가 교체를 시작하는가**이고(사용자의 명령이 아니라
   * 런의 종료), 그 자리에서도 주입 리스너가 따라가야 한다.
   *
   * 셋째 턴의 usage만 임계를 넘긴다 — 첫 턴부터 넘기면 그 시점의 user 턴이 하나뿐이라
   * §4의 `toSummarize`가 비어 `not-possible`이 되고, §7의 자동 중지가 걸려 이 계기
   * 자체가 사라진다. 요약 생성은 모델의 **4번째** 호출이라 기본값(성공)을 쓴다.
   */
  it("자동 압축(런 종료 후 idle)으로 Agent가 바뀌어도 주입 리스너가 새 Agent에 붙는다", async () => {
    const rig = createListenerRig({
      model: localModel({ 3: { usage: OVER_THRESHOLD_USAGE } }),
    });
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();

    const parentSession = app.parts.session.id;
    const parentAgent = app.parts.agent;
    await runTurn(rig, "첫 질문");
    await waitIdle();
    await runTurn(rig, "둘째 질문");
    await waitIdle();

    const mark = rig.subscriptions.length;
    await runTurn(rig, "셋째 질문");
    await waitUntil(
      () => app?.parts.session.id !== parentSession,
      () => "런 종료 후 idle 판정이 압축을 돌리지 않았다.",
    );
    await waitIdle();

    expect(app.parts.session.parentSessionId).toBe(parentSession);

    const compactedAgent = app.parts.agent;
    expect(compactedAgent).not.toBe(parentAgent);
    expectActivation(rig, mark, compactedAgent);
    expect(rig.subscriptions.length).toBe(mark + ACTIVATION_LABELS.length);
    expectReleased(rig, mark - ACTIVATION_LABELS.length);

    await runTurn(rig, "압축 후 질문");

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  /**
   * ── 계기 ③-c: 압축 — 자동, 판정 시점 2 (`COMPACTION.md` §3 · §7)
   *
   * §3의 둘째 판정 시점은 *"**재개 직후** — `loadSession` 반환 트랜스크립트에 대해"*다.
   * 여기서는 **한 입력에 교체가 둘 연달아** 일어난다 — 재개의 교체(계기 ②)와 그 직후
   * 판정이 낳는 압축의 교체(계기 ③). 앞의 것만 리스너를 다시 달고 뒤의 것이 안 달면
   * 화면은 정상인데 주입 구독자만 조용히 떨어진다.
   *
   * 재개할 «한도 근처에서 종료한 세션»은 이렇게 만든다: 셋째 턴에서 임계를 넘기되
   * 그 자리(판정 시점 1)의 **요약을 실패시킨다**. §5가 *"`stopReason`이 `"end_turn"`이
   * 아니면 실패다"*라 정하고 §7이 *"요약 실패 = 압축 포기, 대화는 무손상"*이라 정하므로,
   * 그 세션은 임계를 넘긴 채 그대로 남는다. 실패는 1회뿐이라 §7의 자동 중지(연속 2회)에
   * 걸리지 않는다. 모델 호출 순번은 1·2·3이 턴, **4가 실패하는 요약**, 5가 재개 직후의
   * 요약(성공)이다.
   */
  it("자동 압축(재개 직후)으로 Agent가 바뀌어도 주입 리스너가 새 Agent에 붙는다", async () => {
    const rig = createListenerRig({
      model: localModel({
        3: { usage: OVER_THRESHOLD_USAGE },
        4: { stopReason: "max_tokens" },
      }),
    });
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();

    const parentSession = app.parts.session.id;
    await runTurn(rig, "첫 질문");
    await waitIdle();
    await runTurn(rig, "둘째 질문");
    await waitIdle();
    await runTurn(rig, "셋째 질문");
    await waitIdle();

    // 판정 시점 1의 압축은 요약 실패로 포기됐고 세션은 무손상이다(§7) — 그래서
    // 이 세션이 「재개 직후 판정」이 잴 대상으로 남는다.
    expect(app.parts.session.id).toBe(parentSession);

    rig.input.write("/new\r");
    await waitUntil(
      () => app?.parts.session.id !== parentSession,
      () => "/new가 세션을 교체하지 않았다.",
    );
    await waitIdle();

    const mark = rig.subscriptions.length;
    rig.input.write(`/resume ${parentSession.slice(0, 8)}\r`);
    await waitUntil(
      () => app?.parts.session.parentSessionId === parentSession,
      () => "재개 직후 판정이 압축을 돌리지 않았다.",
    );
    await waitIdle();

    // 교체가 둘이다 — 재개의 것과 압축의 것. 둘 다 같은 다섯 칸을 남겼다.
    const resumeActivation = rig.subscriptions.slice(mark, mark + ACTIVATION_LABELS.length);
    expect(resumeActivation.map((entry) => entry.label)).toEqual(ACTIVATION_LABELS);
    const compactedAgent = app.parts.agent;
    expect(resumeActivation[0]?.agent).not.toBe(compactedAgent);
    expectActivation(rig, mark + ACTIVATION_LABELS.length, compactedAgent);
    expect(rig.subscriptions.length).toBe(mark + 2 * ACTIVATION_LABELS.length);
    // 압축의 교체가 재개의 구독을 떼고 지나갔다.
    expectReleased(rig, mark);

    await runTurn(rig, "압축 후 질문");

    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;
  });

  it("release가 저장소·렌더러·주입 리스너를 전부 뗀다", async () => {
    const rig = createListenerRig();
    app = await startCli(rig.deps, { kind: "run" });

    // 떼기 전 — 아무것도 떼져 있지 않다(단언이 공허하지 않다는 확인).
    const tracked = rig.subscriptions.filter((entry) => entry.label !== ATTACH);
    // 저장소 자신 · 렌더러 · 주입 리스너 둘. 렌더러만 떼고 끝나지 않았다는 것이
    // 이 목록으로 보인다.
    expect(tracked.map((entry) => entry.label)).toEqual([
      SUBSCRIBE,
      SUBSCRIBE,
      "extra-0",
      "extra-1",
    ]);
    expect(tracked.some((entry) => entry.released)).toBe(false);

    await app.shutdown();
    app = undefined;

    expect(tracked.every((entry) => entry.released)).toBe(true);
  });
});
