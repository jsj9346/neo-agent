/**
 * 제어 API — `docs/CORE-INTERFACE.md` §4.
 *
 * 큐 기반 상태 머신. `Agent`는 큐와 상태만 소유하고, 이벤트 시퀀스의 완결성은
 * `runAgentLoop`이 책임진다(§5).
 *
 * 프롬프트 캐시 보존(ARCHITECTURE §2.4)을 타입으로 강제한다 — `systemPrompt`와
 * `tools`는 생성자에서 받고 setter가 없다. 도구·프롬프트를 바꾸려면 새 세션
 * (새 인스턴스)이다. 레퍼런스는 `state.tools` 재할당을 허용하지만 우리는 막는다.
 */

import { AgentEventEmitter, type AgentEventListener, type Unsubscribe } from "./events.ts";
import type { AgentHooks } from "./hooks.ts";
import { runAgentLoop } from "./loop.ts";
import type { AgentMessage, AssistantMessage, UserMessage } from "./messages.ts";
import { type ModelClient, type ModelToolSchema, toModelToolSchemas } from "./model.ts";
import type { AgentTool } from "./tool.ts";

export interface AgentSessionInit {
  systemPrompt: string;
  tools: AgentTool[];
  /** 세션 이어가기: 저장소에서 읽은 과거 트랜스크립트 */
  messages?: AgentMessage[];
}

export interface AgentOptions {
  session: AgentSessionInit;
  /** §8 — 프로바이더 교체 지점 */
  modelClient: ModelClient;
  hooks?: AgentHooks;
}

export interface AgentState {
  /** 생성 시 동결 — setter 없음 */
  readonly systemPrompt: string;
  /** 생성 시 동결 — setter 없음 */
  readonly tools: readonly AgentTool[];
  readonly messages: readonly AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  /** 순차 실행이므로 단수 (§5) */
  readonly pendingToolCall?: string;
  readonly errorMessage?: string;
}

function toUserMessage(input: string | UserMessage): UserMessage {
  if (typeof input !== "string") return input;
  return { role: "user", content: [{ type: "text", text: input }], timestamp: Date.now() };
}

export class Agent {
  readonly #systemPrompt: string;
  readonly #tools: readonly AgentTool[];
  readonly #toolSchemas: ModelToolSchema[];
  readonly #toolsByName: ReadonlyMap<string, AgentTool>;
  readonly #modelClient: ModelClient;
  readonly #hooks: AgentHooks;
  readonly #messages: AgentMessage[];
  readonly #emitter = new AgentEventEmitter();

  /** one-at-a-time 고정 — `QueueMode` 설정을 두지 않는다(§4) */
  readonly #steeringQueue: UserMessage[] = [];
  readonly #followUpQueue: UserMessage[] = [];

  #activeRun: Promise<void> | undefined;
  #abortController: AbortController | undefined;
  #running = false;
  #isStreaming = false;
  #streamingMessage: AssistantMessage | undefined;
  #pendingToolCall: string | undefined;
  #errorMessage: string | undefined;

  constructor(options: AgentOptions) {
    this.#systemPrompt = options.session.systemPrompt;
    this.#tools = [...options.session.tools];
    // 세션 시작 시 1회 변환 — 매 요청 같은 배열을 보내 바이트 안정성을 지킨다(불변 조건 6).
    // 중복 이름·비-strictObject 스키마는 여기서 즉시 실패한다.
    this.#toolSchemas = toModelToolSchemas(this.#tools);
    this.#toolsByName = new Map(this.#tools.map((tool) => [tool.name, tool]));
    this.#modelClient = options.modelClient;
    this.#hooks = options.hooks ?? {};
    this.#messages = [...(options.session.messages ?? [])];
  }

  subscribe(listener: AgentEventListener): Unsubscribe {
    return this.#emitter.subscribe(listener);
  }

