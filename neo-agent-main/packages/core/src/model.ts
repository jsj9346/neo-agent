/**
 * 모델 프로바이더 경계 — `docs/CORE-INTERFACE.md` §8.
 *
 * Api/Provider 이원화(레퍼런스의 프로토콜 9종 × 라우팅 68종)는 채택하지 않고
 * 교체 지점 하나(`ModelClient`)를 좁게 정의한다. 어댑터 구현은 코어 밖이다.
 */

import { z } from "zod";
import type { AgentMessage, AssistantMessage } from "./messages.ts";
import type { AgentTool } from "./tool.ts";

/** 코어가 아는 모델의 전부 */
export interface ModelClient {
  readonly modelId: string;
  /**
   * 요청·모델·런타임 실패로 throw하거나 reject하지 않는다. 모든 실패는 스트림
   * 안에서 `stopReason: "error" | "aborted"` + `errorMessage`를 단 최종 `done`
   * 이벤트로 인코딩한다. 재시도·백오프도 어댑터 안에서 끝낸다.
   */
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
}

export interface ModelToolSchema {
  name: string;
  description: string;
  /** `z.toJSONSchema()` 산출물. 세션 시작 시 1회 변환한다 */
  inputSchema: Record<string, unknown>;
}

export interface ModelRequest {
  systemPrompt: string;
  /** 와이어 포맷 변환은 어댑터 책임 */
  messages: AgentMessage[];
  tools: ModelToolSchema[];
  maxTokens?: number;
}

export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  /** 인자가 완성된 시점에 방출. 부분 인자 스트리밍은 CLI 요구가 생길 때 재검토(§11) */
  | { type: "toolcall"; toolCallId: string; toolName: string; args: unknown }
  /** 스트림의 마지막 이벤트. `message.usage`는 필수 — 없으면 계약 위반 */
  | { type: "done"; message: ModelAssistantMessage };

/**
 * 어댑터 경계(§8) — **어댑터도 id를 모른다.**
 *
 * 코어가 스트리밍 초안 생성 시 발급한 id를 이 최종 메시지에 부여하므로
 * `message_start`/`message_update`/`message_end`가 상관 가능해진다(불변 조건 8).
 * 어댑터가 id를 채우면 코어가 덮어쓰게 되고, 필수인데 무시되는 필드가 생긴다.
 */
export type ModelAssistantMessage = Omit<AssistantMessage, "id">;

/**
 * 도구 배열을 모델 전송용 스키마로 변환한다.
 *
 * 불변 조건 6 — **등록 배열 순서를 보존한다.** 이름으로 정렬하지 않는다.
 * 모델 페이로드의 바이트 안정성이 프롬프트 캐시 적중의 전제다(ARCHITECTURE §2.4).
 *
 * `io: "input"`이 중요하다. 기본값(`"output"`)으로 변환하면 `.default()`가 붙은
 * 필드가 required로 표기되어, 생략 가능한 인자를 모델에게 필수라고 알리게 된다.
 */
export function toModelToolSchemas(tools: readonly AgentTool[]): ModelToolSchema[] {
  const seen = new Set<string>();
  return tools.map((tool) => {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool name: "${tool.name}"`);
    }
    seen.add(tool.name);

    const inputSchema = z.toJSONSchema(tool.paramsSchema, {
      io: "input",
      target: "draft-2020-12",
    }) as Record<string, unknown>;

    // $schema는 모델에 보낼 도구 정의에 불필요한 잡음이다. 페이로드를 좁게 유지한다.
    delete inputSchema.$schema;

    if (inputSchema.type !== "object" || inputSchema.additionalProperties !== false) {
      throw new Error(
        `Tool "${tool.name}" must use z.strictObject for paramsSchema (closed object required)`,
      );
    }

    return { name: tool.name, description: tool.description, inputSchema };
  });
}
