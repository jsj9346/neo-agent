/**
 * 스트림 계약 테스트 — `docs/CORE-INTERFACE.md` §8(모델 프로바이더 경계).
 *
 * 기대값의 정본은 구현이 아니라 §8의 네 줄이다:
 *
 * 1. `stream()`은 요청·모델·런타임 실패로 **throw하거나 reject하지 않는다.**
 * 2. 모든 실패는 스트림 안에서 최종 `done` 이벤트로 인코딩된다(= 모든 경로가 `done`으로 닫힌다).
 * 3. `done.message.usage`는 **필수**다. usage를 주지 않는 어댑터는 계약 위반.
 * 4. 중단은 `stopReason: "aborted"`로 인코딩되고 진행 중 요청이 실제로 끊긴다.
 *
 * 곁들여 §2(`errorMessage` — 침묵 실패 금지)와 §8의 O-5 확정(잘린 도구 호출은
 * `toolcall`로 방출하지 않는다)도 같은 스트림 표면에서 관찰 가능하므로 함께 검증한다.
 *
 * 어댑터 내부 로직은 읽지 않고 **공개 표면**(`AnthropicModelClient` + 주입 `fetch`)만
 * 쓴다. 실패는 전부 와이어 레벨(HTTP 상태·SSE 바이트·소켓 단절)로 주입한다.
 */

import type {
  AgentMessage,
  AssistantMessage,
  ModelRequest,
  ModelStreamEvent,
} from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { AnthropicModelClient } from "../src/index.ts";

const TEST_MODEL = "claude-opus-4-5";

