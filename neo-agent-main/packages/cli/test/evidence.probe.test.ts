/**
 * 근거 실측 — 설계가 전제로 삼은 사실 3건의 **독립 재검증** (T-009 1급 임무).
 *
 * 설계자(Architect)가 설계 중 확인한 전제를 QA가 다시 잰다. 확인한 사람과 검증하는
 * 사람이 같으면 검증이 아니다. 세 전제는 각각 다음 설계의 토대다:
 *
 *   실측 1  `crypto.randomUUID()`는 소문자 hex만 발급한다
 *           → `resolveSessionId`의 소문자 정규화가 정보를 잃지 않는다는 근거
 *             (`docs/SESSION-STORE.md` §5, `docs/CLI-INTERFACE.md` §6)
 *   실측 2  턴 한도 grace의 합성 user 메시지가 `message_start`/`message_end` 쌍으로 나온다
 *           → 렌더러의 "사용자 메시지는 항상 렌더한다" 설계(`CLI-INTERFACE.md` §7)의 근거.
 *             렌더러가 "내가 만든 메시지"만 추적하는 설계였다면 이 메시지를 놓친다
 *   실측 3  비정상 종료의 합성 도구 짝은 `tool_start`/`tool_end` 없이 메시지 이벤트로만 나온다
 *           → 렌더러의 "`tool_end` 없이 온 toolResult `message_end`는 미실행으로 표시"
 *             경로(`CLI-INTERFACE.md` §7)의 근거. 이벤트가 오지 않으면 표시할 자리가 없다
 *
 * **하나라도 거짓이면 설계가 틀린 것이다** — 그때 고쳐야 하는 것은 테스트가 아니라
 * 설계 문서다. 이 파일의 기대값은 전부 위 문서에서만 도출했다.
 *
 * 이 세 건은 코어가 이미 구현돼 있으므로 **통과해야 정상**이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { Agent, type AgentEvent, type AgentMessage } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { ProbeModel } from "./harness.ts";

/** 이벤트를 순서대로 모으는 구독자 — 저장소·렌더러가 앉는 그 자리다 */
function collect(agent: Agent): AgentEvent[] {
  const events: AgentEvent[] = [];
  agent.subscribe((event) => {
    events.push(event);
  });
  return events;
}

function textOf(message: AgentMessage): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

