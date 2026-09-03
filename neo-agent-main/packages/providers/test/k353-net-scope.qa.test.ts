/**
 * K-353 독립 QA — 세 자리(컴플라이언스 와이어 축 · 유니온 밖 stop_reason · thinking 왕복)가
 * 정본에서 도출되는가, 그리고 정본이 요구하는 것 중 그 자리에서 안 재지는 것이 무엇인가.
 *
 * 기대값은 구현이 아니라 아래 정본에서만 도출했다:
 * - `docs/CORE-INTERFACE.md` §2 — StopReason 5종 닫힌 유니온 · errorMessage · ThinkingContent
 * - `docs/CORE-INTERFACE.md` §8 — 어댑터 계약(종료 사유 없는 스트림 · usage · no-throw)
 * - `docs/ARCHITECTURE.md` §2.2(컴플라이언스 타입 강제) · §2.6(가시적 결과 / 침묵 실패 금지)
 * - `docs/COMPLIANCE.md` — 이식 금지 목록(사칭 헤더·프롬프트·문자열 치환)
 *
 * 형제 파일과의 분담 — 여기서 재는 것은 형제가 **안 재는 자리**다:
 * - `compliance.test.ts`는 헤더만 잰다. §2.2가 헤더와 나란히 드는 프롬프트·문자열 치환 축은
 *   레포 어디에도 단정이 없다(2026-08-28 확인). 그 축을 여기서 요청 본문으로 잰다.
 * - `stream-contract.test.ts`는 `pause_turn`·`refusal` 둘을 잰다. 종료 사유가 **아예 없는**
 *   `message_stop`과, 유니온 밖의 나머지 와이어 값은 그 자리에 없다.
 * - `convert.test.ts`는 순수 함수 `toAnthropicMessages`만 잰다. §2가 금지하는 것은 «어댑터가
 *   와이어로 되돌려 보내는 것»이므로 실제 요청 본문에서도 한 번 잰다.
 *
 * 미규정 지점은 `[미규정]` 표시를 달고 판정을 내리지 않는다 — QA 리포트의 «판정 필요»로 간다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { AgentMessage, ModelRequest, ModelStreamEvent, StopReason } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { AnthropicModelClient, toAnthropicMessages } from "../src/index.ts";

const TEST_MODEL = "claude-opus-4-5";
const TS = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// SSE 픽스처 (형제 파일과 같은 와이어 포맷. 여기서 필요한 최소만 둔다)
// ---------------------------------------------------------------------------

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const MESSAGE_START = sse("message_start", {
  type: "message_start",
  message: {
    id: "msg_qa",
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

function textDelta(text: string): string {
  return sse("content_block_delta", {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  });
}

const BLOCK_STOP = sse("content_block_stop", { type: "content_block_stop", index: 0 });

function messageDelta(stopReason: string, outputTokens = 7): string {
  return sse("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });
}

const MESSAGE_STOP = sse("message_stop", { type: "message_stop" });

// ---------------------------------------------------------------------------
// fetch 주입 — 헤더와 **본문**을 함께 기록한다(형제는 헤더만 기록한다)
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

interface Capture {
  fetch: typeof globalThis.fetch;
  requests: CapturedRequest[];
}

function capturing(chunks: readonly string[]): Capture {
  const requests: CapturedRequest[] = [];
  const capture: Capture = {
    requests,
    fetch: async (input, init) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const rawBody = typeof init?.body === "string" ? init.body : "";
      let body: unknown = null;
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
      requests.push({ url: String(input), headers, body, rawBody });
      return new Response(chunks.join(""), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
  };
  return capture;
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

const USER_MESSAGE: AgentMessage = {
  id: "m1",
  role: "user",
  content: [{ type: "text", text: "안녕" }],
  timestamp: TS,
};

const SYSTEM_PROMPT = "너는 neo-agent다.";

function makeRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    systemPrompt: SYSTEM_PROMPT,
    messages: [USER_MESSAGE],
    tools: [],
    ...overrides,
  };
}

async function collect(
  client: AnthropicModelClient,
  request: ModelRequest = makeRequest(),
): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of client.stream(request, new AbortController().signal)) {
    events.push(event);
  }
  return events;
}

function doneMessage(events: ModelStreamEvent[]): {
  stopReason: StopReason;
  errorMessage?: string;
  content: { type: string }[];
} {
  const done = events.at(-1);
  expect(done?.type, "스트림이 done으로 닫히지 않았다 (§8 계약 2)").toBe("done");
  if (done?.type !== "done") throw new Error("unreachable");
  return done.message;
}

const SUCCESS_CHUNKS: readonly string[] = [
  MESSAGE_START,
  TEXT_BLOCK_START,
  textDelta("네"),
  BLOCK_STOP,
  messageDelta("end_turn", 9),
  MESSAGE_STOP,
];

// ---------------------------------------------------------------------------
// 1. §2.2의 프롬프트·문자열 치환 축 — 형제가 헤더만 재는 자리의 나머지 절반
// ---------------------------------------------------------------------------

/**
 * 두 레퍼런스가 실제로 위장에 쓴 신원들. `docs/COMPLIANCE.md` 이식 금지 목록이 이름으로 든 것들이다
 * — 시스템 프롬프트 주입("You are Claude Code, Anthropic's official CLI"), 문자열 치환,
 * `originator: codex_cli_rs`. 헤더가 아니라 **본문**으로 나가는 축이다.
 */
