/**
 * T-008a — 와이어 변환 골든 테스트.
 *
 * 기대값의 정본은 두 곳이다:
 * - 코어 메시지 모델: `docs/CORE-INTERFACE.md` §2 (역할 3종 × 콘텐츠 종류)
 * - 와이어 포맷: Anthropic Messages API의 문서화된 블록 형태
 *   (`text` / `image.source.base64` / `tool_use` / `tool_result`)
 *
 * 그리고 불변 조건 6(결정적 직렬화, §9)과 ARCHITECTURE §2.4(프롬프트 캐시 보존)를
 * 변환 계층에 적용한다 — 같은 입력은 바이트 동일한 출력을 내고, 입력 트랜스크립트를
 * 건드리지 않는다.
 *
 * 구현을 읽어 기대값을 맞추지 않는다. 문서가 정하지 않은 지점은 미규정 마커로
 * 표시하고 관찰만 기록한다 — 그 항목들은 QA 리포트의 "판정 필요"로 올라간다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { AgentMessage, ModelToolSchema } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { ConversionError, toAnthropicMessages, toAnthropicTools } from "../src/index.ts";

const TS = 1_700_000_000_000;

/** 1×1 투명 PNG (base64). 실제 디코딩은 하지 않으므로 값 자체는 중요치 않다 */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function userText(text: string): AgentMessage {
  return { id: "m1", role: "user", content: [{ type: "text", text }], timestamp: TS };
}

describe("toAnthropicMessages — 역할 3종 × 콘텐츠 종류 (CORE-INTERFACE §2)", () => {
  it("user 메시지의 text를 text 블록으로 옮긴다", () => {
    expect(toAnthropicMessages([userText("안녕")])).toEqual([
      { role: "user", content: [{ type: "text", text: "안녕" }] },
    ]);
  });

  it("user 메시지의 image를 base64 source 블록으로 옮긴다", () => {
    const messages: AgentMessage[] = [
      {
        id: "m2",
        role: "user",
        content: [
          { type: "text", text: "이 그림은?" },
          { type: "image", mimeType: "image/png", data: PNG_B64 },
        ],
        timestamp: TS,
      },
    ];

    expect(toAnthropicMessages(messages)).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "이 그림은?" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_B64 } },
        ],
      },
    ]);
  });

  it("지원 이미지 타입 4종을 모두 옮긴다", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/gif", "image/webp"]) {
      const [message] = toAnthropicMessages([
        {
          id: "m3",
          role: "user",
          content: [{ type: "image", mimeType, data: PNG_B64 }],
          timestamp: TS,
        },
      ]);
      expect(message?.content).toEqual([
        { type: "image", source: { type: "base64", media_type: mimeType, data: PNG_B64 } },
      ]);
    }
  });

  it("assistant 메시지의 text와 toolCall을 순서 그대로 옮긴다", () => {
    const messages: AgentMessage[] = [
      {
        id: "m4",
        role: "assistant",
        content: [
          { type: "text", text: "파일을 읽을게" },
          { type: "toolCall", toolCallId: "call_1", toolName: "read", args: { path: "a.ts" } },
          { type: "text", text: "그리고 하나 더" },
          { type: "toolCall", toolCallId: "call_2", toolName: "read", args: { path: "b.ts" } },
        ],
        stopReason: "tool_use",
        usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
    ];

    expect(toAnthropicMessages(messages)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "파일을 읽을게" },
          { type: "tool_use", id: "call_1", name: "read", input: { path: "a.ts" } },
          { type: "text", text: "그리고 하나 더" },
          { type: "tool_use", id: "call_2", name: "read", input: { path: "b.ts" } },
        ],
      },
    ]);
  });

  it("인자 없는 도구 호출은 빈 객체 input으로 옮긴다", () => {
    const messages: AgentMessage[] = [
      {
        id: "m5",
        role: "assistant",
        content: [{ type: "toolCall", toolCallId: "c", toolName: "now", args: {} }],
        stopReason: "tool_use",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
    ];

    expect(toAnthropicMessages(messages)).toEqual([
      { role: "assistant", content: [{ type: "tool_use", id: "c", name: "now", input: {} }] },
    ]);
  });

  it("toolResult를 user 역할의 tool_result 블록으로 옮긴다 (isError 반영)", () => {
    const messages: AgentMessage[] = [
      {
        id: "m6",
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "파일 내용" }],
        isError: false,
        source: "local",
        timestamp: TS,
      },
      {
        id: "m7",
        role: "toolResult",
        toolCallId: "call_2",
        toolName: "read",
        content: [{ type: "text", text: "ENOENT: no such file" }],
        isError: true,
        source: "local",
        timestamp: TS,
      },
    ];

    expect(toAnthropicMessages(messages)).toEqual([
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: [{ type: "text", text: "파일 내용" }],
            is_error: false,
          },
          {
            type: "tool_result",
            tool_use_id: "call_2",
            content: [{ type: "text", text: "ENOENT: no such file" }],
            is_error: true,
          },
        ],
      },
    ]);
  });

  it("toolResult의 image 콘텐츠도 base64 블록으로 옮긴다", () => {
    const messages: AgentMessage[] = [
      {
        id: "m8",
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "screenshot",
        content: [
          { type: "text", text: "캡처함" },
          { type: "image", mimeType: "image/webp", data: PNG_B64 },
        ],
        isError: false,
        source: "local",
        timestamp: TS,
      },
    ];

    const [message] = toAnthropicMessages(messages);
    expect(message?.content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "call_1",
        content: [
          { type: "text", text: "캡처함" },
          { type: "image", source: { type: "base64", media_type: "image/webp", data: PNG_B64 } },
        ],
        is_error: false,
      },
    ]);
  });
});

