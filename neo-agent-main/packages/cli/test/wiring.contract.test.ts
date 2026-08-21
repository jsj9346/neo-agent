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
import type { Agent, AgentTool, ModelClient, Unsubscribe } from "@neo-agent/core";
import type { ApprovalGateConfig } from "@neo-agent/gate";
import { createApprovalGate } from "@neo-agent/gate";
import { contextWindowForModel } from "@neo-agent/providers";
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
  // 3c 첫 기동 관문(`CLI-INTERFACE.md` §2.1)을 이미 지난 홈으로 만든다 — 판정은
  // `~/.neo-agent/sessions.db`의 부재 하나뿐이라 빈 파일 하나면 «returning»이 된다
  // (0바이트는 SQLite가 유효한 빈 DB로 취급한다). 없으면 조립이 관문에서 키를
  // 기다리며 끝나지 않는다. 모드를 명시하는 것은 umask가 writeFileSync의 mode를
  // 깎아 `loose-file-permissions` 경고가 새로 나가는 것을 막기 위해서다.
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
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
   * 배열(`denyRules`)까지 동결인지는 QA-A의 U-6과 같은 지점이었고 **2026-08-06에
   * 깊은 동결로 판정됐다**(QA 독해 지지 — 판정 정본 `plans/20260806-cli-qa-report.md`
   * §3, 반영은 `CLI-INTERFACE.md` §3). 근거는 이 파일이 단언하는 그것이다: 배열이
   * 열려 있으면 `config.denyRules.length = 0` 한 줄로 게이트 2계층이 사라져
   * "실행 중 게이트를 약화시킬 수 없다"(SAFE-DEFAULTS §4)가 성립하지 않는다.
   * 판정이 끝났으므로 미규정 마커를 달지 않는다.
   *
   * 같은 물음이 `test/harness.ts`의 QA-A 블록(U-6)에 마커인 채 남아 있었고
   * **2026-08-20에 걷혔다**(K-005) — 판정은 2026-08-06에 끝났는데 마커가 여러 파일에
   * 그대로 남아, 뒤이은 검증들이 이 항목을 열린 것으로 다시 셌다. 한쪽만 보고 열린
   * 것으로 읽지 않도록 그 경위를 여기 남긴다(2026-08-11 독립 QA 발견).
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

// ───────────────────────────────────────────────────────────────────────────
// W7. 미지 모델 컨텍스트 창 경고 (PROVIDERS §3)
// ───────────────────────────────────────────────────────────────────────────

/**
 * §8 마지막 행: *"미지 모델은 보수 기본값 + **기동 시 경고**."*
 *
 * 계약이 두 조각인데 **보수 기본값 쪽만 기계가 지키고 있었다**(`providers/test/
 * context-window.contract.test.ts`). 경고 쪽은 2026-08-10 검증에서 커버리지 구멍
 * C-1으로 잡혔다 — 문면이 `src/wiring.ts`에만 있고 어느 테스트도 그 분기를 지나지
 * 않았다(CLI 테스트 전체가 기지 모델 id 하나만 썼다). `warn` 호출을 통째로 지워도
 * 게이트가 그린이었다.
 *
 * **왜 경고가 계약인가**: 추정값으로 압축을 판정한다는 사실이 숨으면 사용자는 압축이
 * 늦거나 이른 이유를 알 수 없다(ARCHITECTURE §2.6 가시적 결과). 침묵 실패 계열이라
 * 커버리지 구멍의 값이 낮지 않다.
 */
