/**
 * Anthropic `ModelClient` 어댑터 — `docs/CORE-INTERFACE.md` §8.
 *
 * 이 파일의 계약은 하나로 요약된다: **`stream()`은 throw하지 않는다.** 인증 실패든
 * 네트워크 단절이든 변환 불가 입력이든, 모든 실패는 스트림 안에서
 * `stopReason: "error" | "aborted"` + `errorMessage`를 단 최종 `done`으로 나온다.
 * 코어는 그 done을 트랜스크립트에 남기므로 실패가 대화의 일부로 보인다(§2.6).
 *
 * 컴플라이언스(ARCHITECTURE §2.2): 공식 SDK + 공식 엔드포인트 + API 키만. 신원은
 * `neo-agent/<version>` User-Agent로 정직하게 밝힌다. 소비자 구독 OAuth·타 제품
 * 위장 헤더 경로는 존재하지 않는다.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
  TextContent,
  ThinkingContent,
  TokenUsage,
  ToolCallContent,
} from "@neo-agent/core";
import { ConversionError, toAnthropicMessages, toAnthropicTools } from "./convert.ts";

/** 어댑터가 소유하는 응답 길이 한도 기본값 (CORE-INTERFACE §8 — 구 O-2) */
export const DEFAULT_MAX_TOKENS = 8192;

/** SDK 내장 재시도 횟수. 재시도·백오프는 어댑터 안에서 종결된다(§8) */
export const DEFAULT_MAX_RETRIES = 2;

export interface AnthropicClientConfig {
  apiKey: string;
  model: string;
  /** 생략 시 `DEFAULT_MAX_TOKENS`. 요청에 실린 값이 있으면 그것이 우선한다 */
  maxTokens?: number;
  maxRetries?: number;
  /** 정직한 신원 — 등록(registration.ts)이 채운다 */
  userAgent: string;
  /** 테스트용 주입 지점. 프로덕션에서는 SDK 기본 fetch를 쓴다 */
  fetch?: typeof globalThis.fetch;
}

function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

interface WireUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * 와이어 usage를 누적한다 — **덮어쓰지 않는다**(§8).
 *
 * Anthropic은 입력·캐시 토큰을 `message_start`에, 최종 출력 토큰을 `message_delta`에
 * 싣는다. SDK 타입에서 이 필드들은 전부 nullable이라(2026-08-06 실측,
 * `@anthropic-ai/sdk@0.71.2`) 나중 이벤트의 null을 0으로 접어 통째로 덮으면 시작
 * 시점에 받은 입력·캐시 토큰이 지워진다. 값이 실제로 온 필드만 갱신한다 —
 * 캐시 적중률이 0으로 보이면 프롬프트 캐시(§2.4) 계측 자체가 막힌다.
 */
function mergeUsage(base: TokenUsage, wire: WireUsage): TokenUsage {
  return {
    input: wire.input_tokens ?? base.input,
    output: wire.output_tokens ?? base.output,
    cacheRead: wire.cache_read_input_tokens ?? base.cacheRead,
    cacheWrite: wire.cache_creation_input_tokens ?? base.cacheWrite,
  };
}

/**
 * 와이어 stop_reason → 코어 `StopReason`.
 *
 * SDK는 6종을 반환하는데(2026-08-06 실측: `end_turn` `max_tokens` `stop_sequence`
 * `tool_use` `pause_turn` `refusal`) 코어는 5종이고 그중 `error`/`aborted`는 코어
 * 사정이다. 매핑 판단:
 *
 * - `stop_sequence` → `end_turn`: 정지 문자열로 끝난 것은 정상 종료다.
 * - `pause_turn` → `error`: 서버 사이드 도구(웹 검색 등)를 쓸 때만 나오며 요청을
 *   그대로 재전송해 이어가라는 신호다. 우리는 서버 도구를 쓰지 않으므로 이것이
 *   오면 예상 밖 상태이고, `end_turn`으로 접으면 잘린 응답이 정상 종료로 위장된다.
 * - `refusal` → `error`: 모델이 안전상 생성을 중단한 경우. `end_turn`으로 접으면
 *   본문이 비었을 때 아무 설명 없이 빈 응답이 되어 침묵 실패가 된다(§2.6).
 *
 * 둘 다 `errorMessage`로 원인을 남기므로 사용자는 무슨 일이 있었는지 본다.
 */
