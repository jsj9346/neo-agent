import { describe, expect, test } from "vitest";
import { planCompaction } from "../src/plan.ts";
import { shouldCompact } from "../src/trigger.ts";
import { assistant, config, ids, toolResult, user } from "./support.ts";

describe("planCompaction — cut 위치", () => {
  test("뒤에서 keepRecentTurns번째 user 메시지에서 자른다", () => {
    const messages = [
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
      user("u3"),
      assistant("a3"),
    ];
    const result = planCompaction(messages, config({ keepRecentTurns: 2 }));

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    // 유지는 u2부터 — u2·u3 두 턴이 원문으로 남는다
    expect(ids(result.kept)).toEqual(ids(messages.slice(2)));
    expect(ids(result.toSummarize)).toEqual(ids(messages.slice(0, 2)));
  });

  test("도구 짝은 절대 갈라지지 않는다 — 경계가 user 메시지뿐이기 때문", () => {
    const call = assistant("도구를 부른다", {
      content: [{ type: "toolCall", toolCallId: "call_1", toolName: "read_file", args: {} }],
      stopReason: "tool_use",
    });
    const messages = [user("u1"), call, toolResult(), assistant("a1"), user("u2"), assistant("a2")];
    const result = planCompaction(messages, config({ keepRecentTurns: 1 }));

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(ids(result.kept)).toEqual(ids(messages.slice(4)));
    // toolCall과 toolResult가 같은 쪽(요약 대상)에 함께 남는다
    expect(ids(result.toSummarize)).toContain(call.id);
    expect(result.toSummarize.some((message) => message.role === "toolResult")).toBe(true);
  });

  test("합성 user 메시지도 경계다 — grace·steer 주입을 구분하지 않는다", () => {
    const grace = user("(주입된 합성 턴)");
    const messages = [user("u1"), assistant("a1"), grace, assistant("a2")];
    const result = planCompaction(messages, config({ keepRecentTurns: 1 }));

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.kept[0]?.id).toBe(grace.id);
  });

  test("유지·요약이 트랜스크립트를 정확히 분할한다 (이전 요약 없음)", () => {
    const messages = [user("u1"), assistant("a1"), user("u2"), assistant("a2"), user("u3")];
    const result = planCompaction(messages, config({ keepRecentTurns: 2 }));

    if (result.kind !== "plan") throw new Error("plan을 기대했다");
    expect([...ids(result.toSummarize), ...ids(result.kept)]).toEqual(ids(messages));
  });
});

describe("planCompaction — not-possible", () => {
  test("user 턴이 유지 기준 이하면 압축 불가", () => {
    const messages = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];
    const result = planCompaction(messages, config({ keepRecentTurns: 2 }));

    expect(result.kind).toBe("not-possible");
    if (result.kind !== "not-possible") return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("빈 트랜스크립트도 압축 불가 (throw하지 않는다)", () => {
    expect(planCompaction([], config()).kind).toBe("not-possible");
  });

  test("분기 직후 세션 — stale usage로 shouldCompact가 참이어도 모델 호출 없이 끝난다", () => {
    // 자식은 부모 시절 usage를 실은 어시스턴트 메시지를 그대로 복사받는다(§3).
    const messages = [
      user("이전 요약"),
      user("u1"),
      assistant("a1", { usage: { input: 900, output: 10, cacheRead: 0, cacheWrite: 0 } }),
    ];
    const cfg = config({ contextWindowTokens: 1000, threshold: 0.75, keepRecentTurns: 2 });

    expect(shouldCompact(messages, cfg)).toBe(true);
    // 계획 단계에서 걸린다 — 순수 함수이므로 여기까지 오는 데 비용이 없다
    expect(planCompaction(messages, cfg, { hasPreviousSummary: true }).kind).toBe("not-possible");
  });
});

describe("planCompaction — 이전 요약", () => {
  test("첫 메시지를 previousSummary로 뽑고 toSummarize에서 제외한다", () => {
    const summary = user("지난 요약 본문");
    const messages = [
      summary,
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
      user("u3"),
      assistant("a3"),
    ];
    const result = planCompaction(messages, config({ keepRecentTurns: 2 }), {
      hasPreviousSummary: true,
    });

    if (result.kind !== "plan") throw new Error("plan을 기대했다");
    expect(result.previousSummary).toBe("지난 요약 본문");
    expect(ids(result.toSummarize)).not.toContain(summary.id);
    expect(ids(result.toSummarize)).toEqual(ids(messages.slice(1, 3)));
  });

  test("hasPreviousSummary가 거짓이면 첫 메시지도 요약 대상이다", () => {
    const first = user("u1");
    const messages = [first, assistant("a1"), user("u2"), assistant("a2"), user("u3")];
    const result = planCompaction(messages, config({ keepRecentTurns: 2 }));

    if (result.kind !== "plan") throw new Error("plan을 기대했다");
    expect(ids(result.toSummarize)).toContain(first.id);
    expect(result.previousSummary).toBeUndefined();
  });

  test("[E-32] 첫 메시지가 user가 아니면 throw — 호출자 배선 버그를 숨기지 않는다", () => {
    const messages = [assistant("a1"), user("u1"), assistant("a2"), user("u2")];
    expect(() =>
      planCompaction(messages, config({ keepRecentTurns: 1 }), { hasPreviousSummary: true }),
    ).toThrow(/hasPreviousSummary/);
  });
});
