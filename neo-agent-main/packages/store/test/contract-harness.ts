/**
 * QA-B 소유 하네스 — 세션 저장소 계약 검증 전용.
 *
 * 코어의 `packages/core/test/mock-model-client.ts`를 재사용하지 않는다. 독립 검증의
 * 결론이 구현자가 만든 하네스의 정확성에 의존하면 "둘 다 같은 오해를 공유"하는
 * 경우를 잡지 못한다. 여기의 모의 어댑터는 `docs/CORE-INTERFACE.md` §8의 스트림
 * 계약만 보고 새로 썼다:
 *
 *   - `stream()`은 throw/reject하지 않는다. 실패는 `done`의 stopReason으로 인코딩된다.
 *   - `done.message.usage`는 항상 실린다.
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

import type {
  AgentEvent,
  AssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
  TokenUsage,
} from "@neo-agent/core";

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** 한 응답의 대본. content는 델타로 흘리고 done으로 닫는다 */
export interface ScriptedResponse {
  text?: string;
  toolCalls?: { toolCallId: string; toolName: string; args: unknown }[];
  stopReason?: StopReason;
  errorMessage?: string;
  usage?: Partial<TokenUsage>;
}

/**
 * 대본대로 재생하는 최소 `ModelClient`.
 *
 * 시나리오가 소진되면 계약을 깨는 throw 대신 `stopReason: "error"` done을 낸다 —
 * 하네스가 계약을 어기면서 테스트를 진단하지 않는다.
 */
export class ScriptedModel implements ModelClient {
  readonly modelId: string;
  readonly requests: ModelRequest[] = [];
  #cursor = 0;
  readonly #script: ScriptedResponse[];

  constructor(script: ScriptedResponse[], modelId = "qa-b/scripted-1") {
    this.#script = [...script];
    this.modelId = modelId;
  }

  get callCount(): number {
    return this.#cursor;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    const response = this.#script[this.#cursor];
    this.#cursor += 1;

    if (!response) {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: `ScriptedModel: 대본 소진 (호출 ${this.#cursor}회 / 준비 ${this.#script.length}개)`,
          usage: { ...ZERO_USAGE },
          timestamp: Date.now(),
        },
      };
      return;
    }

    const content: AssistantMessage["content"] = [];

    if (response.text !== undefined) {
      content.push({ type: "text", text: response.text });
      yield { type: "text_delta", text: response.text };
    }
    for (const call of response.toolCalls ?? []) {
      content.push({ type: "toolCall", ...call });
      yield { type: "toolcall", ...call };
    }

    const stopReason: StopReason =
      response.stopReason ?? ((response.toolCalls?.length ?? 0) > 0 ? "tool_use" : "end_turn");

    yield {
      type: "done",
      message: {
        role: "assistant",
        content,
        stopReason,
        ...(response.errorMessage === undefined ? {} : { errorMessage: response.errorMessage }),
        usage: { ...ZERO_USAGE, ...response.usage },
        timestamp: Date.now(),
      },
    };
  }
}

/** 방출된 이벤트를 순서대로 모으는 구독자 */
export function recordEvents(): { events: AgentEvent[]; listener: (event: AgentEvent) => void } {
  const events: AgentEvent[] = [];
  return { events, listener: (event) => void events.push(event) };
}

/** 특정 타입의 이벤트만 골라낸다 */
export function eventsOfType<T extends AgentEvent["type"]>(
  events: readonly AgentEvent[],
  type: T,
): Extract<AgentEvent, { type: T }>[] {
  return events.filter((event): event is Extract<AgentEvent, { type: T }> => event.type === type);
}
