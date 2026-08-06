/**
 * 와이어 포맷 변환 — 코어 메시지 모델 → Anthropic Messages API.
 *
 * `docs/CORE-INTERFACE.md` §2가 코어의 역할을 3개로 닫은 대가로 코어에는 변환
 * 계층이 없다. 그 책임이 여기다(§8 "와이어 포맷 변환은 어댑터 책임").
 *
 * **결정적 직렬화**(불변 조건 6): 같은 입력은 항상 바이트 동일한 출력을 낸다.
 * 순서를 재배열하지 않고, 키를 정렬하지 않으며, 타임스탬프 같은 가변값을 섞지
 * 않는다. 프롬프트 캐시 적중이 여기에 달려 있다(ARCHITECTURE §2.4).
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentMessage, ModelToolSchema } from "@neo-agent/core";

/**
 * 이미지 미디어 타입 — SDK가 받는 4종으로 좁힌다.
 *
 * 코어의 `ImageContent.mimeType`은 자유 문자열이라(도구가 채운다) 여기서 판정한다.
 * 지원하지 않는 타입을 조용히 흘려보내면 API가 400으로 답하고, 그 실패는 사용자에게
 * "요청 실패"로만 보인다 — 원인을 남기려면 변환 시점에 걸러야 한다(§2.6).
 */
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function isSupportedImageType(mimeType: string): mimeType is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

/** 변환 불가 입력. `stream()`은 이것을 잡아 error done으로 인코딩한다(no-throw 계약) */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

function toImageBlock(mimeType: string, data: string): Anthropic.ImageBlockParam {
  if (!isSupportedImageType(mimeType)) {
    throw new ConversionError(
      `Unsupported image media type "${mimeType}". Supported: ${SUPPORTED_IMAGE_TYPES.join(", ")}.`,
    );
  }
  return { type: "image", source: { type: "base64", media_type: mimeType, data } };
}

/**
 * 도구 인자를 JSON 객체로 좁힌다.
 *
 * 코어의 `ToolCallContent.args`는 `unknown`이다 — 모델이 준 값을 신뢰하지 않는다는
 * 계약의 결과다(§6). 하지만 와이어에서 `tool_use.input`은 객체여야 하므로 여기서
 * 판정한다. 어시스턴트 메시지의 도구 호출은 이전 턴에 우리가 방출한 것이므로
 * 정상 경로에서는 항상 객체다.
 */
function toToolInput(args: unknown, toolName: string): Record<string, unknown> {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new ConversionError(
      `Tool call arguments for "${toolName}" must be a JSON object, got ${Array.isArray(args) ? "array" : typeof args}.`,
    );
  }
  return args as Record<string, unknown>;
}

/**
 * 어시스턴트 메시지를 콘텐츠 블록으로 변환한다.
 *
 * `thinking` 블록은 **전송하지 않는다.** 확장 사고 블록을 되돌려 보내려면 원본
 * `signature`가 필요한데(API가 무결성 검증에 쓴다), 코어의 `ThinkingContent`는
 * 텍스트만 싣는다 — 서명을 만들어낼 수 없으므로 보내면 400이 된다. thinking은
 * 표시·기록용이고 다음 턴 컨텍스트에는 들어가지 않는다.
 * 확장 사고를 실제로 활성화할 때 signature 왕복을 함께 설계한다(CORE-INTERFACE §10).
 */
function assistantBlocks(
  message: Extract<AgentMessage, { role: "assistant" }>,
): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      // 빈 텍스트 블록은 API가 거부한다. 스트리밍 초안이 비어 끝난 경우가 여기 온다.
      if (block.text.length > 0) blocks.push({ type: "text", text: block.text });
    } else if (block.type === "toolCall") {
      blocks.push({
        type: "tool_use",
        id: block.toolCallId,
        name: block.toolName,
        input: toToolInput(block.args, block.toolName),
      });
    }
    // thinking은 의도적으로 누락 — 위 주석 참조
  }
  return blocks;
}

function userBlocks(
  message: Extract<AgentMessage, { role: "user" }>,
): Anthropic.ContentBlockParam[] {
  return message.content.map((block) =>
    block.type === "text"
      ? ({ type: "text", text: block.text } as const)
      : toImageBlock(block.mimeType, block.data),
  );
}

function toolResultBlock(
  message: Extract<AgentMessage, { role: "toolResult" }>,
): Anthropic.ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: message.toolCallId,
    content: message.content.map((block) =>
      block.type === "text"
        ? ({ type: "text", text: block.text } as const)
        : toImageBlock(block.mimeType, block.data),
    ),
    is_error: message.isError,
  };
}

/**
 * 트랜스크립트를 Anthropic 메시지 배열로 변환한다.
 *
 * **인접한 같은 역할을 병합한다.** 와이어에서 도구 결과는 user 역할이므로, 코어의
 * `[assistant(toolCall), toolResult, toolResult]`는 `[assistant, user(결과 2개)]`가
 * 되어야 한다 — 병합하지 않으면 user 메시지가 연속으로 나열되어 API가 거부한다.
 * 병합은 순서를 바꾸지 않으므로 결정성을 해치지 않는다.
 */
export function toAnthropicMessages(messages: readonly AgentMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
    const blocks: Anthropic.ContentBlockParam[] =
      message.role === "assistant"
        ? assistantBlocks(message)
        : message.role === "user"
          ? userBlocks(message)
          : [toolResultBlock(message)];

    // 콘텐츠가 전부 걸러진 메시지(예: thinking만 있던 어시스턴트)는 보내지 않는다.
    if (blocks.length === 0) continue;

    const last = result.at(-1);
    if (last && last.role === role && Array.isArray(last.content)) {
      last.content.push(...blocks);
    } else {
      result.push({ role, content: blocks });
    }
  }

  return result;
}

/**
 * 코어 도구 스키마를 SDK 도구 정의로 변환한다.
 *
 * `inputSchema`는 코어가 `z.toJSONSchema({ io: "input" })`으로 이미 만든 산출물이라
 * 여기서는 형태를 바꾸지 않는다 — 재가공하면 코어가 보장한 바이트 안정성이 깨진다.
 * 등록 순서도 그대로 보존한다(불변 조건 6).
 */
export function toAnthropicTools(tools: readonly ModelToolSchema[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }));
}
