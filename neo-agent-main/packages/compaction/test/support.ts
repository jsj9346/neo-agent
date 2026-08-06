/**
 * 테스트용 트랜스크립트 빌더. 계약 검증(QA-A 소유)이 아니라 구현 단위 테스트의
 * 보조 도구다 — 코어의 발급 규칙을 흉내 내지 않고 고정 id를 쓴다.
 */

import type {
  AgentMessage,
  AssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  ToolResultMessage,
  UserMessage,
} from "@neo-agent/core";
import type { CompactionConfig } from "../src/config.ts";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `m${counter}`;
}

export function user(text: string): UserMessage {
  return { id: nextId(), role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

export function assistant(
  text: string,
  overrides: Partial<Omit<AssistantMessage, "role">> = {},
): AssistantMessage {
  return {
    id: nextId(),
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "end_turn",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    timestamp: 0,
    ...overrides,
  };
}

export function toolResult(
  overrides: Partial<Omit<ToolResultMessage, "role">> = {},
): ToolResultMessage {
  return {
    id: nextId(),
    role: "toolResult",
    toolCallId: "call_1",
    toolName: "read_file",
    content: [{ type: "text", text: "파일 내용" }],
    isError: false,
    source: "local",
    timestamp: 0,
    ...overrides,
  };
}

export const config = (overrides: Partial<CompactionConfig> = {}): CompactionConfig => ({
  contextWindowTokens: 1000,
  threshold: 0.75,
  keepRecentTurns: 2,
  summaryMaxTokens: 8192,
  ...overrides,
});

export function ids(messages: readonly AgentMessage[]): string[] {
  return messages.map((message) => message.id);
}

/** 요청을 기록하고 정해진 이벤트를 그대로 돌려주는 ModelClient */
export function stubClient(events: readonly ModelStreamEvent[]): ModelClient & {
  requests: ModelRequest[];
} {
  const requests: ModelRequest[] = [];
  return {
    modelId: "stub-model",
    requests,
    async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
      requests.push(request);
      for (const event of events) yield event;
    },
  };
}

export function doneEvent(
  overrides: Partial<Omit<AssistantMessage, "id" | "role">> = {},
): ModelStreamEvent {
  return {
    type: "done",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "## Goal\n요약문" }],
      stopReason: "end_turn",
      usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
      timestamp: 0,
      ...overrides,
    },
  };
}
