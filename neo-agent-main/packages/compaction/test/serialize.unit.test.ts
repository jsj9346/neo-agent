import { describe, expect, test } from "vitest";
import { serializeTranscript } from "../src/serialize.ts";
import { assistant, toolResult, user } from "./support.ts";

describe("serializeTranscript", () => {
  test("ThinkingContent는 제외하고 text·toolCall은 포함한다", () => {
    const message = assistant("", {
      content: [
        { type: "thinking", text: "내부 추론 — 새어 나가면 안 된다" },
        { type: "text", text: "파일을 읽겠다" },
        { type: "toolCall", toolCallId: "call_1", toolName: "read_file", args: { path: "/a.ts" } },
      ],
      stopReason: "tool_use",
    });

    const output = serializeTranscript([message]);

    expect(output).not.toContain("내부 추론");
    expect(output).toContain("파일을 읽겠다");
    expect(output).toContain("[tool_call] read_file (call_1)");
    expect(output).toContain('{"path":"/a.ts"}');
  });

  test("도구 결과는 이름·id·오류·외부 유래 표시와 함께 본문을 싣는다", () => {
    const output = serializeTranscript([
      toolResult({
        toolName: "fetch",
        toolCallId: "call_9",
        isError: true,
        source: "network",
        content: [{ type: "text", text: "404 Not Found" }],
      }),
    ]);

    expect(output).toBe("[tool_result] fetch (call_9) [error] [network]\n404 Not Found");
  });

  test("비정상 종료를 표기한다 — §5의 '진행: 막힘'의 재료", () => {
    const output = serializeTranscript([
      assistant("여기까지", { stopReason: "error", errorMessage: "rate limited" }),
    ]);
    expect(output).toContain("[stop: error] rate limited");
  });

  test("정상 종료에는 stop 표기가 없다", () => {
    expect(serializeTranscript([assistant("응")])).toBe("[assistant]\n응");
  });

  test("이미지는 조용히 사라지지 않고 자리표시자로 남는다", () => {
    const output = serializeTranscript([
      {
        id: "x",
        role: "user",
        content: [{ type: "image", mimeType: "image/png", data: "..." }],
        timestamp: 0,
      },
    ]);
    expect(output).toBe("[user]\n[image: image/png]");
  });

  test("메시지 사이는 빈 줄로 구분한다", () => {
    expect(serializeTranscript([user("안녕"), assistant("응")])).toBe(
      "[user]\n안녕\n\n[assistant]\n응",
    );
  });

  test("직렬화 불가 인자에도 throw하지 않는다", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const message = assistant("", {
      content: [{ type: "toolCall", toolCallId: "c", toolName: "t", args: circular }],
      stopReason: "tool_use",
    });

    expect(() => serializeTranscript([message])).not.toThrow();
    expect(serializeTranscript([message])).toContain("[unserializable args]");
  });
});
