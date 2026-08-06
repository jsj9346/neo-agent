/**
 * T-009 — 루프·큐 동작 테스트.
 *
 * 기대값은 `docs/CORE-INTERFACE.md` §3(이벤트 스트림)·§4(제어 API)·§5(루프)에서
 * 읽어낸 것이다. 구현이 문서와 다르면 테스트는 문서 편에 선다.
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type AgentMessage,
  type AssistantMessage,
  DEFAULT_MAX_TURNS_PER_RUN,
  type ToolResultMessage,
} from "../src/index.ts";
import { buildAgent, eventTypes, makeSpyTool, toolResultText, userMessage } from "./fixtures.ts";

function assistantMessages(messages: readonly AgentMessage[]): AssistantMessage[] {
  return messages.filter((message): message is AssistantMessage => message.role === "assistant");
}

function toolResults(messages: readonly AgentMessage[]): ToolResultMessage[] {
  return messages.filter((message): message is ToolResultMessage => message.role === "toolResult");
}

/** 요청 페이로드에 담긴 사용자 텍스트만 뽑는다 — 큐 주입 검증용 */
function userTexts(messages: readonly AgentMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) =>
      message.role === "user"
        ? message.content.map((block) => (block.type === "text" ? block.text : "")).join("")
        : "",
    );
}

describe("1. 이벤트 시퀀스 골든 테스트 (§3)", () => {
  it("(a) 도구 없는 단일 응답", async () => {
    const { agent, events } = buildAgent({
      responses: [{ steps: [{ kind: "text", text: "안녕하세요" }] }],
    });

    await agent.prompt("인사해줘");

    expect(eventTypes(events)).toEqual([
      "agent_start",
      "message_start", // 사용자 메시지
      "message_end",
      "turn_start",
      "message_start", // 어시스턴트 스트리밍 초안
      "message_update",
      "message_end",
      "turn_end",
      "agent_end",
    ]);
  });

  it("(b) 도구 1개 호출", async () => {
    const spy = makeSpyTool({ name: "read" });
    const { agent, events } = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "다 읽었다" }] },
      ],
    });

    await agent.prompt("파일 읽어줘");

    expect(eventTypes(events)).toEqual([
      "agent_start",
      "message_start",
      "message_end",
      // 턴 1 — 어시스턴트 응답 + 도구 실행
      "turn_start",
      "message_start",
      "message_update",
      "message_end",
      "tool_start",
      "tool_end",
      "message_start", // 도구 결과 메시지
      "message_end",
      "turn_end",
      // 턴 2 — 도구 결과를 받은 뒤의 마무리 응답
      "turn_start",
      "message_start",
      "message_update",
      "message_end",
      "turn_end",
      "agent_end",
    ]);
    expect(spy.calls).toHaveLength(1);
  });

  it("(c) 도구 연쇄 2턴", async () => {
    const spy = makeSpyTool({ name: "read" });
    const { agent, events } = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "toolCall", toolCallId: "c2", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "둘 다 읽었다" }] },
      ],
    });

    await agent.prompt("두 파일 읽어줘");

    const turnBlock = [
      "turn_start",
      "message_start",
      "message_update",
      "message_end",
      "tool_start",
      "tool_end",
      "message_start",
      "message_end",
      "turn_end",
    ];
    expect(eventTypes(events)).toEqual([
      "agent_start",
      "message_start",
      "message_end",
      ...turnBlock,
      ...turnBlock,
      "turn_start",
      "message_start",
      "message_update",
      "message_end",
      "turn_end",
      "agent_end",
    ]);
    expect(spy.calls.map((call) => call.toolCallId)).toEqual(["c1", "c2"]);
  });

  it("turn_end는 그 턴의 어시스턴트 메시지와 도구 결과를 함께 싣는다", async () => {
    const spy = makeSpyTool({ name: "read" });
    const { agent, events } = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await agent.prompt("읽어줘");

    const turnEnds = events.filter((event) => event.type === "turn_end");
    expect(turnEnds).toHaveLength(2);
    const first = turnEnds[0];
    expect(first?.type === "turn_end" && first.toolResults.map((r) => r.toolCallId)).toEqual([
      "c1",
    ]);
    const second = turnEnds[1];
    expect(second?.type === "turn_end" && second.toolResults).toEqual([]);
  });
});