const FORBIDDEN_IDENTITY = [
  /claude[-\s]?code/i,
  /claude[-\s]?cli/i,
  /codex/i,
  /vscode/i,
  /copilot/i,
  /official cli/i,
  /originator/i,
];

describe("§2.2 — 사칭 금지는 헤더뿐 아니라 요청 본문에도 걸린다", () => {
  it("시스템 프롬프트가 호출자가 준 문면 그대로 나가고 사칭 문구가 덧붙지 않는다", async () => {
    const capture = capturing(SUCCESS_CHUNKS);
    await collect(makeClient(capture.fetch));

    expect(capture.requests, "요청이 나가지 않았다 — 아래 단정이 모두 공허해진다").toHaveLength(1);
    const body = capture.requests[0]?.body as { system?: unknown } | null;
    const system = JSON.stringify(body?.system ?? null);

    expect(system, "시스템 프롬프트가 와이어에 실리지 않았다").toContain(SYSTEM_PROMPT);
    for (const pattern of FORBIDDEN_IDENTITY) {
      expect(system, `시스템 프롬프트에 타 제품 신원이 주입됐다: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("요청 본문 어디에도 타 제품 신원 문자열이 없다", async () => {
    const capture = capturing(SUCCESS_CHUNKS);
    await collect(makeClient(capture.fetch));

    expect(capture.requests).toHaveLength(1);
    const raw = capture.requests[0]?.rawBody ?? "";
    expect(raw.length, "본문이 비어 있다 — 0바이트를 통과로 접지 않는다").toBeGreaterThan(0);
    for (const pattern of FORBIDDEN_IDENTITY) {
      expect(raw, `요청 본문에 타 제품 신원이 실렸다: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("도구 이름이 치환 없이 등록 순서 그대로 실린다 (§2.2 문자열 치환 금지 · 불변 조건 6)", async () => {
    const capture = capturing(SUCCESS_CHUNKS);
    const names = ["read_file", "mcp_probe", "write_file"];
    await collect(
      makeClient(capture.fetch),
      makeRequest({
        tools: names.map((name) => ({
          name,
          description: `${name} 설명`,
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        })),
      }),
    );

    expect(capture.requests).toHaveLength(1);
    const body = capture.requests[0]?.body as { tools?: { name?: string }[] } | null;
    expect(body?.tools?.map((tool) => tool.name)).toEqual(names);
  });

  it("헤더 캡처가 비어 있지 않다 — 금지 패턴 단정의 fail-closed 앵커", async () => {
    // 형제의 사칭 단정은 요청 건수만 잰다. 건수가 1이어도 **헤더 맵이 비면** 금지 패턴
    // 다섯이 다시 전부 통과한다(직렬화 결과가 "{}"). 그 잔여를 여기서 닫는다.
    const capture = capturing(SUCCESS_CHUNKS);
    await collect(makeClient(capture.fetch));

    expect(capture.requests).toHaveLength(1);
    const headers = capture.requests[0]?.headers ?? {};
    expect(Object.keys(headers).length, "헤더를 하나도 캡처하지 못했다").toBeGreaterThan(0);
    expect(headers["user-agent"], "User-Agent가 캡처되지 않았다").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. §2 유니온 밖 와이어 stop_reason — 형제가 둘만 재는 자리의 나머지
// ---------------------------------------------------------------------------

/** §2가 든 다섯. 어댑터가 내는 값은 언제나 이 안이어야 한다 */
const STOP_REASONS: readonly StopReason[] = [
  "end_turn",
  "tool_use",
  "max_tokens",
  "error",
  "aborted",
];

describe("§2 · §8 — 종료 사유가 없거나 유니온 밖인 와이어 값", () => {
  it("message_delta 없이 message_stop만 온 스트림은 end_turn을 만들지 않는다 (§8)", async () => {
    // §8은 프로바이더 스트림이 종료 사유를 주지 않고 끝나는 경우를 직접 규정한다 —
    // 어댑터는 end_turn을 만들어내지 않고, signal.aborted가 아니면 error로 인코딩한다.
    // 형제의 실패 목록에는 message_stop이 **오지 않는** 절단만 있고, 프레임은 정상인데
    // stop_reason이 끝내 null인 이 경로가 없다. 비용 0의 빈 정상 응답이 되는 자리다.
    const client = makeClient(
      capturing([MESSAGE_START, TEXT_BLOCK_START, textDelta("부분"), BLOCK_STOP, MESSAGE_STOP])
        .fetch,
    );
    const message = doneMessage(await collect(client));

    expect(message.stopReason, "종료 사유 없는 스트림이 정상 종료로 보고됐다").not.toBe("end_turn");
    expect(message.stopReason).toBe("error");
    expect(message.errorMessage, "errorMessage가 비어 있다 (§2)").toBeTruthy();
  });

  /**
   * **이 두 축은 red를 확인한 뒤 파킹했다 — 삭제 대기가 아니라 판정 대기다.**
   *
   * 관측은 확정이다(2026-08-28): 와이어가 `model_context_window_exceeded`를 보내면 어댑터가
   * `stopReason: "end_turn"` · `errorMessage` 없음으로 보고한다. 컨텍스트 창 초과로 잘린
   * 응답이 완결된 정상 종료로 사용자에게 보이므로 `ARCHITECTURE.md` §2.6이 최악으로 드는
   * 침묵 실패다. 가설이 아니다 — 이 레포에 설치된 SDK가 `BetaStopReason`으로 그 값을 이미 든다.
   *
   * **그럼에도 실단언으로 못 세우는 이유는 목적지가 정본에 없기 때문이다.** §8이 규정하는 것은
   * 종료 사유를 **주지 않고** 끝나는 경우이고(위 축이 그것을 잰다), 여기는 **주는데 옮길 자리가
   * 없는** 경우다. 와이어 값 → 코어 유니온 다섯의 매핑표가 어느 정본에도 없어, 이 자리에
   * `error`를 요구하면 정본이 안 낸 판정을 이 파일이 대신 내리게 된다.
   *
   * **소유는 `K-359`이고 재개 조건은 그 카드가 매핑표를 정본에 올리는 것이다.** 그날
   * `todo`를 떼는 것만으로 이 단언이 다시 선다 — 술어와 픽스처는 그대로 둔다.
   * **조건을 느슨하게 고쳐 green을 만드는 길은 여기서 닫는다**: 위 두 단정 중 `not.toBe`는
   * 정본이 이미 금지한 결과이므로 어떤 판정이 나와도 살아남는다.
   *
   * 이 파킹이 `K-006`·`K-150`의 형태가 되지 않게 하는 것은 소유 카드가 살아 있는 것뿐이다
   * (`plans/20260828-providers-test-verify-report.md` V-3이 그 대가를 실물로 냈다).
   */
  for (const wire of ["model_context_window_exceeded", "future_reason_xyz"]) {
    it.todo(`[K-359 대기] 유니온에 없는 와이어 stop_reason ${wire}는 정상 종료로 접히지 않는다`, async () => {
      // §2의 StopReason은 다섯으로 닫혀 있어 이 값들은 자리가 없다. 그럼에도 end_turn으로
      // 접으면 완결되지 않은 응답이 완결로 보고된다 — ARCHITECTURE §2.6이 최악으로 드는
      // 침묵 실패다. 원인 쪽(어느 값으로 옮길지)이 미규정이어도 이 결과는 금지된다.
      const client = makeClient(
        capturing([
          MESSAGE_START,
          TEXT_BLOCK_START,
          textDelta("부분"),
          BLOCK_STOP,
          messageDelta(wire, 4),
          MESSAGE_STOP,
        ]).fetch,
      );
      const message = doneMessage(await collect(client));

      expect(STOP_REASONS, "유니온 밖 값이 그대로 새어 나왔다 (§2)").toContain(message.stopReason);
      expect(message.stopReason, `${wire}가 정상 종료로 접혔다`).not.toBe("end_turn");
      expect(message.errorMessage, "errorMessage가 비어 있다 (§2)").toBeTruthy();
    });
  }

  it("[미규정] 와이어 stop_sequence는 유니온 다섯 중 하나로 옮겨진다 — 어느 것인지는 정본이 안 든다", async () => {
    // SDK의 stop_reason 여섯 중 `stop_sequence`만 레포 전체에 단정이 0건이다.
    // §2의 유니온에 대응 값이 없고, 정지 시퀀스 도달을 정상 완결로 볼지 미완결로 볼지는
    // 정본이 정하지 않는다 — 여기서는 유니온 소속만 재고 판정은 리포트로 올린다.
    const client = makeClient(
      capturing([
        MESSAGE_START,
        TEXT_BLOCK_START,
        textDelta("부분"),
        BLOCK_STOP,
        messageDelta("stop_sequence", 4),
        MESSAGE_STOP,
      ]).fetch,
    );
    const message = doneMessage(await collect(client));

    expect(STOP_REASONS, "유니온 밖 값이 그대로 새어 나왔다 (§2)").toContain(message.stopReason);
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      expect(message.errorMessage, "errorMessage가 비어 있다 (§2)").toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. ThinkingContent — 순수 함수가 아니라 실제 와이어에서 잰다 (§2)
// ---------------------------------------------------------------------------

const THINKING_TEXT = "속으로만 하는 생각";

function assistantWithThinking(): AgentMessage {
  return {
    id: "m2",
    role: "assistant",
    content: [
      { type: "thinking", text: THINKING_TEXT },
      { type: "text", text: "읽을게" },
      { type: "toolCall", toolCallId: "call_1", toolName: "read_file", args: { path: "a.ts" } },
    ],
    stopReason: "tool_use",
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    timestamp: TS,
  };
}

describe("§2 — thinking은 와이어로 되돌아가지 않는다", () => {
  it("다른 콘텐츠와 섞인 thinking도 페이로드에 문면이 남지 않고 이웃은 보존된다", () => {
    const converted = toAnthropicMessages([USER_MESSAGE, assistantWithThinking()]);
    const serialized = JSON.stringify(converted);

    expect(serialized.includes(THINKING_TEXT), "thinking 문면이 와이어 페이로드에 남았다").toBe(
      false,
    );
    // 누락이 계약인 것은 thinking 하나다 — 같은 메시지의 이웃까지 사라지면 그건 유실이다.
    expect(serialized).toContain("읽을게");
    expect(serialized).toContain("call_1");
  });

  it("실제 요청 본문에도 thinking 문면이 실리지 않는다", async () => {
    const capture = capturing(SUCCESS_CHUNKS);
    await collect(
      makeClient(capture.fetch),
      makeRequest({ messages: [USER_MESSAGE, assistantWithThinking()] }),
    );

    expect(capture.requests).toHaveLength(1);
    const raw = capture.requests[0]?.rawBody ?? "";
    expect(raw.length, "본문이 비어 있다").toBeGreaterThan(0);
    expect(raw.includes(THINKING_TEXT), "thinking 문면이 실제 요청 본문에 실렸다").toBe(false);
    expect(raw, "이웃 콘텐츠까지 사라졌다").toContain("읽을게");
  });
});
