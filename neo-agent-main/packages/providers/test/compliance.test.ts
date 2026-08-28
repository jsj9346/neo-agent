/**
 * T-008b — 컴플라이언스 테스트.
 *
 * 정본: `docs/ARCHITECTURE.md` §2.2(컴플라이언스는 타입 레벨에서 강제한다),
 * `docs/CORE-INTERFACE.md` §8(컴플라이언스 게이트), 루트 `CLAUDE.md`(이식 금지 목록).
 *
 * 검증하는 명제는 세 개다:
 *   1. 정직한 신원이 **실제로 와이어에 실린다** — 선언만으로는 아무것도 보장되지 않는다.
 *   2. 사칭 UA·비공식 근거는 **컴파일되지 않는다** — OpenClaw는 같은 분류를 갖고도
 *      강제하지 않아 위반 경로가 살아남았다(§2.2). 우리는 게이트로 쓴다.
 *   3. **등록이 선언한 값이 계약 형태를 지킨다** — 근거 URL이 https이고 Anthropic 공식 문서
 *      도메인 안이며, `id`·`userAgent`·`evidence.kind`와 `createClient`가 내주는 `modelId`도
 *      함께 잰다. **근거 주소가 실재하는 문서를 가리키는지는 안 잰다** — 망을 타야 하는
 *      확인이라 이 파일의 수단 밖이다.
 *
 * **2026-08-28 정정 두 자리** — 셋째 명제가 근거 URL의 **실재**까지 재는 것처럼 적혀 있었고
 * (본문은 스킴과 호스트만 잰다), 그 명제가 근거 URL 하나만 드는 동안 셋째 절은 등록 내용
 * 전반을 재고 있었다. 둘 다 머리가 본문과 갈린 자리다.
 *
 * `@ts-expect-error`가 실제로 에러를 잡지 못하면 `tsc --noEmit`이 "unused directive"로
 * 실패한다 — 즉 **타입체크 통과 자체가 이 파일의 절반**이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { ModelClient, ProviderRegistration } from "@neo-agent/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicModelClient, anthropicProvider, NEO_AGENT_USER_AGENT } from "../src/index.ts";

// ---------------------------------------------------------------------------
// SSE 픽스처 — 요청이 성공 경로로 끝나야 헤더 검증이 재시도·에러에 섞이지 않는다
// ---------------------------------------------------------------------------

function sseFixture(): string {
  const frames = [
    {
      type: "message_start",
      message: {
        id: "msg_compliance",
        type: "message",
        role: "assistant",
        model: "test-model",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: "message_stop" },
  ];
  return `${frames.map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}`).join("\n\n")}\n\n`;
}

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

function capturingFetch(captured: CapturedRequest[]): typeof globalThis.fetch {
  return async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    captured.push({ url: String(input), headers });
    return new Response(sseFixture(), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
}

async function drain(client: ModelClient): Promise<void> {
  const controller = new AbortController();
  for await (const _event of client.stream(
    {
      systemPrompt: "test",
      messages: [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 }],
      tools: [],
    },
    controller.signal,
  )) {
    // 이벤트 내용은 여기 관심사가 아니다 — 요청이 실제로 나가기만 하면 된다
  }
}

// ---------------------------------------------------------------------------
// 1. 정직한 신원이 실제로 전송되는가
// ---------------------------------------------------------------------------

describe("User-Agent가 실제 요청에 실린다 (ARCHITECTURE §2.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("주입 fetch가 받은 헤더의 User-Agent가 neo-agent/로 시작한다", async () => {
    const captured: CapturedRequest[] = [];
    const client = new AnthropicModelClient({
      apiKey: "sk-test-not-a-real-key",
      model: "test-model",
      userAgent: NEO_AGENT_USER_AGENT,
      fetch: capturingFetch(captured),
    });

    await drain(client);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers["user-agent"]).toMatch(/^neo-agent\//);
  });

  it("등록(anthropicProvider.createClient) 경로로 만든 클라이언트도 같은 UA를 보낸다", async () => {
    // createClient에는 fetch 주입 지점이 없다. 전역 fetch를 스텁해 등록→클라이언트
    // 배선이 실제로 UA를 실어 보내는지 끝까지 확인한다.
    const captured: CapturedRequest[] = [];
    vi.stubGlobal("fetch", capturingFetch(captured));

    const client = anthropicProvider.createClient({
      apiKey: "sk-test-not-a-real-key",
      model: "test-model",
    });
    await drain(client);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers["user-agent"]).toBe(NEO_AGENT_USER_AGENT);
  });

  it("공식 엔드포인트로만 나간다 (api.anthropic.com)", async () => {
    const captured: CapturedRequest[] = [];
    const client = new AnthropicModelClient({
      apiKey: "sk-test-not-a-real-key",
      model: "test-model",
      userAgent: NEO_AGENT_USER_AGENT,
      fetch: capturingFetch(captured),
    });

    await drain(client);

    // 요청이 실제로 나갔음을 먼저 잰다. 이것이 없으면 아래 단정의 fail-closed가
    // `new URL("")`이 던지는 부수효과에 매달린다 — 그물이 아니라 우연이다.
    expect(captured).toHaveLength(1);
    expect(new URL(captured[0]?.url ?? "").origin).toBe("https://api.anthropic.com");
  });

  it("공식 API 키 인증만 쓴다 — OAuth Bearer 헤더가 없다", async () => {
    const captured: CapturedRequest[] = [];
    const client = new AnthropicModelClient({
      apiKey: "sk-test-not-a-real-key",
      model: "test-model",
      userAgent: NEO_AGENT_USER_AGENT,
      fetch: capturingFetch(captured),
    });

    await drain(client);

    // 같은 이유로 요청 실재를 먼저 잰다 — 0건이면 `?? {}`가 빈 객체를 내주고
    // `authorization`의 `toBeUndefined`가 그물 없이 통과한다.
    expect(captured).toHaveLength(1);
    const headers = captured[0]?.headers ?? {};
    expect(headers["x-api-key"]).toBe("sk-test-not-a-real-key");
    expect(headers.authorization).toBeUndefined();
  });

  it("타 제품 사칭 흔적이 어떤 헤더에도 없다 (CLAUDE.md 금지 목록)", async () => {
    const captured: CapturedRequest[] = [];
    const client = new AnthropicModelClient({
      apiKey: "sk-test-not-a-real-key",
      model: "test-model",
      userAgent: NEO_AGENT_USER_AGENT,
      fetch: capturingFetch(captured),
    });

    await drain(client);

    // 요청 실재가 이 단정의 전제다. 없으면 `?? {}`가 0건을 빈 객체로 접어
    // 아래 금지 패턴 다섯과 `x-app` 단정이 **전부 통과한다** — 사칭이 실제로
    // 들어와도 못 잡는 것이 아니라, 요청이 안 나가는 회귀에서 금지 목록 통과가
    // 조용히 보고된다(§2.6 침묵 실패). 2026-08-28 역검증으로 확정된 자리다.
    expect(captured).toHaveLength(1);
    // **요청 실재만으로는 안 닫힌다.** 요청이 1건이어도 헤더 맵이 비면(캡처 방식이 어긋나는
    // 회귀) `JSON.stringify({})`가 `"{}"`가 되어 아래가 다시 전부 통과한다. 형제 `it`들은
    // `x-api-key`·origin 값 단정이 그 앵커 노릇을 하는데 이 자리에는 값을 요구하는 단정이
    // 없다 — 그래서 여기서 따로 세운다.
    expect(
      captured[0]?.headers["user-agent"],
      "헤더 맵이 비어 아래 단정이 공허해진다",
    ).toBeTruthy();

    // 레퍼런스 두 곳이 실제로 쓰던 위장 신원들. 하나라도 새어 나오면 실패한다.
    const forbidden = [/claude-cli/i, /claude-code/i, /codex/i, /vscode/i, /copilot/i];
    const serialized = JSON.stringify(captured[0]?.headers ?? {});
    for (const pattern of forbidden) {
      expect(serialized).not.toMatch(pattern);
    }
    // OpenClaw가 소비자 클라이언트 위장에 쓰던 헤더
    expect(captured[0]?.headers["x-app"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. 타입 게이트 — 아래 블록은 "컴파일이 실패해야 한다"를 검증한다
// ---------------------------------------------------------------------------

/** 타입 게이트만 확인하는 자리표시자. 호출되지 않는다 */
const stubClient: ModelClient = {
  modelId: "stub",
  async *stream() {},
};