describe("2. steer — 진행 중 끼어들기 (§4)", () => {
  it("도구 실행 중 steer한 메시지가 다음 모델 호출 컨텍스트에 주입된다", async () => {
    let steered = false;
    const spy = makeSpyTool({
      name: "read",
      execute: () => {
        if (!steered) {
          steered = true;
          agentRef?.steer(userMessage("아니 그 파일 말고 b.txt"));
        }
        return { content: [{ type: "text", text: "읽음" }], source: "local" };
      },
    });

    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "b.txt를 읽겠다" }] },
      ],
    });
    const agentRef: typeof built.agent | undefined = built.agent;

    await built.agent.prompt("a.txt 읽어줘");

    expect(built.model.requests).toHaveLength(2);
    // 1번째 요청에는 아직 없고, 2번째 요청 컨텍스트에 주입돼 있다
    expect(userTexts(built.model.requests[0]?.messages ?? [])).toEqual(["a.txt 읽어줘"]);
    expect(userTexts(built.model.requests[1]?.messages ?? [])).toEqual([
      "a.txt 읽어줘",
      "아니 그 파일 말고 b.txt",
    ]);
  });

  it("steer 메시지는 트랜스크립트에도 남는다 (가시적 결과)", async () => {
    const spy = makeSpyTool({
      name: "read",
      execute: () => {
        built.agent.steer(userMessage("끼어들기"));
        return { content: [{ type: "text", text: "읽음" }], source: "local" };
      },
    });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("시작");
    expect(userTexts(built.agent.state.messages)).toEqual(["시작", "끼어들기"]);
  });

  it("마지막 모델 응답 도중 도착한 steer는 같은 런에서 처리된다 (§5 종료 직전 드레인)", async () => {
    const built = buildAgent({
      responses: [
        // 도구 없는 자연 종료 응답 — 구 계약에서는 이 스트리밍 중 도착한 steer가
        // 다음 런까지 잔류했다(구 O-3). 새 계약: 내부 루프 종료 조건이
        // "도구 호출 없음 AND steering 큐 빔"이므로 한 턴 더 돌아 처리된다.
        { steps: [{ kind: "text", text: "다 했다" }] },
        { steps: [{ kind: "text", text: "steer 반영" }] },
      ],
    });
    let steered = false;
    built.agent.subscribe((event) => {
      if (event.type === "message_update" && !steered) {
        steered = true;
        built.agent.steer(userMessage("잠깐, 하나 더"));
      }
    });

    await built.agent.prompt("시작");

    // 런은 한 번 — 하지만 턴이 하나 더 돌아 steer를 소화했다
    expect(built.model.requests).toHaveLength(2);
    expect(userTexts(built.model.requests[1]?.messages ?? [])).toEqual(["시작", "잠깐, 하나 더"]);
    const types = eventTypes(built.events);
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);
    expect(types.filter((type) => type === "turn_start")).toHaveLength(2);
  });
});

/**
 * 3. followUp — 자연 종료 후 재진입.
 *
 * **판정: followUp 2개는 하나의 런 안에서 처리된다. `agent_end`는 1회다.**
 *
 * 근거는 §5의 루프 의사코드다. `agent_end 방출`이 **외부 루프 바깥**에 있고,
 * 외부 루프의 종료 조건이 "follow-up 큐가 비고 자연 종료할 때까지"이며,
 * 큐 드레인이 "follow-up 큐 드레인 → 있으면 **내부 루프 재진입**"이다 —
 * 재진입 대상이 내부 루프이지 런이 아니다. 따라서 큐에 무엇이 몇 개 남았든
 * `agent_start ... agent_end`는 한 번만 닫힌다.
 *
 * §4의 "one-at-a-time"은 **주입 단위**를 가리킨다. 그 문장이 배제하는 대상이
 * 레퍼런스의 `QueueMode("all" | "one-at-a-time")`인데, 이는 "큐를 통째로 한 번에
 * 주입할 것인가, 하나씩 주입할 것인가"의 설정이다. 런을 쪼개는 것과 무관하다.
 *
 * 보강 근거 — §3의 `agent_end{messages}`는 "이 런에서 새로 생긴 메시지들"이다.
 * 런이 쪼개진다면 후속 메시지들이 별개 `agent_end`로 흩어져야 하는데, 아래
 * 테스트가 확인하듯 하나의 `agent_end`가 전부를 싣는다.
 */
