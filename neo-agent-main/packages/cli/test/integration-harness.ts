/**
 * QA-B 소유 통합 하네스 — T-011 시나리오와 T-010 배선 계약의 공용 부품.
 *
 * **하네스를 새로 쓰는 이유는 전과 같다.** `packages/store/test/contract-harness.ts`도
 * QA-A의 `packages/cli/test/harness.ts`도 재사용하지 않는다 — 독립 검증의 결론이 다른
 * 작성자의 하네스 정확성에 의존하면 "둘 다 같은 오해를 공유하는" 경우를 잡지 못한다.
 * 여기의 모의 어댑터는 `docs/CORE-INTERFACE.md` §8만 보고 새로 썼다.
 *
 * 이 하네스가 조립하는 것은 **실물**이다: 실제 SQLite 저장소, 실제 승인 게이트,
 * 실제 워크스페이스 경계와 도구 4종, 실제 CLI 렌더러·승인 프롬프트·allowlist 파일.
 * 모의로 두는 것은 셋뿐이다 — 모델(`ScenarioModel`), 터미널 스트림, 그리고 승인
 * 응답 키다. 통합 시나리오가 모의 위에서 돌면 "부품은 다 맞는데 합치면 안 되는"
 * 경우를 잡지 못하기 때문이다.
 *
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PassThrough, Writable } from "node:stream";
import {
  createAllowlistStore,
  createApprovalPrompt,
  createRenderer,
  type OutputSink,
  type TerminalIo,
} from "@neo-agent/cli";
import {
  Agent,
  type AgentEventListener,
  type AgentHooks,
  type AgentMessage,
  type AgentTool,
  type AssistantMessage,
  type ModelAssistantMessage,
  type ModelClient,
  type ModelRequest,
  type ModelStreamEvent,
  type StopReason,
  type Unsubscribe,
} from "@neo-agent/core";
import {
  type AllowlistStore,
  type ApprovalPrompt,
  type ApprovalRequest,
  createApprovalGate,
} from "@neo-agent/gate";
import { openSessionStore, type SessionStore } from "@neo-agent/store";
import {
  createHostShellExecutor,
  createStandardTools,
  createWorkspaceBoundary,
  TOOL_GATE_PROFILES,
  type WorkspaceBoundary,
} from "@neo-agent/tools";

const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

export const SYSTEM_PROMPT = "QA-B 통합 시나리오";
export const MODEL_ID = "qa-b/scenario-1";

/** 한 턴의 대본 */
export interface ScenarioTurn {
  text?: string;
  toolCalls?: readonly { toolCallId: string; toolName: string; args: unknown }[];
  stopReason?: StopReason;
}

/**
 * 대본대로 재생하는 최소 `ModelClient`.
 *
 * §8의 계약만 지킨다: throw/reject하지 않고, `done.message`에 id가 없으며,
 * `usage`는 항상 실린다. 대본이 소진되면 계약을 깨는 throw 대신
 * `stopReason: "error"` done을 낸다 — 하네스가 계약을 어기면서 테스트를
 * 진단하지 않는다.
 */
export class ScenarioModel implements ModelClient {
  readonly modelId = MODEL_ID;
  /** 모델이 실제로 받은 요청들. "block reason이 모델에 닿았는가"의 관측 지점이다 */
  readonly requests: ModelRequest[] = [];
  #cursor = 0;
  readonly #script: readonly ScenarioTurn[];

  constructor(script: readonly ScenarioTurn[]) {
    this.#script = [...script];
  }

  get callCount(): number {
    return this.#cursor;
  }