describe("컴플라이언스 타입 게이트 (CORE-INTERFACE §8)", () => {
  it("타 제품을 사칭하는 userAgent는 컴파일되지 않는다", () => {
    const spoofed: ProviderRegistration = {
      id: "spoofed",
      evidence: { kind: "vendor-documented", url: "https://docs.anthropic.com/en/api/overview" },
      // @ts-expect-error — `neo-agent/${string}`에 배정 불가. 이 지시자가 불필요해지는
      // 순간(= 사칭 UA가 컴파일되는 순간) tsc가 unused directive로 실패한다.
      userAgent: "claude-cli/2.1.75",
      createClient: () => stubClient,
    };
    // 게이트는 컴파일 타임에 걸린다. 런타임에서는 값이 살아 있음만 확인한다.
    expect(spoofed.id).toBe("spoofed");
  });

  it("접두가 다른 어떤 UA도 컴파일되지 않는다", () => {
    const bare: ProviderRegistration = {
      id: "bare",
      evidence: { kind: "vendor-documented", url: "https://docs.anthropic.com/en/api/overview" },
      // @ts-expect-error — 접두가 없으면 배정 불가
      userAgent: "neo-agent",
      createClient: () => stubClient,
    };
    expect(bare.id).toBe("bare");
  });

  it('"vendor-documented"가 아닌 evidence kind는 컴파일되지 않는다', () => {
    const hidden: ProviderRegistration = {
      id: "hidden",
      // @ts-expect-error — OpenClaw의 4분류 중 나머지 3종은 타입이 존재하지 않는다
      evidence: { kind: "vendor-hidden-api-spec", url: "https://example.invalid" },
      userAgent: "neo-agent/0.1.0",
      createClient: () => stubClient,
    };
    expect(hidden.id).toBe("hidden");
  });

  it("internal-runtime evidence도 컴파일되지 않는다", () => {
    const internal: ProviderRegistration = {
      id: "internal",
      // @ts-expect-error — 합법 종류는 "vendor-documented" 하나뿐
      evidence: { kind: "internal-runtime", url: "https://example.invalid" },
      userAgent: "neo-agent/0.1.0",
      createClient: () => stubClient,
    };
    expect(internal.id).toBe("internal");
  });

  it("evidence 없이는 프로바이더를 등록할 수 없다", () => {
    // @ts-expect-error — evidence는 옵션이 아니다
    const noEvidence: ProviderRegistration = {
      id: "no-evidence",
      userAgent: "neo-agent/0.1.0",
      createClient: () => stubClient,
    };
    expect(noEvidence.id).toBe("no-evidence");
  });
});

