/**
 * `@neo-agent/core` 공개 배럴.
 *
 * 코어가 아는 것은 "모델 호출 ↔ 도구 실행"의 반복뿐이다. 전송 계층·저장소·UI는
 * 전부 바깥이며, 코어는 `node:fs`/`node:net`/`node:sqlite` 같은 I/O성 모듈을
 * 임포트하지 않는다. 계약 정본은 `docs/CORE-INTERFACE.md`.
 */

// §4 제어 API
export { Agent, type AgentOptions, type AgentSessionInit, type AgentState } from "./agent.ts";

// §3 이벤트 스트림
export type { AgentEvent, AgentEventListener, Unsubscribe } from "./events.ts";

// §7 훅 — 승인 게이트가 앉는 자리
export type {
  AfterToolCallContext,
  AgentHooks,
  BeforeToolCallContext,
  ToolCallDecision,
  ToolResultOverride,
} from "./hooks.ts";

// §2 메시지 모델
export type {
  AgentMessage,
  AssistantMessage,
  ImageContent,
  StopReason,
  TextContent,
  ThinkingContent,
  TokenUsage,
  ToolCallContent,
  ToolResultMessage,
  ToolResultSource,
  UserMessage,
} from "./messages.ts";

// §8 모델 프로바이더 경계
export {
  type ModelClient,
  type ModelRequest,
  type ModelStreamEvent,
  type ModelToolSchema,
  toModelToolSchemas,
} from "./model.ts";

// §8 컴플라이언스 게이트
export type { ProviderEvidence, ProviderRegistration } from "./provider.ts";

// §6 도구 계약
export {
  type AgentTool,
  type ToolArgsValidation,
  type ToolExecutionContext,
  type ToolResult,
  validateToolArgs,
} from "./tool.ts";