  async *stream(request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    // 구조적 복사로 스냅샷을 잡는다 — 코어가 같은 배열을 계속 밀어 넣으므로
    // 참조를 그대로 들고 있으면 "그때 무엇을 봤는가"가 사후에 오염된다.
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
          errorMessage: `ScenarioModel: 대본 소진 (호출 ${this.#cursor}회 / 준비 ${this.#script.length}개)`,
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

/** 출력 검증용 싱크. 렌더러·승인 프롬프트가 같은 곳으로 쓴다 — 실제 화면과 같은 구조다 */
export class CaptureSink implements OutputSink {
  #chunks: string[] = [];

  write(text: string): void {
    this.#chunks.push(text);
  }

  /** 장식까지 포함한 원문. `display` 무가공 검증은 반드시 이쪽을 본다 */
  get raw(): string {
    return this.#chunks.join("");
  }

  /** ANSI를 벗긴 텍스트 — 장식과 무관한 내용 검증용 */
  get text(): string {
    return stripAnsi(this.raw);
  }

  clear(): void {
    this.#chunks = [];
  }
}

export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/** `CaptureSink`로 흘려보내는 최소 Writable — 승인 프롬프트가 받는 `TerminalIo.output` */
class SinkStream extends Writable {
  readonly #sink: CaptureSink;

  constructor(sink: CaptureSink) {
    super();
    this.#sink = sink;
  }

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#sink.write(String(chunk));
    callback();
  }
}

/** 렌더 시점에 그 메시지가 이미 DB에 있었는가 — §4 순서 계약의 관측 기록 */
export interface RenderProbe {
  messageId: string;
  savedAtRenderTime: boolean;
}

export interface Rig {
  sandbox: string;
  home: string;
  workspaceRoot: string;
  store: SessionStore;
  boundary: WorkspaceBoundary;
  tools: AgentTool[];
  allowlistPath: string;
  allowlist: AllowlistStore;
  hooks: AgentHooks;
  out: CaptureSink;
  io: TerminalIo;
  /** 게이트가 만든 `ApprovalRequest`들 — CLI가 받은 것 그대로 */
  promptRequests: ApprovalRequest[];
  /** 게이트가 만든 block 사유들 — "CLI가 자체 사유를 만들지 않는다"의 관측 지점 */
  blockReasons: string[];
  /** allowlist append 실패 경고 (§10) */
  allowlistWarnings: string[];
  /** 저장소 경고 (§7) */
  storeWarnings: unknown[];
  /** 승인 응답 키를 대본대로 밀어 넣는다. `ask` 순서대로 소비된다 */
  queueApprovalKeys(...keys: readonly string[]): void;
  messageRows(sessionId: string): { id: string; seq: number; role: string }[];
  cleanup(): void;
}

export interface RigOptions {
  approvalMode?: "manual" | "off";
  denyRules?: readonly string[];
  /**
   * allowlist 파일에 미리 놓을 키. **저장소가 생성되기 전에** 기록된다 —
   * allowlist는 생성 시 1회만 읽으므로(CLI-INTERFACE §10) 나중에 쓰면 이번
   * 프로세스에는 반영되지 않는다. 워크스페이스 경로를 인자로 받는 이유는 키에
   * 절대 경로가 들어가는데 그 경로가 rig 생성 시점에 정해지기 때문이다.
   */
  seedAllowlist?: (workspaceRoot: string) => readonly string[];
}

/**
 * `CLI-INTERFACE.md` §2의 시작 시퀀스 3~6단계를 손으로 조립한다.
 *
 * 배선을 `src/wiring.ts`에 맡기지 않고 손으로 하는 이유: 조립 지점을 통해 조립하면
 * **조립 지점의 버그가 시나리오의 전제를 바꿔** 무엇이 깨진 것인지 분간되지 않는다.
 * 여기서는 "문서가 규정한 순서대로 조립했을 때 통합 동작이 성립하는가"만 보고,
 * 조립 지점 자체의 계약(순서·주입점·인스턴스 공유)은 `wiring.contract.test.ts`가
 * 따로 검증한다.
 */
export function createRig(options: RigOptions = {}): Rig {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-int-")));
  const home = join(sandbox, "home");
  const workspaceRoot = join(sandbox, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  const storeWarnings: unknown[] = [];
  // 4. 저장소 열기 — 경고 핸들러 주입(SESSION-STORE §7)
  const store = openSessionStore({
    home,
    onWarning: (warning) => void storeWarnings.push(warning),
  });

  // 3. 워크스페이스 경계 — **도구와 게이트가 같은 인스턴스를 공유한다**(TOOLS §3).
  //    `home`을 샌드박스로 주입해야 `~/.neo-agent/**` denylist가 이 rig 안에서 성립한다.
  const boundary = createWorkspaceBoundary({ root: workspaceRoot, home });
  const executor = createHostShellExecutor({ env: {}, secretValues: [] });
  const tools = createStandardTools({ boundary, executor });

  const allowlistPath = join(home, ".neo-agent", "allowlist");
  const seeded = options.seedAllowlist?.(realpathSync(workspaceRoot)) ?? [];
  if (seeded.length > 0) {
    writeFileSync(allowlistPath, `${seeded.join("\n")}\n`, { mode: 0o600 });
  }
  const allowlistWarnings: string[] = [];
  const allowlist = createAllowlistStore(allowlistPath, {
    onWarning: (message) => void allowlistWarnings.push(message),
  });

  const out = new CaptureSink();
  const input = new PassThrough();
  // 승인 프롬프트와 렌더러가 같은 싱크로 나간다 — 실제 CLI와 같은 구조다.
  const io: TerminalIo = { input, output: new SinkStream(out) };

  const promptRequests: ApprovalRequest[] = [];
  const pendingKeys: string[] = [];
  const realPrompt = createApprovalPrompt(io);

  /**
   * 실제 CLI 승인 프롬프트를 감싼다. 대체하지 않는 이유: 시나리오 2가 재는 것이
   * **CLI가 `display`를 가공하지 않는가**이므로, 프롬프트를 모의로 갈면 그 계약이
   * 검증 대상에서 빠진다. 모의인 것은 사용자가 누르는 키뿐이다.
   *
   * 키를 `ask` 직후에 밀어 넣는 이유: `createApprovalPrompt`는 `new Promise`
   * 실행자 안에서 `input.on("data")`를 **동기로** 붙인다. 따라서 `ask()`가
   * 프라미스를 돌려준 시점에는 리스너가 이미 붙어 있다.
   */
  const prompt: ApprovalPrompt = {
    ask(request, signal) {
      promptRequests.push(request);
      const promise = realPrompt.ask(request, signal);
      const key = pendingKeys.shift();
      if (key !== undefined) input.write(key);
      return promise;
    },
  };

  const gate = createApprovalGate({
    mode: options.approvalMode ?? "manual",
    ...(options.denyRules === undefined ? {} : { denyRules: options.denyRules }),
    toolProfiles: TOOL_GATE_PROFILES,
    classifier: boundary,
    allowlist,
    prompt,
  });

  const blockReasons: string[] = [];
  const hooks: AgentHooks = {
    beforeToolCall: async (ctx, signal) => {
      const decision = await gate.beforeToolCall(ctx, signal);
      if (decision.decision === "block") blockReasons.push(decision.reason);
      return decision;
    },
  };

  // API를 우회해 행을 직접 보는 읽기 전용 연결. WAL이라 커밋된 것은 즉시 보인다.
  const admin = new DatabaseSync(join(home, ".neo-agent", "sessions.db"));

  return {
    sandbox,
    home,
    workspaceRoot,
    store,
    boundary,
    tools,
    allowlistPath,
    allowlist,
    hooks,
    out,
    io,
    promptRequests,
    blockReasons,
    allowlistWarnings,
    storeWarnings,
    queueApprovalKeys: (...keys) => void pendingKeys.push(...keys),
    messageRows: (sessionId) =>
      admin
        .prepare("SELECT id, seq, role FROM messages WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as { id: string; seq: number; role: string }[],
    cleanup: () => {
      try {
        admin.close();
      } catch {
        /* 이미 닫힘 */
      }
      try {
        store.close();
      } catch {
        /* 이미 닫힘 */
      }
      rmSync(sandbox, { recursive: true, force: true });
    },
  };
}

export interface WiredAgent {
  agent: Agent;
  model: ScenarioModel;
  /** `message_end`를 렌더할 때마다 "그 메시지가 이미 저장돼 있었는가"를 기록한다 */
  renderProbes: RenderProbe[];
  detach(): void;
}

export interface WireOptions {
  /** 과거 트랜스크립트 — 재개 시나리오에서 `loadSession` 결과를 싣는다 */
  messages?: AgentMessage[];
  /**
   * **의도적 역순 배선.** 순서 검사가 실제로 순서를 잰다는 것을 보이기 위한 대조군이며,
   * 계약이 허용하는 배선이 아니다(SESSION-STORE §4).
   */
  rendererFirst?: boolean;
}

/**
 * Agent를 만들고 §2 시퀀스 6~7단계를 배선한다 — **저장소가 먼저, 렌더러가 나중**.
 *
 * 렌더러는 감싸서 내보낸다. 감싼 이유는 §4 계약("사용자가 화면에서 본 것은 이미
 * 저장된 것")이 **관측 가능해야** 하기 때문이다: `message_end`를 그리는 순간 그
 * 메시지 행이 DB에 있는지를 그 자리에서 확인한다. 리스너 등록 순서를 들여다보는
 * 대신 계약의 **결과**를 재는 방식이고, 배선을 뒤집으면 실제로 깨진다(대조군 테스트).
 */
export function wireAgent(
  rig: Rig,
  sessionId: string,
  script: readonly ScenarioTurn[],
  options: WireOptions = {},
): WiredAgent {
  const model = new ScenarioModel(script);
  const agent = new Agent({
    session: {
      systemPrompt: SYSTEM_PROMPT,
      tools: rig.tools,
      ...(options.messages === undefined ? {} : { messages: options.messages }),
    },
    modelClient: model,
    hooks: rig.hooks,
  });

  const renderProbes: RenderProbe[] = [];
  const renderer = createRenderer(rig.out);
  const probing: AgentEventListener = (event, signal) => {
    if (event.type === "message_end") {
      const saved = rig.messageRows(sessionId).some((row) => row.id === event.message.id);
      renderProbes.push({ messageId: event.message.id, savedAtRenderTime: saved });
    }
    return renderer(event, signal);
  };

  let unsubStore: Unsubscribe;
  let unsubRenderer: Unsubscribe;
  if (options.rendererFirst === true) {
    unsubRenderer = agent.subscribe(probing);
    unsubStore = rig.store.attach(agent, sessionId);
  } else {
    unsubStore = rig.store.attach(agent, sessionId);
    unsubRenderer = agent.subscribe(probing);
  }

  return {
    agent,
    model,
    renderProbes,
    detach: () => {
      unsubStore();
      unsubRenderer();
    },
  };
}
