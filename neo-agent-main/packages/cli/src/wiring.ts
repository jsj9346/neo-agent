/**
 * 조립(composition root) — `docs/CLI-INTERFACE.md` §2·§5·§6.
 *
 * **코어·도구·게이트·저장소는 서로를 모른다.** 그 계약들(`CORE-INTERFACE.md` §1,
 * `TOOLS-INTERFACE.md` §1, `APPROVAL-GATE.md` §1, `SESSION-STORE.md` §1)은 전부
 * "결합은 호스트의 배선 한 곳"을 전제하며, 그 한 곳이 이 파일이다.
 *
 * 여기에도 `process.*` 참조는 없다 — argv·env·cwd·home·스트림, 그리고 설치 루트
 * (`DISTRIBUTION.md` §6)까지 전부 주입받는다. `process`와 자기 위치를 만지는 곳은
 * 진입점(`main.ts`) 하나다. 그래야 조립 자체를 모의 스트림과 임시 디렉터리로
 * 검증할 수 있다.
 */

import { isAbsolute, join, relative, resolve } from "node:path";
import {
  Agent,
  type AgentEvent,
  type AgentEventListener,
  type AgentHooks,
  type AgentMessage,
  type AgentTool,
  type ModelClient,
} from "@neo-agent/core";
import {
  type AllowlistStore,
  type ApprovalGateConfig,
  type ApprovalPrompt,
  createApprovalGate,
} from "@neo-agent/gate";
import {
  createRememberTool,
  loadMemory,
  MEMORY_FILE_MAX_CHARS,
  MEMORY_FILE_NAME,
  MEMORY_TOOL_GATE_PROFILES,
  type MemorySnapshot,
  type MemoryToolDeps,
  removeMemoryEntry,
  renderMemoryBlock,
} from "@neo-agent/memory";
import {
  anthropicProvider,
  contextWindowForModel,
  NEO_AGENT_USER_AGENT,
} from "@neo-agent/providers";
import {
  createDockerShellExecutor,
  type DockerAvailability,
  type DockerShellExecutorOptions,
  probeDocker,
} from "@neo-agent/sandbox";
import {
  type OpenSessionStoreOptions,
  openSessionStore,
  type SessionStore,
  type StoredSession,
  type StoreWarning,
} from "@neo-agent/store";
import {
  createHostShellExecutor,
  createStandardTools,
  createWorkspaceBoundary,
  type HostShellExecutorOptions,
  type ShellExecutor,
  type StandardToolsOptions,
  TOOL_GATE_PROFILES,
  type WorkspaceBoundary,
  type WorkspaceBoundaryOptions,
} from "@neo-agent/tools";
import { createWebFetchTool, WEB_TOOL_GATE_PROFILES } from "@neo-agent/web";
import { createAllowlistStore, defaultAllowlistPath } from "./allowlist.ts";
import { createApprovalPrompt } from "./approval-ui.ts";
import { type CliArgs, parseArgs, USAGE } from "./args.ts";
import { type CompactionController, createCompactionController } from "./compact.ts";
import { type CliConfig, defaultConfigPath, loadConfig } from "./config.ts";
import { defaultCredentialsPath, type LoadedCredentials, loadCredentials } from "./credentials.ts";
import { createRepl, type Repl } from "./input.ts";
import { defaultMemoryDir } from "./memory.ts";
import { type CliActions, type CliContext, dispatchSlashCommand } from "./registry.ts";
import { createRenderer, renderTranscript } from "./renderer.ts";
import { renderSearchResults } from "./search.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { type OutputSink, style, type TerminalIo } from "./terminal.ts";

/** 세션 id를 화면에 줄여 보일 때의 길이. 재개 접두 안내도 이 길이를 쓴다 */
const ID_PREFIX_LENGTH = 8;

/**
 * `--version`이 찍는 값.
 *
 * 어댑터가 프로바이더에 신고하는 신원과 **같은 원천**에서 뽑는다. 버전을 두 곳에
 * 적으면 한쪽만 올라가고, 그때 사용자가 보는 버전과 서버가 보는 버전이 갈린다.
 */
export const CLI_VERSION = NEO_AGENT_USER_AGENT.slice("neo-agent/".length);

/**
 * 종료 코드. [미규정] — 계약은 "원인과 다음 행동을 담은 에러로 종료"까지만 정하고
 * 코드 값을 정하지 않는다. 관례대로 사용법 오류와 기동 실패를 나눴다.
 */
export const EXIT_OK = 0;
export const EXIT_STARTUP_FAILED = 1;
export const EXIT_USAGE = 2;

type ApprovalHook = ReturnType<typeof createApprovalGate>;

/**
 * 생성자 주입점.
 *
 * 전부 기본 구현이 있고, 바꾸는 것은 테스트다. 이 표면이 있는 이유는 **배선의
 * 계약(누가 누구와 같은 인스턴스를 공유하는가, 무엇이 어떤 순서로 불리는가)이
 * 결과물만 봐서는 검증되지 않기 때문**이다 — 도구와 게이트가 같은
 * `WorkspaceBoundary`를 받았는지는 전달 인자를 봐야 안다.
 */
export interface WiringFactories {
  createBoundary(options: WorkspaceBoundaryOptions): WorkspaceBoundary;
  /**
   * **호스트 실행자** — `sandbox: "off"`(명시적 옵트아웃)에서만 불린다(§2 단계 5b).
   *
   * [미규정 EP-4] 이 자리를 "구현체 비의존 팩토리 하나"로 합치는 안을 택하지 않았다.
   * 두 실행자는 **받는 것이 다르다** — 호스트는 상속할 env와 스크러빙할 시크릿 값을
   * 받고(§4 계약 3), 컨테이너는 env가 비어서 시작하므로 시크릿을 **애초에 받지
   * 않는다**(`SANDBOX.md` §4 화이트리스트). 한 시그니처로 합치면 두 옵션 집합의
   * 합집합(전부 옵셔널)이 되어, 시크릿을 컨테이너 쪽에 넘기는 배선이나 이미지 없는
   * 컨테이너 요청이 **타입 수준에서 통과**한다. `createModelClient`에서 `fetch`를
   * 구조적으로 못 채우게 한 것과 같은 원리라 갈라 둔 쪽을 택했다: 시그니처가 실수를
   * 막게. 어느 쪽이 선택됐는지는 팩토리가 아니라 배선(`selectShell`)과 `parts.shell`이
   * 드러낸다 — 선택을 팩토리 안으로 숨기지 않는다.
   */
  createExecutor(options: HostShellExecutorOptions): ShellExecutor;
  /** **컨테이너 실행자** — `sandbox: "on"` + Docker 가용에서만 불린다(§2 단계 5b) */
  createSandboxExecutor(options: DockerShellExecutorOptions): ShellExecutor;
  /**
   * Docker 가용 판정(`SANDBOX.md` §3). **상한은 패키지가 보장**하므로 배선은 그냥
   * 기다린다. 주입점인 이유는 이 판정이 **기동 시 실제 docker를 건드리는 유일한
   * 지점**이라, 여기가 열려 있지 않으면 세 갈래(가용/불가용/옵트아웃)의 검증이
   * 테스트 머신의 Docker 설치 여부에 좌우되기 때문이다.
   *
   * 그래서 **주입은 선택이 아니다** — `startCli`를 부르는 테스트가 이 자리를 비우면
   * `scripts/check-core-budget.mjs`의 교차 파일 검사 5번이 `pnpm check`를 실패시킨다
   * (2026-08-10 판정 D-1). 여기를 지우거나 옵셔널로 바꾸면 그 검사도 함께 죽는다.
   */
  probeDocker(): Promise<DockerAvailability>;
  createTools(options: StandardToolsOptions): AgentTool[];
  /**
   * `web_fetch`(`WEB-ACCESS.md` §3). **인자를 받지 않는 것이 계약의 이행이다** —
   * §4가 "CLI는 `fetch`도 `verify`도 채우지 않는다"를 코드 리뷰 기준으로 못박았고,
   * 시그니처에 그 인자가 없으면 배선이 실수로 채울 방법이 구조적으로 없다
   * (`createModelClient`의 `fetch` 부재와 같은 수단).
   */
  createWebTool(): AgentTool;
  /**
   * `remember`(`MEMORY.md` §4). **항상 등록되고 도구 목록 말미에 온다** — `shell`과
   * 달리 조건부가 아니다(§4.4).
   *
   * `createWebTool`과 달리 인자를 받는 이유는 계약이 그렇게 정했기 때문이다:
   * `MemoryToolDeps`의 `dir`은 설정 표면이 아니라 **호스트가 배선하는 값**이고
   * (§9 M-2 닫힘), `isRunTainted`도 값이 아니라 **함수**로 배선하라고 §4.1이
   * 못박는다. 시그니처에 그대로 두어야 그 두 결정이 배선에서 관측된다.
   */
  createMemoryTool(deps: MemoryToolDeps): AgentTool;
  /**
   * 모델 클라이언트. 기본값은 프로바이더 등록의 `createClient`다.
   *
   * **`AnthropicClientConfig.fetch`는 채우지 않는다**(§2, 2026-08-06 기결정 — SSRF·
   * 프록시 우회 표면). 이 시그니처에 `fetch`가 없으므로 배선이 실수로 채울 방법이
   * 구조적으로 없다: 등록의 `createClient`가 받는 것은 `apiKey`와 `model`뿐이다.
   */
  createModelClient(config: { apiKey: string; model: string }): ModelClient;
  createGate(config: ApprovalGateConfig): ApprovalHook;
  openStore(options: OpenSessionStoreOptions): SessionStore;
}

