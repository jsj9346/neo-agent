/**
 * T-009 (추가) — 이벤트 이미터 계약 검증. `docs/CORE-INTERFACE.md` §3.
 *
 * 계약 3줄:
 * 1. 리스너는 **구독 순서대로 await**된다.
 * 2. 리스너가 밀리면 다음 리스너·루프도 밀린다(settlement 순차성 = 자연 배압).
 * 3. `waitForIdle()`은 `agent_end` 리스너들의 settlement까지 기다린다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import { buildAgent } from "./fixtures.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("이벤트 이미터 계약 (§3)", () => {
  it("리스너 3개는 구독 순서대로 호출된다", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    const order: string[] = [];

    agent.subscribe(() => {
      order.push("A");
    });
    agent.subscribe(() => {
      order.push("B");
    });
    agent.subscribe(() => {
      order.push("C");
    });

    await agent.prompt("해줘");

    expect(order.length % 3).toBe(0);
    for (let i = 0; i < order.length; i += 3) {
      expect(order.slice(i, i + 3)).toEqual(["A", "B", "C"]);
    }
  });

  it("async 리스너의 지연이 다음 리스너를 지연시킨다 (settlement 순차성)", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    const order: string[] = [];

    agent.subscribe(async (event) => {
      if (event.type !== "agent_start") return;
      order.push("A-start");
      await sleep(15);
      order.push("A-end");
    });
    agent.subscribe((event) => {
      if (event.type !== "agent_start") return;
      order.push("B");
    });

    await agent.prompt("해줘");

    // B는 A가 settle한 뒤에야 호출된다 — 병렬 방출이었다면 A-end보다 앞섰을 것
    expect(order).toEqual(["A-start", "A-end", "B"]);
  });

  it("느린 리스너는 루프도 밀린다 (자연 배압)", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    const marks: string[] = [];

    agent.subscribe(async (event) => {
      if (event.type !== "message_start") return;
      await sleep(10);
      marks.push(`listener:${event.message.role}`);
    });
    agent.subscribe((event) => {
      if (event.type === "turn_end") marks.push("turn_end");
    });

    await agent.prompt("해줘");

    // 사용자 메시지·어시스턴트 초안의 리스너가 모두 settle한 뒤에 턴이 닫힌다
    expect(marks).toEqual(["listener:user", "listener:assistant", "turn_end"]);
  });

  it("한 리스너가 throw해도 뒤 순번 리스너가 호출된다", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    const order: string[] = [];

    agent.subscribe((event) => {
      if (event.type !== "turn_start") return;
      order.push("A");
    });
    agent.subscribe((event) => {
      if (event.type !== "turn_start") return;
      order.push("B-throw");
      throw new Error("중간 리스너 폭발");
    });
    agent.subscribe((event) => {
      if (event.type !== "turn_start") return;
      order.push("C");
    });

    // 예외는 삼켜지지 않는다 — 전달이 끝난 뒤 전파된다
    await expect(agent.prompt("해줘")).rejects.toThrow("중간 리스너 폭발");

    // C는 B의 실패와 무관하게 같은 방출에서 호출된다. 순서도 그대로다
    expect(order).toEqual(["A", "B-throw", "C"]);
  });

  it("리스너 예외는 전달 완료 뒤에 전파된다 — 2개 이상이면 AggregateError", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    let tailCalled = false;

    agent.subscribe((event) => {
      if (event.type === "turn_start") throw new Error("하나");
    });
    agent.subscribe((event) => {
      if (event.type === "turn_start") throw new Error("둘");
    });
    agent.subscribe((event) => {
      if (event.type === "turn_start") tailCalled = true;
    });

    const error: unknown = await agent.prompt("해줘").then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);
    expect(tailCalled).toBe(true);
  });

  it("구독 해제 후에는 호출되지 않는다", async () => {
    const { agent } = buildAgent({
      responses: [
        { steps: [{ kind: "text", text: "1" }] },
        { steps: [{ kind: "text", text: "2" }] },
      ],
    });
    let count = 0;
    const unsubscribe = agent.subscribe(() => {
      count += 1;
    });

    await agent.prompt("첫 번째");
    const afterFirst = count;
    expect(afterFirst).toBeGreaterThan(0);

    unsubscribe();
    await agent.prompt("두 번째");
    expect(count).toBe(afterFirst);
  });

  it("방출 도중 해제된 리스너는 그 방출에서도 호출되지 않는다", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    const seen: string[] = [];

    // 첫 리스너가 두 번째 리스너를 해제한다
    let unsubscribeSecond: (() => void) | undefined;
    agent.subscribe(() => {
      seen.push("first");
      unsubscribeSecond?.();
    });
    unsubscribeSecond = agent.subscribe(() => {
      seen.push("second");
    });

    await agent.prompt("해줘");

    expect(seen.filter((name) => name === "second")).toHaveLength(0);
    expect(seen.filter((name) => name === "first").length).toBeGreaterThan(0);
  });

  it("리스너는 런의 AbortSignal을 함께 받는다", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    const signals: AbortSignal[] = [];
    agent.subscribe((_event, signal) => {
      signals.push(signal);
    });

    await agent.prompt("해줘");

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    // 같은 런의 모든 이벤트는 같은 signal을 본다
    expect(new Set(signals).size).toBe(1);
  });

  it("waitForIdle()은 agent_end 리스너의 settlement까지 기다린다", async () => {
    const { agent } = buildAgent({ responses: [{ steps: [{ kind: "text", text: "hi" }] }] });
    let saved = false;
    agent.subscribe(async (event) => {
      if (event.type !== "agent_end") return;
      await sleep(15);
      saved = true;
    });

    const run = agent.prompt("해줘");
    await agent.waitForIdle();

    // "저장이 끝나기 전에 다음 프롬프트가 들어오는" 경합이 계약 수준에서 차단된다
    expect(saved).toBe(true);
    await run;
  });

  it("agent_end는 런의 마지막 이벤트이고, 그 뒤 새 프롬프트를 받을 수 있다", async () => {
    const { agent, events } = buildAgent({
      responses: [
        { steps: [{ kind: "text", text: "1" }] },
        { steps: [{ kind: "text", text: "2" }] },
      ],
    });

    await agent.prompt("첫 번째");
    await agent.waitForIdle();
    expect(events.at(-1)?.type).toBe("agent_end");

    await agent.prompt("두 번째");
    expect(events.at(-1)?.type).toBe("agent_end");
    expect(events.filter((event) => event.type === "agent_end")).toHaveLength(2);
  });
});