describe("3. followUp — 자연 종료 후 재진입 (§4·§5)", () => {
  it("2개를 넣으면 하나의 런 안에서 one-at-a-time으로 주입된다 (agent_end 1회)", async () => {
    const built = buildAgent({
      responses: [
        { steps: [{ kind: "text", text: "1번 응답" }] },
        { steps: [{ kind: "text", text: "2번 응답" }] },
        { steps: [{ kind: "text", text: "3번 응답" }] },
      ],
    });

    // prompt()는 동기적으로 런을 활성화한다 — await 전에 큐잉하면 런 중 주입이다(불변 조건 7)
    const run = built.agent.prompt("최초 프롬프트");
    built.agent.followUp(userMessage("후속 1"));
    built.agent.followUp(userMessage("후속 2"));
    await run;

    // 주입은 하나씩 — 매 요청마다 후속이 하나만 늘어난다(§4 one-at-a-time)
    expect(built.model.requests).toHaveLength(3);
    expect(userTexts(built.model.requests[0]?.messages ?? [])).toEqual(["최초 프롬프트"]);
    expect(userTexts(built.model.requests[1]?.messages ?? [])).toEqual(["최초 프롬프트", "후속 1"]);
    expect(userTexts(built.model.requests[2]?.messages ?? [])).toEqual([
      "최초 프롬프트",
      "후속 1",
      "후속 2",
    ]);

    // 런은 쪼개지지 않는다 — agent_start/agent_end 각각 1회(§5 의사코드)
    const types = eventTypes(built.events);
    expect(types.filter((type) => type === "agent_start")).toHaveLength(1);
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);
    // 나뉘는 것은 턴이다 — 내부 루프 재진입이 2회 더 일어난다
    expect(types.filter((type) => type === "turn_start")).toHaveLength(3);
    expect(types.filter((type) => type === "turn_end")).toHaveLength(3);
  });

  it("단 하나의 agent_end가 후속 메시지까지 전부 싣는다 (§3 — 이 런에서 새로 생긴 메시지들)", async () => {
    const built = buildAgent({
      responses: [
        { steps: [{ kind: "text", text: "1번 응답" }] },
        { steps: [{ kind: "text", text: "2번 응답" }] },
        { steps: [{ kind: "text", text: "3번 응답" }] },
      ],
    });

    // prompt()는 동기적으로 런을 활성화한다 — await 전에 큐잉하면 런 중 주입이다(불변 조건 7)
    const run = built.agent.prompt("최초 프롬프트");
    built.agent.followUp(userMessage("후속 1"));
    built.agent.followUp(userMessage("후속 2"));
    await run;

    const ends = built.events.filter((event) => event.type === "agent_end");
    expect(ends).toHaveLength(1);
    const end = ends[0];
    const carried = end?.type === "agent_end" ? end.messages : [];
    expect(userTexts(carried)).toEqual(["최초 프롬프트", "후속 1", "후속 2"]);
    expect(assistantMessages(carried)).toHaveLength(3);
  });

  it("followUp은 자연 종료 뒤에만 드레인된다 — 한 턴에 몰아 주입하지 않는다", async () => {
    const spy = makeSpyTool({ name: "read" });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        // 턴 1은 도구를 부른다 → 자연 종료가 아니므로 followUp을 건드리지 않는다
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "이제 끝" }] },
        { steps: [{ kind: "text", text: "후속 처리" }] },
      ],
    });

    const run = built.agent.prompt("시작");
    built.agent.followUp(userMessage("후속"));
    await run;

    // 도구 결과를 받은 2번째 요청에는 아직 후속이 없다
    expect(userTexts(built.model.requests[1]?.messages ?? [])).toEqual(["시작"]);
    // 자연 종료 뒤인 3번째 요청에서야 주입된다
    expect(userTexts(built.model.requests[2]?.messages ?? [])).toEqual(["시작", "후속"]);
    expect(eventTypes(built.events).filter((type) => type === "agent_end")).toHaveLength(1);
  });
});

