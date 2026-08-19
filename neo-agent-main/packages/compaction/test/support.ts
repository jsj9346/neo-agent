/**
 * 테스트용 트랜스크립트 빌더. 계약 검증(QA-A 소유)이 아니라 구현 단위 테스트의
 * 보조 도구다 — 코어의 발급 규칙을 흉내 내지 않고 고정 id를 쓴다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
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
