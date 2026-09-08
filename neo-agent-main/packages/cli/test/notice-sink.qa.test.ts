/**
 * 독립 QA — 고지 싱크 착지(`K-261`)가 `docs/CLI-INTERFACE.md` §1·§2·§7·§7.1을
 * 깨지 않았는가.
 *
 * **기대값의 출처는 정본 문서뿐이다.** `src/wiring.ts`·`src/registry.ts`나 기존 QA
 * 파일을 읽어 기대값을 정하지 않았다 — 그렇게 하면 구현이 옳았다는 것을 구현으로
 * 증명하는 순환이 된다. 대상이 문서와 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * 이 파일이 재는 자리는 **기존 검사가 지나지 않는 경로**로 골랐다. 침묵 실패 계열을
 * 먼저 의심한다는 원칙대로, 던져지는 실패가 아니라 **조용히 끝나는 경로**를 잰다:
 *
 * - §7.1 마지막 불릿 — 조립만 부르고 REPL에 들어가지 않는 호스트에 **화면 부작용이
 *   없는가**. 문서가 「오늘의 배선은 이 계약을 이미 만족한다」고 서술하므로 그 서술이
 *   참인지 잰다.
 * - §1 「목록은 조립 시점에 한 번 읽히고 그 뒤의 변형은 반영되지 않는다」 — 조립 뒤에
 *   민 리스너가 반영되지 않는가. 그리고 그 반대편: **Agent 교체 뒤에도 주입 구독자가
 *   이벤트를 계속 받는가**(안 받으면 두 번째 호스트의 화면이 조용히 멈춘다 —
 *   `ARCHITECTURE.md` §2.6).
 * - §1 「고지 싱크의 예외는 주는 쪽이 진다」 — 그 예외가 **종료 인사 자리**에서 나면
 *   무엇이 남는가. 조립이 삼키지 않는 것은 계약이나, 런이 영영 settle하지 않는 것은
 *   문서가 정한 바가 없다(아래 `[미규정 NS-1]`).
 * - §2 종료 시퀀스 — `store.close()`가 인사보다 **앞**인가.
 * - §2 시작 실패 — 6단계에서 죽으면 store가 닫히고 문면이 고지 싱크로만 나가는가.
 * - §1 「가르는 선은 기계적이다」 — 한 슬래시 명령(`/memory`) 안에서 직접 쓰기와 고지
 *   헬퍼가 서로 다른 싱크로 갈리는가.
 * - §7.1 「상태줄에 주입점을 내지 않는다」 — `CliDeps`의 필드 표면에 상태줄이 없는가.
 *
 * **표시 문구를 리터럴로 고정하지 않는다**(§7 말미). 이 파일이 문자열을 단정하는 자리는
 * 전부 ⑴ 이 파일이 주입한 값(모델 id·메모리 항목 본문·홈 경로), ⑵ 이 파일이 세운 트레이스
 * 마커, ⑶ 런타임이 만든 세션 id 접두 중 하나다. 화면 문면 자체는 재지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 이 파일은 정본 문면을 인용부호로 감싸지
 * 않는다(전부 서술로 옮겼다). 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import type {
  AgentEvent,
  AgentEventListener,
  ModelClient,
  ModelStreamEvent,
} from "@neo-agent/core";
import { MEMORY_FILE_NAME } from "@neo-agent/memory";
import {
  type OpenSessionStoreOptions,
  openSessionStore,
  type SessionStore,
} from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_ENV } from "../src/credentials.ts";
import { defaultMemoryDir } from "../src/memory.ts";
import type { OutputSink } from "../src/terminal.ts";
import { type CliApp, type CliDeps, EXIT_STARTUP_FAILED, runCli, startCli } from "../src/wiring.ts";
import { dockerAvailable, sandboxImageProbeForbidden } from "./probe-docker.ts";

/** 등록에 없는 모델 id — 주입 데이터. 6단계의 「컨텍스트 창 미지」 고지를 확실히 낸다 */
const UNKNOWN_MODEL = "notice-sink-qa/unregistered-model";
/** 이 파일이 심는 메모리 항목 본문 — 주입 데이터 */
const MEMORY_ENTRY = "notice-sink-qa-memory-entry-marker";

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

