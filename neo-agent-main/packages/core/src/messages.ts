/**
 * 메시지 모델 — `docs/CORE-INTERFACE.md` §2.
 *
 * MVP 역할은 3개로 닫는다. 셋 다 모델에 그대로 보이는 역할이므로 코어에는
 * 와이어 포맷 변환 계층(`convertToLlm` 류)이 없다 — 변환은 `ModelClient`
 * 어댑터의 책임이다(§7).
 *
 * 이 모듈은 타입만 내보낸다. 런타임 코드를 여기에 넣지 않는다.
 */

export type TextContent = { type: "text"; text: string };

/** base64 인코딩된 이미지 데이터 */
export type ImageContent = { type: "image"; mimeType: string; data: string };

export type ThinkingContent = { type: "thinking"; text: string };

export type ToolCallContent = {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  args: unknown;
};

export interface UserMessage {
  role: "user";
  content: (TextContent | ImageContent)[];
  timestamp: number;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "error" | "aborted";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCallContent)[];
  stopReason: StopReason;
  /** stopReason이 "error"·"aborted"일 때의 원인. 침묵 실패 금지(ARCHITECTURE §2.6) */
  errorMessage?: string;
  /** 비용 가시성 — 모든 응답에 필수. 옵션이 아니다 */
  usage: TokenUsage;
  timestamp: number;
}

/**
 * 도구 결과의 유래 분류. 턴 오염(taint) 추적의 흔적 — REUSE-MAP §2.1.
 *
 * 정책 집행(오염된 턴에서 위험 동작 제한)은 후순위지만, 필드를 나중에 넣으면
 * 모든 도구 구현을 재수정하게 되므로 지금부터 필수 필드다.
 */
export type ToolResultSource = "local" | "network";

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  /** 필수. 기본값 없음 — 모든 도구가 명시적으로 판정한다 */
  source: ToolResultSource;
  timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;