// ---------------------------------------------------------------------------
// SSE 픽스처 — Anthropic Messages 스트리밍 와이어 포맷
// ---------------------------------------------------------------------------

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const MESSAGE_START = sse("message_start", {
  type: "message_start",
  message: {
    id: "msg_test_1",
    type: "message",
    role: "assistant",
    model: TEST_MODEL,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 11,
      output_tokens: 0,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 5,
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

function messageDelta(stopReason: string, outputTokens = 7): string {
  return sse("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });
}

const MESSAGE_STOP = sse("message_stop", { type: "message_stop" });

function toolBlockStart(index: number, id: string, name: string): string {
  return sse("content_block_start", {
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id, name, input: {} },
  });
}

function inputJsonDelta(index: number, partialJson: string): string {
  return sse("content_block_delta", {
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: partialJson },
  });
}

/** 텍스트 한 덩어리로 정상 종료하는 최소 성공 스트림 */
const SUCCESS_TEXT_CHUNKS: readonly string[] = [
  MESSAGE_START,
  TEXT_BLOCK_START,
  textDelta("안녕"),
  textDelta("하세요"),
  blockStop(),
  messageDelta("end_turn", 9),
  MESSAGE_STOP,
];

// ---------------------------------------------------------------------------
// fetch 주입 — 응답 본문 조립과 호출 기록
// ---------------------------------------------------------------------------

function sseBody(chunks: AsyncIterable<string> | Iterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  async function* encoded(): AsyncGenerator<Uint8Array> {
    for await (const chunk of chunks) yield encoder.encode(chunk);
  }
  return ReadableStream.from(encoded());
}

function sseResponse(chunks: AsyncIterable<string> | Iterable<string>): Response {
  return new Response(sseBody(chunks), {
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

interface FetchRecorder {
  fetch: typeof globalThis.fetch;
  /** SDK가 실제로 HTTP 계층에 넘긴 abort 신호. 중단 전파 검증에 쓴다 */
  signals: (AbortSignal | undefined)[];
  callCount: number;
}

function recordingFetch(handler: (attempt: number) => Response | Promise<Response>): FetchRecorder {
  const recorder: FetchRecorder = {
    signals: [],
    callCount: 0,
    fetch: async (input, init) => {
      const signal =
        init?.signal ??
        (typeof input === "object" && input instanceof Request ? input.signal : undefined);
      recorder.signals.push(signal ?? undefined);
      const attempt = recorder.callCount;
      recorder.callCount += 1;
      return await handler(attempt);
    },
  };
  return recorder;
}

function makeClient(fetchImpl: typeof globalThis.fetch): AnthropicModelClient {
  return new AnthropicModelClient({
    apiKey: "sk-ant-test-key",
    model: TEST_MODEL,
    userAgent: "neo-agent/0.1.0-test",
    // 실패 주입 테스트가 백오프를 기다리지 않게 한다(공개 config 필드)
    maxRetries: 0,
    fetch: fetchImpl,
  });
}

const USER_MESSAGE: AgentMessage = {
  role: "user",
  content: [{ type: "text", text: "안녕" }],
  timestamp: 1_770_000_000_000,
};

function makeRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    systemPrompt: "너는 테스트 어시스턴트다.",
    messages: [USER_MESSAGE],
    tools: [],
    ...overrides,
  };
}

/**
 * 계약 1의 실측 지점 — 여기서 예외를 잡지 않는다.
 * `stream()` 호출과 소비 중 어떤 예외도 그대로 테스트 실패가 된다.
 */
async function collect(
  client: AnthropicModelClient,
  request: ModelRequest,
  signal: AbortSignal,
): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of client.stream(request, signal)) {
    events.push(event);
  }
  return events;
}

/** 계약 2 — `done`이 정확히 하나, 그리고 마지막이다 */
function expectClosedByDone(events: ModelStreamEvent[]): AssistantMessage {
  const doneEvents = events.filter((event) => event.type === "done");
  expect(doneEvents).toHaveLength(1);
  const last = events.at(-1);
  expect(last?.type).toBe("done");
  const done = doneEvents[0];
  if (done?.type !== "done") throw new Error("unreachable — done 이벤트가 없다");
  return done.message;
}

/** 계약 3 — usage 4필드가 전부 유한한 수 */
function expectUsagePresent(message: AssistantMessage): void {
  expect(message.usage).toBeDefined();
  for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
    expect(Number.isFinite(message.usage[key]), `usage.${key}가 수가 아니다`).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// 실패 주입 목록 — 전부 와이어 레벨
// ---------------------------------------------------------------------------

interface FailureCase {
  name: string;
  makeFetch: () => FetchRecorder;
}

const FAILURE_CASES: readonly FailureCase[] = [
  {
    name: "401 인증 실패",
    makeFetch: () =>
      recordingFetch(() =>
        jsonResponse(401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        }),
      ),
  },
  {
    name: "429 레이트리밋",
    makeFetch: () =>
      recordingFetch(() =>
        jsonResponse(429, {
          type: "error",
          error: { type: "rate_limit_error", message: "rate limited" },
        }),
      ),
  },
  {
    name: "500 서버 오류",
    makeFetch: () =>
      recordingFetch(() =>
        jsonResponse(500, {
          type: "error",
          error: { type: "api_error", message: "internal server error" },
        }),
      ),
  },
  {
    name: "529 과부하",
    makeFetch: () =>
      recordingFetch(() =>
        jsonResponse(529, {
          type: "error",
          error: { type: "overloaded_error", message: "overloaded" },
        }),
      ),
  },
  {
    name: "네트워크 단절 (fetch 자체가 reject)",
    makeFetch: () =>
      recordingFetch(() => {
        throw new TypeError("fetch failed");
      }),
  },
  {
    name: "잘못된 JSON 응답 (200인데 본문이 JSON이 아님)",
    makeFetch: () =>
      recordingFetch(
        () =>
          new Response("<html>502 Bad Gateway</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
  },
  {
    name: "SSE data가 파싱 불가한 JSON",
    makeFetch: () =>
      recordingFetch(() =>
        sseResponse([MESSAGE_START, "event: content_block_start\ndata: {깨진 JSON\n\n"]),
      ),
  },
  {
    name: "SSE error 이벤트",
    makeFetch: () =>
      recordingFetch(() =>
        sseResponse([
          MESSAGE_START,
          TEXT_BLOCK_START,
          textDelta("부분"),
          sse("error", {
            type: "error",
            error: { type: "overloaded_error", message: "overloaded mid-stream" },
          }),
        ]),
      ),
  },
  {
    name: "스트림 중간 소켓 단절",
    makeFetch: () =>
      recordingFetch(() =>
        sseResponse(
          (async function* () {
            yield MESSAGE_START;
            yield TEXT_BLOCK_START;
            yield textDelta("부분");
            throw new Error("socket hang up");
          })(),
        ),
      ),
  },
  {
    name: "message_stop 없이 끊긴 스트림",
    makeFetch: () =>
      recordingFetch(() => sseResponse([MESSAGE_START, TEXT_BLOCK_START, textDelta("부분")])),
  },
  {
    name: "message_start 없이 시작한 스트림",
    makeFetch: () => recordingFetch(() => sseResponse([TEXT_BLOCK_START, textDelta("부분")])),
  },
  {
    name: "빈 본문 (바이트 0개)",
    makeFetch: () => recordingFetch(() => sseResponse([])),
  },
];

// ---------------------------------------------------------------------------
// 계약 1 — no-throw
// ---------------------------------------------------------------------------

describe("§8 계약 1 — stream()은 어떤 실패로도 throw/reject하지 않는다", () => {
  for (const failure of FAILURE_CASES) {
    it(`${failure.name}: 예외 없이 소비된다`, async () => {
      const client = makeClient(failure.makeFetch().fetch);
      const controller = new AbortController();

      // stream() 자체의 동기 throw도 계약 위반이다 — 반환값을 먼저 받아 본다.
      const stream = client.stream(makeRequest(), controller.signal);
      await expect(
        (async () => {
          const events: ModelStreamEvent[] = [];
          for await (const event of stream) events.push(event);
          return events;
        })(),
      ).resolves.toBeInstanceOf(Array);
    });
  }

  it("도구 스키마가 실린 요청도 실패 시 throw하지 않는다", async () => {
    const client = makeClient(
      recordingFetch(() =>
        jsonResponse(400, {
          type: "error",
          error: { type: "invalid_request_error", message: "bad tool schema" },
        }),
      ).fetch,
    );
    const request = makeRequest({
      tools: [
        {
          name: "read_file",
          description: "파일을 읽는다",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
          },
        },
      ],
    });
    const events = await collect(client, request, new AbortController().signal);
    expect(events).toBeInstanceOf(Array);
  });
});

// ---------------------------------------------------------------------------
// 계약 2 — 모든 경로가 done으로 끝난다
// ---------------------------------------------------------------------------

describe("§8 계약 2 — 모든 경로가 done 이벤트로 끝난다", () => {
  for (const failure of FAILURE_CASES) {
    it(`${failure.name}: 마지막 이벤트가 done이고 stopReason이 "error"다`, async () => {
      const client = makeClient(failure.makeFetch().fetch);
      const events = await collect(client, makeRequest(), new AbortController().signal);

      const message = expectClosedByDone(events);
      expect(message.role).toBe("assistant");
      expect(message.stopReason).toBe("error");
      // §2 — 침묵 실패 금지. 실패 사유가 비어 있으면 사용자가 원인을 볼 수 없다.
      expect(message.errorMessage, "errorMessage가 비어 있다").toBeTruthy();
    });
  }

  it("성공 경로도 done으로 끝난다", async () => {
    const client = makeClient(recordingFetch(() => sseResponse(SUCCESS_TEXT_CHUNKS)).fetch);
    const events = await collect(client, makeRequest(), new AbortController().signal);

    const message = expectClosedByDone(events);
    expect(message.stopReason).toBe("end_turn");
    expect(events.some((event) => event.type === "text_delta")).toBe(true);
  });

  it("재시도는 어댑터 안에서 끝난다 — 소진 후에도 done으로 닫힌다 (§8)", async () => {
    const recorder = recordingFetch(() =>
      jsonResponse(500, { type: "error", error: { type: "api_error", message: "flaky" } }),
    );
    // maxRetries를 덮지 않는다 — 어댑터 기본 재시도 정책을 그대로 태운다.
    const client = new AnthropicModelClient({
      apiKey: "sk-ant-test-key",
      model: TEST_MODEL,
      userAgent: "neo-agent/0.1.0-test",
      fetch: recorder.fetch,
    });

    const events = await collect(client, makeRequest(), new AbortController().signal);

    expect(recorder.callCount, "재시도가 전혀 일어나지 않았다").toBeGreaterThan(1);
    const message = expectClosedByDone(events);
    expect(message.stopReason).toBe("error");
    expect(message.errorMessage).toBeTruthy();
  }, 30_000);

  it("재시도 후 성공하면 done이 하나만 나온다", async () => {
    const recorder = recordingFetch((attempt) =>
      attempt === 0
        ? jsonResponse(500, { type: "error", error: { type: "api_error", message: "flaky" } })
        : sseResponse(SUCCESS_TEXT_CHUNKS),
    );
    const client = new AnthropicModelClient({
      apiKey: "sk-ant-test-key",
      model: TEST_MODEL,
      userAgent: "neo-agent/0.1.0-test",
      fetch: recorder.fetch,
    });

    const events = await collect(client, makeRequest(), new AbortController().signal);

    expect(recorder.callCount).toBe(2);
    expect(expectClosedByDone(events).stopReason).toBe("end_turn");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 계약 3 — usage 필수
// ---------------------------------------------------------------------------

describe("§8 계약 3 — done.message.usage는 실패 경로에서도 존재한다", () => {
  for (const failure of FAILURE_CASES) {
    it(`${failure.name}: usage 4필드가 모두 있다`, async () => {
      const client = makeClient(failure.makeFetch().fetch);
      const events = await collect(client, makeRequest(), new AbortController().signal);
      expectUsagePresent(expectClosedByDone(events));
    });
  }

  it("성공 경로는 와이어 usage를 그대로 옮긴다", async () => {
    const client = makeClient(recordingFetch(() => sseResponse(SUCCESS_TEXT_CHUNKS)).fetch);
    const events = await collect(client, makeRequest(), new AbortController().signal);
    const message = expectClosedByDone(events);

    expect(message.usage).toEqual({ input: 11, output: 9, cacheRead: 3, cacheWrite: 5 });
  });
});

// ---------------------------------------------------------------------------
// 계약 4 — abort 전파
// ---------------------------------------------------------------------------

/** 스트림이 abort 없이 스스로 끝나는 것을 막는 안전망. 초과하면 테스트가 단언으로 실패한다 */
const ABORT_SAFETY_TIMEOUT_MS = 3000;

/**
 * 진행 중 abort를 **실제 `fetch`와 같은 방식으로** 흉내 낸다.
 *
 * undici는 signal이 abort되면 응답 본문 `ReadableStream`을 abort 이유로 **에러 처리**한다.
 * 본문을 곱게 닫지 않는다 — 그래서 여기서도 `controller.error()`로 끝낸다.
 * 이렇게 해야 "중단됐는데 정상 종료로 보이는" 테스트 인공물이 생기지 않는다.
 */
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

const ABORT_PREFIX: readonly string[] = [
  MESSAGE_START,
  TEXT_BLOCK_START,
  textDelta("중단 전 텍스트"),
];

describe('§8 계약 4 — abort는 stopReason "aborted"로 인코딩되고 요청을 끊는다', () => {
  it("이미 aborted된 signal로 호출해도 throw하지 않고 done으로 닫힌다", async () => {
    const recorder = recordingFetch(() => sseResponse(SUCCESS_TEXT_CHUNKS));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();
    controller.abort(new Error("사용자가 시작 전에 취소"));

    const events = await collect(client, makeRequest(), controller.signal);

    const message = expectClosedByDone(events);
    expect(message.stopReason).toBe("aborted");
    expect(message.errorMessage).toBeTruthy();
    expectUsagePresent(message);
  });

  it("스트림 도중 abort하면 aborted로 닫힌다", async () => {
    const recorder = recordingFetch(() => abortableSseResponse(recorder, ABORT_PREFIX));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();

    const events: ModelStreamEvent[] = [];
    for await (const event of client.stream(makeRequest(), controller.signal)) {
      events.push(event);
      if (event.type === "text_delta") controller.abort();
    }

    const message = expectClosedByDone(events);
    expect(message.stopReason).toBe("aborted");
    expect(message.errorMessage).toBeTruthy();
    expectUsagePresent(message);
  });

  it("abort가 진행 중 HTTP 요청까지 전파된다", async () => {
    const recorder = recordingFetch(() => abortableSseResponse(recorder, ABORT_PREFIX));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();

    for await (const event of client.stream(makeRequest(), controller.signal)) {
      if (event.type === "text_delta") controller.abort();
    }

    expect(recorder.callCount, "abort된 요청을 재시도했다").toBe(1);
    const httpSignal = recorder.signals.at(-1);
    expect(httpSignal, "SDK가 fetch에 abort 신호를 넘기지 않았다").toBeDefined();
    expect(httpSignal?.aborted, "abort가 진행 중 HTTP 요청까지 전파되지 않았다").toBe(true);
  });

  it("abort하면 스트림이 즉시 끝난다 (열린 본문을 계속 기다리지 않는다)", async () => {
    const recorder = recordingFetch(() => abortableSseResponse(recorder, ABORT_PREFIX));
    const client = makeClient(recorder.fetch);
    const controller = new AbortController();

    const startedAt = Date.now();
    for await (const event of client.stream(makeRequest(), controller.signal)) {
      if (event.type === "text_delta") controller.abort();
    }
    const elapsed = Date.now() - startedAt;

    expect(elapsed, "abort 후에도 본문이 닫히기를 기다렸다").toBeLessThan(ABORT_SAFETY_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// §8 부수 계약 — toolcall은 인자 완성 시점에만, max_tokens는 잘린 호출을 만들지 않는다
// ---------------------------------------------------------------------------

describe("§8 — toolcall 이벤트는 인자가 완성된 것만 방출한다", () => {
  it("완성된 tool_use 블록은 파싱된 args로 방출된다", async () => {
    const client = makeClient(
      recordingFetch(() =>
        sseResponse([
          MESSAGE_START,
          toolBlockStart(0, "toolu_01", "read_file"),
          inputJsonDelta(0, '{"path":'),
          inputJsonDelta(0, '"/tmp/a.txt"}'),
          blockStop(0),
          messageDelta("tool_use", 12),
          MESSAGE_STOP,
        ]),
      ).fetch,
    );

    const events = await collect(client, makeRequest(), new AbortController().signal);
    const toolCalls = events.filter((event) => event.type === "toolcall");

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toEqual({
      type: "toolcall",
      toolCallId: "toolu_01",
      toolName: "read_file",
      args: { path: "/tmp/a.txt" },
    });
    expect(expectClosedByDone(events).stopReason).toBe("tool_use");
  });

  it("max_tokens로 잘린 도구 호출은 toolcall로 방출되지 않는다 (§8, O-5)", async () => {
    const client = makeClient(
      recordingFetch(() =>
        sseResponse([
          MESSAGE_START,
          TEXT_BLOCK_START,
          textDelta("파일을 읽겠습니다"),
          blockStop(0),
          toolBlockStart(1, "toolu_02", "read_file"),
          // 인자가 완성되기 전에 끊긴다 — content_block_stop이 오지 않는다.
          inputJsonDelta(1, '{"pa'),
          messageDelta("max_tokens", 4096),
          MESSAGE_STOP,
        ]),
      ).fetch,
    );

    const events = await collect(client, makeRequest(), new AbortController().signal);
    const message = expectClosedByDone(events);

    expect(events.filter((event) => event.type === "toolcall")).toHaveLength(0);
    expect(message.stopReason).toBe("max_tokens");
    expect(
      message.content.some((block) => block.type === "toolCall"),
      "잘린 도구 호출이 최종 메시지에 남았다",
    ).toBe(false);
    expectUsagePresent(message);
  });
});
