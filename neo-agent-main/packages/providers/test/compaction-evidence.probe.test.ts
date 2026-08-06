/**
 * QA-A (T-010) — 압축 설계가 전제한 사실의 **어댑터 쪽 독립 실측**.
 *
 * 실측 2 (어댑터 절반) — 와이어 실패·중단에서 `done.message.usage`가 실제로 어떤
 *                        값이 되는가 (COMPACTION §3 "불완전할 수 있어 건너뛴다")
 * 실측 3 — 어댑터가 `tools: []` 요청을 유효하게 처리하는가 (COMPACTION §5 요약 호출 형태)
 * 실측 4 (어댑터 절반) — 스트리밍 중 abort가 `"aborted"`로 구분 가능한 형태인가
 *
 * 어댑터 내부는 읽지 않고 공개 표면(`AnthropicModelClient` + 주입 `fetch`)만 쓴다.
 * 실패·중단은 전부 와이어 레벨로 주입한다.
 */

import type { AgentMessage, ModelRequest, ModelStreamEvent } from "@neo-agent/core";
import { afterAll, describe, expect, test } from "vitest";
import { AnthropicModelClient } from "../src/index.ts";

const TEST_MODEL = "claude-opus-4-5";

const EVIDENCE: Record<string, unknown> = {};

afterAll(() => {
  // 실측 산출물이다 — 이 출력을 기록 파일로 옮긴다
  console.log(`\n[QA-A 실측 · providers]\n${JSON.stringify(EVIDENCE, null, 2)}\n`);
});

// ---------------------------------------------------------------------------
// SSE 픽스처
// ---------------------------------------------------------------------------

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const MESSAGE_START = sse("message_start", {
  type: "message_start",
  message: {
    id: "msg_evidence_1",
    type: "message",
    role: "assistant",
    model: TEST_MODEL,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 40_000,
      output_tokens: 0,
      cache_read_input_tokens: 12_000,
      cache_creation_input_tokens: 800,
    },
  },
});

const TEXT_BLOCK_START = sse("content_block_start", {
  type: "content_block_start",
  index: 0,
  content_block: { type: "text", text: "" },
});

function textDelta(text: string, index = 0): string {
  return sse("content_block_delta", {
    type: "content_block_delta",
    index,
    delta: { type: "text_delta", text },
  });
}

function blockStop(index = 0): string {
  return sse("content_block_stop", { type: "content_block_stop", index });
}

function messageDelta(stopReason: string, outputTokens = 512): string {
  return sse("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });
}

const MESSAGE_STOP = sse("message_stop", { type: "message_stop" });

const SUCCESS_CHUNKS: readonly string[] = [
  MESSAGE_START,
  TEXT_BLOCK_START,
  textDelta("## 목표\n"),
  textDelta("압축 요약 본문"),
  blockStop(),
  messageDelta("end_turn", 512),
  MESSAGE_STOP,
];

// ---------------------------------------------------------------------------
// fetch 주입 — 요청 본문까지 기록한다 (실측 3의 관찰 대상)
// ---------------------------------------------------------------------------

interface FetchRecorder {
  fetch: typeof globalThis.fetch;
  signals: (AbortSignal | undefined)[];
  bodies: unknown[];
  callCount: number;
}

type FetchInput = Parameters<typeof globalThis.fetch>[0];

async function readBody(input: FetchInput, init?: RequestInit): Promise<unknown> {
  const raw =
    init?.body ??
    (typeof input === "object" && input instanceof Request
      ? await input.clone().text()
      : undefined);
  if (typeof raw !== "string") return raw === undefined ? undefined : "<비문자열 body>";
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function recordingFetch(handler: (attempt: number) => Response | Promise<Response>): FetchRecorder {
  const recorder: FetchRecorder = {
    signals: [],
    bodies: [],
    callCount: 0,
    fetch: async (input, init) => {
      const signal =
        init?.signal ??
        (typeof input === "object" && input instanceof Request ? input.signal : undefined);
      recorder.signals.push(signal ?? undefined);
      recorder.bodies.push(await readBody(input, init));
      const attempt = recorder.callCount;
      recorder.callCount += 1;
      return await handler(attempt);
    },
  };
  return recorder;
}

function sseResponse(chunks: AsyncIterable<string> | Iterable<string>): Response {
  const encoder = new TextEncoder();
  async function* encoded(): AsyncGenerator<Uint8Array> {
    for await (const chunk of chunks) yield encoder.encode(chunk);
  }
  return new Response(ReadableStream.from(encoded()), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(fetchImpl: typeof globalThis.fetch): AnthropicModelClient {
  return new AnthropicModelClient({
    apiKey: "sk-ant-test-key",
    model: TEST_MODEL,
    userAgent: "neo-agent/0.1.0-test",
    maxRetries: 0,
    fetch: fetchImpl,
  });
}

const SUMMARY_USER_MESSAGE: AgentMessage = {
  id: "summary-req-1",
  role: "user",
  content: [{ type: "text", text: "<대화 직렬화 본문>" }],
  timestamp: 1_770_000_000_000,
};

/** COMPACTION §5가 규정한 요약 호출 형태 그대로 */
function summaryRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    systemPrompt: "너는 대화 요약기다.",
    messages: [SUMMARY_USER_MESSAGE],
    tools: [],
    maxTokens: 8192,
    ...overrides,
  };
}

async function collect(
  client: AnthropicModelClient,
  request: ModelRequest,
  signal: AbortSignal,
): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of client.stream(request, signal)) events.push(event);
  return events;
}