/** 상한이 있는 settle 관측 — 「끝나지 않는다」를 재려면 기다림에 상한이 있어야 한다 */
async function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (settled) return true;
    await tick();
  }
  return settled;
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
  root = mkdtempSync(join(tmpdir(), "neo-cli-noticeqa-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  // `0b` 첫 기동 관문(§2.1)의 판정 재료는 `sessions.db`의 부재 하나뿐이다. 빈 파일을
  // 심어 관문을 지난 홈으로 만든다 — 없으면 조립이 키를 기다리며 끝나지 않는다.
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

/** 조립·종료 단계의 고지를 받아 두는 최소 싱크. 터미널을 모른다 */
function captureSink(): OutputSink & { text(): string; count(): number } {
  const written: string[] = [];
  return {
    write(text: string): void {
      written.push(text);
    },
    text: () => written.join(""),
    count: () => written.length,
  };
}

/**
 * 무장 가능한 고지 싱크 — 무장하면 던진다.
 *
 * §1은 이 싱크의 예외를 **주는 쪽**에 지운다. 그 규율이 실제로 지켜지는지(조립이 감싸
 * 삼키지 않는지)를 재려면 던지는 싱크가 필요하고, 무장 시점을 밖에서 고를 수 있어야
 * 「조립 중」과 「종료 인사 자리」를 갈라 잴 수 있다.
 */
function armableSink(): OutputSink & { arm(): void; text(): string } {
  let armed = false;
  const written: string[] = [];
  return {
    write(text: string): void {
      if (armed) throw new Error("qa-notice-boom");
      written.push(text);
    },
    arm: () => {
      armed = true;
    },
    text: () => written.join(""),
  };
}

interface Rig {
  deps: CliDeps;
  input: PassThrough;
  terminal(): string;
  /** 관측한 배선 이벤트의 순서. 값은 아래 `M` */
  marks: string[];
}

const M = {
  storeClose: "store.close",
  farewellSink: "farewell:sink",
} as const;

interface RigOptions {
  deps?: Partial<CliDeps>;
  listeners?: readonly AgentEventListener[];
  /** `store.close()`를 마크에 남길지 — 종료 시퀀스 순서를 재는 테스트만 켠다 */
  traceStoreClose?: boolean;
  /** 6단계에서 던지게 한다 — 시작 실패 갈래 */
  failAtStep6?: boolean;
}

function createRig(options: RigOptions = {}): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const marks: string[] = [];
  const model = localModel();

  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "notice-qa-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-test",
    ...(options.listeners === undefined ? {} : { listeners: options.listeners }),
    factories: {
      probeDocker: async () => dockerAvailable()(),
      probeSandboxImage: sandboxImageProbeForbidden(),
      createModelClient: () => model,
      openStore: (storeOptions: OpenSessionStoreOptions): SessionStore => {
        const store = openSessionStore(storeOptions);
        if (options.traceStoreClose !== true) return store;
        return {
          ...store,
          close: () => {
            marks.push(M.storeClose);
            store.close();
          },
        };
      },
      ...(options.failAtStep6 === true
        ? {
            createGate: () => {
              throw new Error("qa-step6-boom");
            },
          }
        : {}),
      ...(options.deps?.factories ?? {}),
    },
    ...options.deps,
  };

  return {
    deps,
    input,
    marks,
    terminal: () => chunks.join(""),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// NS-A. §7.1 — 조립만 부르는 호스트에 화면 부작용이 없다
// ───────────────────────────────────────────────────────────────────────────

describe("QA — REPL 없는 호스트의 조립 (CLI-INTERFACE §7.1)", () => {
  /**
   * §7.1의 마지막 불릿은 상태줄 주입점을 내지 않는 근거로 「오늘의 배선은 이 계약을 이미
   * 만족한다」를 든다: 조립이 상태 병합을 부르는 자리들은 출력이 아니라 상태 갱신이고,
   * 입력 라인 쪽 ANSI는 REPL 진입(§2 열거의 8) 안에서만 나가므로 **조립만 부르고 REPL에
   * 들어가지 않는 호스트**는 그 경로를 지나지 않는다. 그리고 하위 불릿이 그 호스트의
   * 요구를 「조립이 완주하고 화면 부작용이 없다」까지로 못박는다.
   *
   * 그러므로 잴 것은 둘이다 — 조립이 완주하고, `io.output`으로 한 바이트도 나가지 않는다.
   * 대비쌍은 주입 싱크 쪽이다: 같은 조립에서 고지가 실제로 나갔다는 것을 함께 세워야
   * 「출력이 아예 없어서」 참이 되는 단언이 아니게 된다.
   */
  it("고지 싱크를 준 채 조립만 하면 터미널로 한 바이트도 나가지 않는다", async () => {
    const sink = captureSink();
    const rig = createRig({ deps: { out: sink } });

    app = await startCli(rig.deps, { kind: "run" });

    // 대비쌍 — 이 조립에서 고지는 실제로 나갔다(6단계의 미지 모델 경고).
    expect(sink.text()).toContain(UNKNOWN_MODEL);
    // 계약 — 화면 부작용 0.
    expect(rig.terminal()).toBe("");
  });

  /**
   * §7.1은 `CliDeps`(§1)에 상태줄 주입점을 더하는 갈래를 기각했다. 표면에 그 필드가
   * 없다는 것을 소스의 선언 블록에서 잰다 — 타입은 런타임에 남지 않으므로 값으로는
   * 잴 수 없고, 이 규정이 금지하는 것이 정확히 **필드의 존재**다.
   *
   * 문면이 아니라 식별자를 재므로 §7의 리터럴 금지에 걸리지 않는다.
   */
  it("CliDeps 선언에 상태줄 주입점이 없다", () => {
    const wiringPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "wiring.ts");
    const source = readFileSync(wiringPath, "utf8");
    const start = source.indexOf("export interface CliDeps {");
    expect(start, "CliDeps 선언을 찾지 못했다").toBeGreaterThanOrEqual(0);
    const end = source.indexOf("\n}", start);
    const block = source.slice(start, end);
    // 필드 선언 줄만 본다 — 주석의 §7.1 인용에 status라는 낱말이 있을 수 있다.
    const fields = block
      .split("\n")
      .filter((line) => /^\s{2}\w+\??:/.test(line))
      .map((line) => line.trim().split(/[?:]/)[0] ?? "");
    expect(fields.length, "필드를 하나도 못 읽었다 — 파서가 틀렸다").toBeGreaterThan(3);
    expect(fields.filter((name) => /status/i.test(name))).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// NS-B. §1 — 추가 구독자 목록의 조립 시점 고정과 Agent 교체
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 추가 구독자 (CLI-INTERFACE §1)", () => {
  /**
   * §1은 목록이 조립 시점에 한 번 읽히고 그 뒤의 변형은 반영되지 않는다고 정한다 —
   * 조립이 끝난 뒤 호스트가 넘긴 배열을 밀거나 빼도 다음 Agent가 그것을 보지 않는다.
   *
   * 대비쌍으로 잰다: 조립 **전**에 넣은 구독자는 이벤트를 받고, 조립 **뒤**에 민
   * 구독자는 한 건도 받지 않는다. 뒤엣것만 재면 「이벤트가 아예 없어서」 참이 된다.
   */
  it("조립 뒤에 배열에 민 리스너는 다음 런에서도 이벤트를 받지 않는다", async () => {
    const early: AgentEvent[] = [];
    const late: AgentEvent[] = [];
    const listeners: AgentEventListener[] = [(event) => void early.push(event)];

    const rig = createRig({ deps: { out: captureSink() }, listeners });
    app = await startCli(rig.deps, { kind: "run" });

    // 조립이 끝난 **뒤** 호스트가 배열을 민다.
    listeners.push((event) => void late.push(event));

    running = app.run();
    await waitUntil(
      () => rig.terminal().length > 0,
      () => "REPL에 진입하지 않았다.",
    );
    rig.input.write("질문\r");
    await waitUntil(
      () => early.some((event) => event.type === "agent_end"),
      () => "조립 전에 넣은 구독자가 런을 못 봤다.",
    );

    expect(early.length).toBeGreaterThan(0);
    expect(late).toEqual([]);
  });

  /**
   * §1의 같은 불릿이 그 규정을 세운 근거는 두 번째 호스트가 **팬아웃 리스너 하나**로
   * 붙는다는 것이고, `CORE-INTERFACE.md` §3은 그 자리를 웹 UI에 예약했다. 그렇다면
   * 세션 교체(§6)를 넘어 구독이 이어지는 것이 그 자리가 성립하는 조건이다 — 안 이어지면
   * 두 번째 호스트의 화면이 **조용히** 멈춘다(`ARCHITECTURE.md` §2.6).
   *
   * `/new`로 Agent를 갈아치운 뒤 같은 주입 구독자가 이벤트를 계속 받는지 잰다.
   */
  it("/new로 Agent가 바뀌어도 주입 구독자가 이벤트를 계속 받는다", async () => {
    const seen: AgentEvent[] = [];
    const rig = createRig({
      deps: { out: captureSink() },
      listeners: [(event) => void seen.push(event)],
    });
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();
    await waitUntil(
      () => rig.terminal().length > 0,
      () => "REPL에 진입하지 않았다.",
    );

    rig.input.write("질문\r");
    await waitUntil(
      () => seen.some((event) => event.type === "agent_end"),
      () => "첫 런을 구독자가 못 봤다.",
    );

    rig.input.write("/new\r");
    await tick();
    const before = seen.length;
    await waitUntil(
      () => before > 0,
      () => "관측점을 못 떴다.",
    );

    rig.input.write("질문\r");
    await waitUntil(
      () => seen.slice(before).some((event) => event.type === "agent_end"),
      () => `교체 뒤 런을 구독자가 못 봤다 — 관측된 이벤트 수 ${seen.length - before}`,
    );
    expect(seen.slice(before).some((event) => event.type === "agent_end")).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// NS-C. §1·§2 — 고지 싱크의 예외가 종료 인사 자리에서 날 때
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 고지 싱크의 예외와 종료 (CLI-INTERFACE §1 · §2)", () => {
  /**
   * §1은 고지 싱크의 예외를 **주는 쪽**에 지우고 조립이 그것을 강제하지 않는다고 정했다.
   * §2는 종료 인사가 그 싱크를 지난다고 정했다. 두 규정이 맞물리는 자리를 잰다 —
   * 인사를 쓰다 싱크가 던지면 무엇이 남는가.
   *
   * 계약으로 잴 수 있는 것: 조립이 삼키지 않는다(= `shutdown()`이 reject한다).
   *
   * [미규정 NS-1] **그때 `run()`이 settle하는지는 어느 절도 정하지 않았다.**
   * §2 종료 시퀀스는 무엇이 어떤 순서로 나가는가까지만 정하고, §1의 예외 귀속은
   * 「누가 책임지는가」만 정한다. 아래 단언은 그래서 **관측만 한다** — 값을 고정하지
   * 않고 실측을 `expect`의 메시지로 남긴다. 판정이 필요한 자리이고 산출물 리포트가
   * 그것을 「판정 필요」로 올린다.
   * **정해야 하는 곳: `CLI-INTERFACE.md` §2**(종료 시퀀스의 실패 갈래).
   */
  it("종료 인사 자리에서 고지 싱크가 던지면 shutdown이 그것을 삼키지 않는다", async () => {
    const sink = armableSink();
    const rig = createRig({ deps: { out: sink } });
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();
    await waitUntil(
      () => rig.terminal().length > 0,
      () => "REPL에 진입하지 않았다.",
    );

    sink.arm();
    const shutdownResult = app.shutdown();
    const app_ = app;
    app = undefined;

    await expect(shutdownResult).rejects.toThrow();

    // [미규정 NS-1] 관측만 한다 — 이 줄은 실패를 만들지 않고 실측을 리포트로 옮긴다.
    const runSettled = await settledWithin(running, 500);
    expect(
      typeof runSettled,
      `[미규정 NS-1] 인사 자리에서 싱크가 던진 뒤 run()의 settle 여부 = ${runSettled}`,
    ).toBe("boolean");

    // 정리 — 이미 `closing`이라 두 번째 shutdown은 즉시 돌아온다.
    await app_.shutdown().catch(() => undefined);
    running = undefined;
  });

  /**
   * §2 종료 시퀀스의 순서 — `store.close()`가 **인사보다 앞**이다. 인사가 마지막
   * 항목이라는 것이 그 절의 열거이고, 그 뒤에 오는 것은 없다.
   *
   * 마커는 이 파일이 세운 것이고 화면 문면이 아니다. 인사의 도착은 주입 싱크가 세션 id
   * 접두를 처음 받은 시점으로 잡는다 — 접두는 런타임이 만든 값이지 문면이 아니다.
   */
  it("store.close()가 종료 인사보다 앞이다", async () => {
    const rig = createRig({ traceStoreClose: true });
    const marks = rig.marks;
    let prefix = "";
    // 세션 id 접두는 시작 배너(고지)에도 실린다 — 그래서 **종료 직전부터만** 본다.
    // 이 창을 안 두면 배너가 인사로 오인돼 순서 판정이 뒤집힌다.
    let watching = false;
    const sink: OutputSink = {
      write(text: string): void {
        if (watching && prefix !== "" && text.includes(prefix) && !marks.includes(M.farewellSink)) {
          marks.push(M.farewellSink);
        }
      },
    };
    rig.deps.out = sink;

    app = await startCli(rig.deps, { kind: "run" });
    prefix = app.parts.session.id.slice(0, 8);
    running = app.run();
    await waitUntil(
      () => rig.terminal().length > 0,
      () => "REPL에 진입하지 않았다.",
    );

    watching = true;
    await app.shutdown();
    app = undefined;
    await running;
    running = undefined;

    const closeAt = marks.indexOf(M.storeClose);
    const farewellAt = marks.indexOf(M.farewellSink);
    expect(
      closeAt,
      `store.close를 관측하지 못했다. 관측: ${JSON.stringify(marks)}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      farewellAt,
      `인사가 고지 싱크로 오지 않았다. 관측: ${JSON.stringify(marks)}`,
    ).toBeGreaterThanOrEqual(0);
    expect(closeAt).toBeLessThan(farewellAt);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// NS-D. §2 — 시작 단계 실패
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 시작 실패의 문면 (CLI-INTERFACE §2)", () => {
  /**
   * §2 말미: 시작 단계의 실패는 원인과 다음 행동을 담은 에러로 종료하고 부분 기동
   * 상태를 만들지 않으며, **그 에러도 §1의 고지 싱크를 지난다**.
   *
   * 6단계(Agent 생성)에서 죽여 잰다 — 이미 4단계에서 store를 열었으므로 「부분 기동을
   * 만들지 않는다」가 관측 가능한 자리이기도 하다. 잴 것 셋: 종료 코드, 문면이 주입
   * 싱크로 나감, 터미널로는 안 나감.
   */
  it("6단계 실패의 문면이 주입 고지 싱크로만 나간다", async () => {
    const sink = captureSink();
    const rig = createRig({ deps: { out: sink }, failAtStep6: true, traceStoreClose: true });

    const code = await runCli(rig.deps);

    expect(code).toBe(EXIT_STARTUP_FAILED);
    // 문면이 나갔다 — 이 파일이 심은 에러 메시지가 그대로 실려 있다(주입 데이터).
    expect(sink.text()).toContain("qa-step6-boom");
    expect(rig.terminal()).not.toContain("qa-step6-boom");
    // 부분 기동을 남기지 않는다 — 이미 연 store가 닫혔다.
    expect(rig.marks).toContain(M.storeClose);
  });

  /**
   * 대비쌍 — 주입하지 않으면 같은 문면이 터미널로 나간다(오늘 그대로). 위 단언이
   * 문면 자체를 없애 버린 것이 아님을 이 쌍이 세운다.
   */
  it("주입하지 않으면 같은 문면이 터미널로 나간다", async () => {
    const rig = createRig({ failAtStep6: true });
    const code = await runCli(rig.deps);
    expect(code).toBe(EXIT_STARTUP_FAILED);
    expect(rig.terminal()).toContain("qa-step6-boom");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// NS-E. §1 — 가르는 선이 한 명령 안에서도 기계적인가
// ───────────────────────────────────────────────────────────────────────────

describe("QA — 고지/화면의 갈림 (CLI-INTERFACE §1)", () => {
  /**
   * §1은 가르는 선을 기계적이라 못박고, 한정이 필요한 자리를 슬래시 명령 하나로 든다:
   * 목록 행 같은 **직접 쓰기는 화면**이고, 같은 명령 안에서 고지 헬퍼를 지나는 짧은
   * 안내는 **고지**다.
   *
   * `/memory`가 그 둘을 한 명령 안에 함께 내는 자리다(`MEMORY.md` §7.2 — 항목 행 +
   * 파일 경로를 포함한 안내). 항목 본문과 홈 경로는 둘 다 이 파일이 심은 값이라
   * 문면을 고정하지 않고도 갈림을 잴 수 있다.
   *
   * 이 테스트가 문서에서 도출하는 기대는 **갈린다**까지다 — 어느 조각이 어느 쪽인지의
   * 배정은 §1이 이름으로 든 「목록 행 = 화면」에서만 가져온다.
   */
  it("/memory의 항목 행은 터미널로, 파일 경로 안내는 고지 싱크로 갈린다", async () => {
    const memoryDir = defaultMemoryDir(home);
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(join(memoryDir, MEMORY_FILE_NAME), `- ${MEMORY_ENTRY}\n`);

    const sink = captureSink();
    const rig = createRig({ deps: { out: sink } });
    app = await startCli(rig.deps, { kind: "run" });
    running = app.run();
    await waitUntil(
      () => rig.terminal().length > 0,
      () => "REPL에 진입하지 않았다.",
    );

    const sinkBefore = sink.text().length;
    const terminalBefore = rig.terminal().length;
    rig.input.write("/memory\r");
    await waitUntil(
      () => sink.text().slice(sinkBefore).includes(memoryDir),
      () => "`/memory`의 경로 안내가 고지 싱크로 오지 않았다.",
    );

    // 항목 행(직접 쓰기)은 화면으로 간다.
    expect(rig.terminal().slice(terminalBefore)).toContain(MEMORY_ENTRY);
    // 그리고 고지 싱크로는 오지 않는다 — 갈림이 실제로 일어났다.
    expect(sink.text().slice(sinkBefore)).not.toContain(MEMORY_ENTRY);
  });
});
