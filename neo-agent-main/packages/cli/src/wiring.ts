/**
 * 조립(composition root) — `docs/CLI-INTERFACE.md` §2·§5·§6.
 *
 * **코어·도구·게이트·저장소는 서로를 모른다.** 그 계약들(`CORE-INTERFACE.md` §1,
 * `TOOLS-INTERFACE.md` §1, `APPROVAL-GATE.md` §1, `SESSION-STORE.md` §1)은 전부
 * "결합은 호스트의 배선 한 곳"을 전제하며, 그 한 곳이 이 파일이다.
 *
 * 여기에도 `process.*` 참조는 없다 — argv·env·cwd·home·스트림을 전부 주입받는다.
 * `process`를 만지는 곳은 bin 엔트리(`main.ts`) 하나다. 그래야 조립 자체를 모의
 * 스트림과 임시 디렉터리로 검증할 수 있다.
 */

import { Agent, type AgentMessage, type AgentTool, type ModelClient } from "@neo-agent/core";
import {
  type AllowlistStore,
  type ApprovalGateConfig,
  type ApprovalPrompt,
  createApprovalGate,
} from "@neo-agent/gate";
import {
  anthropicProvider,
  contextWindowForModel,
  NEO_AGENT_USER_AGENT,
} from "@neo-agent/providers";
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
import { createAllowlistStore, defaultAllowlistPath } from "./allowlist.ts";
import { createApprovalPrompt } from "./approval-ui.ts";
import { type CliArgs, parseArgs, USAGE } from "./args.ts";
import { type CompactionController, createCompactionController } from "./compact.ts";
import { type CliConfig, defaultConfigPath, loadConfig } from "./config.ts";
import { defaultCredentialsPath, type LoadedCredentials, loadCredentials } from "./credentials.ts";
import { createRepl, type Repl } from "./input.ts";
import { type CliActions, type CliContext, dispatchSlashCommand } from "./registry.ts";
import { createRenderer, renderTranscript } from "./renderer.ts";
import { renderSearchResults } from "./search.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { style, type TerminalIo } from "./terminal.ts";

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
  createExecutor(options: HostShellExecutorOptions): ShellExecutor;
  createTools(options: StandardToolsOptions): AgentTool[];
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
  factories?: Partial<WiringFactories>;
}

/** 조립된 부품. 배선 계약을 검증하는 쪽이 인스턴스 동일성을 확인할 수 있게 연다 */
export interface CliParts {
  config: CliConfig;
  credentials: LoadedCredentials;
  boundary: WorkspaceBoundary;
  store: SessionStore;
  allowlist: AllowlistStore;
  tools: readonly AgentTool[];
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
    createTools: createStandardTools,
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
  const systemPrompt = buildSystemPrompt(boundary.root);

  // REPL을 먼저 만들되 진입(start)은 8단계로 미룬다. 저장소 열기부터 경고가 나올 수
  // 있고 그 경고도 **라인 안전 출력**으로 나가야 하기 때문이다 — readline을 붙이기
  // 전의 `repl.write`는 출력으로 곧장 흐른다(입력 라인이 없으니 지킬 것도 없다).
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

  const out = { write: (text: string): void => repl.write(text) };
  const notify = (text: string): void => {
    out.write(text.endsWith("\n") ? text : `${text}\n`);
  };
  const warn = (message: string): void => {
    notify(`${style.yellow("⚠")} ${message}`);
  };

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

    // ── 6. Agent 생성 — 도구 4종 + 게이트를 beforeToolCall에 배선
    // 실행자·도구·모델 클라이언트·게이트·allowlist는 **세션이 바뀌어도 그대로**다.
    // 설정은 시작 시 동결됐고(SAFE-DEFAULTS §4) 워크스페이스도 프로세스 수명 내내
    // 같다. 세션마다 새로 만들어지는 것은 Agent 하나뿐이다(코어 §4).
    const executor = factories.createExecutor({
      env: deps.env,
      // 값 기반 env 스크러빙이 성립하려면 executor가 실제 값을 알아야 한다(§4 계약 3).
      secretValues: credentials.secretValues,
    });
    const tools = factories.createTools({ boundary, executor });
    const modelClient = factories.createModelClient({
      apiKey: credentials.apiKey,
      model: config.model,
    });

    // 압축 판정이 쓰는 컨텍스트 창 — **배선 시 1회 조회**한다(COMPACTION §8).
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

    // 승인 프롬프트는 REPL에게서 입력 소유권을 넘겨받아 묻는다(§8 approval-wait).
    const basePrompt = createApprovalPrompt(io);
    const prompt: ApprovalPrompt = {
      ask: (request, signal) => repl.withApprovalWait(() => basePrompt.ask(request, signal)),
    };

    const hooks = factories.createGate({
      mode: config.approvalMode,
      denyRules: config.denyRules,
      toolProfiles: TOOL_GATE_PROFILES,
      // 도구가 쓰는 것과 **같은 인스턴스**(TOOLS-INTERFACE §3).
      classifier: boundary,
      allowlist,
      prompt,
    });

    const renderer = createRenderer(out);
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
      const detachRenderer = agent.subscribe(renderer);

      return {
        session,
        agent,
        release: () => {
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
    const compaction = createCompactionController({
      settings: config,
      contextWindowTokens: contextWindow.tokens,
      client: modelClient,
      store,
      systemPrompt,
      model: config.model,
      notify,
      withCompaction: (run) => repl.withCompaction(run),
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
      // 종료 시퀀스(§2): waitForIdle → store.close → 세션 id와 재개 방법 표시.
      if (active !== undefined) {
        await active.agent.waitForIdle().catch(() => undefined);
        active.release();
      }
      store.close();

      // 터미널을 먼저 돌려준 뒤 인사를 남긴다 — 이 뒤로는 입력 라인이 없다.
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
      tools,
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
        notify(startupBanner(opened.session, config, boundary.root));
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

    async exit(): Promise<void> {
      await env.shutdown();
    },
  };
}

/**
 * 확인 프롬프트 — 키 하나를 읽는다.
 *
 * [미규정] **§8의 닫힌 상태 3개에 확인 프롬프트의 자리가 없다.** `/delete`는 §6이
 * "실행 전 확인 1회"를 요구하는데, 확인을 받는 동안 상태는 `idle-input`이고
 * readline이 살아 있어서 사용자가 친 "y"가 확인 응답이 아니라 **새 대화 입력으로
 * 제출된다**. 그래서 입력 소유권 이양(`withApprovalWait`)을 재사용했고, 그 구간의
 * 상태는 `approval-wait`이 된다 — 동작은 맞지만 상태 이름이 실제 일어나는 일과
 * 어긋난다. 상태를 넓힐지 이양 메커니즘의 이름을 일반화할지는 계약 소유자의 판정
 * 대상이다(T-007 보고의 질문 1).
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

function startupBanner(session: StoredSession, config: CliConfig, workspaceRoot: string): string {
  return style.dim(
    `neo-agent · 세션 ${session.id.slice(0, ID_PREFIX_LENGTH)} · ${config.model} · 승인 ${config.approvalMode}\n` +
      `${workspaceRoot} · /help`,
  );
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