describe("4. abort — 중단과 큐 비움 (§4)", () => {
  it('도구 실행 중 abort하면 stopReason:"aborted"가 트랜스크립트에 남고 agent_end가 방출된다', async () => {
    const spy = makeSpyTool({
      name: "slow",
      execute: () => {
        // 중단 시점에 양쪽 큐에 예약이 남아 있는 상황을 만든다
        built.agent.steer(userMessage("버려질 steer"));
        built.agent.followUp(userMessage("버려질 followUp"));
        built.agent.abort("사용자 Ctrl+C");
        return { content: [{ type: "text", text: "부분 결과" }], source: "local" };
      },
    });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "slow", args: {} }] },
        { steps: [{ kind: "text", text: "여기까지 오면 안 된다" }] },
      ],
    });

    await built.agent.prompt("시작");

    // 중단 후 추가 모델 호출 없음 — 양쪽 큐가 비워졌다
    expect(built.model.requests).toHaveLength(1);
    expect(userTexts(built.agent.state.messages)).toEqual(["시작"]);

    const aborted = assistantMessages(built.agent.state.messages).filter(
      (message) => message.stopReason === "aborted",
    );
    expect(aborted).toHaveLength(1);
    expect(aborted[0]?.errorMessage).toBe("사용자 Ctrl+C");

    const types = eventTypes(built.events);
    expect(types[0]).toBe("agent_start");
    expect(types.at(-1)).toBe("agent_end");
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);

    // 다음 런에도 되살아나지 않는다 — 큐는 정말 비워졌다
    await built.agent.prompt("다음 프롬프트");
    expect(userTexts(built.model.requests[1]?.messages ?? [])).toEqual(["시작", "다음 프롬프트"]);
  });

  it("스트리밍 중 abort해도 이벤트 시퀀스가 완결된다", async () => {
    const built = buildAgent({
      responses: [
        {
          steps: [
            { kind: "text", text: "시작" },
            { kind: "delay", ms: 20 },
            { kind: "text", text: "끝까지" },
          ],
        },
      ],
    });

    const run = built.agent.prompt("긴 응답 줘");
    await new Promise((resolve) => setTimeout(resolve, 5));
    built.agent.abort("중단");
    await run;

    const types = eventTypes(built.events);
    expect(types.at(-1)).toBe("agent_end");
    const last = assistantMessages(built.agent.state.messages).at(-1);
    expect(last?.stopReason).toBe("aborted");
  });
});

describe("5. 활성 런 중 prompt() (§4)", () => {
  it("활성 런이 있으면 throw한다", async () => {
    const built = buildAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 10 },
            { kind: "text", text: "1" },
          ],
        },
        { steps: [{ kind: "text", text: "2" }] },
      ],
    });

    const run = built.agent.prompt("첫 번째");
    expect(() => built.agent.prompt("두 번째")).toThrow(/already active/i);
    await run;

    // 런이 끝난 뒤에는 다시 받는다
    await expect(built.agent.prompt("두 번째")).resolves.toBeUndefined();
  });
});