describe("배선 — 미지 모델 컨텍스트 창 경고 (PROVIDERS §3)", () => {
  /** 배선은 모델 id를 `~/.neo-agent/config.json`에서 읽는다(CLI-INTERFACE §3) */
  function writeModelConfig(model: string): void {
    writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify({ model }), "utf8");
  }

  /** 테이블에 없는 id. 접두가 기지 모델과 겹치지 않게 골랐다(조회는 접두 일치를 쓰지 않는다) */
  const UNKNOWN_MODEL = "qa-b/no-such-model";

  /**
   * **경고 횟수는 계약이 아니다** — `toContain`으로 존재만 재고 발화 횟수는 세지 않는다.
   *
   * §8 R6의 문면은 *"기동 시 경고"*로 경고의 **존재**만 규정한다. 중복 발화는 소음이지
   * 계약 위반이 아니고, 침묵 실패 계열도 아니다(경고가 사라지는 쪽만 위험하다 —
   * ARCHITECTURE §2.6). 계약에 없는 횟수를 여기서 단정하면 **테스트가 계약을 새로 만드는**
   * 셈이 되므로 하지 않는다. 2026-08-10 `/verify`가 커버리지 구멍 C-W2로 올린 것을 유저가
   * 이 방향으로 판정했다. 횟수가 계약이 되려면 §8을 먼저 고친다.
   */
  it("미지 모델로 기동하면 추정값으로 판정한다는 경고가 나온다", async () => {
    writeModelConfig(UNKNOWN_MODEL);
    await start();

    expect(out.text).toContain(UNKNOWN_MODEL);
    expect(out.text).toContain("컨텍스트 창을 모른다");
  });

  /**
   * **경고가 거짓말하지 않는다.** 표시된 수치가 판정에 실제로 쓰이는 값과 달라지면
   * 경고는 있으나 마나다 — 사용자는 틀린 값을 근거로 압축 시점을 이해하게 된다.
   *
   * 두 공개 표면(providers의 조회 함수 ↔ CLI의 표시)을 교차 대조한다. 구현 상수를
   * 직접 읽지 않는 것이 중요하다 — 상수를 읽으면 "같은 값을 두 번 쓴다"만 확인된다.
   */
  it("경고가 말하는 수치가 조회 함수의 값과 일치한다", async () => {
    writeModelConfig(UNKNOWN_MODEL);
    await start();

    const expected = contextWindowForModel(UNKNOWN_MODEL);
    expect(expected.known).toBe(false);
    expect(out.text).toContain(expected.tokens.toLocaleString("en-US"));
  });

  /**
   * 반대 방향 — **헛경고가 나지 않는다.** 기지 모델에서도 경고가 나면 경고가 신호가
   * 아니라 소음이 되고, 사용자는 곧 무시하게 된다. 기본 모델이 날짜 스냅샷 id라
   * (`claude-haiku-4-5-20251001`) 별칭 해석이 깨지면 여기서 걸린다.
   */
  it("기지 모델(기본값)로 기동하면 그 경고가 없다", async () => {
    await start(); // config.json 없음 → DEFAULT_MODEL

    expect(out.text).not.toContain("컨텍스트 창을 모른다");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 판정 기록 — 이 파일이 물었던 것과 그 처분 (QA-B / T-010 배선)
 *
 * W-1~W-3은 **2026-08-06에**, W-4는 **2026-08-11에** 판정됐다. 2026-08-06 판정
 * 정본은 `plans/20260806-cli-qa-report.md` — W-1은 §3(계약 명문화 표), 나머지는
 * §4(조치 불필요 15건)다. W-4의 정본은 `CLI-INTERFACE.md` §1·§6이다.
 * 열린 판정이 하나도 없으므로 미규정 마커를 달지 않는다 —
 * **닫힌 항목이 마커를 유지하면 진짜 열린 항목이 묻힌다.**
 *
 * ── W-1: `WiringFactories` 주입점 자체의 지위 ───────────────────────────────
 *   물음: 생성자 주입점을 공개 표면으로 둘 것인가. 명문화하지 않으면 다음 리팩터가
 *   "테스트 전용 표면"으로 보고 지울 수 있다.
 *   **판정 — 계약 명문화** (2026-08-06). 배선 계약은 결과물만으로는 검증되지 않고
 *   (도구와 게이트가 같은 `WorkspaceBoundary`를 받았는지는 전달 인자를, 구독 순서는
 *   구독 시점을 봐야 안다), 주입점을 지우면 이 파일의 배선 contract가 성립하지
 *   않는다. 반영 위치는 **`CLI-INTERFACE.md` §1**이며 실물에 있다.
 *   물음의 문면은 "§1·§2에"로 넓게 썼으나 **판정은 §1로 났다.** §2는 시작·종료
 *   시퀀스 절이라 주입점의 지위와는 다른 축이다 — 그 축은 열려 있지 않다.
 *
 * ── W-2: 구독 순서를 관측 가능하게 만드는 수단 ──────────────────────────────
 *   물음: §4는 순서를 계약으로 못박지만 그 순서를 **밖에서 확인할 방법**은 정하지
 *   않는다. 이 파일은 `agent.subscribe`를 가로채 관측한다.
 *   **판정 — 조치 불필요** (2026-08-06). 구현이 바뀌어 `attach`가 `subscribe`를
 *   쓰지 않게 되면 하니스는 무력해지지만 **침묵하지는 않는다** — 기록이 0건이 되어
 *   첫 단언에서 걸린다. 더 나은 관측 수단을 계약에 둘 이유가 그만큼 없다.
 *
 * ── W-3: 재개 시 표시하는 과거 대화의 범위 ─────────────────────────────────
 *   `integration.contract.test.ts`의 I-1과 **같은 항목**이다(리포트가 `I-1·W-3`으로
 *   묶어 처분했다). 여기서는 "과거 대화의 내용이 화면에 닿는가"까지만 단언했고
 *   몇 턴을 보일지는 요구하지 않았다.
 *   **판정 — 조치 불필요** (2026-08-06). 구현이 전체 트랜스크립트를 렌더하므로
 *   §6의 "어디까지 진행됐는지 보인다"가 충족되고, **범위 수치는 세부**다
 *   (`CLI-INTERFACE.md` §12가 "표시 세부"로 분류한 미결이 그 세부 쪽이다).
 *
 * ── W-4: `renderTranscript`의 배럴 노출 ─────────────────────────────────────
 *   `integration.contract.test.ts`의 I-2와 **같은 항목**이다 — 정정은 반드시 두
 *   파일 동시에.
 *   **판정 — 배럴 노출이 맞다. 2026-08-06 판정을 갱신한다** (2026-08-11,
 *   `CLI-INTERFACE.md` §1·§6). 근거는 §1이 명문화한 **소속 기준**이다: 배럴의
 *   소속은 "모듈의 의도된 표면"이지 "현재 소비자 수"가 아니고, `renderTranscript`는
 *   `renderer.ts`가 무엇을 하는 모듈인지 드러내는 두 표면(라이브·재개) 중 하나다.
 *   2026-08-06 판정의 **근거**(*"소비자는 wiring 하나, 같은 패키지"*)는 2026-08-11
 *   실측에서도 여전히 사실이다 — 거짓이었던 것은 결론에 딸린 부속 주장
 *   (*"배럴에 없다"*) 하나뿐이고, 그것은 판정 시점에 이미 거짓이었다(같은 판정 대상
 *   사슬의 마지막 커밋 `5c21c0a`에서 배럴에 올라갔다). 근거는 맞고 결론이 과했던
 *   경우이며, **개별 심볼 판정을 §1의 기준이 대신한다** — 심볼마다 "이건 왜 있고
 *   저건 왜 없나"를 따로 판정한 것이 W-4가 5일간 거짓인 채 있던 원인이다.
 *   배럴 노출 자체는 `renderer.contract.test.ts`가 단언한다(판정이 다시 늙지 않게).
 *   > 발견 정본: `plans/20260811-marker-hygiene-qa-report.md`
 * ═══════════════════════════════════════════════════════════════════════════ */
