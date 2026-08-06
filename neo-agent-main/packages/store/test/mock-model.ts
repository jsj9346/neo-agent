/**
 * 통합 시나리오용 모의 어댑터 (Store Engineer 소유).
 *
 * QA-B의 `contract-harness.ts`를 재사용하지 않는다 — 독립 검증과 구현자 검증이
 * 같은 하네스를 공유하면 "둘 다 같은 오해를 공유하는" 경우를 잡지 못한다.
 *
 * `CORE-INTERFACE.md` §8의 계약만 따른다:
 *   - `stream()`은 throw/reject하지 않는다. 실패는 `done`의 `stopReason`으로 인코딩.
 *   - `done.message`는 `ModelAssistantMessage` — id가 없다(코어가 붙인다).
 *   - `usage`는 필수.
 *
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
 */

import type {
  AssistantMessage,
  ModelAssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
} from "@neo-agent/core";

const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export interface ScriptedTurn {
  text?: string;
  toolCalls?: { toolCallId: string; toolName: string; args: unknown }[];
  stopReason?: StopReason;
  /** 이 턴의 `done` 직전에 await한다 — 중단을 스트림 도중에 걸기 위한 훅 */
  beforeDone?: () => Promise<void>;
}

/** 대본대로 재생하는 최소 `ModelClient` */
export class MockModel implements ModelClient {
  readonly modelId = "store-integration/mock-1";
  readonly requests: ModelRequest[] = [];
  #cursor = 0;
  readonly #script: ScriptedTurn[];

  constructor(script: ScriptedTurn[]) {
    this.#script = [...script];
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    const turn = this.#script[this.#cursor];
    this.#cursor += 1;

    if (!turn) {
      yield { type: "done", message: failed("MockModel: 대본이 소진됐다") };
      return;
    }

    if (turn.text !== undefined) yield { type: "text_delta", text: turn.text };

    const content: AssistantMessage["content"] = [];
    if (turn.text !== undefined) content.push({ type: "text", text: turn.text });
    for (const call of turn.toolCalls ?? []) {
      content.push({ type: "toolCall", ...call });
      yield { type: "toolcall", ...call };
    }

    await turn.beforeDone?.();

    // 중단은 어댑터가 예외로 알리지 않는다 — `stopReason: "aborted"`로 인코딩한다.
    if (signal.aborted) {
      yield { type: "done", message: { ...failed("aborted by test"), stopReason: "aborted" } };
      return;
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

function failed(message: string): ModelAssistantMessage {
  return {
    role: "assistant",
    content: [],
    stopReason: "error",
    errorMessage: message,
    usage: { ...ZERO_USAGE },
    timestamp: Date.now(),
  };
}
