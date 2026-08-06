/**
 * 도구 계약 — `docs/CORE-INTERFACE.md` §6.
 *
 * 코어는 어떤 도구가 존재하는지 모른다. `AgentTool` 배열을 받을 뿐이고,
 * 도구 구현(파일·셸)과 승인 게이트는 전부 코어 밖이다.
 */

import type { z } from "zod";
import type { ImageContent, TextContent, ToolResultSource } from "./messages.ts";

export interface ToolResult<TDetails = unknown> {
  /** 모델이 보는 것 — "도구 결과는 프롬프트다" */
  content: (TextContent | ImageContent)[];
  /** UI·로그용 구조화 데이터. 모델에게 가지 않는다 */
  details?: TDetails;
  /** 필수 (§2) — taint 흔적의 강제 */
  source: ToolResultSource;
}

export interface ToolExecutionContext {
  toolCallId: string;
  /** 존중 의무 — 중단 요청 후에도 계속 도는 도구는 결함이다 */
  signal: AbortSignal;
  /** 장시간 도구의 진행 스트리밍 */
  onUpdate?: (partial: ToolResult) => void;
}

export interface AgentTool<TParams extends z.ZodType = z.ZodType> {
  name: string;
  /** UI 표시용 */
  label: string;
  /** 모델이 보는 설명 — 코드와 같은 무게로 리뷰한다 */
  description: string;
  /** `z.strictObject` 필수 — closed object. 모델 인자는 신뢰하지 않는다 */
  paramsSchema: TParams;
  /**
   * 실패는 throw로 알린다. 루프가 잡아 `isError: true` 결과로 변환하고
   * 에러 텍스트를 모델에게 보인다 — 모델이 다음 행동을 정정할 수 있도록
   * "무엇을 시도하면 되는지"까지 담는 것을 지향한다.
   */
  execute(params: z.infer<TParams>, ctx: ToolExecutionContext): Promise<ToolResult>;
}

/**
 * 인자 검증 결과. 실패를 throw가 아니라 값으로 돌려주는 이유는, 루프가 이것을
 * 그대로 `isError` 도구 결과로 변환해 모델에게 보여야 하기 때문이다.
 */
export type ToolArgsValidation<TParams extends z.ZodType = z.ZodType> =
  | { ok: true; value: z.infer<TParams> }
  | { ok: false; message: string };

/** zod 이슈를 모델이 읽고 고칠 수 있는 한 줄로 편다 */
function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * 불변 조건 3 — 도구 인자는 검증 전에 실행되지 않는다.
 * 스키마에 없는 필드가 오면(closed object) 검증 실패다.
 */
export function validateToolArgs<TParams extends z.ZodType>(
  tool: AgentTool<TParams>,
  args: unknown,
): ToolArgsValidation<TParams> {
  const parsed = tool.paramsSchema.safeParse(args);
  if (parsed.success) {
    return { ok: true, value: parsed.data as z.infer<TParams> };
  }
  return {
    ok: false,
    message: `Invalid arguments for tool "${tool.name}": ${formatIssues(parsed.error.issues)}`,
  };
}
