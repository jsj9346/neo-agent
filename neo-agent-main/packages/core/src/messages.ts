/**
 * 메시지 모델 — `docs/CORE-INTERFACE.md` §2.
 *
 * MVP 역할은 3개로 닫는다. 셋 다 모델에 그대로 보이는 역할이므로 코어에는
 * 와이어 포맷 변환 계층(`convertToLlm` 류)이 없다 — 변환은 `ModelClient`
 * 어댑터의 책임이다(§7).
 *
 * 런타임 코드는 두 가지뿐이다: 메시지 id 발급기와 `AgentMessage`의 Zod 스키마.
 * 후자는 저장소가 DB에서 읽은 JSON을 검증하는 데 쓴다(§2 — 계약이 두 곳에
 * 존재하지 않게 코어가 공개한다). 그 밖의 로직은 여기 넣지 않는다.
 */

import { z } from "zod";

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
  /** 코어 발급(§2). 와이어로 나가지 않는다 */
  id: string;
  role: "user";
  content: (TextContent | ImageContent)[];
  timestamp: number;
}

/**
 * 입력 경계(§4) — 호출자는 id·timestamp를 모른다. 코어가 채운다.
 *
 * 발급자를 코어 하나로 묶는 것이 목적이다. 호출자가 id를 실어 보내면 코어가
 * 덮어쓰게 되고 "필수인데 무시되는 필드"라는 잘못된 표면이 생긴다.
 */