export interface CliDeps {
  /** `process.argv.slice(2)` */
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  /** 워크스페이스의 원천. 경계 생성 시 realpath로 정규화된다(§2 단계 3) */
  cwd: string;
  /** 설정·크리덴셜·allowlist·세션 DB가 전부 이 아래 `.neo-agent/`에 있다 */
  home: string;
  io: TerminalIo;
  /** `--version` 출력 */
  version: string;
  /**
   * neo-agent 자신이 설치된(= clone된) 트리의 루트. **realpath여야 한다**
   * (`DISTRIBUTION.md` §6). `main.ts`가 자기 위치에서 계산해 주입한다.
   *
   * **옵셔널인 것이 계약의 이행이다.** 이 값의 쓰임은 고지 하나이고 §6이 그 고지를
   * *"경계가 아니라 고지"*로 못박았다 — 모르면 말하지 않으면 되고, 모르는 채로
   * 기동을 막거나 추측해 채우는 것이 오히려 §6 위반이다. 조립을 모의 스트림으로
   * 부르는 경로(테스트·QA)는 설치 트리 안에서 도는 것이 아니므로 줄 값도 없다.
   */
  installRoot?: string;
  /**
   * **조립 단계의 고지가 나갈 출력 싱크**(§1 — 「조립이 아는 것은 「어디로 쓰는가」까지다」).
   *
   * 주지 않으면 오늘 그대로다 — REPL의 라인 안전 출력(`repl.write`)을 뿌리로 하는
   * 싱크를 조립이 스스로 만든다. 주면 그것을 **그대로** 쓴다.
   *
   * **팩토리가 아니라 여기인 근거는 §1의 판별 기준이다**: 기본 구현이 `repl`에
   * 기대는데 `resolveFactories`는 REPL 생성보다 **앞**에서 불리므로, 팩토리 클로저는
   * 그 시점에 존재하지 않는 객체를 참조할 수 없다.
   *
   * **라인 안전 출력의 성질은 여기 없다.** §7의 *"타이핑 중인 입력은 출력에 의해
   * 유실되지 않는다"*를 이행하는 수단(입력 라인 걷어내기·재그리기)은 REPL 구현이
   * 소유하고, 조립은 「어디로 쓰는가」만 안다 — 그래서 이 타입이 `Repl`이 아니라
   * `OutputSink`다. REPL 없는 호스트가 주는 싱크는 지킬 입력 라인이 없다.
   *
   * **고지를 조용히 버리는 쪽은 선택지가 아니다**(ARCHITECTURE §2.6): §2 열거의 앞
   * 단계들이 내는 경고(저장소 권한·WAL·메모리·미지 모델·셸 판정)가 전부 이 싱크로
   * 나가므로, 주는 쪽은 그것을 사용자에게 닿게 할 책임을 함께 받는다.
   */
  out?: OutputSink;
  /**
   * **완성된 승인 프롬프트**(§1 — 「조립은 주어진 프롬프트를 그대로 쓴다」).
   *
   * 주지 않으면 오늘 그대로다 — `createApprovalPrompt(io)`로 터미널 프롬프트를 만들고
   * `repl.withApprovalWait`로 감싼다(§8 `approval-wait`). 주면 **감싸지 않고 그대로**
   * 게이트에 배선한다: 입력 소유권 이양은 REPL이 있는 호스트에서만 뜻이 있고, 없는
   * 호스트에 씌우면 존재하지 않는 입력 라인을 걷었다 되돌리게 된다(§1).
   *
   * **`WiringFactories`가 아니라 여기인 근거는 `out`과 같다** — 기본 구현이 `repl`에
   * 기대는데 `resolveFactories`는 REPL 생성보다 **앞**에서 불린다(§1의 판별 기준).
   * 팩토리에 `repl`을 인자로 넘기면 터미널 개념이 `WiringFactories` 시그니처에 오른다.
   *
   * **게이트 모듈은 이 값에 대해 아무것도 모른다**(`APPROVAL-GATE.md` §1·§4의
   * `ApprovalGateConfig.prompt` · `CORE-INTERFACE.md` §7 — *"웹 UI 도입 시 같은 게이트
   * 모듈에 다른 프롬프트 구현만 붙인다"*). 여기서 갈리는 것은 프롬프트 구현 하나이고
   * 파이프라인·정책·allowlist는 그대로다.
   *
   * **`/delete` 확인은 이 표면을 지나지 않는다** — 그것은 슬래시 명령이라 REPL 전용이
   * 맞고(§8이 `approval-wait`의 소유자를 게이트 프롬프트로 한정하지 않는다), 두 번째
   * 호스트에는 그 명령 자체가 없다.
   */
  approvalPrompt?: ApprovalPrompt;
  /**
   * **이벤트 스트림의 추가 구독자**(§1 — 「이벤트 스트림의 추가 구독자」).
   *
   * `CORE-INTERFACE.md` §3이 *"나중에 웹 UI도 같은 자리에 앉는다"*로 연 자리다.
   * 주지 않으면 오늘 그대로다 — 구독자는 저장소와 렌더러 둘뿐이다.
   *
   * **순서는 이 목록이 아니라 구조가 정한다**(§1). §2 열거의 7이 든 저장소 먼저·
   * 렌더러 나중은 이 목록 **밖**에서 그대로 서고, 여기 있는 것은 전부 그 뒤에 목록
   * 순서대로 붙는다 — 첫 자리에 무엇을 놓아도 저장소를 앞지를 방법이 없다.
   * `SESSION-STORE.md` §4는 호출부 한 줄의 성의로 지킬 계약이 아니다.
   *
   * **구독은 `activate()` 수명에 붙는다**(§6 — Agent 교체). `/new`·`/resume`·압축이
   * Agent를 갈아치우므로 조립 **밖**에서 한 번 붙이는 형태로는 세션 교체 뒤 새
   * Agent에 안 붙고, 두 번째 호스트의 화면이 조용히 멈춘다(ARCHITECTURE §2.6 —
   * 침묵 실패). 그래서 이 값은 조립을 지나 그 클로저까지 흐르고 `release()`가
   * 저장소·렌더러와 함께 전부 뗀다.
   *
   * **추가 구독자는 자기 예외를 자기가 처리한다 — 그리고 이 표면은 그것을 강제하지
   * 않는다**(§1). 전파된 예외는 런을 끝내고 `prompt()`를 reject시키는데
   * (`CORE-INTERFACE.md` §3), `WEB-UI.md` §8은 *"클라이언트 연결이 끊겨도 진행 중인
   * 런은 계속된다"*를 계약으로 든다. 둘이 함께 서려면 전송 쪽 사정이 구독자 밖으로
   * 나오지 않아야 한다. **렌더러와 규율이 반대인 것이 의도다** — 렌더러가 안 삼키는
   * 것은 §7의 계약이고(`renderer.ts` 선언부), 조립이 여기서 감싸 삼키면 그 갈래가
   * 지워진다. 삼키는 자리는 구독자 쪽이다.
   */
  listeners?: readonly AgentEventListener[];
  factories?: Partial<WiringFactories>;
}

/**
 * 5b의 결과 — **어느 실행자가 선택됐는가**(§2 단계 5b, `SANDBOX.md` §3).
 *
 * 선택을 팩토리 안에 숨기지 않고 값으로 남기는 이유는 두 가지다: 시작 화면이 이것을
 * 그대로 읽어 사용자에게 보이고(§2.6 — 숨겨진 도구가 조용히 빠지면 사용자는 왜 안
 * 되는지 모른다), 배선 계약의 검증이 결과물이 아니라 **선택 자체**를 봐야 하기 때문이다.
 */
export type ShellWiring =
  | { readonly kind: "sandbox"; readonly image: string; readonly dockerVersion: string }
  /** `sandbox: "off"` — 명시적 호스트 실행 옵트아웃 */
  | { readonly kind: "host" }
  /** `sandbox: "on"`인데 Docker 불가용 — 셸 도구를 등록하지 않는다. **에러가 아니다** */
  | { readonly kind: "unavailable"; readonly reason: string };

/** 조립된 부품. 배선 계약을 검증하는 쪽이 인스턴스 동일성을 확인할 수 있게 연다 */
export interface CliParts {
  config: CliConfig;
  credentials: LoadedCredentials;
  boundary: WorkspaceBoundary;
  store: SessionStore;
  allowlist: AllowlistStore;
  /**
   * 3b가 읽어 **동결한** 메모리 스냅샷(`MEMORY.md` §3.1). 세션 중 `remember`가
   * 디스크를 바꿔도 이 값은 변하지 않는다 — 그 불변이 프롬프트 캐시 불가침의 실체이고,
   * 값으로 열어 두어야 "프롬프트에 실린 것"과 "디스크"의 차이가 관측 가능하다.
   */
  memory: MemorySnapshot;
  tools: readonly AgentTool[];
  /** 5b 판정 결과. `shell` 등록 여부와 그 이유가 여기 있다 */
  shell: ShellWiring;
  repl: Repl;
  /** 현재 세션 — `/new`·`/resume`으로 바뀐다 */
  readonly session: StoredSession;
  /** 현재 Agent — 세션이 바뀌면 새 인스턴스다(CORE-INTERFACE §4의 "reset() 없음") */
  readonly agent: Agent;
}

export interface CliApp {
  readonly parts: CliParts;
  /** REPL 진입(§2 단계 8). 종료 시퀀스가 끝나면 resolve한다 */
  run(): Promise<void>;
  /** 종료 시퀀스(§2). 두 번 불러도 안전하다 */
  shutdown(): Promise<void>;
}

export function resolveFactories(overrides: Partial<WiringFactories> = {}): WiringFactories {
  return {
    createBoundary: createWorkspaceBoundary,
    createExecutor: createHostShellExecutor,
    createSandboxExecutor: createDockerShellExecutor,
    probeDocker: () => probeDocker(),
    createTools: createStandardTools,
    // 기본 인자를 그대로 쓴다 — 주입점(`fetch`)은 존재하되 배선이 채우지 않는다.
    createWebTool: () => createWebFetchTool(),
    createMemoryTool: createRememberTool,
    createModelClient: (config) => anthropicProvider.createClient(config),
    createGate: createApprovalGate,
    openStore: openSessionStore,
    ...overrides,
  };
}

/** 활성 세션 하나의 런타임. 세션이 바뀌면 통째로 교체된다 */
interface SessionRuntime {
  session: StoredSession;
  agent: Agent;
  release(): void;
}

/** REPL이 만들어진 뒤에 채워지는 동작들 — 배선이 끝나기 전의 입력은 갈 곳이 없다 */
interface ReplBridge {
  prompt(text: string): Promise<void>;
  steer(text: string): void;
  abort(): void;
  dispatch(line: string): Promise<void>;
  requestExit(): void;
}

/**
 * 기본 승인 프롬프트 — 터미널 프롬프트 + 입력 소유권 이양(§8 `approval-wait`, §9).
 *
 * **`CliDeps.approvalPrompt`가 비었을 때만 불린다.** 조립 안 인라인이 아니라 여기인
 * 이유는 갈래를 한 줄로 읽히게 하기 위해서다 — 이 래핑이 **터미널 호스트의 것**이라는
 * 사실이 함수 이름에 남고, 주입 갈래가 그것을 지나지 않는다는 것이 호출부에서 보인다.
 *
 * `wiring.ts` 밖으로 내보내지 않는다: `repl`을 인자로 받는 순간 터미널 개념이 붙으므로
 * 이 결합은 조립 파일 안에 가둔다(§1의 판별 기준과 같은 이유).
 */
function createReplApprovalPrompt(io: TerminalIo, repl: Repl): ApprovalPrompt {
  const basePrompt = createApprovalPrompt(io);
  return {
    ask: (request, signal) => repl.withApprovalWait(() => basePrompt.ask(request, signal)),
  };
}

/**
 * 시작 시퀀스 1~7단계를 수행하고 REPL 진입 직전 상태를 돌려준다(§2).
 *
 * **순서가 계약이다** — 뒤 단계는 앞 단계의 동결·검증을 전제한다. 어느 단계에서
 * 실패하든 원인과 다음 행동을 담은 에러로 던지며 이미 연 자원은 닫는다:
 * 부분 기동 상태를 만들지 않는다(§2).
 */
