/**
 * T-008 — 스크립트 기반 모의 `ModelClient`.
 *
 * 계약 정본은 `docs/CORE-INTERFACE.md` §8이다. 이 하네스는 그 계약을 **그대로**
 * 지키는 어댑터를 흉내 낸다:
 *
 * - `stream()`은 어떤 실패로도 throw/reject하지 않는다. 모든 실패는 스트림 안에서
 *   `stopReason: "error" | "aborted"` + `errorMessage`를 단 최종 `done`으로 인코딩된다.
 * - `done.message.usage`는 항상 실린다.
 *
 * `requests`에 호출 기록을 남겨 프롬프트 캐시 안정성(불변 조건 1·6)과 큐 주입
 * (steer/followUp)을 요청 페이로드 수준에서 검증할 수 있게 한다.
 */

import type {
  AssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
  TokenUsage,
} from "../src/index.ts";

/** 한 응답 안에서 재생될 단위 동작 */
export type MockScriptStep =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "toolCall"; toolCallId: string; toolName: string; args: unknown }
  /** 지연 — 스트리밍 도중 abort/steer가 끼어들 틈을 만든다 */
  | { kind: "delay"; ms: number };

export interface MockScriptedResponse {
  steps?: MockScriptStep[];
  /** 생략 시 toolCall이 있으면 "tool_use", 없으면 "end_turn" */
  stopReason?: StopReason;
  /** 지정하면 `stopReason: "error"` + 이 문자열을 errorMessage로 하는 done을 방출한다 */
  error?: string;
  usage?: Partial<TokenUsage>;
}

export interface MockModelClientOptions {
  modelId?: string;
}

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function usageOf(partial: Partial<TokenUsage> | undefined): TokenUsage {
  return { ...ZERO_USAGE, ...partial };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 델타를 누적해 최종 메시지 content를 만든다. 루프의 초안 병합 규칙과 같은 규칙을
 * 쓰므로 초안과 최종 메시지가 같은 모양이 된다.
 */
function pushDelta(content: AssistantMessage["content"], step: MockScriptStep): void {
  if (step.kind === "text") {
    const last = content.at(-1);
    if (last?.type === "text") last.text += step.text;
    else content.push({ type: "text", text: step.text });
    return;
  }
  if (step.kind === "thinking") {
    const last = content.at(-1);
    if (last?.type === "thinking") last.text += step.text;
    else content.push({ type: "thinking", text: step.text });
    return;
  }
  if (step.kind === "toolCall") {
    content.push({
      type: "toolCall",
      toolCallId: step.toolCallId,
      toolName: step.toolName,
      args: step.args,
    });
  }
}

function toDelta(step: MockScriptStep): ModelStreamEvent | undefined {
  if (step.kind === "text") return { type: "text_delta", text: step.text };
  if (step.kind === "thinking") return { type: "thinking_delta", text: step.text };
  if (step.kind === "toolCall") {
    return {
      type: "toolcall",
      toolCallId: step.toolCallId,
      toolName: step.toolName,
      args: step.args,
    };
  }
  return undefined;
}

export class MockModelClient implements ModelClient {
  readonly modelId: string;
  /** 호출 기록 — 루프가 보낸 `ModelRequest`를 순서대로 담는다 */
  readonly requests: ModelRequest[] = [];

  readonly #responses: MockScriptedResponse[];
  #cursor = 0;

  constructor(responses: MockScriptedResponse[], options: MockModelClientOptions = {}) {
    this.#responses = [...responses];
    this.modelId = options.modelId ?? "mock/model-1";
  }

  /** 지금까지의 `stream()` 호출 횟수 */
  get callCount(): number {
    return this.#cursor;
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    const response = this.#responses[this.#cursor];
    this.#cursor += 1;

    // 시나리오 소진도 throw가 아니라 done으로 알린다 — 계약을 깨면서 테스트를
    // 진단하지 않는다. 초과 호출은 error done으로 눈에 띈다.
    if (!response) {
      yield {
        type: "done",
        message: failedMessage(
          "error",
          `MockModelClient: 시나리오가 소진되었다 (요청 ${this.#cursor}회, 준비된 응답 ${this.#responses.length}개)`,
          [],
          ZERO_USAGE,
        ),
      };
      return;
    }

    const content: AssistantMessage["content"] = [];
    const usage = usageOf(response.usage);

    try {
      for (const step of response.steps ?? []) {
        if (signal.aborted) {
          yield {
            type: "done",
            message: failedMessage("aborted", abortText(signal), content, usage),
          };
          return;
        }
        if (step.kind === "delay") {
          await sleep(step.ms);
          continue;
        }
        pushDelta(content, step);
        const delta = toDelta(step);
        if (delta) yield delta;
      }

      if (response.error !== undefined) {
        yield { type: "done", message: failedMessage("error", response.error, content, usage) };
        return;
      }

      const stopReason: StopReason =
        response.stopReason ??
        (content.some((block) => block.type === "toolCall") ? "tool_use" : "end_turn");

      const message: AssistantMessage = {
        role: "assistant",
        content,
        stopReason,
        usage,
        timestamp: Date.now(),
      };
      yield { type: "done", message };
    } catch (error) {
      // 재생 중 무슨 일이 나든 스트림 밖으로 새지 않는다(no-throw 계약).
      yield {
        type: "done",
        message: failedMessage("error", describeError(error), content, usage),
      };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function abortText(signal: AbortSignal): string {
  const reason: unknown = signal.reason;
  if (typeof reason === "string" && reason.length > 0) return reason;
  if (reason instanceof Error) return describeError(reason);
  return "The run was aborted.";
}

function failedMessage(
  stopReason: "error" | "aborted",
  errorMessage: string,
  content: AssistantMessage["content"],
  usage: TokenUsage,
): AssistantMessage {
  return {
    role: "assistant",
    content: [...content],
    stopReason,
    errorMessage,
    usage,
    timestamp: Date.now(),
  };
}

/** 하네스를 루프 없이 직접 구동할 때 쓰는 최소 요청 */
export function makeModelRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    systemPrompt: "테스트 시스템 프롬프트",
    messages: [],
    tools: [],
    ...overrides,
  };
}

/** 스트림을 끝까지 읽어 이벤트 배열로 만든다 */
export async function collectStream(
  client: ModelClient,
  request: ModelRequest = makeModelRequest(),
  signal: AbortSignal = new AbortController().signal,
): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of client.stream(request, signal)) {
    events.push(event);
  }
  return events;
}
