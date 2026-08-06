/**
 * QA-A (T-010) — `generateSummary`의 계약 검증. (T-007)
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `docs/COMPACTION.md` §5 — "실패는 throw — 부분 요약을 반환하지 않는다" /
 *       "**요청 형태**: `systemPrompt` = 요약 전용 프롬프트, `messages` = 직렬화된 대화를
 *       담은 **단일 user 메시지**, `tools` = **빈 배열**, `maxTokens` = `summaryMaxTokens`" /
 *       "**직렬화에서 `ThinkingContent`는 제외한다** ... toolCall(이름+인자)과
 *       toolResult(텍스트)는 포함한다" /
 *       "`previousSummary`가 있으면 프롬프트에 함께 실어 '보존 + 갱신'을 지시한다" /
 *       "**`stopReason`이 `"end_turn"`이 아니면 실패다.** `max_tokens`는 잘린 요약이고 ...
 *       `error`·`aborted`도 마찬가지. **응답에 텍스트가 없어도 실패다.**"
 *   - `docs/COMPACTION.md` §7 — "요약 실패 = 압축 포기, 대화는 무손상"
 *   - `docs/COMPACTION.md` §10 — **미결**: "요약 프롬프트 전문과 직렬화 포맷 — 구조는 §5가
 *       계약, 문구·포맷은 구현 시 확정"
 *
 * §10이 문구·포맷을 미결로 남겼으므로 이 파일은 **문구·구분자·마크업을 단언하지 않는다.**
 * 검증 대상은 §5가 계약으로 못박은 구조적 사실뿐이다.
 *
 * 실측 근거: `plans/20260806-compaction-qa-a-evidence.md` 실측 3(어댑터가 `tools: []` 요청을
 * 유효하게 처리하고 요청 `maxTokens`가 어댑터 기본값을 덮는다)·실측 4(중단이 `"aborted"`로
 * 실패와 구분된다).
 */

import type {
  AgentMessage,
  AssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
  TokenUsage,
  ToolResultMessage,
} from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import {
  type CompactionConfig,
  type CompactionPlan,
  generateSummary,
  planCompaction,
} from "../src/index.ts";

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

// ---------------------------------------------------------------------------
// 모의 ModelClient — 요청 페이로드를 기록하고 스크립트된 응답을 낸다
// ---------------------------------------------------------------------------

interface ScriptedResponse {
  text?: string;
  stopReason?: StopReason;
  errorMessage?: string;
  /** 텍스트 블록 자체를 넣지 않는다 — §5 "응답에 텍스트가 없어도 실패다" */
  omitText?: boolean;
}

class RecordingModelClient implements ModelClient {
  readonly modelId = "qa-a/summary-contract";
  readonly requests: ModelRequest[] = [];
  readonly signals: AbortSignal[] = [];
  readonly #response: ScriptedResponse;

  constructor(response: ScriptedResponse = {}) {
    this.#response = response;
  }

  get callCount(): number {
    return this.requests.length;
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    this.signals.push(signal);

    const content: AssistantMessage["content"] = [];
    if (this.#response.omitText !== true) {
      const text = this.#response.text ?? "## 목표\n요약 본문";
      content.push({ type: "text", text });
      yield { type: "text_delta", text };
    }

    const message: Omit<AssistantMessage, "id"> = {
      role: "assistant",
      content,
      stopReason: this.#response.stopReason ?? "end_turn",
      usage: { ...ZERO_USAGE, input: 100, output: 50 },
      timestamp: Date.now(),
    };
    if (this.#response.errorMessage !== undefined) {
      (message as AssistantMessage).errorMessage = this.#response.errorMessage;
    }
    yield { type: "done", message };
  }
}

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

