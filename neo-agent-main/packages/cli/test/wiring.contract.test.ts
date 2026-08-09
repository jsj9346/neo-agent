/**
 * T-010 배선 계약 — 조립 지점(`src/wiring.ts`) 자체의 검증 (QA-B).
 *
 * `integration.contract.test.ts`가 "문서대로 조립하면 동작하는가"를 잰다면, 여기서
 * 재는 것은 **조립 지점이 문서대로 조립하는가**다. 둘은 다른 질문이다 — 손으로
 * 올바르게 조립한 통합 테스트는 `wiring.ts`가 순서를 뒤집어도 전부 통과한다.
 *
 * 배선 계약은 **결과물만 봐서는 검증되지 않는다.** 도구와 게이트가 같은
 * `WorkspaceBoundary`를 받았는지는 전달 인자를 봐야 알고, 저장소가 렌더러보다 먼저
 * 구독했는지는 구독 시점을 봐야 안다. 그래서 `WiringFactories` 주입점으로 생성자를
 * 감싸 관측한다 — 감싼 팩토리는 전부 실제 구현에 위임하므로 조립되는 것은 실물이다.
 *
 * 기대값의 출처:
 *   - `CLI-INTERFACE.md` §2(시작 시퀀스 — 특히 단계 7과 `fetch` 미채움), §6(재개 노출)
 *   - `SESSION-STORE.md` §4(저장소가 렌더러보다 먼저 구독한다)
 *   - `TOOLS-INTERFACE.md` §3 / `APPROVAL-GATE.md` §3(같은 판정기 인스턴스)
 *   - `SAFE-DEFAULTS.md` §4(시작 시 1회 읽고 동결)
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { Agent, AgentTool, ModelClient, Unsubscribe } from "@neo-agent/core";
import type { ApprovalGateConfig } from "@neo-agent/gate";
import { createApprovalGate } from "@neo-agent/gate";
import {
  type OpenSessionStoreOptions,
  openSessionStore,
  type SessionStore,
} from "@neo-agent/store";
import {
  createHostShellExecutor,
  createStandardTools,
  createWorkspaceBoundary,
  type StandardToolsOptions,
  type WorkspaceBoundary,
  type WorkspaceBoundaryOptions,
} from "@neo-agent/tools";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.ts";
import type { TerminalIo } from "../src/terminal.ts";
import { type CliApp, type CliDeps, startCli, type WiringFactories } from "../src/wiring.ts";
import { CaptureSink, ScenarioModel, type ScenarioTurn, stripAnsi } from "./integration-harness.ts";
import { dockerAvailable } from "./probe-docker.ts";

/** 배선 중 관측한 것들 */
interface Observed {
  boundaries: WorkspaceBoundary[];
  toolOptions: StandardToolsOptions[];
  gateConfigs: ApprovalGateConfig[];
  modelConfigs: Record<string, unknown>[];
  /** 구독이 일어난 순서. `"store"`는 `store.attach` 안에서 일어난 구독이다 */
  subscribeOrder: string[];
  storeClosed: number;
}

let sandbox: string;
let home: string;
let workspaceRoot: string;
let out: CaptureSink;
let io: TerminalIo;
let observed: Observed;
let app: CliApp | undefined;
let model: ScenarioModel;

function makeDeps(argv: readonly string[], script: readonly ScenarioTurn[] = []): CliDeps {
  model = new ScenarioModel(script);
  return {
    argv,
    env: { ANTHROPIC_API_KEY: "qa-b-test-key" },
    cwd: workspaceRoot,
    home,
    io,
    version: "0.0.0-test",
    factories: makeFactories(),
  };
}

/**
 * 전부 실제 구현에 위임하는 관측 래퍼.
 *
 * 대체가 아니라 **감싸기**인 것이 중요하다 — 모의로 갈아치우면 "조립된 것이 실제로
 * 도는가"가 검증 대상에서 빠지고, 배선만 맞고 동작은 깨진 상태를 통과시킨다.
 * 유일한 예외가 모델 클라이언트다(네트워크로 나갈 수 없다).
 */