function doneOf(
  events: ModelStreamEvent[],
): Extract<ModelStreamEvent, { type: "done" }>["message"] {
  const done = events.at(-1);
  if (done?.type !== "done") throw new Error("스트림이 done으로 닫히지 않았다");
  return done.message;
}

// ---------------------------------------------------------------------------
// 실측 3 — tools: [] 요청이 SDK 호출로 성립하는가
// ---------------------------------------------------------------------------

describe("실측 3 — 어댑터가 tools: [] 요청을 유효하게 처리하는가 (COMPACTION §5)", () => {
  test("빈 tools 배열 요청이 정상 응답으로 완주한다", async () => {
    const recorder = recordingFetch(() => sseResponse(SUCCESS_CHUNKS));
    const client = makeClient(recorder.fetch);

    const events = await collect(client, summaryRequest(), new AbortController().signal);
    const message = doneOf(events);
    const body = recorder.bodies[0] as Record<string, unknown> | undefined;

    EVIDENCE["3-emptyTools"] = {
      HTTP_호출_수: recorder.callCount,
      요청_body_키: body ? Object.keys(body).sort() : null,
      "요청_body.tools": body?.tools ?? "<필드 없음>",
      "요청_body.tools_타입": Array.isArray(body?.tools) ? "array" : typeof body?.tools,
      "요청_body.max_tokens": body?.max_tokens ?? "<필드 없음>",
      "요청_body.system": body?.system ?? "<필드 없음>",
      "요청_body.messages": body?.messages ?? "<필드 없음>",
      결과_stopReason: message.stopReason,
      결과_텍스트: message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join(""),
      결과_usage: message.usage,
    };

    expect(recorder.callCount).toBe(1);
    expect(message.stopReason).toBe("end_turn");
    expect(message.content.some((block) => block.type === "text")).toBe(true);
  });

  test("tools: []는 400 invalid_request를 유발하지 않는다 — 실제 와이어 형태 관찰", async () => {
    // 400은 우리가 주입하지 않는 한 나올 수 없으므로, 관찰 대상은 **보낸 페이로드**다.
    // Anthropic Messages API는 `tools: []`를 허용하지만 필드를 아예 생략하는 것도 유효하다.
    // 어느 쪽이든 요약 호출이 성립한다는 것이 §5 전제의 내용이다.
    const recorder = recordingFetch(() => sseResponse(SUCCESS_CHUNKS));
    const client = makeClient(recorder.fetch);
    await collect(client, summaryRequest(), new AbortController().signal);

    const body = recorder.bodies[0] as Record<string, unknown> | undefined;
    const tools = body?.tools;

    EVIDENCE["3-emptyToolsWire"] = {
      tools_필드_존재: body ? "tools" in body : null,
      tools_값: tools ?? null,
      판정:
        tools === undefined
          ? "생략 — 유효 (Anthropic은 tools 필드 자체가 선택)"
          : Array.isArray(tools) && tools.length === 0
            ? "빈 배열 그대로 전송 — 유효"
            : "예상 밖",
    };

    // 둘 중 어느 쪽이든 "도구 없는 요청"이 성립해야 한다.
    expect(tools === undefined || (Array.isArray(tools) && tools.length === 0)).toBe(true);
  });

  test("maxTokens가 실린 요청은 어댑터 기본값을 덮는다 (CORE-INTERFACE §8)", async () => {
    // §5는 요약 호출의 maxTokens를 config.summaryMaxTokens로 규정한다. 어댑터가
    // 요청값을 무시하면 요약이 어댑터 기본값에서 잘려 §5의 "max_tokens는 실패" 경로로 샌다.
    // 어댑터 기본값(DEFAULT_MAX_TOKENS)과 겹치지 않는 값을 쓴다 — 같은 값이면
    // "요청값을 썼다"와 "기본값을 썼다"가 관찰상 구분되지 않는다.
    const DISTINCT_MAX_TOKENS = 4_321;
    const withValue = recordingFetch(() => sseResponse(SUCCESS_CHUNKS));
    await collect(
      makeClient(withValue.fetch),
      summaryRequest({ maxTokens: DISTINCT_MAX_TOKENS }),
      new AbortController().signal,
    );

    const without = recordingFetch(() => sseResponse(SUCCESS_CHUNKS));
    const noMax: ModelRequest = {
      systemPrompt: "너는 대화 요약기다.",
      messages: [SUMMARY_USER_MESSAGE],
      tools: [],
    };
    await collect(makeClient(without.fetch), noMax, new AbortController().signal);

    const withBody = withValue.bodies[0] as Record<string, unknown> | undefined;
    const withoutBody = without.bodies[0] as Record<string, unknown> | undefined;

    EVIDENCE["3-maxTokens"] = {
      요청에_실은_값: DISTINCT_MAX_TOKENS,
      요청에_실었을_때_와이어_max_tokens: withBody?.max_tokens ?? null,
      "요청에_없을_때_와이어_max_tokens(어댑터 기본값)": withoutBody?.max_tokens ?? null,
      오버라이드_성립: withBody?.max_tokens === DISTINCT_MAX_TOKENS,
    };

    expect(withBody?.max_tokens).toBe(DISTINCT_MAX_TOKENS);
    expect(withoutBody?.max_tokens).not.toBe(DISTINCT_MAX_TOKENS);
  });
});

