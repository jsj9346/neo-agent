/**
 * 훅 — `docs/CORE-INTERFACE.md` §7.
 *
 * 레퍼런스의 8종에서 2종으로 축소했다. 소비자가 실재하는 훅만 만든다:
 * `beforeToolCall` ← 승인 게이트, `afterToolCall` ← 출력 후처리(트렁케이션 등).
 *
 * **승인 게이트는 코어 밖이다.** 코어가 승인을 알면 승인 UI도 알아야 하고
 * (전송 비의존 위반), 승인 정책 갱신이 코어 릴리스에 묶인다. 훅 경계 뒤에
 * 두면 게이트는 코어와 독립적으로 진화한다.
 */

import type { ImageContent, TextContent } from "./messages.ts";
import type { ToolResult } from "./tool.ts";

export interface BeforeToolCallContext {
  toolCallId: string;
  toolName: string;
  /** 스키마 검증을 통과한 뒤의 인자 */
  args: unknown;
}

/**
 * 닫힌 discriminated union이다. 레퍼런스의 `{ block?: boolean; reason?: string }`은
 * `block: false` + `reason` 같은 무의미 조합을 표현할 수 있다 —
 * 불가능한 상태는 타입으로 배제한다.
 */
export type ToolCallDecision =
  | { decision: "allow" }
  /** reason은 모델에게 에러 결과로 전달된다 */
  | { decision: "block"; reason: string };

export interface AfterToolCallContext {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: ToolResult;
  isError: boolean;
}

/** 부분 오버라이드 — 생략한 필드는 원본을 유지한다 */
export interface ToolResultOverride {
  content?: (TextContent | ImageContent)[];
  isError?: boolean;
}

export interface AgentHooks {
  beforeToolCall?: (ctx: BeforeToolCallContext, signal: AbortSignal) => Promise<ToolCallDecision>;
  afterToolCall?: (
    ctx: AfterToolCallContext,
    signal: AbortSignal,
  ) => Promise<ToolResultOverride | undefined>;
}