export async function startCli(deps: CliDeps, args: CliArgs): Promise<CliApp> {
  const factories = resolveFactories(deps.factories);
  const { io } = deps;

  // ── 1. 설정 로드 + 동결 (§3, SAFE-DEFAULTS §4)
  const config = loadConfig(defaultConfigPath(deps.home));

  // ── 2. 크리덴셜 로드 — fail-closed (§4)
  const credentials = loadCredentials(deps.env, defaultCredentialsPath(deps.home));

  // ── 3. 워크스페이스 경계 (TOOLS-INTERFACE §3)
  // 도구 4종과 게이트 classifier가 **이 하나의 인스턴스**를 공유한다. 판정기가 둘이면
  // "게이트는 안이라 했는데 도구는 밖을 읽는" 불일치가 생기고, 그 순간 매트릭스의
  // 안/밖 구분이 무의미해진다.
  const boundary = factories.createBoundary({ root: deps.cwd, home: deps.home });

  // REPL을 먼저 만들되 진입(start)은 8단계로 미룬다. 저장소 열기부터 경고가 나올 수
  // 있고 그 경고도 **라인 안전 출력**으로 나가야 하기 때문이다 — readline을 붙이기
  // 전의 `repl.write`는 출력으로 곧장 흐른다(입력 라인이 없으니 지킬 것도 없다).
  //
  // 3b(메모리 로드)의 권한 경고도 같은 경로로 나가야 하므로 생성이 그보다 앞에 있다.
  // 생성 자체는 부수 효과가 없다(readline은 `start()`에서 붙는다) — 3b가 던져도
  // 정리할 것이 없다는 §2의 이득이 그대로 유지된다.
  let bridge: ReplBridge | undefined;
  const repl = createRepl(io, {
    prompt: async (text) => {
      await bridge?.prompt(text);
    },
    steer: (text) => {
      if (bridge === undefined) return;
      bridge.steer(text);
    },
    abort: () => bridge?.abort(),
    dispatch: async (line) => {
      await bridge?.dispatch(line);
    },
    requestExit: () => bridge?.requestExit(),
  });

  // 상태줄의 동결값 — `docs/CLI-INTERFACE.md` §7.1 표에서 출처가 "config 동결 (§3)"인
  // 두 행(승인 모드 · 모델).
  //
  // **설정은 1단계에서 이미 얼었으므로 여기가 가장 이른 자리다**(§3, `SAFE-DEFAULTS.md`
  // §4). 두 행 모두 갱신 계기가 "없음(고정)"이라 이 한 번의 호출이 프로세스 수명 전체를
  // 덮는다 — §7.1의 *"시계를 두지 않는다"*가 배선 쪽에서는 **부르는 자리가 하나**로
  // 나타난다. 다시 읽는 경로를 만들면 그 순간 동결이 동결이 아니게 된다.
  //
  // 기본값(`approvalMode: "manual"`)에서 이 항목이 화면에 뜨지 않는 것은 여기서 값을
  // 거르기 때문이 아니다 — 배선은 실값을 그대로 넘기고, 표시 여부의 판정은 §7.1의
  // *"두 계약 항목이 켜져 있을 때(기본값일 때)는 표시하지 않는다"*를 이행하는
  // `status.ts`가 소유한다. 판정을 두 곳에 두면 갈리는 날이 온다.
  repl.setStatus({ approvalMode: config.approvalMode, model: config.model });

  // 조립이 쓰는 출력 싱크. **주어지면 그대로 쓰고, 없으면 오늘 그대로 REPL을 뿌리로
  // 만든다**(§1 — `CliDeps`는 조립이 만들지 않고 그대로 쓰는 값을 여는 표면이다).
  //
  // 기본 갈래가 `repl.write`인 것이 §7의 이행이다 — 이 싱크로 나가는 고지는 입력 라인이
  // 그려진 뒤에도 나갈 수 있고(`run()` 안의 배너·재개 트랜스크립트), 그때 타이핑 중인
  // 입력을 지키는 것은 REPL의 몫이다. 조립은 그 성질을 모른다.
  //
  // [미규정] **싱크가 하나인가 둘인가를 §1이 정하지 않았다.** 그 절이 이름으로 든 것은
  // 「조립 단계의 고지가 나갈 출력 싱크」이고, 이 값은 오늘 그 고지 말고 렌더러
  // (`createRenderer(out)`)·재개 트랜스크립트·슬래시 명령의 출력도 함께 받는다. 여기서
  // 가르지 않은 것은 오늘 하나이기 때문이다 — 가르면 이 작업이 동작을 바꾼다. 두 번째
  // 호스트가 「고지는 터미널로, 이벤트는 전송으로」를 원하면 그때 §1이 먼저 갈라야 한다.
  const out: OutputSink = deps.out ?? { write: (text: string): void => repl.write(text) };
  const notify = (text: string): void => {
    out.write(text.endsWith("\n") ? text : `${text}\n`);
  };
  const warn = (message: string): void => {
    notify(`${style.yellow("⚠")} ${message}`);
  };

  // ── 3a. 설치 트리 자기 편집 고지 (DISTRIBUTION.md §6). **막지 않는다** —
  // neo-agent로 neo-agent를 개발하는 것이 주 용도이고, 설치 트리를 denylist에 넣으면
  // 그 용도가 죽는다. 크리덴셜·메모리 denylist와 성격이 다르다: 그쪽은 에이전트가
  // 접근할 이유가 없는 영역이고, 여기는 접근하는 것이 목적인 영역이다.
  //
  // **배너가 아니라 여기인 이유** [구현 판정 2026-08-09]: 이것은 상태가 아니라
  // **판정**이다(realpath 둘의 세그먼트 비교). 5b의 셸 판정과 같은 규율로 판정이
  // 일어난 자리에서 알린다(판정 C-7) — 배너에 실리는 도구 목록·메모리 규모는 계산
  // 없이 읽어 낸 이 세션의 구성 사실이고, 배너는 `run()`을 부르기 전에는 보이지
  // 않아 조립만 세우는 경로에서는 사라진다. 판정 대상인 `boundary`가 3단계에서
  // 막 만들어졌으므로 자리도 여기가 가장 가깝다(`notify`가 이 줄 위에서야 준비되는
  // 것은 REPL 생성이 사이에 끼어서일 뿐, 저장소 경고 4단계와 같은 출력 경로다).
  //
  // **`warn`이 아니라 `notify`인 이유**: §6이 *"이 경고는 경계가 아니라 고지다"*라고
  // 못박았다. ⚠ 노랑은 사용자가 무언가 대응해야 할 때 쓰는 표시이고, 여기서 대응할
  // 일은 없다 — 의도한 배치이며 기동은 그대로 진행한다.
  if (deps.installRoot !== undefined) {
    const overlap = describeInstallTreeOverlap(deps.installRoot, boundary.root);
    if (overlap !== undefined) notify(style.dim(overlap));
  }

  // ── 3b. 메모리 로드 — 1회 읽어 **동결**한다 (MEMORY.md §2.2·§3.1)
  //
  // **4보다 앞인 것이 계약이다**(§2). 시스템 프롬프트가 스냅샷을 **인자로** 필요로
  // 하므로 프롬프트 조립 전에 로드가 끝나야 하고, 프롬프트는 5(세션 생성)·6(Agent
  // 생성)으로 함께 흘러간다. 저장소(4)보다 앞인 것에는 이득이 있다 — **로드 실패는
  // 기동 실패**인데(§2.2: 읽기 실패 ≠ 빈 메모리. 빈 것으로 읽고 첫 쓰기에서 덮으면
  // 메모리가 조용히 소실된다) 이 시점엔 아직 연 자원이 없어 정리할 것 없이 종료된다.
  // 그래서 여기서는 잡지 않는다: `loadMemory`가 던지면 `startCli`가 그대로 던지고
  // `runCli`가 EXIT_STARTUP_FAILED로 옮긴다.
  //
  // 권한 경고는 **경고일 뿐 진행한다**(§2.2 4행) — 메모리는 시크릿이 아니라
  // 크리덴셜의 fail-closed와 의도적으로 다르다.
  const memoryDir = defaultMemoryDir(deps.home);
  const memory = loadMemory({ dir: memoryDir, onWarning: warn });

  // 블록은 **내용이 있을 때만** 붙는다 — `renderMemoryBlock`의 `undefined`가 그
  // 판정이고, 여기서 빈 문자열로 뭉개면 §3.2가 깨진다.
  const memoryBlock = renderMemoryBlock(memory);
  const systemPrompt = buildSystemPrompt(boundary.root, memoryBlock);

  // ── 4. 저장소 열기 — 권한·WAL 경고 핸들러 주입 (SESSION-STORE §6·§7)
  const store = factories.openStore({
    home: deps.home,
    onWarning: (warning: StoreWarning) => warn(warning.message),
  });

  try {
    // ── 5. 세션 생성 또는 재개 (§6)
    const resumeContext = { workspaceRoot: boundary.root, systemPrompt, model: config.model };
    const opened =
      args.kind === "resume"
        ? openResumed(store, args.prefix, resumeContext)
        : { session: store.createSession(resumeContext), messages: [] as AgentMessage[] };

    // ── 5b. executor 선택 — sandbox 설정 + Docker 가용성 판정 (§2, SANDBOX.md §3).
    // **6단계보다 앞인 것이 계약이다**: 도구 목록은 `new Agent()` 시점에 동결되므로
    // 등록 여부 판정이 그 전에 끝나야 한다.
    const shell = await selectShell({
      config,
      factories,
      env: deps.env,
      secretValues: credentials.secretValues,
      workspaceRoot: boundary.root,
      // 판정 결과는 **이 단계에서** 화면에 나간다(판정 C-7). `repl.start()` 전이지만
      // 저장소 경고(4단계)가 이미 쓰는 경로 그대로다 — 입력 라인이 없으니 지킬 것도 없다.
      notify,
      warn,
    });

    // 5b 판정의 동결 — §7.1 표에서 출처가 "5b 판정 동결"인 행(셸이 호스트에서 도는 중임).
    //
    // **`unavailable`은 호스트 실행이 아니다.** `sandbox: "on"`인데 Docker를 쓸 수 없는
    // 갈래에서는 셸 도구가 **아예 등록되지 않으므로**(바로 위 `selectShell`) 호스트에서
    // 도는 것이 없다. 그 갈래를 참으로 세우면 상태줄이 "격리 없이 도는 셸이 있다"고
    // 거짓말하고, 그것은 §7.1이 이 항목을 계약으로 올린 근거(§2.6의 심각도 순서)를
    // 정확히 뒤집는 방향의 오보다. §7.1이 든 항목의 문면도 `sandbox: "off"` 하나만 든다.
    //
    // 이 값도 갱신 계기가 "없음(고정)"이다 — 판정은 세션 시작 시 1회이고 재판정 경로가
    // 없다(`selectShell` 선언부). 그래서 부르는 자리도 하나다.
    repl.setStatus({ shellOnHost: shell.wiring.kind === "host" });

    // ── 6. Agent 생성 — 도구 + 게이트를 beforeToolCall에 배선
    // 실행자·도구·모델 클라이언트·게이트·allowlist는 **세션이 바뀌어도 그대로**다.
    // 설정은 시작 시 동결됐고(SAFE-DEFAULTS §4) 워크스페이스도 프로세스 수명 내내
    // 같다. 세션마다 새로 만들어지는 것은 Agent 하나뿐이다(코어 §4).
    //
    // **도구 배열은 게이트 뒤에서 만든다** — `remember`가 `() => gate.isTainted()`를
    // 받아야 하는데(§4.1: 값이 아니라 **함수**), 게이트보다 앞에서 조립하면 그 자리에
    // 쓸 것이 없다. 순서가 이 한 곳에서만 정해지므로 배열의 순서 계약은 그대로다.
    const modelClient = factories.createModelClient({
      apiKey: credentials.apiKey,
      model: config.model,
    });

    // 압축 판정이 쓰는 컨텍스트 창 — **배선 시 1회 조회**한다(PROVIDERS §3).
    // 미지 모델은 보수 기본값 + 기동 시 경고가 계약이다: 추정값으로 판정하고 있다는
    // 사실을 감추면 사용자는 압축이 늦는 이유를 알 수 없다(ARCHITECTURE §2.6).
    const contextWindow = contextWindowForModel(config.model);
    if (!contextWindow.known) {
      warn(
        `모델 "${config.model}"의 컨텍스트 창을 모른다 — ` +
          `${contextWindow.tokens.toLocaleString("en-US")} 토큰으로 가정하고 자동 압축을 판정한다.`,
      );
    }

    const allowlist = createAllowlistStore(defaultAllowlistPath(deps.home), { onWarning: warn });

    // 승인 프롬프트. **주어지면 그대로 쓰고, 없으면 오늘 그대로** 터미널 프롬프트를
    // 만들어 입력 소유권 이양으로 감싼다(§8 approval-wait) — `CliDeps.approvalPrompt`
    // 선언부가 그 갈래의 근거를 든다.
    //
    // **주입된 것을 감싸지 않는 것이 계약의 이행이다**(§1). 감싸면 REPL 없는 호스트가
    // 준 프롬프트도 터미널의 입력 상태 머신을 지나게 되고, 그 순간 조립이 «어디로
    // 묻는가»를 넘어 «어떻게 입력을 뺏는가»까지 알게 된다.
    const prompt: ApprovalPrompt = deps.approvalPrompt ?? createReplApprovalPrompt(io, repl);

    const gate = factories.createGate({
      mode: config.approvalMode,
      denyRules: config.denyRules,
      // **각 패키지가 자기 도구의 프로필을 소유하고 호스트가 병합한다**
      // (TOOLS-INTERFACE §5). `tools`가 자기가 만들지도 않은 `web_fetch`를 선언하면
      // "테이블에 없는 도구는 fail-closed"의 책임 소재가 흐려진다.
      // `MEMORY_TOOL_GATE_PROFILES`가 여기 있는 이유는 같다 — **등록하지 않는 것은
      // 중립이 아니다**(APPROVAL-GATE §3): 미등록 도구는 `unknown`으로 fail-closed라,
      // 빠뜨리면 메모리 저장마다 승인 프롬프트가 뜬다. 판정은 자동 허용이다(MEMORY §5).
      toolProfiles: {
        ...TOOL_GATE_PROFILES,
        ...WEB_TOOL_GATE_PROFILES,
        ...MEMORY_TOOL_GATE_PROFILES,
      },
      // 도구가 쓰는 것과 **같은 인스턴스**(TOOLS-INTERFACE §3).
      classifier: boundary,
      allowlist,
      prompt,
    });

    // **`web_fetch`와 `remember`는 항상 등록되고 위치가 고정이다.** 파일 3종 →
    // (shell) → web_fetch → remember 순서는 구성과 무관하며, 순서가 곧 모델 페이로드의
    // 바이트 안정성이다(불변 조건 6). `remember`가 말미인 것은 `MEMORY.md` §4.4다.
    const tools: AgentTool[] = [
      ...factories.createTools({
        boundary,
        executor: shell.executor,
        includeShell: shell.wiring.kind !== "unavailable",
      }),
      factories.createWebTool(),
      factories.createMemoryTool({
        dir: memoryDir,
        // **늦은 바인딩이 계약이다**(MEMORY §4.1): 생성 시점에 `gate.isTainted()`를
        // 호출해 `boolean`을 캡처하면 오염 정책이 기동 시점 값으로 굳어, 웹을 읽은
        // 런에서도 메모리 쓰기가 통과한다. 게이트가 판정의 소유자로 남는다.
        isRunTainted: () => gate.isTainted(),
      }),
    ];

    /**
     * 훅 배선 — **게이트는 어느 훅도 소유하지 않는다**(APPROVAL-GATE §4).
     *
     * 오염 추적이 훅이 아니라 평범한 메서드인 이유가 여기서 보인다: `afterToolCall`의
     * 원래 소비자는 출력 후처리(트렁케이션)이고(CORE-INTERFACE §7 — 훅 소비자는 각각
     * 하나), 게이트가 그것을 가져가면 호스트가 합성을 강요받는다. **나중에 출력
     * 후처리가 붙는 자리가 바로 이 함수 안이다** — 그때도 `noteToolResult`는 남는다.
     *
     * **모든 도구 결과에 대해 부른다.** 조건을 붙이면(예: `web_fetch`만) 오염이 조용히
     * 새고, 그 순간 allowlist 무효화 정책은 있으나 마나가 된다(WEB-ACCESS §5).
     * 판정 근거는 결과의 `source` 하나이며 그 필터링은 게이트가 한다.
     */
    const hooks: AgentHooks = {
      beforeToolCall: gate.beforeToolCall,
      afterToolCall: async (ctx) => {
        gate.noteToolResult(ctx.result);
        return undefined;
      },
    };

    const renderer = createRenderer(out);
    /**
     * 추가 구독자를 **조립 시점에 한 번 복사해 고정한다**(§1 — `CliDeps`는 조립이
     * 만들지 않고 그대로 쓰는 값을 여는 표면이다).
     *
     * **[미규정]** 조립이 끝난 뒤 호스트가 이 배열을 변형했을 때 그것이 다음 Agent에
     * 반영되는가는 정본이 정하지 않았다. 복사해 두면 세션마다 구독자 집합이 달라지는
     * 상태가 아예 성립하지 않으므로, 문서가 정할 때까지 좁은 쪽을 잡는다.
     */
    const extraListeners: readonly AgentEventListener[] = [...(deps.listeners ?? [])];
    let runtime: SessionRuntime | undefined;

    const activate = (
      session: StoredSession,
      messages: readonly AgentMessage[],
    ): SessionRuntime => {
      const agent = new Agent({
        session: { systemPrompt, tools, messages: [...messages] },
        modelClient,
        hooks,
      });

      // ── 7. 구독 배선 — **저장소가 먼저, 렌더러가 나중**(SESSION-STORE §4).
      // 리스너는 구독 순서대로 await되므로(코어 §3) 이 순서가 곧 "사용자가 화면에서
      // 본 것은 이미 저장된 것"이다. 뒤집으면 저장에 실패한 메시지가 화면에는 남는다.
      const detachStore = store.attach(agent, session.id);
      /**
       * 호스트의 이벤트 리스너 — 렌더링 + **런 시작의 오염 초기화**(APPROVAL-GATE §4)
       * + **상태줄의 사용량 갱신**(`CLI-INTERFACE.md` §7.1).
       *
       * `agent_start`는 **세션마다 새로 만들어지는 이 Agent의 이벤트**다. 그래서 구독이
       * `activate()`와 같은 수명에 붙어야 하고, `/new`·`/resume`·압축의 Agent 교체를
       * 자동으로 따라간다. 리스너가 붙지 않은 Agent가 생기면 그 세션은 **오염이 영원히
       * 안 풀린다** — 게이트도 allowlist도 세션이 바뀌어도 그대로이므로(위 주석) 오염
       * 상태 역시 프로세스 수명 동안 하나이고, 그래서 런 시작 초기화가 필요하다.
       * `turn_end`도 같은 Agent의 이벤트이므로 **세션 교체 뒤에도 갱신이 이어지는 근거가
       * 정확히 이 수명**이다: 등록 자리를 `activate()` 밖으로 옮기면 `/new`·`/resume` 뒤
       * 사용량이 조용히 갱신을 멈춘다(§2.6 침묵 실패).
       *
       * 오염 초기화를 별도 구독으로 두지 않고 이 리스너에 합친 것은
       * `docs/CLI-INTERFACE.md` §7.1의 규정이다(2026-08-21 확정 — 그전까지 구독 수가
       * EP-5 미규정이었다): 이벤트에 얹히는 부수 상태 갱신은 구독을 늘리지 않고 렌더러
       * 리스너 안에 합류한다. 리스너 하나가 늘면 코어가 await하는 대상이 하나 늘어 런의
       * 실패 표면도 함께 는다(§7 — 리스너 예외는 런을 실패시킨다). 초기화가 렌더링보다
       * 앞인 것은 화면 출력 중 예외가 나도 오염이 이미 풀려 있게 하기 위해서다.
       *
       * **상태줄 갱신도 같은 규정을 따른다.** 별도 구독으로 세우면 상태줄 조립의 버그
       * 하나가 **에이전트 런 전체를 실패시킨다** — §7.1이 구독 미증가의 근거로 든 것이
       * 그것이고, 상태줄은 화면 세부라 런을 죽일 값이 전혀 없다. 방어는 두 겹이다:
       * 여기서 리스너를 늘리지 않는 것과, `formatStatus`가 전 입력에 대해 전역이라
       * 던지지 않는 것(`status.ts` 선언부 — §7.1의 «던지지 않는 전함수» 조건).
       *
       * 갱신이 렌더링보다 앞인 것도 초기화와 같은 이유다 — 렌더러가 usage 한 줄을 쓰다
       * 예외가 나도 상태줄에는 이미 반영돼 있다. **그 한 줄을 상태줄이 대체하지 않는다**:
       * §7 표의 `turn_end` 행은 그대로 살아 있고, 상태줄이 하는 일은 *"고지가 아니라
       * 지속"*이라 그것이 스크롤로 밀려난 뒤에도 계속 보이게 하는 것뿐이다(§7.1).
       *
       * **타이머가 아니라 이벤트다**(§7.1 — 시계를 두지 않는다). 값이 바뀌는 자리는
       * 이벤트가 도착한 이 지점 하나이고, 여기에도 호출되는 쪽에도 주기 실행이 없다.
       */
      const detachRenderer = agent.subscribe((event: AgentEvent, signal: AbortSignal) => {
        if (event.type === "agent_start") gate.resetTaint();
        if (event.type === "turn_end") repl.setStatus({ usage: event.message.usage });
        return renderer(event, signal);
      });

      /**
       * 추가 구독자 — **저장소·렌더러 뒤**(§1 — 「순서는 주입 목록이 아니라 구조가
       * 정한다」). 앞의 둘이 이 줄 **위**에 있는 것이 그 강제의 실체다: 주입 목록이
       * 어떤 순서로 오든 `store.attach`를 앞지를 자리가 없다.
       *
       * **여기서 예외를 감싸지 않는다**(§1 — 「추가 구독자는 자기 예외를 자기가
       * 처리한다」). 감싸면 렌더러와의 갈래가 조립에서 지워지고, 삼킬지 말지의 판단이
       * 구독자에서 조립으로 넘어온다. 삼키지 않는 구독자를 주면 그 예외는 런을
       * 끝낸다(`CORE-INTERFACE.md` §3) — 막는 것은 주는 쪽 책임이다.
       */
      const detachExtras = extraListeners.map((listener) => agent.subscribe(listener));

      // 세션 id 접두 — §7.1 표에서 갱신 계기가 "`/new`·`/resume`"인 행.
      // **사용량 비움**도 같은 호출이다 — §7.1 표의 사용량 행이 갱신 계기로 든 둘 중
      // 뒤쪽인 «Agent 교체(§6) 시 비움»(2026-08-21 확정). 앞쪽인 `turn_end`는 위 구독이다.
      //
      // **`activate()` 안이 그 계기 전부를 덮는 유일한 자리다.** `/new`·`/resume`도,
      // 압축의 분기도 전부 "폐기 후 재생성"이라 여기를 지난다(§6 · `COMPACTION.md` §6이
      // 압축 전용 교체 경로를 금지한 결과다). 호출부마다 따로 부르면 그중 하나를
      // 빠뜨리는 날 상태줄이 **이전 세션의 id를 계속 보여준다** — 화면이 조용히 거짓이
      // 되는 형태이고, 위 구독이 `activate()` 수명에 붙어 있는 것과 같은 이유로 여기다.
      // 두 필드가 한 호출인 것도 그 근거다: 갈라 부르면 계기가 둘이 되고, 그중 하나만
      // 옮겨 가는 날 **새 세션 id 옆에 떠난 세션의 사용량**이 선다.
      //
      // **왜 비우는가**(§7.1 2026-08-21 판정 — 사용량은 Agent 교체를 넘지 못한다).
      // 사용량이 세부로 분류된 근거는 «모르면 물어보면 되는 것»인데, 그 근거는 값이
      // **없을** 때만 선다 — 떠난 세션의 값이 새 세션 id와 한 행에 나란히 서면
      // 사용자는 모르는 것이 아니라 틀리게 안다. 비우는 비용은 없다:
      // «항목 없음은 이미 이 절의 정상 상태다».
      //
      // **`undefined`가 비움으로 동작하는 근거는 둘이고 둘 다 실물에서 확인했다.**
      // ① 병합이 `Object.assign(status, patch)`이고(`input.ts`의 `setStatus`),
      //    `Object.assign`은 값이 `undefined`인 **자기 열거 가능 키도 복사한다** —
      //    키가 빠지는 것이 아니라 `undefined`로 덮인다. ② 조립부가 그것을 항목 없음으로
      //    읽는다(`status.ts`의 `collectPieces` — `usage !== undefined`일 때만
      //    조각을 넣는다). 그래서 별도의 «클리어» API를 두지 않는다 — 표면만 하나 늘고
      //    `StatusFields`가 이미 «없음»을 표현한다.
      //
      // 구독 배선 **뒤**인 것은 활성화가 성공한 시점에만 값이 바뀌게 하기 위해서다.
      // 자르는 것은 `status.ts`가 한다 — 접두 길이는 표시 세부다(§7.1 지위 열).
      repl.setStatus({ sessionId: session.id, usage: undefined });

      return {
        session,
        agent,
        release: () => {
          // 구독의 역순으로 뗀다 — 붙인 순서(저장소 → 렌더러 → 추가 구독자)의 거울이다.
          for (let i = detachExtras.length - 1; i >= 0; i -= 1) detachExtras[i]?.();
          detachRenderer();
          detachStore();
        },
      };
    };

    const requireRuntime = (): SessionRuntime => {
      if (runtime === undefined) throw new Error("활성 세션이 없다.");
      return runtime;
    };

    runtime = activate(opened.session, opened.messages);

    /** `/new`·`/resume`의 실체 — 현재 Agent 폐기 후 재생성(§5) */
    const switchTo = async (
      session: StoredSession,
      messages: readonly AgentMessage[],
    ): Promise<void> => {
      const previous = requireRuntime();
      // 진행 중인 런과 그 리스너 settlement까지 기다린 뒤에야 구독을 끊는다 —
      // 먼저 끊으면 마지막 메시지가 저장되지 않는다(코어 §3의 settlement 계약).
      await previous.agent.waitForIdle();
      previous.release();
      runtime = activate(session, messages);
    };

    /**
     * 압축 컨트롤러(COMPACTION §3·§6·§7).
     *
     * 세션·트랜스크립트를 **함수로** 넘긴다 — 압축 자신이 세션을 교체하므로 값으로
     * 넘기면 두 번째 압축이 낡은 부모를 가리킨다. Agent 교체는 `/resume`·`/new`가
     * 쓰는 `switchTo` 그대로다: 압축 전용 교체 경로를 만들지 않는다(§6 3단계).
     */
    /**
     * 인플라이트 압축. 종료 시퀀스가 이것을 기다린다 — `CLI-INTERFACE.md` §8
     * `compacting` 행("압축을 기다린 뒤 끝낸다")의 이행 지점이다.
     *
     * **왜 `waitForIdle()`로 안 되는가.** 자동 압축은 `agent.prompt()`가 resolve된
     * 뒤에 불리므로(아래 `prompt` 핸들러 — 판정 E-45의 의도된 배치) 압축이 도는 동안
     * agent는 이미 idle이다. 그래서 §2의 `waitForIdle()`은 압축에 대해 아무것도
     * 말하지 않고, 기다리지 않으면 `store.close()`가 `branchSession`보다 먼저 간다.
     * 그 결과는 조용하다 — 압축 컨트롤러는 자기 실패를 삼키므로(`COMPACTION.md` §7)
     * 사용자는 요약이 사라진 것을 모른다(§2.6 침묵 실패). 2026-08-12 실측으로 확인된
     * 뒤 닫았다.
     *
     * **abort하지 않고 기다린다.** 취소는 Ctrl+C의 몫이고(§8 같은 행) Ctrl+D는
     * "더 이상 입력하지 않겠다"이지 "진행 중인 것을 버려라"가 아니다.
     */
    let inFlightCompaction: Promise<unknown> | undefined;

    const compaction = createCompactionController({
      settings: config,
      contextWindowTokens: contextWindow.tokens,
      client: modelClient,
      store,
      systemPrompt,
      model: config.model,
      notify,
      withCompaction: (run) => {
        const running = repl.withCompaction(run);
        inFlightCompaction = running;
        const clear = (): void => {
          // 자기 것만 지운다 — 뒤이어 시작된 압축의 핸들을 덮어 지우면 그것이
          // 기다림에서 빠진다.
          if (inFlightCompaction === running) inFlightCompaction = undefined;
        };
        running.then(clear, clear);
        return running;
      },
      runtime: {
        session: () => requireRuntime().session,
        messages: () => requireRuntime().agent.state.messages,
        switchTo,
      },
    });

    let resolveExit: () => void = () => undefined;
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });

    let closing = false;
    const shutdown = async (): Promise<void> => {
      if (closing) return;
      closing = true;

      const active = runtime;
      // 종료 시퀀스(§2): waitForIdle → (인플라이트 압축) → store.close → repl.close →
      // 세션 id와 재개 방법 표시. 압축 대기가 여기 있는 이유는 `inFlightCompaction`
      // 선언부에.
      //
      // REPL 반납은 §2 열거의 항목이 아니다 — 열거의 마지막 항목이 반납 **뒤**에
      // 나간다는 순서 계약(§2)을 이행하는 수단이고, 그 자리를 §2가 코드 쪽에 맡겼다.
      if (active !== undefined) {
        await active.agent.waitForIdle().catch(() => undefined);
        // 런이 끝난 직후 압축이 시작될 수 있어(같은 런 프로미스 안이다) 한 번으로는
        // 부족하다. 압축은 스스로 다음 압축을 열지 않으므로 이 루프는 끝난다.
        while (inFlightCompaction !== undefined) {
          await inFlightCompaction.catch(() => undefined);
        }
        active.release();
      }
      store.close();

      // 터미널을 먼저 돌려준 뒤 인사를 남긴다 — 이 뒤로는 입력 라인이 없다.
      // 이 순서는 계약이다(§2 · `input.ts`의 `close()` 선언).
      repl.close();
      if (active !== undefined) {
        io.output.write(formatFarewell(active.session.id));
      }
      resolveExit();
    };

    const actions = createActions({
      store,
      compaction,
      repl,
      io,
      out,
      notify,
      memoryDir,
      resumeContext,
      currentSessionId: () => runtime?.session.id,
      switchTo,
      shutdown,
    });
    const context: CliContext = { out, actions };

    bridge = {
      /**
       * **자동 압축 판정 시점 (a) — 런 종료 후 idle**(COMPACTION §3).
       *
       * `agent.prompt()`의 반환은 런 종료 + 리스너 settlement 뒤에 settle한다
       * (`ReplHandlers.prompt` 계약) — 즉 여기가 `agent_end` settlement 직후이고,
       * REPL이 `idle-input`으로 돌아가기 직전이다. 런 **도중**이 아니라는 것이
       * 계약의 요점이다: 분기는 새 Agent 생성이라 활성 런과 양립할 수 없다(§3).
       *
       * [미규정 E-45] 판정을 **런 프로미스 안**에 둘지 밖에 둘지는 계약이 정하지
       * 않았다. 안을 택한 근거: 밖(예: `startRun`의 finally)에 두면 입력 상태 머신이
       * 압축 정책을 알아야 하고, REPL이 `idle-input`으로 돌아간 뒤에 압축이 시작돼
       * **그 틈에 제출된 입력이 폐기될 Agent로 간다.** 안에 두면 그 틈 자체가 없다.
       * 대가는 압축이 런의 수명에 포함된다는 것이고, 그래서 컨트롤러는 자기 실패를
       * 스스로 처리하며 던지지 않는다(§7) — 던지면 REPL이 "런 실패"로 표시해 실패의
       * 출처가 어긋난다.
       */
      prompt: async (text) => {
        await requireRuntime().agent.prompt(text);
        await compaction.auto();
      },
      steer: (text) => {
        requireRuntime().agent.steer({ role: "user", content: [{ type: "text", text }] });
      },
      abort: () => requireRuntime().agent.abort(),
      dispatch: (line) => dispatchSlashCommand(line, context),
      requestExit: () => {
        void shutdown();
      },
    };

    const parts: CliParts = {
      config,
      credentials,
      boundary,
      store,
      allowlist,
      memory,
      tools,
      shell: shell.wiring,
      repl,
      get session(): StoredSession {
        return requireRuntime().session;
      },
      get agent(): Agent {
        return requireRuntime().agent;
      },
    };

    return {
      parts,
      async run(): Promise<void> {
        // ── 8. REPL 진입
        notify(startupBanner(opened.session, config, boundary.root, tools, memory, memoryBlock));
        if (opened.messages.length > 0) {
          // **재개 직후 어디까지 진행된 세션인지가 화면에 보여야 한다**(§6).
          notify(style.dim("── 이어가는 대화"));
          renderTranscript(out, opened.messages);
          notify(style.dim("──"));
        }
        repl.start();

        // **자동 압축 판정 시점 (b) — 재개 직후**(COMPACTION §3): 한도 근처에서
        // 종료한 세션을 다시 열 때. `repl.start()` 뒤인 것은 Ctrl+C 취소가 readline이
        // 붙어 있어야 닿기 때문이고, 그 사이에 입력이 끼어들 틈은 없다 — 판정은
        // 임계 미달이면 첫 await 전에 동기적으로 끝나고, 압축에 들어가면 그 즉시
        // `compacting`이라 제출이 거부된다.
        await compaction.auto();

        await exited;
      },
      shutdown,
    };
  } catch (error) {
    // 5~7단계에서 실패하면 이미 연 DB를 닫는다 — 부분 기동을 남기지 않는다(§2).
    store.close();
    throw error;
  }
}