describe("6. 훅 block (§7)", () => {
  it("beforeToolCall이 block하면 execute가 호출되지 않고 reason이 모델에게 간다", async () => {
    const spy = makeSpyTool({ name: "danger" });
    const beforeToolCall = vi.fn(async () => ({
      decision: "block" as const,
      reason: "승인 게이트가 거부했다",
    }));

    const built = buildAgent({
      tools: [spy.tool],
      hooks: { beforeToolCall },
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "danger", args: {} }] },
        { steps: [{ kind: "text", text: "알겠다" }] },
      ],
    });

    await built.agent.prompt("위험한 거 해줘");

    expect(beforeToolCall).toHaveBeenCalledTimes(1);
    expect(spy.calls).toHaveLength(0);

    const result = toolResults(built.agent.state.messages)[0];
    expect(result?.isError).toBe(true);
    expect(toolResultText(built.agent.state.messages, "c1")).toContain("승인 게이트가 거부했다");

    // 다음 모델 요청의 messages에 그 에러 결과가 들어간다
    const secondRequest = built.model.requests[1];
    expect(secondRequest).toBeDefined();
    expect(toolResultText(secondRequest?.messages ?? [], "c1")).toContain("승인 게이트가 거부했다");
  });

  it("beforeToolCall이 allow하면 execute가 호출된다", async () => {
    const spy = makeSpyTool({ name: "safe" });
    const beforeToolCall = vi.fn(async () => ({ decision: "allow" as const }));

    const built = buildAgent({
      tools: [spy.tool],
      hooks: { beforeToolCall },
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "safe", args: {} }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");
    expect(beforeToolCall).toHaveBeenCalledTimes(1);
    expect(spy.calls).toHaveLength(1);
  });

  it("afterToolCall의 부분 오버라이드는 생략 필드를 원본 유지한다", async () => {
    const spy = makeSpyTool({
      name: "noisy",
      execute: () => ({
        content: [{ type: "text", text: "아주 긴 원본 출력" }],
        source: "network",
      }),
    });

    const built = buildAgent({
      tools: [spy.tool],
      hooks: {
        afterToolCall: async () => ({ content: [{ type: "text", text: "잘린 출력" }] }),
      },
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "noisy", args: {} }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");
    const result = toolResults(built.agent.state.messages)[0];
    expect(toolResultText(built.agent.state.messages, "c1")).toBe("잘린 출력");
    // isError를 생략했으므로 원본(성공) 유지
    expect(result?.isError).toBe(false);
    // source는 오버라이드 대상이 아니다 — 도구가 판정한 값이 남는다
    expect(result?.source).toBe("network");
  });
});

describe("7. 인자 검증 실패 (§6, 불변 조건 3)", () => {
  const schema = z.strictObject({ path: z.string() });

  it("스키마에 없는 필드가 오면 실행 없이 isError 결과", async () => {
    const spy = makeSpyTool({ name: "read", paramsSchema: schema });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        {
          steps: [
            {
              kind: "toolCall",
              toolCallId: "c1",
              toolName: "read",
              args: { path: "a.txt", sudo: true },
            },
          ],
        },
        { steps: [{ kind: "text", text: "알겠다" }] },
      ],
    });

    await built.agent.prompt("읽어줘");

    expect(spy.calls).toHaveLength(0);
    const result = toolResults(built.agent.state.messages)[0];
    expect(result?.isError).toBe(true);
    expect(toolResultText(built.agent.state.messages, "c1")).toContain("read");
  });

  it("필수 필드가 빠지면 실행 없이 isError 결과", async () => {
    const spy = makeSpyTool({ name: "read", paramsSchema: schema });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "알겠다" }] },
      ],
    });

    await built.agent.prompt("읽어줘");

    expect(spy.calls).toHaveLength(0);
    const toolEnd = built.events.find((event) => event.type === "tool_end");
    expect(toolEnd?.type === "tool_end" && toolEnd.isError).toBe(true);
  });

  it("등록되지 않은 도구를 부르면 실행 없이 isError 결과", async () => {
    const spy = makeSpyTool({ name: "read", paramsSchema: schema });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "rm_rf", args: {} }] },
        { steps: [{ kind: "text", text: "알겠다" }] },
      ],
    });

    await built.agent.prompt("지워줘");

    expect(spy.calls).toHaveLength(0);
    expect(toolResultText(built.agent.state.messages, "c1")).toContain("rm_rf");
    expect(toolResults(built.agent.state.messages)[0]?.isError).toBe(true);
  });

  it("도구가 throw하면 isError 결과로 변환돼 모델에게 간다 (§6)", async () => {
    const spy = makeSpyTool({
      name: "read",
      execute: () => {
        throw new Error("ENOENT: a.txt 없음. ls로 경로를 먼저 확인하라");
      },
    });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "다시 시도" }] },
      ],
    });

    await built.agent.prompt("읽어줘");

    expect(spy.calls).toHaveLength(1);
    expect(toolResults(built.agent.state.messages)[0]?.isError).toBe(true);
    expect(toolResultText(built.model.requests[1]?.messages ?? [], "c1")).toContain("ENOENT");
  });
});