describe("근거 실측 1 — crypto.randomUUID()는 소문자 hex만 발급한다", () => {
  // 근거: docs/SESSION-STORE.md §5 / docs/CLI-INTERFACE.md §6
  //   "id는 crypto.randomUUID()가 발급하는 소문자 hex뿐이므로 정규화에 정보 손실이 없고"
  // 이 전제가 거짓이면 `resolveSessionId(prefix.toLowerCase())`가 대문자를 포함한
  // 실제 id를 영영 찾지 못한다 — 조용한 재개 실패다.

  const LOWERCASE_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("20,000회 발급 전량이 소문자 hex UUID 형식이다", () => {
    const ITERATIONS = 20_000;
    const violations: string[] = [];
    // 대문자 hex(A-F)가 한 번이라도 나오면 전제가 깨진다. 발급 문자 집합 자체도 모은다.
    const charset = new Set<string>();

    for (let i = 0; i < ITERATIONS; i += 1) {
      const id = crypto.randomUUID();
      for (const char of id) charset.add(char);
      if (!LOWERCASE_UUID_V4.test(id)) violations.push(id);
    }

    expect(violations).toEqual([]);
    // 관찰된 문자 집합이 `0-9a-f-` 안에 완전히 들어가는지 — 정규식과 독립된 두 번째 관찰
    expect([...charset].sort().join("")).toBe("-0123456789abcdef");
    // 통계적 유의성: 16진 문자 16종이 전부 관찰돼야 "우연히 대문자가 안 나온" 것이 아니다
    expect(charset.size).toBe(17);
  });

  it("코어가 트랜스크립트 메시지에 붙이는 id도 같은 형식이다", async () => {
    // 저장소가 보관하고 CLI가 접두 매칭하는 것은 이 id들이다(CORE-INTERFACE §2).
    const agent = new Agent({
      session: { systemPrompt: "probe", tools: [] },
      modelClient: new ProbeModel([{ text: "ok" }]),
    });

    await agent.prompt("hello");
    await agent.waitForIdle();

    const ids = agent.state.messages.map((message) => message.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(id).toMatch(LOWERCASE_UUID_V4);
  });
});

describe("근거 실측 2 — grace 턴의 합성 user 메시지는 message_start/message_end 쌍으로 방출된다", () => {
  // 근거: docs/CORE-INTERFACE.md §3 "트랜스크립트에 추가되는 모든 메시지는 역할 무관
  //       message_start/message_end 쌍으로 방출된다", §5 grace 턴
  //       docs/CLI-INTERFACE.md §7 "렌더러가 '내가 만든 메시지'를 추적해 스킵하는
  //       설계는 합성 메시지를 놓친다"

  /** 도구 호출을 끝없이 반환하는 모델 + 낮은 턴 한도 → grace 경로 강제 */
  async function runToTurnLimit(maxTurnsPerRun: number) {
    const agent = new Agent({
      session: { systemPrompt: "probe", tools: [] },
      // 등록된 도구가 없으므로 코어는 "Unknown tool" 오류 결과로 짝을 채우고 루프를
      // 계속 돈다 — 도구 구현 없이 "도구를 계속 부르는 모델"을 재현하는 방법이다.
      modelClient: new ProbeModel(
        [{ text: "작업 중", toolCalls: [{ toolCallId: "loop", toolName: "noop", args: {} }] }],
        { repeatLast: true },
      ),
      maxTurnsPerRun,
    });
    const events = collect(agent);
    await agent.prompt("시작");
    await agent.waitForIdle();
    return { agent, events };
  }

  it("합성 user 메시지가 message_start와 message_end 양쪽으로 나온다", async () => {
    const { events } = await runToTurnLimit(2);

    const syntheticStarts = events.filter(
      (event): event is Extract<AgentEvent, { type: "message_start" }> =>
        event.type === "message_start" &&
        event.message.role === "user" &&
        textOf(event.message).includes("Turn limit reached"),
    );
    const syntheticEnds = events.filter(
      (event): event is Extract<AgentEvent, { type: "message_end" }> =>
        event.type === "message_end" &&
        event.message.role === "user" &&
        textOf(event.message).includes("Turn limit reached"),
    );

    expect(syntheticStarts).toHaveLength(1);
    expect(syntheticEnds).toHaveLength(1);

    // §3 "message_end가 싣는 것은 같은 메시지 객체다" — 별도 스냅샷이면 저장소와
    // 렌더러가 다른 값을 볼 수 있다. 참조 동일성으로 확인한다.
    expect(syntheticEnds[0]?.message).toBe(syntheticStarts[0]?.message);

    // 순서: start가 end보다 앞
    const startAt = events.findIndex((event) => event === syntheticStarts[0]);
    const endAt = events.findIndex((event) => event === syntheticEnds[0]);
    expect(startAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeLessThan(endAt);
  });

  it("합성 user 메시지는 사용자가 친 프롬프트와 구별되지 않는 형태로 나온다 (렌더러가 특별 취급할 필요가 없다)", async () => {
    const { events } = await runToTurnLimit(2);

    const userStarts = events.filter(
      (event) => event.type === "message_start" && event.message.role === "user",
    );
    // 사용자가 친 것 1개 + 코어가 주입한 합성 1개
    expect(userStarts).toHaveLength(2);
    for (const event of userStarts) {
      expect(event.type).toBe("message_start");
      if (event.type !== "message_start") return;
      // 두 메시지 모두 같은 형태(role/id/timestamp/content)를 갖는다 — 렌더러는
      // "user 메시지는 항상 렌더"라는 규칙 하나로 둘 다 그린다.
      expect(event.message.role).toBe("user");
      expect(typeof event.message.id).toBe("string");
      expect(typeof event.message.timestamp).toBe("number");
      expect(event.message.content.length).toBeGreaterThan(0);
    }
  });
});

describe("근거 실측 3 — 합성 도구 짝은 tool 이벤트 없이 메시지 이벤트로만 방출된다", () => {
  // 근거: docs/CORE-INTERFACE.md §5
  //   grace: "grace 응답에 도구 호출이 있으면 실행하지 않고 ... 합성 ToolResultMessage를 붙여"
  //   일반: "합성 짝은 grace 턴과 마찬가지로 도구 이벤트(tool_start/tool_end) 없이
  //          message_start/message_end로만 방출된다(실행이 없었으므로)"
  //   docs/CLI-INTERFACE.md §7 message_end(toolResult) 행이 이 사실 위에 서 있다.

  it("grace 턴 응답의 도구 호출: tool_start/tool_end 없이 isError toolResult가 메시지 이벤트로만 온다", async () => {
    // 1턴째는 정상 도구 호출(실행됨 — tool 이벤트 있음), grace 턴에서는 다른 id의
    // 도구 호출(미실행 — tool 이벤트 없어야 함)을 싣는다. 같은 런 안에서 두 경로를
    // 대조하면 "이벤트가 원래 안 나오는 구현"과 구별된다.
    const agent = new Agent({
      session: { systemPrompt: "probe", tools: [] },
      modelClient: new ProbeModel(
        [
          { text: "1턴", toolCalls: [{ toolCallId: "executed-1", toolName: "noop", args: {} }] },
          { text: "grace", toolCalls: [{ toolCallId: "grace-1", toolName: "noop", args: {} }] },
        ],
        { repeatLast: true },
      ),
      maxTurnsPerRun: 1,
    });
    const events = collect(agent);

    await agent.prompt("시작");
    await agent.waitForIdle();

    const toolEventIds = events
      .filter(
        (event) =>
          event.type === "tool_start" || event.type === "tool_update" || event.type === "tool_end",
      )
      .map((event) => (event as { toolCallId: string }).toolCallId);

    // 대조군: 실제 실행된 호출은 tool 이벤트를 남긴다
    expect(toolEventIds).toContain("executed-1");
    // 본 검증: grace 턴의 미실행 호출에는 tool 이벤트가 하나도 없다
    expect(toolEventIds).not.toContain("grace-1");

    const syntheticEnds = events.filter(
      (event): event is Extract<AgentEvent, { type: "message_end" }> =>
        event.type === "message_end" &&
        event.message.role === "toolResult" &&
        event.message.toolCallId === "grace-1",
    );
    const syntheticStarts = events.filter(
      (event) =>
        event.type === "message_start" &&
        event.message.role === "toolResult" &&
        event.message.toolCallId === "grace-1",
    );

    expect(syntheticStarts).toHaveLength(1);
    expect(syntheticEnds).toHaveLength(1);

    const synthetic = syntheticEnds[0]?.message;
    expect(synthetic?.role).toBe("toolResult");
    if (synthetic?.role !== "toolResult") return;
    // 미실행 사실이 화면에 남아야 한다(CLI-INTERFACE §7) — 그 근거가 되는 isError
    expect(synthetic.isError).toBe(true);
    expect(textOf(synthetic).length).toBeGreaterThan(0);
  });

  it("리스너 예외로 런이 끊겨도 짝 없는 도구 호출은 tool 이벤트 없이 합성 짝으로 채워진다", async () => {
    // §5 "런이 어떤 경로로 끝나든(리스너 예외·훅 예외 포함) ... 짝 없는 도구 호출이
    // 있으면 코어가 isError: true 합성 결과로 짝을 채운다". 이 경로에서는 도구 실행이
    // 시작조차 되지 않으므로 tool 이벤트가 전혀 없다 — 렌더러가 유일하게 보는 것이
    // toolResult의 message_end다.
    const agent = new Agent({
      session: { systemPrompt: "probe", tools: [] },
      modelClient: new ProbeModel([
        { text: "호출", toolCalls: [{ toolCallId: "dangling-1", toolName: "noop", args: {} }] },
      ]),
    });

    const events: AgentEvent[] = [];
    let thrown = false;
    agent.subscribe((event) => {
      events.push(event);
      // 도구 호출을 실은 어시스턴트 메시지의 message_end에서 한 번만 throw한다 →
      // 루프가 executeToolCall에 도달하기 전에 끊긴다.
      if (
        !thrown &&
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        event.message.content.some((block) => block.type === "toolCall")
      ) {
        thrown = true;
        throw new Error("QA-A: 의도적 리스너 예외");
      }
    });

    await expect(agent.prompt("시작")).rejects.toThrow();
    await agent.waitForIdle();

    const toolEvents = events.filter(
      (event) =>
        event.type === "tool_start" || event.type === "tool_update" || event.type === "tool_end",
    );
    expect(toolEvents).toEqual([]);

    const settled = events.filter(
      (event): event is Extract<AgentEvent, { type: "message_end" }> =>
        event.type === "message_end" &&
        event.message.role === "toolResult" &&
        event.message.toolCallId === "dangling-1",
    );
    expect(settled).toHaveLength(1);
    const message = settled[0]?.message;
    if (message?.role !== "toolResult") throw new Error("합성 짝이 toolResult가 아니다");
    expect(message.isError).toBe(true);

    // 완결된 시퀀스(불변 조건 2) — 합성 짝을 채운 뒤에도 agent_end는 반드시 나간다
    expect(events.at(-1)?.type).toBe("agent_end");
  });
});