/**
 * 조립부터 종료까지. bin 엔트리가 부르는 유일한 함수이며 종료 코드를 돌려준다.
 *
 * `--help`·`--version`은 시작 시퀀스를 타지 않는다 — 설정도 크리덴셜도 필요 없는
 * 조회이고, 키가 없다는 이유로 `--help`가 실패하면 안내가 안내를 못 한다.
 */
export async function runCli(deps: CliDeps): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(deps.argv);
  } catch (error) {
    deps.io.output.write(`${style.red(describeError(error))}\n`);
    return EXIT_USAGE;
  }

  if (args.kind === "help") {
    deps.io.output.write(`${USAGE}\n`);
    return EXIT_OK;
  }
  if (args.kind === "version") {
    deps.io.output.write(`${deps.version}\n`);
    return EXIT_OK;
  }

  let app: CliApp;
  try {
    app = await startCli(deps, args);
  } catch (error) {
    // 시작 단계의 실패는 원인과 다음 행동을 담아 종료한다(§2).
    deps.io.output.write(`${style.red(describeError(error))}\n`);
    return EXIT_STARTUP_FAILED;
  }

  await app.run();
  return EXIT_OK;
}

interface ResumeContext {
  workspaceRoot: string;
  systemPrompt: string;
  model: string;
}