  /** 새 런 시작. 활성 런이 있으면 throw — steer/followUp을 쓰라는 뜻이다 */
  prompt(input: string | UserMessage): Promise<void> {
    if (this.#running) {
      throw new Error(
        "An agent run is already active. Use steer() to interject, or followUp() to queue input for after this run.",
      );
    }
    this.#running = true;
    this.#errorMessage = undefined;

    const controller = new AbortController();
    this.#abortController = controller;

    const run = this.#run(toUserMessage(input), controller.signal).finally(() => {
      this.#running = false;
      this.#activeRun = undefined;
      this.#abortController = undefined;
      this.#isStreaming = false;
      this.#streamingMessage = undefined;
      this.#pendingToolCall = undefined;
    });
    this.#activeRun = run;
    return run;
  }

  /** 진행 중 끼어들기 — 현재 턴의 도구 실행이 끝난 뒤, 다음 모델 호출 전에 주입된다 */
  steer(message: UserMessage): void {
    this.#steeringQueue.push(message);
  }

  /** 런이 자연 종료된 뒤에 처리할 후속 입력 */
  followUp(message: UserMessage): void {
    this.#followUpQueue.push(message);
  }

  /**
   * 활성 런 중단 + 양쪽 큐 비움.
   *
   * 1인 CLI에서 Ctrl+C의 기대 의미는 "지금 하던 것과 예약한 것 전부 취소"다 —
   * 레퍼런스처럼 중단과 큐 정리를 나누지 않는다(§4).
   */
  abort(reason?: string): void {
    this.#steeringQueue.length = 0;
    this.#followUpQueue.length = 0;
    this.#abortController?.abort(reason ?? "The run was aborted.");
  }

  /**
   * 활성 런과 모든 이벤트 리스너의 settlement까지 대기한다.
   *
   * `agent_end` 리스너가 전부 settle한 뒤에야 idle이 되므로, "저장이 끝나기 전에
   * 다음 프롬프트가 들어오는" 경합이 계약 수준에서 차단된다. 대기 수단이지
   * 오류 채널이 아니므로 런의 실패는 여기서 던지지 않는다 — `prompt()`가 던진다.
   */
  async waitForIdle(): Promise<void> {
    while (this.#activeRun) {
      await this.#activeRun.catch(() => undefined);
    }
  }

  get state(): Readonly<AgentState> {
    return {
      systemPrompt: this.#systemPrompt,
      tools: this.#tools,
      messages: this.#messages,
      isStreaming: this.#isStreaming,
      ...(this.#streamingMessage ? { streamingMessage: this.#streamingMessage } : {}),
      ...(this.#pendingToolCall !== undefined ? { pendingToolCall: this.#pendingToolCall } : {}),
      ...(this.#errorMessage !== undefined ? { errorMessage: this.#errorMessage } : {}),
    };
  }

  async #run(initialMessage: UserMessage, signal: AbortSignal): Promise<void> {
    const newMessages = await runAgentLoop({
      systemPrompt: this.#systemPrompt,
      toolsByName: this.#toolsByName,
      toolSchemas: this.#toolSchemas,
      modelClient: this.#modelClient,
      hooks: this.#hooks,
      messages: this.#messages,
      emitter: this.#emitter,
      signal,
      initialMessage,
      takeSteering: () => this.#steeringQueue.shift(),
      takeFollowUp: () => this.#followUpQueue.shift(),
      onStreamingChange: (message) => {
        this.#streamingMessage = message;
        this.#isStreaming = message !== undefined;
      },
      onPendingToolCall: (toolCallId) => {
        this.#pendingToolCall = toolCallId;
      },
    });

    // 실패는 트랜스크립트에 남지만, 상태에서도 마지막 오류를 읽을 수 있게 한다.
    for (let i = newMessages.length - 1; i >= 0; i--) {
      const message = newMessages[i];
      if (message?.role === "assistant" && message.errorMessage !== undefined) {
        this.#errorMessage = message.errorMessage;
        break;
      }
    }
  }
}