function makeFactories(): Partial<WiringFactories> {
  return {
    createBoundary: (options: WorkspaceBoundaryOptions) => {
      const boundary = createWorkspaceBoundary(options);
      observed.boundaries.push(boundary);
      return boundary;
    },
    createExecutor: createHostShellExecutor,
    // Docker 판정은 명시 주입이다 — 생략하면 실제 `docker version`이 스폰되고
    // 이 파일의 결과가 테스트 머신 상태에 좌우된다(`./probe-docker.ts`).
    probeDocker: dockerAvailable(),
    createTools: (options: StandardToolsOptions): AgentTool[] => {
      observed.toolOptions.push(options);
      return createStandardTools(options);
    },
    createGate: (config: ApprovalGateConfig) => {
      observed.gateConfigs.push(config);
      return createApprovalGate(config);
    },
    createModelClient: (config): ModelClient => {
      observed.modelConfigs.push(config as unknown as Record<string, unknown>);
      return model;
    },
    openStore: (options: OpenSessionStoreOptions): SessionStore => {
      const real = openSessionStore(options);
      return {
        ...real,
        /**
         * 구독 순서 하니스.
         *
         * `attach` 안으로 들어온 시점에 `agent.subscribe`를 가로채 기록을 시작한다.
         * 그러면 `attach`가 내부에서 거는 구독이 첫 기록이 되고, 그 뒤의 구독(렌더러)이
         * 두 번째가 된다. **배선이 렌더러를 먼저 구독하면 그 구독은 가로채기 이전이라
         * 아예 기록되지 않는다** — 기록이 1건뿐인 것으로 위반이 드러난다.
         */
        attach(agent: Agent, sessionId: string): Unsubscribe {
          const original = agent.subscribe.bind(agent);
          let label = "store";
          (agent as unknown as { subscribe: Agent["subscribe"] }).subscribe = (listener) => {
            observed.subscribeOrder.push(label);
            label = "after-store";
            return original(listener);
          };
          return real.attach(agent, sessionId);
        },
        close(): void {
          observed.storeClosed += 1;
          real.close();
        },
      };
    },
  };
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-wire-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  out = new CaptureSink();
  io = {
    input: new PassThrough(),
    output: Object.assign(new PassThrough(), {
      write(chunk: unknown): boolean {
        out.write(String(chunk));
        return true;
      },
    }) as unknown as TerminalIo["output"],
  };
  observed = {
    boundaries: [],
    toolOptions: [],
    gateConfigs: [],
    modelConfigs: [],
    subscribeOrder: [],
    storeClosed: 0,
  };
  app = undefined;
});

afterEach(async () => {
  await app?.shutdown();
  rmSync(sandbox, { recursive: true, force: true });
});

async function start(argv: readonly string[] = [], script: readonly ScenarioTurn[] = []) {
  const deps = makeDeps(argv, script);
  app = await startCli(deps, parseArgs([...argv]));
  return app;
}

// ───────────────────────────────────────────────────────────────────────────
// W1. 구독 순서 — 저장소가 먼저 (SESSION-STORE §4, CLI-INTERFACE §2 단계 7)
// ───────────────────────────────────────────────────────────────────────────