/**
 * 재개 — `resolveSessionId` → `loadSession`(§6).
 *
 * 저장소가 거부하는 **워크스페이스 불일치**를 여기서 사용자 언어로 옮긴다. 저장소의
 * 에러는 모델·로그를 겸한 영어이고, 화면에 필요한 것은 "기록된 경로 + 그 디렉터리에서
 * 다시 실행"이다(§6). 세션 행을 먼저 읽어 두는 이유가 그 경로를 손에 쥐기 위해서다.
 * 세션의 워크스페이스를 새 경로로 바꾸는 재지정은 MVP에 없다.
 */
function openResumed(
  store: SessionStore,
  prefix: string,
  context: ResumeContext,
): { session: StoredSession; messages: AgentMessage[] } {
  const id = resolveOrExplain(store, prefix);
  const stored = store.getSession(id);

  try {
    return store.loadSession(id, context);
  } catch (error) {
    if (stored !== undefined && stored.workspaceRoot !== context.workspaceRoot) {
      throw new Error(
        `세션 ${stored.id.slice(0, ID_PREFIX_LENGTH)}은 다른 워크스페이스의 대화다.\n` +
          `  기록된 워크스페이스: ${stored.workspaceRoot}\n` +
          `  현재 워크스페이스:   ${context.workspaceRoot}\n\n` +
          "그 디렉터리에서 다시 실행하라 — 여기서 이어가면 과거 대화의 파일 경로가 전부 다른 파일을 가리킨다.",
      );
    }
    throw error;
  }
}