export type UserMessageInput = Omit<UserMessage, "id" | "timestamp">;

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "error" | "aborted";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AssistantMessage {
  /** 코어 발급. 스트리밍 초안과 그 최종 메시지가 같은 id를 갖는다(§2) */
  id: string;
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
  /** 코어 발급 */
  id: string;
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

/**
 * 메시지 id 발급기 — **코어의 유일한 발급 지점**(§2, 불변 조건 8).
 *
 * `crypto.randomUUID()`는 Node의 Web Crypto 전역이라 임포트가 없다 — 코어의
 * 의존성 예산(zod 단일)과 I/O 모듈 금지에 영향을 주지 않는다. 순서의 진실은
 * id가 아니라 트랜스크립트 배열 순서이므로 정렬 가능한 형식일 필요가 없다.
 *
 * 생성기 주입 지점(`AgentOptions.generateId` 류)은 두지 않는다 — 설계가 정한
 * 표면이 아니고, 주입 가능해지는 순간 "코어가 유일한 발급자"가 규약으로 내려간다.
 */
export function newMessageId(): string {
  return crypto.randomUUID();
}

/**
 * user 메시지 발급기 — **코어 안팎을 통틀어 유일한 발급 경로**(§2, COMPACTION §8).
 *
 * `newMessageId`를 감싸 id·timestamp를 채운다. 이 함수가 공개 표면인 이유는
 * 세션 밖에서 만들어지는 합성 메시지(압축 요약, `COMPACTION.md` §6) 때문이다 —
 * 소비자가 직접 `randomUUID()`를 부르기 시작하면 "발급자는 코어 하나"가 코드
 * 배치가 아니라 문서 규약으로 격하된다. `Agent`의 prompt 입력 변환·steer·
 * followUp과 루프의 grace 턴 합성도 전부 이 함수를 지난다(발급 지점 단일).
 *
 * **입력의 id·timestamp는 읽지 않는다**(§2). `UserMessageInput`이 1차 방어이고,
 * 타입을 우회해 실어 보내도 여기서 발급한 값만 남는다 — throw 대안은 기각됐다
 * (검사 코드가 늘고 JS 소비자만 만나는 표면이다). `role`도 읽지 않고 리터럴로
 * 쓴다: `UserMessage`의 `role`은 `"user"` 하나뿐이라 읽을 정보가 없다.
 *
 * [미규정 E-11] `content` 배열의 소유권. 현행은 호출자가 준 배열을 그대로
 * 참조한다(`Agent.prompt`/`steer`/`followUp`의 기존 동작 유지). 호출자가 나중에
 * 그 배열을 변형하면 트랜스크립트가 따라 바뀐다. 방어적 복사로 닫을지 여부는
 * 계약(§2·§4)이 정하지 않았다 — 코어가 트랜스크립트 소유자라는 §5의 태도는
 * 복사 쪽을 가리키지만, 기존 동작 변경이라 임의로 닫지 않았다. 판단 요청.
 */
export function createUserMessage(input: UserMessageInput): UserMessage {
  return { id: newMessageId(), role: "user", content: input.content, timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Zod 스키마 (§2) — 저장소가 DB에서 읽은 JSON을 검증하는 데 쓴다.
//
// 소비자가 자체 스키마를 정의하면 계약이 두 곳에 존재하게 되고, 코어가 유니온을
// 넓혔을 때 소비자가 따라오지 않아도 컴파일이 통과한다. 그래서 코어가 공개한다.
//
// 두 가지 선택을 명시한다:
// - `z.strictObject` — DB에서 나온 JSON은 외부 입력이다. 모르는 키를 조용히
//   버리면(zod 기본 동작) 저장→읽기 왕복에서 데이터가 소리 없이 사라진다.
//   [미규정] `SESSION-STORE.md` §2는 "Zod로 검증한다"까지만 정하고 미지의 키를
//   어떻게 다룰지는 정하지 않는다. 침묵 유실 금지(ARCHITECTURE §2.6) 쪽으로 닫았다.
// - `.exactOptional()` — 이 저장소는 `exactOptionalPropertyTypes: true`다.
//   `.optional()`은 `errorMessage?: string | undefined`를 낳아 `AssistantMessage`와
//   타입이 어긋난다(2026-08-06 실측). `.exactOptional()`은 키 자체의 유무만
//   표현하므로 `errorMessage?: string`과 정확히 일치한다.
// ---------------------------------------------------------------------------

const textContentSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
});

const imageContentSchema = z.strictObject({
  type: z.literal("image"),
  mimeType: z.string(),
  data: z.string(),
});

const thinkingContentSchema = z.strictObject({
  type: z.literal("thinking"),
  text: z.string(),
});

const toolCallContentSchema = z.strictObject({
  type: z.literal("toolCall"),
  toolCallId: z.string(),
  toolName: z.string(),
  // `args`가 `unknown`인 것은 "모델이 준 값을 신뢰하지 않는다"는 §6 계약의 결과다.
  // 여기서 형태를 좁히면 그 계약이 저장 경로에서만 달라진다.
  args: z.unknown(),
});

const tokenUsageSchema = z.strictObject({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
});

export const userMessageSchema = z.strictObject({
  id: z.string(),
  role: z.literal("user"),
  content: z.array(z.union([textContentSchema, imageContentSchema])),
  timestamp: z.number(),
});

export const assistantMessageSchema = z.strictObject({
  id: z.string(),
  role: z.literal("assistant"),
  content: z.array(z.union([textContentSchema, thinkingContentSchema, toolCallContentSchema])),
  stopReason: z.enum(["end_turn", "tool_use", "max_tokens", "error", "aborted"]),
  errorMessage: z.string().exactOptional(),
  usage: tokenUsageSchema,
  timestamp: z.number(),
});

export const toolResultMessageSchema = z.strictObject({
  id: z.string(),
  role: z.literal("toolResult"),
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.array(z.union([textContentSchema, imageContentSchema])),
  isError: z.boolean(),
  source: z.enum(["local", "network"]),
  timestamp: z.number(),
});

/** `AgentMessage`의 정본 스키마. `role`로 닫힌 판별 유니온이다 */
export const agentMessageSchema = z.discriminatedUnion("role", [
  userMessageSchema,
  assistantMessageSchema,
  toolResultMessageSchema,
]);