// ---------------------------------------------------------------------------
// 실측 2 (어댑터 절반) — 실패·중단의 usage 형상
// ---------------------------------------------------------------------------

describe("실측 2 — 와이어 실패·중단에서 usage가 실제로 어떤 값이 되는가 (COMPACTION §3)", () => {
  test("요청 전 실패(401)의 usage — 토큰을 하나도 못 본 경우", async () => {
    const client = makeClient(
      recordingFetch(() =>
        jsonResponse(401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        }),
      ).fetch,
    );
    const message = doneOf(await collect(client, summaryRequest(), new AbortController().signal));

    EVIDENCE["2-wire401"] = {
      stopReason: message.stopReason,
      usage: message.usage,
      errorMessage: message.errorMessage,
    };
    expect(message.stopReason).toBe("error");
  });

  test("스트림 중간 실패의 usage — message_start의 입력 토큰만 본 경우", async () => {
    const client = makeClient(
      recordingFetch(() =>
        sseResponse([
          MESSAGE_START,
          TEXT_BLOCK_START,
          textDelta("부분 요약"),
          sse("error", {
            type: "error",
            error: { type: "overloaded_error", message: "overloaded mid-stream" },
          }),
        ]),
      ).fetch,
    );
    const message = doneOf(await collect(client, summaryRequest(), new AbortController().signal));

    EVIDENCE["2-wireMidStreamError"] = {
      stopReason: message.stopReason,
      usage: message.usage,
      errorMessage: message.errorMessage,
      // 대조: 정상 종료였다면 output 512가 들어왔을 자리
      output이_0인가: message.usage.output === 0,
    };
    expect(message.stopReason).toBe("error");
  });

  test("정상 종료의 usage — 대조군", async () => {
    const client = makeClient(recordingFetch(() => sseResponse(SUCCESS_CHUNKS)).fetch);
    const message = doneOf(await collect(client, summaryRequest(), new AbortController().signal));

    EVIDENCE["2-wireSuccess"] = { stopReason: message.stopReason, usage: message.usage };
    expect(message.stopReason).toBe("end_turn");
  });
});

// ---------------------------------------------------------------------------
// 실측 4 (어댑터 절반) — 중단이 "aborted"로 구분 가능한 형태인가
// ---------------------------------------------------------------------------

const ABORT_SAFETY_TIMEOUT_MS = 3000;

