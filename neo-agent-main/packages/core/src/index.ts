/**
 * `@neo-agent/core` 공개 배럴.
 *
 * 코어가 아는 것은 "모델 호출 ↔ 도구 실행"의 반복뿐이다. 전송 계층·저장소·UI는
 * 전부 바깥이며, 코어는 `node:fs`/`node:net`/`node:sqlite` 같은 I/O성 모듈을
 * 임포트하지 않는다. 계약 정본은 `docs/CORE-INTERFACE.md`.
 */

// §4 제어 API
export {
  Agent,
  type AgentOptions,
  type AgentSessionInit,
  type AgentState,
  DEFAULT_MAX_TURNS_PER_RUN,
} from "./agent.ts";

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

// §2 메시지 모델 — 타입 + 저장소가 쓰는 Zod 스키마 + user 메시지 발급기.
// `newMessageId`는 내보내지 않는다: 발급자는 코어 하나이고(불변 조건 8), 밖으로
// 내보내면 소비자가 자기 id를 만들어 넣는 경로가 열린다. `createUserMessage`는
// 그 반대 방향의 표면이다 — 세션 밖 합성 메시지(압축 요약)의 발급까지 코어
// 하나로 묶는다(COMPACTION §8). 코어 공개 표면 확장은 이 하나뿐이다.
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
  UserMessageInput,
} from "./messages.ts";
export {
  agentMessageSchema,
  assistantMessageSchema,
  createUserMessage,
  toolResultMessageSchema,
  userMessageSchema,
} from "./messages.ts";

// §8 모델 프로바이더 경계
export {
  type ModelAssistantMessage,
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