function user(text: string): AgentMessage {
  return { id: nextId("user"), role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

function assistantWithEverything(): AgentMessage {
  const message: AssistantMessage = {
    id: nextId("assistant"),
    role: "assistant",
    content: [
      { type: "thinking", text: "THINKING_비밀_추론_흔적" },
      { type: "text", text: "파일을 읽겠습니다" },
      {
        type: "toolCall",
        toolCallId: "call-1",
        toolName: "read_file",
        args: { path: "/src/loop.ts", limit: 40 },
      },
    ],
    stopReason: "tool_use",
    usage: { ...ZERO_USAGE, input: 100 },
    timestamp: 0,
  };
  return message;
}

function toolResult(): ToolResultMessage {
  return {
    id: nextId("toolResult"),
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read_file",
    content: [{ type: "text", text: "TOOLRESULT_파일_본문_내용" }],
    isError: false,
    source: "local",
    timestamp: 0,
  };
}

function config(overrides: Partial<CompactionConfig> = {}): CompactionConfig {
  return {
    contextWindowTokens: 200_000,
    threshold: 0.75,
    keepRecentTurns: 2,
    summaryMaxTokens: 8192,
    ...overrides,
  };
}

/** §5의 소비 형태 그대로 — planCompaction의 산출물을 넘긴다 */
function makePlan(options: { previousSummary?: string } = {}): CompactionPlan {
  const messages: AgentMessage[] = [
    user("USER_첫_질문"),
    assistantWithEverything(),
    toolResult(),
    {
      ...(assistantWithEverything() as AssistantMessage),
      content: [{ type: "text", text: "읽었습니다" }],
      stopReason: "end_turn",
    },
    user("USER_둘째_질문"),
    {
      id: nextId("assistant"),
      role: "assistant",
      content: [{ type: "text", text: "두 번째 답" }],
      stopReason: "end_turn",
      usage: { ...ZERO_USAGE, input: 200 },
      timestamp: 0,
    },
    user("USER_유지_턴"),
    {
      id: nextId("assistant"),
      role: "assistant",
      content: [{ type: "text", text: "유지 답" }],
      stopReason: "end_turn",
      usage: { ...ZERO_USAGE, input: 300 },
      timestamp: 0,
    },
  ];

  const result = planCompaction(messages, config({ keepRecentTurns: 1 }));
  if (result.kind !== "plan") throw new Error("픽스처가 계획을 만들지 못했다");
  return options.previousSummary === undefined
    ? result
    : { ...result, previousSummary: options.previousSummary };
}

function requestText(request: ModelRequest): string {
  return request.messages
    .flatMap((message) => (message.role === "user" ? message.content : []))
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");
}

/** systemPrompt + 직렬화 본문 전체 — "프롬프트에 반영"의 관찰 범위 */
function fullPayloadText(request: ModelRequest): string {
  return `${request.systemPrompt}\n${requestText(request)}`;
}

// ---------------------------------------------------------------------------
// 1. 요청 형태 — §5
// ---------------------------------------------------------------------------

describe("요청 형태 (§5)", () => {
  test("tools는 빈 배열이다", async () => {
    // 실측 3: 어댑터는 빈 tools를 와이어에서 필드 생략으로 처리해 정상 완주한다.
    // 여기서 검증하는 것은 `ModelRequest` 수준의 계약이다 ([미규정 A-3]).
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    expect(client.callCount).toBe(1);
    expect(client.requests[0]?.tools).toEqual([]);
  });

  test("maxTokens가 config.summaryMaxTokens다", async () => {
    // 어댑터 기본값(8192)과 구분되는 값을 쓴다 — 같은 값이면 "config를 썼다"와
    // "안 채웠다"가 관찰상 구분되지 않는다(실측 3에서 어댑터 기본값이 8192로 확인됨).
    const client = new RecordingModelClient();
    await generateSummary(
      client,
      makePlan(),
      config({ summaryMaxTokens: 4_321 }),
      new AbortController().signal,
    );

    expect(client.requests[0]?.maxTokens).toBe(4_321);
  });

  test("messages는 단일 user 메시지다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    const messages = client.requests[0]?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    // 트랜스크립트를 그대로 재전송하면 압축의 목적(컨텍스트 축소)이 무의미해지고,
    // 요약 호출이 본 대화와 같은 크기의 입력을 쓴다.
    expect(requestText(client.requests[0] as ModelRequest).length).toBeGreaterThan(0);
  });

  test("systemPrompt가 요약 전용이고 비어 있지 않다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    const systemPrompt = client.requests[0]?.systemPrompt ?? "";
    expect(typeof systemPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(0);
  });

  test("abort signal이 ModelClient 호출에 그대로 전달된다", async () => {
    // §6: "Ctrl+C는 요약 호출을 abort하고 구 세션을 그대로 유지한다." 신호가 전달되지
    // 않으면 취소해도 요약 호출이 계속 돈다.
    const client = new RecordingModelClient();
    const controller = new AbortController();
    await generateSummary(client, makePlan(), config(), controller.signal);

    expect(client.signals).toHaveLength(1);
    const passed = client.signals[0];
    expect(passed).toBeDefined();
    expect(passed?.aborted).toBe(false);
    controller.abort(new Error("사용자 취소"));
    // 같은 신호(또는 그것을 따라가는 신호)여야 취소가 전파된다.
    expect(passed?.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. 직렬화 — §5
//    thinking 제외 / toolCall(이름+인자) 포함 / toolResult(텍스트) 포함
// ---------------------------------------------------------------------------

describe("직렬화 (§5)", () => {
  test("ThinkingContent가 직렬화에 들어가지 않는다", async () => {
    // §5: "내부 추론이 요약에 스며들면 다음 세션의 '사용자가 말한 사실'처럼 오염된다."
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    const payload = fullPayloadText(client.requests[0] as ModelRequest);
    expect(payload).not.toContain("THINKING_비밀_추론_흔적");
  });

  test("toolCall의 이름과 인자가 들어간다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    const payload = fullPayloadText(client.requests[0] as ModelRequest);
    expect(payload).toContain("read_file");
    // 인자 — 포맷(JSON/평문)은 §10 미결이므로 값의 존재만 본다.
    expect(payload).toContain("/src/loop.ts");
  });

  test("toolResult의 텍스트가 들어간다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    expect(fullPayloadText(client.requests[0] as ModelRequest)).toContain(
      "TOOLRESULT_파일_본문_내용",
    );
  });

  test("user·assistant 텍스트가 들어간다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);

    const payload = fullPayloadText(client.requests[0] as ModelRequest);
    expect(payload).toContain("USER_첫_질문");
    expect(payload).toContain("파일을 읽겠습니다");
  });

  test("kept 구간은 직렬화에 들어가지 않는다 — toSummarize만 요약한다 (§4)", async () => {
    const client = new RecordingModelClient();
    const plan = makePlan();
    await generateSummary(client, plan, config(), new AbortController().signal);

    const payload = fullPayloadText(client.requests[0] as ModelRequest);
    // 유지 구간은 원문 그대로 자식 세션에 복사되므로 요약에 또 넣으면 이중 반영이다.
    expect(plan.kept.some((message) => message.role === "user")).toBe(true);
    expect(payload).not.toContain("USER_유지_턴");
  });
});

// ---------------------------------------------------------------------------
// 3. previousSummary 반영 — §5 "보존 + 갱신"
// ---------------------------------------------------------------------------

describe("previousSummary 반영 (§5)", () => {
  test("previousSummary가 있으면 요청 페이로드에 실린다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(
      client,
      makePlan({ previousSummary: "PREVIOUS_이전_요약_본문" }),
      config(),
      new AbortController().signal,
    );

    expect(fullPayloadText(client.requests[0] as ModelRequest)).toContain(
      "PREVIOUS_이전_요약_본문",
    );
  });

  test("previousSummary가 없으면 그 자리에 아무것도 실리지 않는다", async () => {
    const withPrevious = new RecordingModelClient();
    await generateSummary(
      withPrevious,
      makePlan({ previousSummary: "PREVIOUS_이전_요약_본문" }),
      config(),
      new AbortController().signal,
    );

    const without = new RecordingModelClient();
    await generateSummary(without, makePlan(), config(), new AbortController().signal);

    const withText = fullPayloadText(withPrevious.requests[0] as ModelRequest);
    const withoutText = fullPayloadText(without.requests[0] as ModelRequest);

    expect(withoutText).not.toContain("PREVIOUS_이전_요약_본문");
    // 있을 때가 더 길어야 한다 — 문구는 §10 미결이므로 길이 관계만 본다.
    expect(withText.length).toBeGreaterThan(withoutText.length);
  });
});

