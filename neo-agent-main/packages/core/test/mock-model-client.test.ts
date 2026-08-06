/**
 * T-008 — 하네스 자체 테스트.
 *
 * 하네스가 `docs/CORE-INTERFACE.md` §8의 스트림 계약을 지키는지 먼저 못박는다.
 * 하네스가 계약을 어기면 루프 테스트의 결론이 전부 무의미해진다.
 */

import { describe, expect, it } from "vitest";
import type { ModelStreamEvent } from "../src/index.ts";
import { collectStream, MockModelClient, makeModelRequest } from "./mock-model-client.ts";

describe("MockModelClient — 시나리오 재생", () => {
  it("2개 응답 시나리오를 순서대로 재생하고 done 메시지가 델타 누적과 일치한다", async () => {
    const model = new MockModelClient([
      {
        steps: [
          { kind: "thinking", text: "생각" },
          { kind: "text", text: "안녕" },
          { kind: "text", text: "하세요" },
          { kind: "toolCall", toolCallId: "call-1", toolName: "read", args: { path: "a.txt" } },
        ],
        usage: { input: 11, output: 7, cacheRead: 3, cacheWrite: 1 },
      },
      {
        steps: [{ kind: "text", text: "끝" }],
      },
    ]);

    const first = await collectStream(model, makeModelRequest({ systemPrompt: "SP" }));
    expect(first.map((event) => event.type)).toEqual([
      "thinking_delta",
      "text_delta",
      "text_delta",
      "toolcall",
      "done",
    ]);

    const firstDone = first.at(-1) as Extract<ModelStreamEvent, { type: "done" }>;
    // 연속 text 델타는 하나의 블록으로 합쳐진다 — 루프의 초안 병합 규칙과 같은 규칙
    expect(firstDone.message.content).toEqual([
      { type: "thinking", text: "생각" },
      { type: "text", text: "안녕하세요" },
      { type: "toolCall", toolCallId: "call-1", toolName: "read", args: { path: "a.txt" } },
    ]);
    // toolCall이 있으면 기본 stopReason은 tool_use
    expect(firstDone.message.stopReason).toBe("tool_use");
    expect(firstDone.message.usage).toEqual({ input: 11, output: 7, cacheRead: 3, cacheWrite: 1 });

    const second = await collectStream(model, makeModelRequest({ systemPrompt: "SP2" }));
    expect(second.map((event) => event.type)).toEqual(["text_delta", "done"]);
    const secondDone = second.at(-1) as Extract<ModelStreamEvent, { type: "done" }>;
    expect(secondDone.message.stopReason).toBe("end_turn");

    // 호출 기록 — 프롬프트 캐시 안정성 검증의 재료
    expect(model.callCount).toBe(2);
    expect(model.requests.map((request) => request.systemPrompt)).toEqual(["SP", "SP2"]);
  });

  it("done.message.usage는 항상 실린다 (계약: usage 없는 어댑터는 위반)", async () => {
    const model = new MockModelClient([{ steps: [{ kind: "text", text: "x" }] }]);
    const events = await collectStream(model);
    const done = events.at(-1) as Extract<ModelStreamEvent, { type: "done" }>;
    expect(done.message.usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("delay 스텝은 재생을 지연시키되 이벤트 순서를 바꾸지 않는다", async () => {
    const model = new MockModelClient([
      {
        steps: [
          { kind: "text", text: "a" },
          { kind: "delay", ms: 5 },
          { kind: "text", text: "b" },
        ],
      },
    ]);
    const events = await collectStream(model);
    expect(events.map((event) => event.type)).toEqual(["text_delta", "text_delta", "done"]);
  });
});

describe("MockModelClient — no-throw 계약 (§8)", () => {
  it('에러 시나리오에서 iterator가 throw하지 않고 stopReason:"error" done을 방출한다', async () => {
    const model = new MockModelClient([
      { steps: [{ kind: "text", text: "부분 출력" }], error: "rate limit exceeded" },
    ]);

    const events: ModelStreamEvent[] = [];
    // for-await가 throw하면 이 await 자체가 reject된다
    await expect(
      (async () => {
        for await (const event of model.stream(makeModelRequest(), new AbortController().signal)) {
          events.push(event);
        }
      })(),
    ).resolves.toBeUndefined();

    expect(events.map((event) => event.type)).toEqual(["text_delta", "done"]);
    const done = events.at(-1) as Extract<ModelStreamEvent, { type: "done" }>;
    expect(done.message.stopReason).toBe("error");
    expect(done.message.errorMessage).toBe("rate limit exceeded");
    // 실패해도 그때까지의 부분 출력은 남는다 — 침묵 실패 금지
    expect(done.message.content).toEqual([{ type: "text", text: "부분 출력" }]);
    expect(done.message.usage).toBeDefined();
  });

  it('중단된 signal로 재생하면 stopReason:"aborted" done을 방출한다', async () => {
    const controller = new AbortController();
    controller.abort("사용자가 중단했다");
    const model = new MockModelClient([{ steps: [{ kind: "text", text: "안 나옴" }] }]);

    const events = await collectStream(model, makeModelRequest(), controller.signal);
    expect(events.map((event) => event.type)).toEqual(["done"]);
    const done = events.at(-1) as Extract<ModelStreamEvent, { type: "done" }>;
    expect(done.message.stopReason).toBe("aborted");
    expect(done.message.errorMessage).toBe("사용자가 중단했다");
  });

  it("시나리오가 소진되어도 throw하지 않고 error done으로 알린다", async () => {
    const model = new MockModelClient([]);
    const events = await collectStream(model);
    const done = events.at(-1) as Extract<ModelStreamEvent, { type: "done" }>;
    expect(done.message.stopReason).toBe("error");
    expect(done.message.errorMessage).toContain("시나리오가 소진");
  });
});