function abortableSseResponse(recorder: FetchRecorder, prefix: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of prefix) controller.enqueue(encoder.encode(chunk));
      const signal = recorder.signals.at(-1);
      const timer = setTimeout(() => controller.close(), ABORT_SAFETY_TIMEOUT_MS);
      const fail = (): void => {
        clearTimeout(timer);
        controller.error(
          signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"),
        );
      };
      if (!signal) return;
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** 예외를 던지지 않고 조용히 닫히는 중단 — CORE-INTERFACE §8이 지목한 실제 SDK 동작 */
function silentlyClosingSseResponse(recorder: FetchRecorder, prefix: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of prefix) controller.enqueue(encoder.encode(chunk));
      const signal = recorder.signals.at(-1);
      const timer = setTimeout(() => controller.close(), ABORT_SAFETY_TIMEOUT_MS);
      const close = (): void => {
        clearTimeout(timer);
        controller.close();
      };
      if (!signal) return;
      if (signal.aborted) {
        close();
        return;
      }
      signal.addEventListener("abort", close, { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const ABORT_PREFIX: readonly string[] = [
  MESSAGE_START,
  TEXT_BLOCK_START,
  textDelta("중단 전 요약"),
];

describe("실측 4 — 요약 호출 중 abort가 error와 구분되는가 (COMPACTION §7 판정 근거)", () => {
  test('스트리밍 중 abort는 stopReason "aborted"로 닫힌다', async () => {
    const recorder = recordingFetch(() => abortableSseResponse(recorder, ABORT_PREFIX));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();

    const events: ModelStreamEvent[] = [];
    for await (const event of client.stream(summaryRequest(), controller.signal)) {
      events.push(event);
      if (event.type === "text_delta") controller.abort(new Error("사용자 Ctrl+C"));
    }
    const message = doneOf(events);

    EVIDENCE["4-adapterAbortErrored"] = {
      stopReason: message.stopReason,
      usage: message.usage,
      errorMessage: message.errorMessage,
      재시도_횟수: recorder.callCount,
    };
    expect(message.stopReason).toBe("aborted");
  });

  test("조용히 닫히는 중단도 aborted로 인코딩된다 (end_turn 날조 없음)", async () => {
    const recorder = recordingFetch(() => silentlyClosingSseResponse(recorder, ABORT_PREFIX));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();

    const events: ModelStreamEvent[] = [];
    for await (const event of client.stream(summaryRequest(), controller.signal)) {
      events.push(event);
      if (event.type === "text_delta") controller.abort(new Error("사용자 Ctrl+C"));
    }
    const message = doneOf(events);

    EVIDENCE["4-adapterAbortSilent"] = {
      stopReason: message.stopReason,
      usage: message.usage,
      errorMessage: message.errorMessage,
    };
    // §8: "signal.aborted면 aborted, 아니면 error" — end_turn을 만들어내면 침묵 실패다.
    expect(message.stopReason).toBe("aborted");
  });

  test("시작 전 abort도 aborted다", async () => {
    const recorder = recordingFetch(() => sseResponse(SUCCESS_CHUNKS));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();
    controller.abort(new Error("시작 전 취소"));

    const message = doneOf(await collect(client, summaryRequest(), controller.signal));

    EVIDENCE["4-adapterAbortBeforeStart"] = {
      stopReason: message.stopReason,
      usage: message.usage,
      errorMessage: message.errorMessage,
      HTTP_호출_수: recorder.callCount,
    };
    expect(message.stopReason).toBe("aborted");
  });

  test("중단과 실패가 같은 표면에서 서로 다른 값이다 — 구분 가능성 확인", async () => {
    const failClient = makeClient(
      recordingFetch(() =>
        jsonResponse(500, { type: "error", error: { type: "api_error", message: "boom" } }),
      ).fetch,
    );
    const failMessage = doneOf(
      await collect(failClient, summaryRequest(), new AbortController().signal),
    );

    const recorder = recordingFetch(() => abortableSseResponse(recorder, ABORT_PREFIX));
    const abortController = new AbortController();
    const abortEvents: ModelStreamEvent[] = [];
    for await (const event of makeClient(recorder.fetch).stream(
      summaryRequest(),
      abortController.signal,
    )) {
      abortEvents.push(event);
      if (event.type === "text_delta") abortController.abort();
    }
    const abortMessage = doneOf(abortEvents);

    EVIDENCE["4-distinguishable"] = {
      실패_stopReason: failMessage.stopReason,
      중단_stopReason: abortMessage.stopReason,
      서로_다른가: failMessage.stopReason !== abortMessage.stopReason,
    };
    expect(failMessage.stopReason).not.toBe(abortMessage.stopReason);
  });
});