// ---------------------------------------------------------------------------
// 3. 근거(evidence)의 실체
// ---------------------------------------------------------------------------

/** Anthropic이 공식 문서를 서비스하는 도메인. 여기 없는 호스트는 근거가 될 수 없다 */
const OFFICIAL_DOC_HOSTS = ["anthropic.com", "claude.com"];

describe("anthropicProvider 등록 내용", () => {
  it('id가 "anthropic"이다', () => {
    expect(anthropicProvider.id).toBe("anthropic");
  });

  it('evidence.kind가 "vendor-documented"다', () => {
    expect(anthropicProvider.evidence.kind).toBe("vendor-documented");
  });

  it("evidence.url이 https이고 Anthropic 공식 도메인이다", () => {
    const url = new URL(anthropicProvider.evidence.url);
    expect(url.protocol).toBe("https:");
    expect(
      OFFICIAL_DOC_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)),
    ).toBe(true);
  });

  it("선언한 userAgent가 neo-agent/<버전> 형태다", () => {
    expect(anthropicProvider.userAgent).toBe(NEO_AGENT_USER_AGENT);
    expect(anthropicProvider.userAgent).toMatch(/^neo-agent\/\d+\.\d+\.\d+/);
  });

  it("createClient가 요청한 모델을 그대로 modelId로 노출한다", () => {
    const client = anthropicProvider.createClient({
      apiKey: "sk-test-not-a-real-key",
      model: "some-model-id",
    });
    expect(client.modelId).toBe("some-model-id");
  });
});