describe("8. 모델 에러 시나리오 (§3 — 에러 전용 이벤트 없음)", () => {
  it("에러가 트랜스크립트에 남고 이벤트 시퀀스가 완결된다", async () => {
    const built = buildAgent({
      responses: [{ steps: [{ kind: "text", text: "부분" }], error: "upstream 503" }],
    });

    await built.agent.prompt("해줘");

    expect(eventTypes(built.events)).toEqual([
      "agent_start",
      "message_start",
      "message_end",
      "turn_start",
      "message_start",
      "message_update",
      "message_end",
      "turn_end",
      "agent_end",
    ]);

    const last = assistantMessages(built.agent.state.messages).at(-1);
    expect(last?.stopReason).toBe("error");
    expect(last?.errorMessage).toBe("upstream 503");
    expect(last?.usage).toBeDefined();
    expect(built.agent.state.errorMessage).toBe("upstream 503");
  });

  it("에러 뒤에는 followUp이 있어도 재진입하지 않는다", async () => {
    const built = buildAgent({
      responses: [
        { error: "upstream 503" },
        { steps: [{ kind: "text", text: "여기까지 오면 안 된다" }] },
      ],
    });

    const run = built.agent.prompt("해줘");
    built.agent.followUp(userMessage("후속"));
    await run;

    expect(built.model.requests).toHaveLength(1);
  });

  it("어댑터가 계약을 어기고 throw해도 시퀀스는 완결된다 (불변 조건 2)", async () => {
    const brokenClient = {
      modelId: "broken/1",
      // biome-ignore lint/correctness/useYield: 계약 위반 어댑터를 재현하는 것이 목적이다
      stream: async function* () {
        throw new Error("어댑터 결함");
      },
    };
    const { Agent } = await import("../src/index.ts");
    const agent = new Agent({
      session: { systemPrompt: "sp", tools: [] },
      modelClient: brokenClient,
    });
    const events: string[] = [];
    agent.subscribe((event) => {
      events.push(event.type);
    });

    await agent.prompt("해줘");

    expect(events[0]).toBe("agent_start");
    expect(events.at(-1)).toBe("agent_end");
    const last = assistantMessages(agent.state.messages).at(-1);
    expect(last?.stopReason).toBe("error");
    expect(last?.errorMessage).toContain("어댑터 결함");
  });
});

