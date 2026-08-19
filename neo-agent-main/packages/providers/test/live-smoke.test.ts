/**
 * T-009 — 라이브 스모크 (opt-in).
 *
 * `ANTHROPIC_API_KEY`가 없으면 통째로 skip한다. 키 없이 `pnpm check`는 그린이어야 하고,
 * CI는 이 테스트에 의존하지 않는다.
 *
 * 픽스처 테스트가 잡지 못하는 것 하나만 노린다: **우리가 만든 SSE 픽스처가 실제
 * 와이어와 같은가.** 특히 `usage` 매핑은 픽스처를 우리가 쓰므로 자기충족적이 되기 쉽다 —
 * 실 API가 보고한 input 토큰이 `usage.input`에 살아 나오는지는 여기서만 확인된다
 * (CORE-INTERFACE §2 "usage는 옵션이 아니다", §8 "done.message.usage는 필수").
 *
 * 토큰 소모는 최소로: 짧은 프롬프트 + `ModelRequest.maxTokens = 16`. 요청에 실린 값이
 * 어댑터 기본값(8192)보다 우선한다는 §8 규정도 이 호출로 함께 확인된다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { ModelStreamEvent } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { anthropicProvider } from "../src/index.ts";

const API_KEY = process.env.ANTHROPIC_API_KEY;

/** 스모크에 쓸 모델. 가장 싼 것을 기본값으로 두고 env로 덮어쓸 수 있게 한다 */
const MODEL = process.env.ANTHROPIC_SMOKE_MODEL ?? "claude-haiku-4-5-20251001";

describe.skipIf(!API_KEY)("라이브 스모크 — 실제 Anthropic API (opt-in)", () => {
  it("짧은 프롬프트 1회 호출이 done으로 끝나고 usage·stopReason이 실려 온다", {
    timeout: 60_000,
  }, async () => {
    const client = anthropicProvider.createClient({
      apiKey: API_KEY as string,
      model: MODEL,
    });

    const events: ModelStreamEvent[] = [];
    const controller = new AbortController();
    for await (const event of client.stream(
      {
        systemPrompt: "Answer with a single word.",
        messages: [
          { id: "m1", role: "user", content: [{ type: "text", text: "Say ok." }], timestamp: 1 },
        ],
        tools: [],
        maxTokens: 16,
      },
      controller.signal,
    )) {
      events.push(event);
    }

    // 계약: 스트림은 반드시 done으로 끝난다 (§8)
    const last = events.at(-1);
    expect(last?.type).toBe("done");
    if (last?.type !== "done") return;

    const { message } = last;

    // 실패 경로면 원인을 그대로 드러낸다 — 침묵 실패 금지(§2.6).
    // 자격증명·모델명 문제를 "그냥 실패"로 뭉개면 스모크의 의미가 없다.
    expect(message.errorMessage ?? null).toBeNull();
    expect(message.stopReason).toBe("end_turn");

    // 비용 가시성 — 실 API가 보고한 입력 토큰이 살아 나와야 한다
    expect(message.usage.input).toBeGreaterThan(0);
    expect(message.usage.output).toBeGreaterThan(0);
    expect(message.usage.cacheRead).toBeGreaterThanOrEqual(0);
    expect(message.usage.cacheWrite).toBeGreaterThanOrEqual(0);

    // 무언가는 말해야 한다
    expect(events.some((event) => event.type === "text_delta")).toBe(true);
    expect(message.content.length).toBeGreaterThan(0);
    expect(message.role).toBe("assistant");
    expect(client.modelId).toBe(MODEL);
  });
});