describe("배선 — 구독 순서 (SESSION-STORE §4)", () => {
  /**
   * §2 단계 7: "구독 배선 — `store.attach`가 먼저, 렌더러가 나중 (SESSION-STORE §4:
   * '사용자가 화면에서 본 것은 이미 저장된 것')."
   */
  it("store.attach가 렌더러 구독보다 먼저 일어난다", async () => {
    await start();

    // 기록이 2건 이상이라는 것 자체가 "렌더러가 attach 뒤에 구독했다"의 관측이다.
    // 1건이면 렌더러가 attach보다 먼저 구독해 가로채기를 피해 갔다는 뜻이다.
    expect(observed.subscribeOrder.length).toBeGreaterThanOrEqual(2);
    expect(observed.subscribeOrder[0]).toBe("store");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// W2. 모델 클라이언트 — fetch 주입 표면 없음 (CLI-INTERFACE §2)
// ───────────────────────────────────────────────────────────────────────────

describe("배선 — 모델 클라이언트 (CLI-INTERFACE §2)", () => {
  /**
   * §2: "배선 시 `AnthropicClientConfig.fetch`는 채우지 않는다(2026-08-06 기결정 —
   * SSRF·프록시 우회 표면)."
   *
   * 값이 `undefined`인 것으로는 부족하다 — **키 자체가 없어야** 한다. 키가 있으면
   * 나중에 누군가 값을 채우는 것이 한 줄이고, 그 한 줄은 리뷰에서 눈에 띄지 않는다.
   */
  it("모델 클라이언트 생성 config에 fetch 키가 없다", async () => {
    await start();

    expect(observed.modelConfigs).toHaveLength(1);
    const config = observed.modelConfigs[0] as Record<string, unknown>;
    expect(Object.keys(config)).not.toContain("fetch");
    expect("fetch" in config).toBe(false);
  });

  it("모델 클라이언트는 로드된 키와 설정된 모델로 만들어진다", async () => {
    await start();

    const config = observed.modelConfigs[0] as Record<string, unknown>;
    expect(config.apiKey).toBe("qa-b-test-key");
    expect(typeof config.model).toBe("string");
    expect(config.model).not.toBe("");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// W3. 판정기 인스턴스 공유 (TOOLS-INTERFACE §3, APPROVAL-GATE §3)
// ───────────────────────────────────────────────────────────────────────────

describe("배선 — 워크스페이스 판정기 (TOOLS-INTERFACE §3)", () => {
  /**
   * §3: "**판정기는 하나뿐이어야 한다.** 도구 실행과 승인 게이트가 같은 인스턴스를
   * 주입받아 쓴다 — 판정기가 둘이면 '게이트는 안이라 했는데 도구는 밖을 읽는'
   * 불일치가 생기고, 그 순간 게이트 매트릭스의 안/밖 구분이 무의미해진다."
   *
   * 값이 같은 것으로는 부족하다 — **같은 객체**여야 한다. `createWorkspaceBoundary`를
   * 두 번 불러 만든 두 인스턴스는 지금은 같은 판정을 내리지만, 그것은 우연히
   * 일치하는 것이지 계약이 요구하는 단일 판정기가 아니다.
   */
  it("도구와 게이트가 같은 WorkspaceBoundary 인스턴스를 받는다", async () => {
    await start();

    expect(observed.boundaries).toHaveLength(1);
    expect(observed.toolOptions).toHaveLength(1);
    expect(observed.gateConfigs).toHaveLength(1);

    const boundary = observed.boundaries[0];
    expect(observed.toolOptions[0]?.boundary).toBe(boundary);
    expect(observed.gateConfigs[0]?.classifier).toBe(boundary);
  });

  /** §2 단계 3: "cwd의 realpath로 WorkspaceBoundary 생성" */
  it("경계의 루트가 cwd의 realpath다", async () => {
    const started = await start();
    expect(started.parts.boundary.root).toBe(realpathSync(workspaceRoot));
  });

  /**
   * §10(CLI): allowlist 파일이 `~/.neo-agent/` 아래 있는 것의 부수 효과 —
   * denylist가 그 디렉터리 전체이므로 **에이전트가 도구로 자기 allowlist를 넓힐 수
   * 없다**. 배선이 `home`을 경계에 넘기지 않으면 이 보호가 조용히 사라진다.
   */
  it("배선된 경계가 ~/.neo-agent를 denied로 판정한다", async () => {
    const started = await start();
    const verdict = started.parts.boundary.resolve(join(home, ".neo-agent", "allowlist"));
    expect(verdict.scope).toBe("denied");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// W4. 동결 (SAFE-DEFAULTS §4)
// ───────────────────────────────────────────────────────────────────────────

describe("배선 — 설정 동결 (SAFE-DEFAULTS §4)", () => {
  /**
   * §4: "전 키는 시작 시 1회 읽고 동결한다. 세션 중 변경의 적용 시점은 다음 프로세스
   * 시작이다." 배선이 끝난 뒤에도 동결이 살아 있어야 한다 — 조립 과정에서 설정을
   * 펼쳐 새 객체로 옮기면 동결이 조용히 풀린다.
   *
   * [미규정] 배열(`denyRules`)까지 동결인지는 QA-A의 U-6과 같은 지점이다. 여기서는
   * QA-A와 **같은 독해**로 단언한다(열려 있으면 `config.denyRules.length = 0` 한 줄로
   * 게이트 2계층이 사라진다). 판정이 다르게 나면 두 파일을 함께 고쳐야 한다.
   */
  it("배선 이후에도 config가 동결돼 있다", async () => {
    const started = await start();
    const { config } = started.parts;

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.denyRules)).toBe(true);
  });

  it("동결된 config는 배선 이후 변경이 먹지 않는다", async () => {
    const started = await start();
    const { config } = started.parts;
    const before = config.approvalMode;

    try {
      (config as { approvalMode: string }).approvalMode = "off";
    } catch {
      /* strict 모드에서는 throw — 어느 쪽이든 값이 바뀌지 않는 것이 계약이다 */
    }
    expect(config.approvalMode).toBe(before);
  });

  /**
   * 게이트도 생성 시 동결된다(APPROVAL-GATE §5). 배선이 게이트에 넘긴 config 객체를
   * 나중에 바꿔도 판정이 따라 변하면 안 된다 — 프로세스 안에서 도는 코드가 실행 중에
   * 게이트를 약화시킬 수 있으면 게이트가 아니다.
   */
  it("게이트에 넘어간 mode가 배선된 설정과 일치한다", async () => {
    const started = await start();
    expect(observed.gateConfigs[0]?.mode).toBe(started.parts.config.approvalMode);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// W5. 재개 직후 표시 (CLI-INTERFACE §6)
// ───────────────────────────────────────────────────────────────────────────

describe("배선 — 재개 노출 (CLI-INTERFACE §6)", () => {
  /** 세션 하나를 만들고 한 턴을 남긴 뒤 닫는다 — 재개의 재료 */
  async function seedSession(): Promise<string> {
    const started = await start([], [{ text: "첫 응답" }]);
    await started.parts.agent.prompt("첫 질문");
    await started.parts.agent.waitForIdle();
    const id = started.parts.session.id;
    await started.shutdown();
    app = undefined;
    out.clear();
    return id;
  }

  /**
   * §6: "**재개 직후 '어디까지 진행된 세션인지'가 화면에 보여야 한다**는 것이
   * 계약이다(§2.6) — 빈 화면으로 이어가면 사용자는 어느 대화에 접속했는지 모른다."
   *
   * 표시 범위는 구현 세부이므로(§6) 특정 형식을 요구하지 않는다. 재는 것은
   * **과거 대화의 내용이 화면에 닿았는가** 하나다.
   */
  it("재개하면 과거 대화가 화면에 나온다", async () => {
    const id = await seedSession();

    const started = await start(["--resume", id.slice(0, 8)], [{ text: "이어서" }]);
    // 과거 대화 표시는 REPL 진입 **직전**에 일어난다(§2 단계 8). run()을 띄우고
    // 종료 시퀀스로 걷어 오면 그 사이의 출력이 화면에 남는다.
    const running = started.run();
    await started.shutdown();
    await running;
    app = undefined;

    const screen = stripAnsi(out.raw);
    expect(screen).toContain("첫 질문");
    expect(screen).toContain("첫 응답");
  });

  /** §6: 재개는 과거 대화를 **이벤트로 재방출하지 않는다** — 저장이 중복되지 않는다 */
  it("재개가 과거 메시지를 다시 저장하지 않는다", async () => {
    const id = await seedSession();

    const started = await start(["--resume", id.slice(0, 8)], [{ text: "이어서" }]);
    await started.parts.agent.prompt("두 번째 질문");
    await started.parts.agent.waitForIdle();

    const loaded = started.parts.store.loadSession(id, {
      workspaceRoot: started.parts.boundary.root,
      systemPrompt: started.parts.agent.state.systemPrompt,
      model: started.parts.config.model,
    });
    expect(loaded.messages).toHaveLength(4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// W6. 워크스페이스 불일치 노출 (CLI-INTERFACE §6, §2)
// ───────────────────────────────────────────────────────────────────────────

describe("배선 — 워크스페이스 불일치 (CLI-INTERFACE §6)", () => {
  /**
   * §6: "세션에 기록된 워크스페이스 경로를 **표시하고** '그 디렉터리에서 다시 실행'을
   * 안내한다."
   *
   * 저장소의 거부(SESSION-STORE §5)를 그대로 흘리면 사용자는 어디로 가야 하는지
   * 모른다 — 기록된 경로가 안내에 들어 있어야 그 안내가 행동으로 이어진다.
   */
  it("다른 워크스페이스에서 재개하면 기록된 경로를 담은 에러로 거부한다", async () => {
    const started = await start([], [{ text: "첫 응답" }]);
    await started.parts.agent.prompt("첫 질문");
    await started.parts.agent.waitForIdle();
    const id = started.parts.session.id;
    const recordedRoot = started.parts.boundary.root;
    await started.shutdown();
    app = undefined;

    const elsewhere = join(sandbox, "다른-워크스페이스");
    mkdirSync(elsewhere, { recursive: true });

    const deps = { ...makeDeps(["--resume", id.slice(0, 8)]), cwd: elsewhere };
    let caught: unknown;
    try {
      app = await startCli(deps, parseArgs(["--resume", id.slice(0, 8)]));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(String((caught as Error).message)).toContain(recordedRoot);
  });

  /**
   * §2: "시작 단계의 실패는 원인과 다음 행동을 담은 에러로 종료한다 — **부분 기동
   * 상태를 만들지 않는다**." 이미 연 저장소가 열린 채로 남으면 부분 기동이다.
   */
  it("기동 실패 시 이미 연 저장소를 닫는다", async () => {
    const started = await start([], [{ text: "첫 응답" }]);
    const id = started.parts.session.id;
    await started.shutdown();
    app = undefined;
    const closedBefore = observed.storeClosed;

    const elsewhere = join(sandbox, "또-다른-워크스페이스");
    mkdirSync(elsewhere, { recursive: true });
    const deps = { ...makeDeps(["--resume", id.slice(0, 8)]), cwd: elsewhere };

    try {
      app = await startCli(deps, parseArgs(["--resume", id.slice(0, 8)]));
    } catch {
      /* 거부가 이 테스트의 전제다 */
    }

    expect(observed.storeClosed).toBeGreaterThan(closedBefore);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정] 판정 요청 — 이 파일이 임의로 정하지 않은 것 (QA-B / T-010 배선)
 *
 * ── W-1: `WiringFactories` 주입점 자체의 지위 ───────────────────────────────
 *   `CLI-INTERFACE.md`는 조립 지점이 하나라는 것까지 정하고, **생성자 주입점을
 *   공개 표면으로 둘 것인지**는 정하지 않는다. 구현은 배선 계약이 결과물만으로는
 *   검증되지 않는다는 이유로 열었고, 그 판단은 이 파일의 검증을 가능하게 했다.
 *   판정: `WiringFactories`를 §1·§2에 명문화할 것인가. 명문화하지 않으면 다음
 *   리팩터가 "테스트 전용 표면"으로 보고 지울 수 있다.
 *
 * ── W-2: 구독 순서를 관측 가능하게 만드는 수단 ──────────────────────────────
 *   §4는 순서를 계약으로 못박지만 그 순서를 **밖에서 확인할 방법**은 정하지 않는다.
 *   이 파일은 `agent.subscribe`를 가로채는 방식으로 관측했다 — 구현이 바뀌어
 *   `attach`가 `subscribe`를 쓰지 않게 되면 이 하니스는 조용히 무력해진다(기록이
 *   0건이 되어 첫 단언에서 걸리므로 침묵하지는 않는다). 더 나은 관측 수단을
 *   계약에 두는 것이 좋을지 판정 요청.
 *
 * ── W-3: 재개 시 표시하는 과거 대화의 범위 ─────────────────────────────────
 *   `integration.contract.test.ts`의 I-1과 같은 항목이다. 여기서는 "과거 대화의
 *   내용이 화면에 닿는가"까지만 단언했고, 몇 턴을 보일지는 요구하지 않았다.
 *
 * ── W-4: `renderTranscript`가 공개 배럴에 없다 ─────────────────────────────
 *   `src/renderer.ts`는 `renderTranscript`를 내보내지만 `src/index.ts`는 그것을
 *   재수출하지 않는다(`createRenderer`만). 배럴 자신이 "공개 계약"을 자처하므로
 *   내부 전용이라는 판정이면 그대로 두면 되고, §6이 말하는 "렌더러가 직접 그린다"의
 *   표면이라면 배럴에 올리는 것이 맞다. 계약 위반으로 단언하지 않고 판정만 요청한다.
 * ═══════════════════════════════════════════════════════════════════════════ */