/**
 * 접두 해석 — **모호하면 후보를 표시하고 에러**(§6).
 *
 * 저장소도 모호한 접두를 거부하지만(조용히 하나를 고르지 않는다) 후보 목록까지
 * 만들지는 않는다 — 저장소는 표시를 모르기 때문이다(SESSION-STORE §1). 목록을
 * 붙이는 것이 UI의 몫이고, 붙여야 사용자가 "몇 글자를 더 쳐야 하는지" 알 수 있다.
 *
 * 접두 정규화(소문자)는 저장소 계약이라 여기서 다시 하지 않는다 — 후보를 고를
 * 때만 같은 규칙으로 맞춘다.
 */
function resolveOrExplain(store: SessionStore, prefix: string): string {
  try {
    return store.resolveSessionId(prefix);
  } catch (error) {
    const needle = prefix.trim().toLowerCase();
    const candidates = store.listSessions().filter((session) => session.id.startsWith(needle));

    if (candidates.length === 0) {
      throw new Error(`"${prefix}"로 시작하는 세션이 없다. /sessions로 목록을 볼 수 있다.`);
    }

    const lines = candidates.map(
      (session) =>
        `  ${session.id.slice(0, ID_PREFIX_LENGTH)}  ${formatTime(session.updatedAt)}  ${session.title ?? "(제목 없음)"}`,
    );
    throw new Error(
      `"${prefix}"에 해당하는 세션이 ${candidates.length}개다 — 글자를 더 붙여 하나로 좁혀라.\n${lines.join("\n")}\n` +
        `(원래 사유: ${describeError(error)})`,
    );
  }
}

