import type { AgentMessage } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import type { CompactionPlan } from "../src/plan.ts";
import { CompactionSummaryError, generateSummary } from "../src/summary.ts";
import { assistant, config, doneEvent, stubClient, user } from "./support.ts";

const plan = (overrides: Partial<CompactionPlan> = {}): CompactionPlan => ({
  kind: "plan",
  toSummarize: [user("파일을 고쳐줘"), assistant("고쳤다")] satisfies AgentMessage[],
  kept: [],
  ...overrides,
});

const never = new AbortController().signal;

describe("generateSummary — 요청 형태 (§5)", () => {
  test("도구 없이, 단일 user 메시지로, summaryMaxTokens를 실어 보낸다", async () => {
    const client = stubClient([doneEvent()]);
    await generateSummary(client, plan(), config({ summaryMaxTokens: 4096 }), never);

    const request = client.requests[0];
    expect(request).toBeDefined();
    expect(request?.tools).toEqual([]);
    expect(request?.maxTokens).toBe(4096);
    expect(request?.messages).toHaveLength(1);
    expect(request?.messages[0]?.role).toBe("user");
    expect(request?.systemPrompt.length).toBeGreaterThan(0);
  });

  test("요약 프롬프트는 §5가 요구하는 6개 절과 원문 보존 지시를 담는다", async () => {
    const client = stubClient([doneEvent()]);
    await generateSummary(client, plan(), config(), never);

    const systemPrompt = client.requests[0]?.systemPrompt ?? "";
    for (const heading of [
      "## Goal",
      "## Constraints and preferences",
      "## Progress",
      "## Key decisions",
      "## Next steps",
      "## Context to carry forward",
    ]) {
      expect(systemPrompt).toContain(heading);
    }
    expect(systemPrompt).toContain("VERBATIM");
  });

  test("직렬화한 대화가 본문에 실린다", async () => {
    const client = stubClient([doneEvent()]);
    await generateSummary(client, plan(), config(), never);

    const first = client.requests[0]?.messages[0];
    const text =
      first?.role === "user" && first.content[0]?.type === "text" ? first.content[0].text : "";
    expect(text).toContain("<transcript>");
    expect(text).toContain("파일을 고쳐줘");
    expect(text).not.toContain("<previous-summary>");
  });

  test("previousSummary가 있으면 함께 실어 보존·갱신을 지시한다", async () => {
    const client = stubClient([doneEvent()]);
    await generateSummary(client, plan({ previousSummary: "지난 요약" }), config(), never);

    const first = client.requests[0]?.messages[0];
    const text =
      first?.role === "user" && first.content[0]?.type === "text" ? first.content[0].text : "";
    expect(text).toContain("<previous-summary>\n지난 요약\n</previous-summary>");
  });
});

describe("generateSummary — 성공", () => {
  test("최종 메시지의 텍스트를 그대로 돌려준다", async () => {
    const client = stubClient([
      { type: "text_delta", text: "부분" },
      doneEvent({ content: [{ type: "text", text: "  ## Goal\n완성된 요약  " }] }),
    ]);

    await expect(generateSummary(client, plan(), config(), never)).resolves.toBe(
      "## Goal\n완성된 요약",
    );
  });
});

describe("generateSummary — 실패는 throw (부분 요약 반환 금지)", () => {
  const cases = [
    {
      name: "max_tokens는 잘린 요약이므로 실패다",
      event: doneEvent({ stopReason: "max_tokens" }),
      reason: "truncated",
    },
    {
      name: "error는 실패다",
      event: doneEvent({ stopReason: "error", errorMessage: "429", content: [] }),
      reason: "model-error",
    },
    {
      name: "tool_use 같은 계약 밖 종료도 실패다",
      event: doneEvent({ stopReason: "tool_use" }),
      reason: "unexpected-stop",
    },
    {
      name: "텍스트가 없으면 실패다",
      event: doneEvent({ content: [{ type: "thinking", text: "생각만 했다" }] }),
      reason: "empty",
    },
  ] as const;

  for (const { name, event, reason } of cases) {
    test(name, async () => {
      const client = stubClient([event]);
      await expect(generateSummary(client, plan(), config(), never)).rejects.toMatchObject({
        name: "CompactionSummaryError",
        reason,
      });
    });
  }

  test("done 없이 끝난 스트림은 incomplete-stream", async () => {
    const client = stubClient([{ type: "text_delta", text: "부분" }]);
    await expect(generateSummary(client, plan(), config(), never)).rejects.toMatchObject({
      reason: "incomplete-stream",
    });
  });

  test("잘린 요약을 값으로 돌려주지 않는다 — 텍스트가 있어도 throw", async () => {
    const client = stubClient([
      doneEvent({ stopReason: "max_tokens", content: [{ type: "text", text: "절반만 쓴 요약" }] }),
    ]);
    await expect(generateSummary(client, plan(), config(), never)).rejects.toThrow(
      CompactionSummaryError,
    );
  });
});

describe("generateSummary — [E-34] 취소는 다른 실패와 구분된다", () => {
  test("어댑터가 aborted로 인코딩하면 reason도 aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = stubClient([doneEvent({ stopReason: "aborted", content: [] })]);

    await expect(
      generateSummary(client, plan(), config(), controller.signal),
    ).rejects.toMatchObject({ reason: "aborted" });
  });

  test("signal이 취소됐으면 error 인코딩도 취소로 분류한다 — 실패 카운트에 넣지 않기 위해", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = stubClient([doneEvent({ stopReason: "error", errorMessage: "aborted" })]);

    await expect(
      generateSummary(client, plan(), config(), controller.signal),
    ).rejects.toMatchObject({ reason: "aborted" });
  });
});