function toStopReason(raw: Anthropic.StopReason | null): {
  stopReason: StopReason;
  errorMessage?: string;
} {
  switch (raw) {
    case "tool_use":
      return { stopReason: "tool_use" };
    case "max_tokens":
      return { stopReason: "max_tokens" };
    case "pause_turn":
      return {
        stopReason: "error",
        errorMessage:
          'The model paused the turn (stop_reason: "pause_turn"), which requires server-side tool continuation that this adapter does not support.',
      };
    case "refusal":
      return {
        stopReason: "error",
        errorMessage: 'The model declined to continue generating (stop_reason: "refusal").',
      };
    default:
      // "end_turn" | "stop_sequence" | null — 전부 정상 종료로 본다
      return { stopReason: "end_turn" };
  }
}

function errorText(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const status = error.status === undefined ? "" : ` (HTTP ${error.status})`;
    return `${error.name}${status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message.length > 0 ? `${error.name}: ${error.message}` : error.name;
  }
  return String(error);
}

function abortReasonText(signal: AbortSignal): string {
  const reason: unknown = signal.reason;
  if (typeof reason === "string" && reason.length > 0) return reason;
  if (reason instanceof Error) return errorText(reason);
  return "The request was aborted.";
}

/** 조립 중인 tool_use 블록. 인자가 완성되기 전에는 방출하지 않는다(§8) */
interface PendingToolCall {
  id: string;
  name: string;
  json: string;
}

export class AnthropicModelClient implements ModelClient {
  readonly modelId: string;

  readonly #client: Anthropic;
  readonly #maxTokens: number;

  constructor(config: AnthropicClientConfig) {
    this.modelId = config.model;
    this.#maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.#client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      // 정직한 신원(ARCHITECTURE §2.2). 다른 제품을 사칭하지 않는다.
      defaultHeaders: { "user-agent": config.userAgent },
      ...(config.fetch ? { fetch: config.fetch } : {}),
    });
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    // 누적 상태 — 실패 시에도 여기까지의 부분 출력을 done에 실어 보낸다.
    const content: (TextContent | ThinkingContent | ToolCallContent)[] = [];
    let usage = emptyUsage();
    const pending = new Map<number, PendingToolCall>();

    /** 진행 중이던 텍스트/사고 블록에 델타를 이어 붙인다 */
    const appendDelta = (type: "text" | "thinking", text: string): void => {
      const last = content.at(-1);
      if (last?.type === type) last.text += text;
      else content.push({ type, text } as TextContent | ThinkingContent);
    };

    try {
      if (signal.aborted) {
        yield {
          type: "done",
          message: failed("aborted", abortReasonText(signal), content, usage),
        };
        return;
      }

      const stream = await this.#client.messages.create(
        {
          model: this.modelId,
          // 요청에 실린 값이 우선. 코어는 채우지 않으므로 평소엔 어댑터 기본값이다(§8)
          max_tokens: request.maxTokens ?? this.#maxTokens,
          system: request.systemPrompt,
          messages: toAnthropicMessages(request.messages),
          ...(request.tools.length > 0 ? { tools: toAnthropicTools(request.tools) } : {}),
          stream: true,
        },
        { signal },
      );

      let stopReason: StopReason = "end_turn";
      let stopErrorMessage: string | undefined;
      // 종료 사유를 실제로 받았는지. 못 받고 끝난 스트림에 end_turn을 날조하지
      // 않는다(§8) — SDK는 중단 시 throw 없이 조용히 이터레이터를 닫는다.
      let sawStopReason = false;

      for await (const event of stream) {
        switch (event.type) {
          case "message_start":
            usage = mergeUsage(usage, event.message.usage);
            break;

          case "content_block_start": {
            const block = event.content_block;
            if (block.type === "tool_use") {
              pending.set(event.index, { id: block.id, name: block.name, json: "" });
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              appendDelta("text", delta.text);
              yield { type: "text_delta", text: delta.text };
            } else if (delta.type === "thinking_delta") {
              appendDelta("thinking", delta.thinking);
              yield { type: "thinking_delta", text: delta.thinking };
            } else if (delta.type === "input_json_delta") {
              // 부분 인자는 코어에 노출하지 않는다 — 완성 시점에 한 번 방출한다(§8).
              const call = pending.get(event.index);
              if (call) call.json += delta.partial_json;
            }
            // signature_delta·citations_delta는 코어 모델에 대응이 없다 — 무시.
            break;
          }

          case "content_block_stop": {
            const call = pending.get(event.index);
            if (!call) break;
            pending.delete(event.index);
            // 인자가 완성된 시점 = 여기. 파싱 실패는 잘린 블록이므로 방출하지 않는다.
            const args = parseToolInput(call.json);
            if (args === undefined) break;
            const toolCall: ToolCallContent = {
              type: "toolCall",
              toolCallId: call.id,
              toolName: call.name,
              args,
            };
            content.push(toolCall);
            yield {
              type: "toolcall",
              toolCallId: call.id,
              toolName: call.name,
              args,
            };
            break;
          }

          case "message_delta": {
            if (event.delta.stop_reason !== null) {
              const mapped = toStopReason(event.delta.stop_reason);
              stopReason = mapped.stopReason;
              stopErrorMessage = mapped.errorMessage;
              sawStopReason = true;
            }
            // 최종 output_tokens가 여기 온다. 시작 시점에 받은 입력·캐시 토큰을
            // 지우지 않도록 병합한다.
            usage = mergeUsage(usage, event.usage);
            break;
          }

          default:
            break;
        }
      }

      // 인자가 잘려 완성되지 못한 tool_use 블록은 여기 남는다. 방출하지 않았으므로
      // 코어가 보는 것은 언제나 완성된 도구 호출뿐이다(§8 — 구 O-5).
      pending.clear();

      // 종료 사유 없이 끝난 스트림에 end_turn을 만들어내지 않는다(§8). 빈 본문·
      // 중간 절단·예상 밖 콘텐츠 타입, 그리고 SDK가 예외 없이 닫는 중단이 여기 온다.
      // 여기까지 누적한 usage는 그대로 싣는다 — 이미 과금된 입력 토큰이다.
      if (!sawStopReason) {
        const aborted = signal.aborted;
        yield {
          type: "done",
          message: failed(
            aborted ? "aborted" : "error",
            aborted
              ? abortReasonText(signal)
              : "The model stream ended without reporting a stop reason.",
            content,
            usage,
          ),
        };
        return;
      }

      const message: AssistantMessage = {
        role: "assistant",
        content,
        stopReason,
        ...(stopErrorMessage !== undefined ? { errorMessage: stopErrorMessage } : {}),
        usage,
        timestamp: Date.now(),
      };
      yield { type: "done", message };
    } catch (error) {
      // no-throw 계약(§8) — 어떤 실패도 done으로 인코딩한다. 변환 오류·인증 실패·
      // 재시도 소진·네트워크 단절이 전부 여기로 모인다.
      const aborted = signal.aborted || isAbortError(error);
      yield {
        type: "done",
        message: failed(
          aborted ? "aborted" : "error",
          aborted && !(error instanceof ConversionError)
            ? abortReasonText(signal)
            : errorText(error),
          content,
          usage,
        ),
      };
    }
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Anthropic.APIUserAbortError ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** 완성된 JSON만 인자로 인정한다. 잘렸거나 객체가 아니면 `undefined` */
function parseToolInput(json: string): Record<string, unknown> | undefined {
  // 인자 없는 도구는 빈 문자열로 온다 — 빈 객체가 맞다.
  if (json.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function failed(
  stopReason: "error" | "aborted",
  errorMessage: string,
  content: (TextContent | ThinkingContent | ToolCallContent)[],
  usage: TokenUsage,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    stopReason,
    errorMessage,
    usage,
    timestamp: Date.now(),
  };
}