interface ActionsEnv {
  store: SessionStore;
  /** `/compact`(수동)와 `/resume` 직후 판정(자동)이 같은 컨트롤러를 쓴다 */
  compaction: CompactionController;
  repl: Repl;
  io: TerminalIo;
  out: { write(text: string): void };
  notify(text: string): void;
  /** `/memory`가 읽는 디렉터리. 3b가 스냅샷을 뜬 곳과 **같은 경로**다 */
  memoryDir: string;
  resumeContext: ResumeContext;
  currentSessionId(): string | undefined;
  switchTo(session: StoredSession, messages: readonly AgentMessage[]): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * 슬래시 명령의 실제 동작(§5·§6).
 *
 * 레지스트리는 이 구현을 모른다 — 명령 표면(닫힌 목록·디스패치·`/help`·자동완성)과
 * 동작을 갈라 둔 자리가 여기다.
 */
function createActions(env: ActionsEnv): CliActions {
  const { store, notify, out } = env;

  return {
    async listSessions(): Promise<void> {
      const sessions = store.listSessions();
      if (sessions.length === 0) {
        notify(style.dim("저장된 세션이 없다."));
        return;
      }

      const current = env.currentSessionId();
      for (const session of sessions) {
        const marker = session.id === current ? style.cyan("*") : " ";
        const id = session.id.slice(0, ID_PREFIX_LENGTH);
        const title = session.title ?? style.dim("(제목 없음)");
        out.write(`${marker} ${id}  ${style.dim(formatTime(session.updatedAt))}  ${title}\n`);
      }
    },

    async resumeSession(prefix: string): Promise<void> {
      const opened = openResumed(store, prefix, env.resumeContext);
      await env.switchTo(opened.session, opened.messages);

      notify(style.dim(`── 세션 ${opened.session.id.slice(0, ID_PREFIX_LENGTH)} 이어가기`));
      if (opened.messages.length > 0) renderTranscript(out, opened.messages);
      notify(style.dim("──"));

      // **자동 압축 판정 시점 (b) — 재개 직후**(COMPACTION §3). 트랜스크립트를
      // 그린 뒤인 것은 사용자가 "어느 대화에 접속했는지"를 먼저 보고 나서 압축
      // 사실을 봐야 순서가 읽히기 때문이다(§6 표시 의무는 그다음이다).
      await env.compaction.auto();
    },

    async newSession(): Promise<void> {
      const session = store.createSession(env.resumeContext);
      await env.switchTo(session, []);
      notify(style.dim(`── 새 세션 ${session.id.slice(0, ID_PREFIX_LENGTH)}`));
    },

    async deleteSession(prefix: string): Promise<void> {
      const id = resolveOrExplain(store, prefix);
      const session = store.getSession(id);
      if (session === undefined) {
        notify(style.red(`세션 ${prefix}를 찾을 수 없다.`));
        return;
      }

      const isCurrent = id === env.currentSessionId();
      const title = session.title ?? "(제목 없음)";
      // **실행 전 대상 표시 + 확인 1회**가 계약이다(§6).
      notify(
        `${style.yellow("삭제 대상")} ${id.slice(0, ID_PREFIX_LENGTH)}  ${formatTime(session.updatedAt)}  ${title}` +
          (isCurrent ? `\n${style.yellow("이 세션은 지금 이어가고 있는 대화다.")}` : ""),
      );

      const confirmed = await env.repl.withApprovalWait(() =>
        askYesNo(env.io, "삭제하시겠나? 대화 기록은 남지만 목록에서 사라진다."),
      );
      if (!confirmed) {
        notify(style.dim("취소했다."));
        return;
      }

      store.deleteSession(id);
      notify(`${style.dim("삭제했다.")} ${id.slice(0, ID_PREFIX_LENGTH)}`);
    },

    /**
     * 검색(§5·`SEARCH.md` §5) — **저장소 조회와 표시가 전부다.**
     *
     * Agent도 세션도 건드리지 않는다: 검색 결과가 모델 컨텍스트로 들어가는 경로는
     * 없고(SEARCH §1 불변), 읽기 전용이라 입력 상태도 그대로다(§8 — `idle-input`에서
     * 디스패치되고 동기 완료된다).
     *
     * [미규정 EC-4] `SearchOptions.limit`을 CLI가 채우는지는 문서에 없다. 넘기지
     * 않는다 — 기본값은 `SEARCH.md` §4가 store 쪽에 둔 수치이고, CLI가 같은 값을
     * 복사해 두면 기본값이 두 곳이 된다. 사용자에게 노출되는 인자도 없다.
     *
     * 검색 실패는 여기서 잡지 않는다. `dispatchSlashCommand`가 명령 실행의 예외를
     * 표시하고 REPL을 계속하는 것이 이미 계약이고(§5), 검색 실패의 요구("에러 표시로
     * 끝낸다 — 대화·저장 무영향", SEARCH §5·§6)가 정확히 그 동작이다. 전용 처리를
     * 넣으면 같은 실패가 명령마다 다른 모양으로 보인다.
     */
    async search(query: string): Promise<void> {
      renderSearchResults(out, query, store.searchMessages(query));
    },

    /**
     * 수동 압축(§5). 자동 트리거와 **같은 경로**이고 임계 판정과 §7 자동 중지
     * 규칙만 건너뛴다(`COMPACTION.md` §3·§7) — 갈림은 trigger 인자 하나다.
     */
    async compact(): Promise<void> {
      await env.compaction.manual();
    },

    /**
     * `/memory` — **디스크 현재 상태**를 읽는다(`MEMORY.md` §7.2).
     *
     * 3b의 스냅샷을 재사용하지 않는 것이 계약이다: 세션 중 `remember`가 저장한 것이
     * 여기서는 보이고 프롬프트에는 없으며, 그 차이가 §3.1의 두 상태다. 스냅샷을
     * 그리면 사용자가 "저장했다는데 목록에 없다"를 보게 된다.
     *
     * **파일 경로를 함께 낸다.** `/memory edit`을 두지 않기로 한 판정(플랜 D-1)의
     * 대체가 이 한 줄이다 — CLI는 프로세스를 스폰할 수 없고(§1 금지 모듈), *사용자가
     * 자기 에디터로 편집하는 것이 큐레이션 정본*이라는 §7.2의 실질은 경로만 알려주면
     * 그대로 성립한다.
     *
     * **표시는 사용자 언어다**(§7.4 A-14의 수신자 규칙) — 도구 설명문·결과 텍스트가
     * 영어인 것과 갈리는 자리이고, 이 화면을 읽는 것은 사용자다.
     */
    async showMemory(): Promise<void> {
      const snapshot = loadMemory({ dir: env.memoryDir });
      const path = join(env.memoryDir, MEMORY_FILE_NAME);

      for (const entry of snapshot.entries) {
        // 번호는 `remove <n>`이 받는 것과 같다 — 사용자가 화면에서 센 것을 그대로
        // 칠 수 있어야 한다(§7.3: 항목 = 최상위 불릿 하나).
        out.write(`${style.cyan(String(entry.index).padStart(3))}  ${entry.content}\n`);
      }
      if (snapshot.entries.length === 0) {
        notify(style.dim(snapshot.exists ? "메모리에 항목이 없다." : "아직 메모리 파일이 없다."));
      }

      notify(
        style.dim(
          `메모리 ${snapshot.entries.length}항목 · ${formatChars(snapshot.chars)}/${formatChars(MEMORY_FILE_MAX_CHARS)}자\n` +
            `${path}\n` +
            "위는 디스크 현재 상태다 — 이 세션의 시스템 프롬프트는 시작 시 동결된 스냅샷을 쓰므로,\n" +
            "세션 중의 저장·편집·삭제는 이 대화에 반영되지 않고 다음 세션부터 반영된다.",
        ),
      );
    },

    /**
     * `/memory remove <n>` — 삭제는 `packages/memory`가 한다.
     *
     * **CLI는 파일 형식을 알지 않는다**: 항목이 무엇인지, 중첩 줄을 어떻게 다루는지,
     * 마지막 항목을 지운 뒤 파일을 어떻게 두는지(§7.4 A-12·A-13)는 전부 형식 소유자의
     * 판정이다. 여기서 하는 것은 번호의 범위 확인과 표시뿐이고, 그 확인조차 파싱이
     * 아니라 `loadMemory`가 돌려준 항목 수를 보는 것이다.
     *
     * 범위 밖을 **사용법 에러**로 만드는 이유는 §7.2다 — 저장소 함수도 거부하지만 그
     * 메시지는 모델을 겸한 영어이고, 화면에 필요한 것은 사용자 언어의 "몇 개까지 있다"이다.
     */
    async forgetMemory(index: number): Promise<void> {
      const before = loadMemory({ dir: env.memoryDir });
      const total = before.entries.length;
      if (index < 1 || index > total) {
        throw new Error(
          total === 0
            ? "메모리에 항목이 없다 — 지울 것이 없다."
            : `${index}번 항목이 없다 — 메모리에는 1번부터 ${total}번까지 있다.`,
        );
      }

      const removed = before.entries[index - 1]?.content ?? "";
      removeMemoryEntry(env.memoryDir, index);
      notify(`${style.dim("지웠다.")} ${index}  ${removed}`);
      notify(style.dim("이 세션의 시스템 프롬프트는 그대로다 — 다음 세션부터 반영된다."));
    },

    async exit(): Promise<void> {
      await env.shutdown();
    },
  };
}

/**
 * 확인 프롬프트 — 키 하나를 읽는다.
 *
 * **이 구간의 상태는 `approval-wait`이고 그것이 계약이다**(§8). `/delete`는 §6이
 * "실행 전 확인 1회"를 요구하는데, 그냥 물으면 readline이 살아 있어서 사용자가 친
 * "y"가 확인 응답이 아니라 **새 대화 입력으로 제출된다**. 그래서 입력 소유권
 * 이양(`withApprovalWait`)을 재사용한다.
 *
 * 한때 여기에 *"상태 이름이 실제 일어나는 일과 어긋난다"*는 물음이 열린 채 달려
 * 있었다 — `approval-wait`을 게이트 승인 전용으로 읽었기 때문이다. **그 독해가
 * 틀렸다**: §8은 이 상태의 소유자를 승인 프롬프트로 한정하지 않고 *REPL에게서 입력
 * 소유권을 넘겨받는 모든 프롬프트*로 정의하며, `/delete`의 확인을 그 예로 직접
 * 든다. 재사용은 차선이 아니라 §8이 요구하는 것 자체다 — *"확인 중 친 글자가 새
 * 대화 입력으로 제출되는 것을 막는 메커니즘은 하나여야 한다."*
 *
 * 상태 목록을 여기 옮겨 적지 않는다. 그 물음이 6일간 열린 채 남은 이유의 절반이
 * 옆에 적혀 있던 상태 **수**가 늙은 것이었다(압축이 넷째 상태를 더했다). 수가
 * 필요하면 §8을 본다 — §1:24가 같은 원리를 계약 절 자신에 대해 명문화했다.
 *
 * 승인 UI와 키 읽기가 겹치지만 합치지 않았다 — `ApprovalPrompt`는 게이트 계약이
 * 정한 모양이고, 확인 프롬프트는 그 계약과 무관한 CLI 자체의 물음이다.
 */
function askYesNo(io: TerminalIo, question: string): Promise<boolean> {
  const choices = `${style.bold("[y] 예  [n] 아니오")}\n`;
  io.output.write(`${question}\n${choices}`);

  return new Promise<boolean>((resolve) => {
    const rawMode = io.input.isTTY === true ? io.input.setRawMode : undefined;
    rawMode?.call(io.input, true);

    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString()) {
        // Ctrl+C는 REPL이 본다 — 여기서 "아니오"로 바꾸면 중단이 응답으로 둔갑한다.
        if (char === "\x03") continue;
        const key = char.toLowerCase();
        if (key !== "y" && key !== "n") {
          // 기본 선택은 없다. Enter도 여기로 온다(§9와 같은 규율).
          io.output.write(`${style.dim("  y 또는 n을 눌러라.")} ${choices}`);
          return;
        }
        io.input.off("data", onData);
        rawMode?.call(io.input, false);
        io.output.write(`${style.dim(`  → ${key === "y" ? "예" : "아니오"}`)}\n`);
        resolve(key === "y");
        return;
      }
    };

    io.input.on("data", onData);
    io.input.resume();
  });
}

/**
 * 설치 루트 계산 — `main.ts`가 있는 `packages/cli/src`에서 **상위 3단계**가 저장소
 * 루트다(`DISTRIBUTION.md` §6).
 *
 * **읽는 것은 `main.ts`가, 세는 것은 여기가 한다.** 주입 계약(§1: `process.*`와 자기
 * 위치를 읽는 곳은 하나)은 그대로다 — 이 함수는 주어진 문자열에 대한 순수 경로
 * 산술이고 파일시스템도 `process`도 건드리지 않는다. 산술을 여기 둔 이유는 §6이
 * 요구한 검증 때문이다: *"계산된 루트에 `pnpm-workspace.yaml`이 있음을 테스트가
 * 단정한다"*. `main.ts`는 top-level await로 CLI를 띄우는 파일이라 테스트가 임포트할
 * 수 없어, 계산이 그 안에 있으면 그 단정을 쓸 자리가 없다 — 레이아웃이 바뀌어 고지가
 * 조용히 죽는 것을 막는 **유일한 수단**이 사라진다.
 *
 * 입력은 realpath여야 한다. 정규화는 호출자의 몫이다(§6 — 비교 상대인
 * `WorkspaceBoundary.root`가 이미 realpath로 동결돼 있다).
 */
export function resolveInstallRoot(entryDirectory: string): string {
  return resolve(entryDirectory, "..", "..", "..");
}

/**
 * 세그먼트 단위 포함 판정. **문자열 prefix 비교를 쓰지 않는다** —
 * `/home/a/neo-agent-2`가 `/home/a/neo-agent`의 하위로 잡히는 고전적 오탐이고,
 * `TOOLS-INTERFACE.md` §3이 봉쇄 판정에서 같은 이유로 금지한 것이다. `path.relative`가
 * 세그먼트 의미론을 보장하므로 결과가 `..`로 시작하지 않는지만 보면 된다.
 *
 * 대소문자는 구분한다 — 여기서 오차의 방향은 "고지를 놓친다"이지 "막아야 할 것을
 * 놓친다"가 아니다(`workspace.ts`의 `isWithin`과 같은 판단).
 */
