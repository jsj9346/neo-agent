/**
 * 렌더러 단위 테스트 — `docs/CLI-INTERFACE.md` §7.
 *
 * 계약 표 자체는 QA의 계약 테스트가 본다. 여기서는 구현이 **계약의 빈칸을 어떻게
 * 닫았는지**를 고정한다 — 특히 델타 없이 온 메시지의 처리와 합성 짝의 표시다.
 */

import type {
  AgentEvent,
  AssistantMessage,
  ToolResult,
  ToolResultMessage,
  UserMessage,
} from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { createRenderer } from "../src/renderer.ts";

const NO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function collector(): { out: { write(text: string): void }; text(): string } {
  const chunks: string[] = [];
  return {
    out: {
      write(text: string): void {
        chunks.push(text);
      },
    },
    text: () => stripAnsi(chunks.join("")),
  };
}

function render(events: AgentEvent[]): string {
  const sink = collector();
  const renderer = createRenderer(sink.out);
  const signal = new AbortController().signal;
  for (const event of events) void renderer(event, signal);
  return sink.text();
}

function user(text: string, id = "u1"): UserMessage {
  return { id, role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: "a1",
    role: "assistant",
    content: [],
    stopReason: "end_turn",
    usage: NO_USAGE,
    timestamp: 0,
    ...overrides,
  };
}

function toolResult(overrides: Partial<ToolResultMessage> = {}): ToolResultMessage {
  return {
    id: "t1",
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read_file",
    content: [{ type: "text", text: "본문" }],
    isError: false,
    source: "local",
    timestamp: 0,
    ...overrides,
  };
}

function result(text: string): ToolResult {
  return { content: [{ type: "text", text }], source: "local" };
}

describe("사용자 메시지", () => {
  it("message_start에서 한 번만 그린다 — message_end로 중복되지 않는다", () => {
    const text = render([
      { type: "message_start", message: user("안녕") },
      { type: "message_end", message: user("안녕") },
    ]);
    expect(text.match(/안녕/g)).toHaveLength(1);
  });

  it("코어가 주입한 합성 user 메시지도 같은 경로로 그려진다", () => {
    // 턴 한도 grace 메시지는 "내가 만든 메시지"가 아니지만 구분 없이 렌더된다
    const text = render([{ type: "message_start", message: user("턴 한도 도달", "synthetic") }]);
    expect(text).toContain("턴 한도 도달");
  });
});

describe("어시스턴트 스트리밍", () => {
  it("델타를 즉시 출력하고 최종 메시지에서 다시 그리지 않는다", () => {
    const streaming = assistant({ content: [{ type: "text", text: "안녕하세요" }] });
    const text = render([
      { type: "message_start", message: streaming },
      {
        type: "message_update",
        message: streaming,
        delta: { type: "text_delta", text: "안녕하세요" },
      },
      { type: "message_end", message: streaming },
    ]);
    expect(text.match(/안녕하세요/g)).toHaveLength(1);
  });

  it("델타가 하나도 오지 않은 메시지의 내용도 그린다 — 침묵 유실 금지", () => {
    const text = render([
      { type: "message_start", message: assistant() },
      {
        type: "message_end",
        message: assistant({ content: [{ type: "text", text: "스트리밍 없이 온 본문" }] }),
      },
    ]);
    expect(text).toContain("스트리밍 없이 온 본문");
  });

  it("다른 id의 message_update는 그리지 않는다 — 상관은 id로 한다", () => {
    const text = render([
      { type: "message_start", message: assistant({ id: "a1" }) },
      {
        type: "message_update",
        message: assistant({ id: "다른-메시지" }),
        delta: { type: "text_delta", text: "엉뚱한 델타" },
      },
    ]);
    expect(text).not.toContain("엉뚱한 델타");
  });
});