// ---------------------------------------------------------------------------
// 4. 실패 처리 — §5 "실패는 throw, 부분 요약을 반환하지 않는다"
// ---------------------------------------------------------------------------

describe("실패는 throw다 — 부분 요약 반환 금지 (§5)", () => {
  const FAILING_STOP_REASONS: StopReason[] = ["max_tokens", "error", "aborted", "tool_use"];

  for (const stopReason of FAILING_STOP_REASONS) {
    test(`stopReason "${stopReason}"이면 throw한다`, async () => {
      // §5: "stopReason이 end_turn이 아니면 실패다." max_tokens는 잘린 요약이고,
      // 잘린 요약의 채택은 침묵 유실이다(§2.6).
      const client = new RecordingModelClient({
        stopReason,
        text: "부분적으로 만들어진 요약",
        ...(stopReason === "error" || stopReason === "aborted"
          ? { errorMessage: "실패 사유" }
          : {}),
      });

      await expect(
        generateSummary(client, makePlan(), config(), new AbortController().signal),
      ).rejects.toThrow();
    });
  }

  test("end_turn이면 요약 텍스트를 반환한다 — 대조군", async () => {
    const client = new RecordingModelClient({ text: "정상 요약 본문" });
    const summary = await generateSummary(
      client,
      makePlan(),
      config(),
      new AbortController().signal,
    );

    expect(typeof summary).toBe("string");
    expect(summary).toContain("정상 요약 본문");
  });

  test("텍스트 블록이 없으면 throw한다", async () => {
    const client = new RecordingModelClient({ omitText: true });
    await expect(
      generateSummary(client, makePlan(), config(), new AbortController().signal),
    ).rejects.toThrow();
  });

  test("빈 문자열 텍스트도 throw한다", async () => {
    const client = new RecordingModelClient({ text: "" });
    await expect(
      generateSummary(client, makePlan(), config(), new AbortController().signal),
    ).rejects.toThrow();
  });

  test("공백뿐인 텍스트도 throw한다", async () => {
    // 공백 요약을 채택하면 자식 세션의 머리에 빈 user 메시지가 앉는다 — 침묵 유실이다.
    const client = new RecordingModelClient({ text: "   \n\t  " });
    await expect(
      generateSummary(client, makePlan(), config(), new AbortController().signal),
    ).rejects.toThrow();
  });

  test('실패해도 계획과 트랜스크립트를 변형하지 않는다 (§7 "대화는 무손상")', async () => {
    const plan = makePlan();
    const snapshot = JSON.stringify(plan);
    const client = new RecordingModelClient({ stopReason: "max_tokens", text: "잘린 요약" });

    await expect(
      generateSummary(client, plan, config(), new AbortController().signal),
    ).rejects.toThrow();

    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// 5. [미규정 A-2] 취소와 실패의 구분
// ---------------------------------------------------------------------------

describe("[미규정 A-2] 취소 실패를 호출자가 구분할 수단", () => {
  test("aborted는 throw한다 — 던져지는 에러의 종류는 단언하지 않는다", async () => {
    // §5는 aborted도 실패로 통일해 throw만 규정한다. §7의 "연속 2회 실패" 카운트에
    // 사용자 취소를 넣을지(A-1)와, 넣지 않기로 한다면 호출자가 무엇으로 구분할지(A-2)는
    // 미규정이다. 따라서 여기서는 **throw한다는 것까지만** 단언한다.
    const client = new RecordingModelClient({
      stopReason: "aborted",
      errorMessage: "사용자 Ctrl+C",
    });
    const controller = new AbortController();
    controller.abort(new Error("사용자 Ctrl+C"));

    await expect(
      generateSummary(client, makePlan(), config(), controller.signal),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. 호출 횟수 — 요약은 모델 호출 1회다
// ---------------------------------------------------------------------------

describe("모델 호출 횟수 (§5 · §7)", () => {
  test("성공 경로의 모델 호출은 1회다", async () => {
    const client = new RecordingModelClient();
    await generateSummary(client, makePlan(), config(), new AbortController().signal);
    expect(client.callCount).toBe(1);
  });

  test("실패해도 재시도하지 않는다 — 실패 비용은 요약 호출 1회뿐이다 (§7)", async () => {
    const client = new RecordingModelClient({ stopReason: "error", errorMessage: "실패" });
    await expect(
      generateSummary(client, makePlan(), config(), new AbortController().signal),
    ).rejects.toThrow();
    expect(client.callCount).toBe(1);
  });
});