function isWithinSegments(root: string, target: string): boolean {
  if (target === root) return true;
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * 설치 트리 자기 편집 고지의 문면 — `DISTRIBUTION.md` §6. 겹치지 않으면 `undefined`.
 *
 * **두 사실을 모두 말한다**: ① 지금 워크스페이스와 neo-agent 자신의 설치 트리가
 * 겹친다 ② 편집한 코드는 **다음 기동부터** 적용된다. ②가 빠지면 사용자는 고친 것이 왜
 * 안 먹는지 모른다(§6이 명시적으로 금지한 누락이라 부분 통과가 없다).
 *
 * **겹침을 양방향으로 본다** [구현 판정 2026-08-09]. §6의 문장은 *"지금 워크스페이스가
 * neo-agent 자신의 설치 트리다"*라 워크스페이스가 설치 트리 **안**인 경우만 읽히지만,
 * 워크스페이스가 설치 트리를 **품는** 배치(`/home/x/neo-agent`에서 기동, 설치 트리는
 * `/home/x/neo-agent/neo-agent-main`)에서도 파일 도구가 닿는 곳에 돌고 있는 코드가 있다
 * — 이 저장소의 실제 배치가 그것이다. 고지는 경계가 아니므로 넓게 잡아 잃는 것이 없고,
 * 좁게 잡으면 §6이 막으려던 상황(고친 것이 왜 안 먹는지 모름)이 그대로 남는다.
 * 두 배치의 첫 문장이 다른 것은 **아는 것만 말하기 위해서**다.
 */
function describeInstallTreeOverlap(
  installRoot: string,
  workspaceRoot: string,
): string | undefined {
  const nextBoot =
    "편집한 코드는 다음 기동부터 적용된다 — 이미 로드된 모듈은 이 세션 중에 바뀌지 않는다.";

  if (isWithinSegments(installRoot, workspaceRoot)) {
    return `이 워크스페이스는 neo-agent 자신의 설치 트리다 — 여기서 고치는 파일이 지금 돌고 있는 코드다.\n${nextBoot}`;
  }
  if (isWithinSegments(workspaceRoot, installRoot)) {
    return (
      `이 워크스페이스 안에 neo-agent 자신의 설치 트리가 있다 — ${installRoot}\n` +
      `그 아래를 고치면 지금 돌고 있는 코드를 고치는 것이다. ${nextBoot}`
    );
  }
  return undefined;
}

/**
 * 시작 화면(§2·§2.6).
 *
 * **등록된 도구 집합이 보여야 한다** — 도구 수는 구성에 따라 다르고(§2), 숨겨진
 * 도구가 조용히 빠지면 사용자는 왜 안 되는지 모른다.
 *
 * **셸 상태의 경고는 여기 없다** (2026-08-09 판정 C-7 — `SANDBOX.md` §3·§5). Docker
 * 불가용 안내와 `sandbox: "off"` 표시는 판정이 일어난 자리(5b)에서 나간다: 시작
 * 단계의 경고는 전부 자기 단계에서 나가고(저장소 권한·WAL은 4단계, 컨텍스트 창은
 * 6단계), 배너에만 있으면 `run()`을 부르기 전에는 보이지 않는다.
 *
 * **메모리 규모 표시(`MEMORY.md` §7.1)는 반대로 여기다** [미규정 EP-8]. `MEMORY.md`는 "세션 시작
 * 화면"까지만 정하고 배너 안인지 밖인지를 정하지 않는다. 배너를 고른 근거는 성격이
 * 같기 때문이다 — 도구 목록과 마찬가지로 **경고가 아니라 이 세션의 구성 사실**이고,
 * 3b의 경고(권한)는 이미 자기 단계에서 나갔다. 5b가 자기 단계에서 나가는 이유(판정이
 * 일어난 자리에서 알린다)와도 충돌하지 않는다: 여기 실리는 것은 판정이 아니라 상태다.
 */
function startupBanner(
  session: StoredSession,
  config: CliConfig,
  workspaceRoot: string,
  tools: readonly AgentTool[],
  memory: MemorySnapshot,
  memoryBlock: string | undefined,
): string {
  const names = tools.map((tool) => tool.name).join(", ");
  const lines = [
    `neo-agent · 세션 ${session.id.slice(0, ID_PREFIX_LENGTH)} · ${config.model} · 승인 ${config.approvalMode}`,
    `${workspaceRoot} · /help`,
    `도구 ${tools.length}종: ${names}`,
  ];

  // **표시 유무의 판정 기준은 항목 수가 아니라 블록 부착 여부다**(§7.4 A-8b). 블록이
  // 싣는 것은 항목 목록이 아니라 파일 텍스트이므로(A-8) 불릿 0개인데 텍스트가 있는
  // 파일이 존재하고, `entries.length`로 판정하면 **프롬프트에는 실렸는데 화면에는
  // 아무 줄도 안 나오는** 상태가 생긴다 — 그것이 §2.6이 금지하는 것이다.
  // `메모리 0항목 · 320/4,000자`는 어긋남이 아니라 정직한 정보다.
  if (memoryBlock !== undefined) {
    lines.push(
      `메모리 ${memory.entries.length}항목 · ${formatChars(memory.chars)}/${formatChars(MEMORY_FILE_MAX_CHARS)}자`,
    );
  }

  return style.dim(lines.join("\n"));
}

function formatChars(value: number): string {
  return value.toLocaleString("en-US");
}

interface SelectShellEnv {
  config: CliConfig;
  factories: WiringFactories;
  env: NodeJS.ProcessEnv;
  secretValues: readonly string[];
  workspaceRoot: string;
  /** 5b의 판정 결과를 **그 자리에서** 알린다(판정 C-7) */
  notify(text: string): void;
  warn(message: string): void;
}

/**
 * 시작 시퀀스 5b — **셸 실행자 선택**(§2, `SANDBOX.md` §3).
 *
 * ```
 * sandbox === "off"                → HostShellExecutor (명시적 옵트아웃)
 * sandbox === "on" && Docker 가용   → DockerShellExecutor
 * sandbox === "on" && Docker 불가용 → 셸 도구를 등록하지 않고 두 갈래를 안내
 * ```
 *
 * **판정은 세션 시작 시 1회다.** 세션 중 Docker가 죽어도 도구 목록은 바뀌지 않고
 * 그때는 도구가 실행 실패로 보고한다(`SANDBOX.md` §3) — 목록을 동적으로 줄이는 것은
 * 프롬프트 캐시를 깨는 일이고, 이 귀결은 결함이 아니라 확정된 계약이다. 그래서
 * **재판정 경로를 만들지 않는다.**
 *
 * `sandbox: "off"`면 판정 자체를 하지 않는다 — 쓰지 않을 사실을 알아내려고 기동을
 * 늦출 이유가 없다.
 *
 * **판정 결과의 표시도 이 단계의 일이다**(판정 C-7). 세 갈래 전부가 화면에 남는다 —
 * 격리 여부는 사용자가 매 기동에 알아야 하는 사실이고(`SANDBOX.md` §5의 표시 의무),
 * 셸이 빠진 이유는 그 자리에서 말하지 않으면 나중에 "왜 안 되지"가 된다.
 */
async function selectShell(
  env: SelectShellEnv,
): Promise<{ wiring: ShellWiring; executor: ShellExecutor }> {
  const { config, factories } = env;

  if (config.sandbox === "off") {
    // 옵트아웃은 사용자의 선택이지만 **무엇을 포기했는지**는 매번 보여야 한다
    // (`SANDBOX.md` §5 — 표시 의무가 계약이고 문구는 재량).
    env.warn('shell은 이 머신에서 격리 없이 돈다 — sandbox: "off"로 선택한 상태다.');
    return {
      wiring: { kind: "host" },
      executor: factories.createExecutor({
        env: env.env,
        // 값 기반 env 스크러빙이 성립하려면 executor가 실제 값을 알아야 한다(§4 계약 3).
        secretValues: env.secretValues,
      }),
    };
  }

  const availability = await factories.probeDocker();
  if (availability.available) {
    env.notify(
      style.dim(
        `shell은 컨테이너에서 돈다 — ${config.sandboxImage} (docker ${availability.version}) · 네트워크 없음, 쓰기는 워크스페이스만`,
      ),
    );
    return {
      wiring: { kind: "sandbox", image: config.sandboxImage, dockerVersion: availability.version },
      executor: factories.createSandboxExecutor({
        // 이 문자열은 **검증을 마친 것**이다(`config.ts`의 `readSandboxImage`). 실행자는
        // `latest` 검사를 겸하지 않는다 — 같은 규칙의 에러가 두 곳에서 나면 문면이
        // 갈린다(`SANDBOX.md` §4).
        image: config.sandboxImage,
        workspaceRoot: env.workspaceRoot,
        // **시크릿 값을 넘기지 않는다.** 컨테이너는 env가 비어서 시작하고 넣을 것만
        // 넣는 화이트리스트이므로(`SANDBOX.md` §4) 뺄 것을 알려줄 필요가 없다.
      }),
    };
  }

  // **Docker 불가용은 에러가 아니다** — 경고를 표시하고 셸 없이 계속 기동한다(§3).
  // 두 갈래를 명시하되 `reason`을 원인으로 덧붙인다: 미설치와 권한 없음은 사용자가
  // 할 일이 전혀 다르므로, 원인이 안 보이면 두 갈래 안내가 실제로는 한 갈래만 가리킨다.
  env.warn(
    'shell 도구를 등록하지 않았다 — 샌드박스가 켜져 있는데(sandbox: "on") Docker를 쓸 수 없다.\n' +
      `${style.dim(`  원인: ${availability.reason}`)}\n` +
      "  두 갈래 중 하나를 고르면 셸이 돌아온다:\n" +
      "    1) Docker를 쓸 수 있게 한다 — 설치하거나, 데몬을 켜거나, 사용자를 docker 그룹에 넣는다(sudo usermod -aG docker $USER 후 재로그인).\n" +
      '    2) ~/.neo-agent/config.json에 { "sandbox": "off" }를 넣어 호스트 실행을 명시적으로 선택한다 — 그러면 셸 명령이 이 머신에서 격리 없이 돈다.\n' +
      `${style.dim("  그때까지 파일 도구와 web_fetch는 그대로 쓸 수 있다. 도구 목록은 세션 중에 바뀌지 않는다.")}`,
  );
  return { wiring: { kind: "unavailable", reason: availability.reason }, executor: absentShell() };
}

/**
 * 등록되지 않은 셸의 자리를 채우는 실행자.
 *
 * [미규정 EP-6] `createStandardTools`는 `executor`를 항상 요구한다(셸을 뺄 때만
 * 필요 없어지는 인자를 옵셔널로 바꾸면 "셸을 넣으면서 실행자를 안 준" 배선이 타입을
 * 통과한다 — 계약이 지키던 것을 런타임 검사로 내리는 일이다). 그래서 값을 주되
 * **불릴 수 없는 값**을 준다: 여기 도달했다는 것은 등록하지 않은 도구가 실행됐다는
 * 뜻이고, 그건 조용히 넘어갈 일이 아니라 배선 버그다.
 */
function absentShell(): ShellExecutor {
  return {
    async exec(): Promise<never> {
      throw new Error(
        "shell tool is not registered in this session (sandbox is on and Docker is unavailable); this executor must never run.",
      );
    },
  };
}

/**
 * 종료 표시(§2).
 *
 * "종료가 대화의 끝이 아니라 중단임을 화면에 남기는 것"이 목적이므로 재개 명령을
 * 그대로 복사해 쓸 수 있는 형태로 적는다.
 */
function formatFarewell(sessionId: string): string {
  const prefix = sessionId.slice(0, ID_PREFIX_LENGTH);
  return `\n${style.dim("세션이 저장됐다. 이어서 하려면:")}\n  neo-agent --resume ${prefix}\n`;
}

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