describe("9. 턴 한도와 grace 턴 (§5)", () => {
  it("기본값은 50이다 — 폭주 백스톱이지 일상 예산이 아니다", () => {
    expect(DEFAULT_MAX_TURNS_PER_RUN).toBe(50);
  });

  it("양의 정수가 아닌 maxTurnsPerRun은 생성 시점에 throw한다 (fail-fast)", () => {
    expect(() => buildAgent({ responses: [], maxTurnsPerRun: 0 })).toThrow(/positive integer/);
    expect(() => buildAgent({ responses: [], maxTurnsPerRun: 1.5 })).toThrow(/positive integer/);
    expect(() => buildAgent({ responses: [], maxTurnsPerRun: -3 })).toThrow(/positive integer/);
  });

  it("상한 도달 시 합성 안내 메시지와 함께 grace 턴 1회가 돌고 런이 닫힌다", async () => {
    const spy = makeSpyTool({ name: "read" });
    const built = buildAgent({
      tools: [spy.tool],
      maxTurnsPerRun: 2,
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "toolCall", toolCallId: "c2", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "요약: 여기까지 했다" }] }, // grace 응답
        { steps: [{ kind: "text", text: "여기까지 오면 안 된다" }] },
      ],
    });

    await built.agent.prompt("시작");

    // 정상 턴 2회 + grace 1회 = 모델 호출 3회. 그 이상은 없다
    expect(built.model.requests).toHaveLength(3);
    // grace 요청의 마지막 사용자 메시지는 코어가 주입한 한도 안내다
    const graceTexts = userTexts(built.model.requests[2]?.messages ?? []);
    expect(graceTexts.at(-1)).toContain("Turn limit reached");
    // 중간 경고는 없다 — 그 전 요청들에는 안내가 실리지 않는다 (hermes #7915)
    expect(userTexts(built.model.requests[1]?.messages ?? []).join()).not.toContain(
      "Turn limit reached",
    );
    // 시퀀스는 완결된다 — grace 턴도 turn_start/turn_end 쌍을 가진 정규 턴이다
    const types = eventTypes(built.events);
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);
    expect(types.filter((type) => type === "turn_start")).toHaveLength(3);
    expect(types.filter((type) => type === "turn_end")).toHaveLength(3);
  });

  it("자연 종료가 상한보다 먼저면 grace는 없다", async () => {
    const built = buildAgent({
      maxTurnsPerRun: 5,
      responses: [{ steps: [{ kind: "text", text: "한 턴에 끝" }] }],
    });

    await built.agent.prompt("시작");

    expect(built.model.requests).toHaveLength(1);
    expect(userTexts(built.agent.state.messages).join()).not.toContain("Turn limit reached");
  });

  it("grace 응답의 도구 호출은 실행되지 않고 isError 짝만 남는다 (와이어 정합성)", async () => {
    const spy = makeSpyTool({ name: "read" });
    const built = buildAgent({
      tools: [spy.tool],
      maxTurnsPerRun: 1,
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        // grace 응답이 지시를 어기고 또 도구를 부른다
        { steps: [{ kind: "toolCall", toolCallId: "c2", toolName: "read", args: {} }] },
      ],
    });

    await built.agent.prompt("시작");

    // 실행은 정상 턴의 c1뿐 — grace의 c2는 실행되지 않았다
    expect(spy.calls.map((call) => call.toolCallId)).toEqual(["c1"]);
    // 그래도 c2의 toolResult 짝은 트랜스크립트에 있다 — 짝 없는 toolCall은
    // 다음 런의 API 호출을 깨뜨린다
    const c2 = toolResults(built.agent.state.messages).find(
      (message) => message.toolCallId === "c2",
    );
    expect(c2?.isError).toBe(true);
    expect(toolResultText(built.agent.state.messages, "c2")).toContain("not executed");
    // 실행이 없었으므로 c2의 tool_start/tool_end는 방출되지 않는다
    const toolEventIds = built.events
      .filter((event) => event.type === "tool_start" || event.type === "tool_end")
      .map((event) =>
        event.type === "tool_start" || event.type === "tool_end" ? event.toolCallId : "",
      );
    expect(toolEventIds).toEqual(["c1", "c1"]);
  });

  it("턴 한도 종료는 abort()처럼 양쪽 큐를 비운다 (불변 조건 7)", async () => {
    const spy = makeSpyTool({
      name: "read",
      execute: () => {
        built.agent.steer(userMessage("버려질 steer"));
        built.agent.followUp(userMessage("버려질 followUp"));
        return { content: [{ type: "text", text: "ok" }], source: "local" };
      },
    });
    const built = buildAgent({
      tools: [spy.tool],
      maxTurnsPerRun: 1,
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "요약" }] }, // grace
        { steps: [{ kind: "text", text: "2번째 런" }] },
      ],
    });

    await built.agent.prompt("시작");
    await built.agent.prompt("다음");

    // 다음 런의 요청에 버려진 예약이 되살아나지 않는다
    const texts = userTexts(built.model.requests.at(-1)?.messages ?? []);
    expect(texts.filter((text) => text.includes("버려질"))).toEqual([]);
  });
});