describe("toAnthropicMessages — 전체 트랜스크립트 형태", () => {
  /** 역할 3종이 한 번씩 등장하는 대표 트랜스크립트 */
  function fullTranscript(): AgentMessage[] {
    return [
      { id: "m9", role: "user", content: [{ type: "text", text: "a.ts 읽어줘" }], timestamp: TS },
      {
        id: "m10",
        role: "assistant",
        content: [
          { type: "thinking", text: "읽기 도구를 쓰자" },
          { type: "text", text: "읽을게" },
          { type: "toolCall", toolCallId: "call_1", toolName: "read", args: { path: "a.ts" } },
        ],
        stopReason: "tool_use",
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
      {
        id: "m11",
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "export const a = 1;" }],
        isError: false,
        source: "local",
        timestamp: TS,
      },
      { id: "m12", role: "user", content: [{ type: "text", text: "고마워" }], timestamp: TS },
      {
        id: "m13",
        role: "assistant",
        content: [{ type: "text", text: "천만에" }],
        stopReason: "end_turn",
        usage: { input: 20, output: 3, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
    ];
  }

  it("메시지 순서를 재배열하지 않는다", () => {
    const converted = toAnthropicMessages(fullTranscript());
    const texts = converted.flatMap((message) =>
      (message.content as { type: string; text?: string }[])
        .filter((block) => block.type === "text")
        .map((block) => block.text),
    );
    expect(texts).toEqual(["a.ts 읽어줘", "읽을게", "고마워", "천만에"]);
  });

  it("인접 메시지의 역할이 교대한다 (Messages API는 연속 동일 역할을 거부한다)", () => {
    const converted = toAnthropicMessages(fullTranscript());
    for (let i = 1; i < converted.length; i += 1) {
      expect(converted[i]?.role).not.toBe(converted[i - 1]?.role);
    }
  });

  it("연속한 toolResult가 하나의 user 메시지로 합쳐진다", () => {
    const messages: AgentMessage[] = [
      {
        id: "m14",
        role: "assistant",
        content: [
          { type: "toolCall", toolCallId: "c1", toolName: "read", args: {} },
          { type: "toolCall", toolCallId: "c2", toolName: "read", args: {} },
        ],
        stopReason: "tool_use",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
      {
        id: "m15",
        role: "toolResult",
        toolCallId: "c1",
        toolName: "read",
        content: [{ type: "text", text: "1" }],
        isError: false,
        source: "local",
        timestamp: TS,
      },
      {
        id: "m16",
        role: "toolResult",
        toolCallId: "c2",
        toolName: "read",
        content: [{ type: "text", text: "2" }],
        isError: false,
        source: "local",
        timestamp: TS,
      },
    ];

    const converted = toAnthropicMessages(messages);
    expect(converted).toHaveLength(2);
    expect(converted[1]?.role).toBe("user");
    expect(converted[1]?.content).toHaveLength(2);
  });

  it("빈 트랜스크립트는 빈 배열이 된다", () => {
    expect(toAnthropicMessages([])).toEqual([]);
  });

  /**
   * [미규정] CORE-INTERFACE는 thinking 콘텐츠의 와이어 왕복을 규정하지 않는다.
   * 여기서 검증하는 것은 "무엇이 나가는가"가 아니라 **결과가 API 계약을 깨지 않는가**다 —
   * thinking을 그대로 text로 흘리면 모델의 내부 추론이 다음 턴의 사용자 발화처럼
   * 보이게 되고, 서명 없는 thinking 블록을 보내면 API가 400으로 답한다.
   * 실제 방출 여부의 판정은 QA 리포트로 올린다.
   */
  it("[미규정] thinking 콘텐츠는 어떤 경우에도 API가 거부할 블록을 만들지 않는다", () => {
    const converted = toAnthropicMessages([
      {
        id: "m17",
        role: "assistant",
        content: [{ type: "thinking", text: "속으로 생각" }],
        stopReason: "end_turn",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
    ]);

    for (const message of converted) {
      for (const block of message.content as { type: string }[]) {
        // 서명 없는 thinking 블록은 전송 불가. text로 둔갑시키는 것도 금지.
        expect(block.type).not.toBe("thinking");
        expect(block.type).not.toBe("redacted_thinking");
      }
    }
  });
});

describe("결정적 직렬화 (불변 조건 6) · 입력 불변 (ARCHITECTURE §2.4)", () => {
  function sample(): AgentMessage[] {
    return [
      {
        id: "m18",
        role: "user",
        content: [
          { type: "text", text: "hello" },
          { type: "image", mimeType: "image/jpeg", data: PNG_B64 },
        ],
        timestamp: TS,
      },
      {
        id: "m19",
        role: "assistant",
        content: [
          { type: "text", text: "ok" },
          { type: "toolCall", toolCallId: "c1", toolName: "t", args: { z: 1, a: 2, m: [3, 4] } },
        ],
        stopReason: "tool_use",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
      {
        id: "m20",
        role: "toolResult",
        toolCallId: "c1",
        toolName: "t",
        content: [{ type: "text", text: "done" }],
        isError: false,
        source: "network",
        timestamp: TS,
      },
    ];
  }

  it("같은 입력 객체를 두 번 변환하면 바이트 동일하다", () => {
    const input = sample();
    expect(JSON.stringify(toAnthropicMessages(input))).toBe(
      JSON.stringify(toAnthropicMessages(input)),
    );
  });

  it("동등한 별개 입력도 바이트 동일한 출력을 낸다 (키 순서 안정)", () => {
    expect(JSON.stringify(toAnthropicMessages(sample()))).toBe(
      JSON.stringify(toAnthropicMessages(sample())),
    );
  });

  it("도구 인자의 키 순서를 정렬하지 않고 보존한다", () => {
    const [message] = toAnthropicMessages([
      {
        id: "m21",
        role: "assistant",
        content: [{ type: "toolCall", toolCallId: "c", toolName: "t", args: { z: 1, a: 2 } }],
        stopReason: "tool_use",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        timestamp: TS,
      },
    ]);
    expect(JSON.stringify(message?.content)).toBe(
      '[{"type":"tool_use","id":"c","name":"t","input":{"z":1,"a":2}}]',
    );
  });

  it("입력 트랜스크립트를 변형하지 않는다 — 과거 컨텍스트 변경은 캐시를 깬다", () => {
    const input = sample();
    const before = JSON.stringify(input);
    toAnthropicMessages(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("반환 배열을 변형해도 다음 변환 결과가 오염되지 않는다", () => {
    const input = sample();
    const first = toAnthropicMessages(input);
    const firstContent = first[0]?.content;
    expect(Array.isArray(firstContent)).toBe(true);
    (firstContent as unknown[]).push({ type: "text", text: "오염" });
    expect(toAnthropicMessages(input)).toEqual(toAnthropicMessages(input));
    expect(JSON.stringify(toAnthropicMessages(input))).not.toContain("오염");
  });
});

describe("toAnthropicMessages — 변환 불가 입력은 ConversionError", () => {
  it("지원하지 않는 이미지 타입 (user)", () => {
    expect(() =>
      toAnthropicMessages([
        {
          id: "m22",
          role: "user",
          content: [{ type: "image", mimeType: "image/svg+xml", data: PNG_B64 }],
          timestamp: TS,
        },
      ]),
    ).toThrow(ConversionError);
  });

  it("지원하지 않는 이미지 타입 (toolResult)", () => {
    expect(() =>
      toAnthropicMessages([
        {
          id: "m23",
          role: "toolResult",
          toolCallId: "c",
          toolName: "t",
          content: [{ type: "image", mimeType: "application/pdf", data: PNG_B64 }],
          isError: false,
          source: "local",
          timestamp: TS,
        },
      ]),
    ).toThrow(ConversionError);
  });

  it("도구 인자가 JSON 객체가 아니면 던진다 (§6 — 모델 인자는 신뢰하지 않는다)", () => {
    for (const args of [null, [1, 2], "문자열", 42, true] as unknown[]) {
      expect(() =>
        toAnthropicMessages([
          {
            id: "m24",
            role: "assistant",
            content: [{ type: "toolCall", toolCallId: "c", toolName: "t", args }],
            stopReason: "tool_use",
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
            timestamp: TS,
          },
        ]),
      ).toThrow(ConversionError);
    }
  });

  it("ConversionError는 Error이고 원인을 문자열로 남긴다 (§2.6 침묵 실패 금지)", () => {
    let caught: unknown;
    try {
      toAnthropicMessages([
        {
          id: "m25",
          role: "user",
          content: [{ type: "image", mimeType: "image/svg+xml", data: PNG_B64 }],
          timestamp: TS,
        },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(ConversionError);
    expect((caught as ConversionError).name).toBe("ConversionError");
    expect((caught as ConversionError).message).toContain("image/svg+xml");
  });
});

describe("toAnthropicTools", () => {
  function schemas(): ModelToolSchema[] {
    return [
      {
        name: "zeta",
        description: "마지막에 등록된 도구",
        inputSchema: {
          type: "object",
          properties: { b: { type: "string" }, a: { type: "number" } },
          required: ["b"],
          additionalProperties: false,
        },
      },
      {
        name: "alpha",
        description: "먼저 등록된 도구",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
    ];
  }

  it("문서화된 SDK 도구 형태로 옮긴다", () => {
    expect(toAnthropicTools([schemas()[1] as ModelToolSchema])).toEqual([
      {
        name: "alpha",
        description: "먼저 등록된 도구",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
    ]);
  });

  it("등록 순서를 보존한다 — 이름으로 정렬하지 않는다 (불변 조건 6)", () => {
    expect(toAnthropicTools(schemas()).map((tool) => tool.name)).toEqual(["zeta", "alpha"]);
  });

  it("inputSchema를 재가공하지 않는다 — 코어가 만든 형태 그대로 나간다", () => {
    const input = schemas();
    const [converted] = toAnthropicTools(input);
    expect(JSON.stringify(converted?.input_schema)).toBe(JSON.stringify(input[0]?.inputSchema));
  });

  it("결정적이다 — 같은 입력에 바이트 동일 출력", () => {
    expect(JSON.stringify(toAnthropicTools(schemas()))).toBe(
      JSON.stringify(toAnthropicTools(schemas())),
    );
  });

  it("빈 도구 목록은 빈 배열이 된다", () => {
    expect(toAnthropicTools([])).toEqual([]);
  });

  it("입력 스키마 배열을 변형하지 않는다", () => {
    const input = schemas();
    const before = JSON.stringify(input);
    toAnthropicTools(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("메시지 id는 와이어로 나가지 않는다 (CORE-INTERFACE §2 · SESSION-STORE §3)", () => {
  /**
   * id가 페이로드에 실리면 매 요청 바이트가 달라져 프롬프트 캐시(ARCHITECTURE §2.4)가
   * 통째로 깨진다. 키 하나를 찾는 것이 아니라 **직렬화 결과에 id 값이 없는지**를 본다 —
   * 어떤 이름으로 새어 나가든 잡히도록.
   */
  const IDENTIFIABLE: AgentMessage[] = [
    {
      id: "ID-USER-0001",
      role: "user",
      content: [{ type: "text", text: "안녕" }],
      timestamp: TS,
    },
    {
      id: "ID-ASSISTANT-0002",
      role: "assistant",
      content: [
        { type: "text", text: "읽을게" },
        { type: "toolCall", toolCallId: "call_1", toolName: "read", args: { path: "a.ts" } },
      ],
      stopReason: "tool_use",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      timestamp: TS,
    },
    {
      id: "ID-TOOLRESULT-0003",
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "read",
      content: [{ type: "text", text: "내용" }],
      isError: false,
      source: "local",
      timestamp: TS,
    },
  ];

  it("변환 산출물의 어디에도 메시지 id가 실리지 않는다", () => {
    const serialized = JSON.stringify(toAnthropicMessages(IDENTIFIABLE));
    expect(serialized).not.toContain("ID-USER-0001");
    expect(serialized).not.toContain("ID-ASSISTANT-0002");
    expect(serialized).not.toContain("ID-TOOLRESULT-0003");
    // toolCallId는 와이어 계약의 일부라 남아야 한다 — id 제거가 과하지 않았음을 확인
    expect(serialized).toContain("call_1");
  });

  it("변환 산출물의 어떤 객체에도 id 키가 없다 (tool_use의 id는 toolCallId다)", () => {
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "id") {
          // 와이어의 `id`는 tool_use 블록의 toolCallId뿐이다
          expect(child).toBe("call_1");
        }
        walk(child);
      }
    };
    walk(toAnthropicMessages(IDENTIFIABLE));
  });

  it("id가 달라져도 와이어 바이트는 같다 — 캐시가 id 때문에 깨지지 않는다", () => {
    const renamed: AgentMessage[] = IDENTIFIABLE.map((message) => ({
      ...message,
      id: `${message.id}-different`,
    }));
    expect(JSON.stringify(toAnthropicMessages(renamed))).toBe(
      JSON.stringify(toAnthropicMessages(IDENTIFIABLE)),
    );
  });
});