describe("stopReason은 침묵하지 않는다", () => {
  it("max_tokens는 잘렸다는 사실을 명시한다", () => {
    const text = render([
      { type: "message_start", message: assistant() },
      { type: "message_end", message: assistant({ stopReason: "max_tokens" }) },
    ]);
    expect(text).toContain("max_tokens");
  });

  it("error는 errorMessage를 보여준다", () => {
    const text = render([
      { type: "message_start", message: assistant() },
      {
        type: "message_end",
        message: assistant({ stopReason: "error", errorMessage: "연결이 끊겼다" }),
      },
    ]);
    expect(text).toContain("연결이 끊겼다");
  });

  it("aborted는 중단을 표시한다", () => {
    const text = render([
      { type: "message_start", message: assistant() },
      { type: "message_end", message: assistant({ stopReason: "aborted" }) },
    ]);
    expect(text).toContain("중단");
  });

  it("end_turn·tool_use는 무표시 정상이다", () => {
    for (const stopReason of ["end_turn", "tool_use"] as const) {
      const text = render([
        { type: "message_start", message: assistant() },
        { type: "message_end", message: assistant({ stopReason }) },
      ]);
      expect(text.trim()).toBe("");
    }
  });
});

describe("도구", () => {
  it("tool_end로 렌더한 toolCallId의 toolResult는 스킵한다", () => {
    const text = render([
      { type: "tool_start", toolCallId: "call-1", toolName: "read_file", args: { path: "a.ts" } },
      {
        type: "tool_end",
        toolCallId: "call-1",
        toolName: "read_file",
        result: result("파일 내용"),
        isError: false,
      },
      { type: "message_end", message: toolResult() },
    ]);
    expect(text).not.toContain("실행되지 않음");
    expect(text.match(/read_file/g)?.length).toBe(2); // start + end
  });

  it("도구 이벤트 없이 온 toolResult는 미실행 사실을 남긴다 — 비정상 종료의 합성 짝", () => {
    const text = render([
      {
        type: "message_end",
        message: toolResult({
          isError: true,
          content: [{ type: "text", text: "턴 한도로 미실행" }],
        }),
      },
    ]);
    expect(text).toContain("실행되지 않음");
    expect(text).toContain("턴 한도로 미실행");
  });

  it("결과는 유계로 요약한다 — 전문 덤프 금지", () => {
    const long = Array.from({ length: 40 }, (_, index) => `줄 ${index}`).join("\n");
    const text = render([
      {
        type: "tool_end",
        toolCallId: "call-1",
        toolName: "shell",
        result: result(long),
        isError: false,
      },
    ]);
    expect(text).toContain("줄 0");
    expect(text).not.toContain("줄 39");
    expect(text).toContain("줄 더");
  });

  it("isError는 시각적으로 구분된다", () => {
    const ok = render([
      {
        type: "tool_end",
        toolCallId: "c",
        toolName: "shell",
        result: result("done"),
        isError: false,
      },
    ]);
    const failed = render([
      {
        type: "tool_end",
        toolCallId: "c",
        toolName: "shell",
        result: result("boom"),
        isError: true,
      },
    ]);
    expect(failed).toContain("실패");
    expect(ok).not.toContain("실패");
  });

  it("tool_update는 소비하지 않는다 (§7)", () => {
    const text = render([
      {
        type: "tool_update",
        toolCallId: "c",
        toolName: "shell",
        partial: result("진행 중 출력"),
      },
    ]);
    expect(text).toBe("");
  });
});

describe("비용 가시성", () => {
  it("turn_end는 usage 네 항목을 한 줄로 보여준다", () => {
    const text = render([
      {
        type: "turn_end",
        message: assistant({
          usage: { input: 12, output: 34, cacheRead: 56, cacheWrite: 78 },
        }),
        toolResults: [],
      },
    ]);
    expect(text).toContain("12");
    expect(text).toContain("34");
    expect(text).toContain("56");
    expect(text).toContain("78");
    expect(text.trim().split("\n")).toHaveLength(1);
  });
});

describe("예외 처리", () => {
  it("렌더러 예외를 삼키지 않는다 — 런이 실패해야 한다", () => {
    const renderer = createRenderer({
      write(): void {
        throw new Error("출력 장치 실패");
      },
    });
    expect(() =>
      renderer({ type: "message_start", message: user("안녕") }, new AbortController().signal),
    ).toThrow("출력 장치 실패");
  });
});

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 이스케이프를 벗기는 것이 목적이다
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}
