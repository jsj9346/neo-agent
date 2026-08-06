/**
 * QA-A (T-009) — 코어 메시지 id 계약의 독립 검증.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다 — 실패가 곧 위반 후보의 지목이다.
 *
 *   - `docs/CORE-INTERFACE.md` §2  — 메시지 모델의 id 규정(발급자는 코어 하나,
 *                                    초안/최종 동일 id, 와이어 비전송, `crypto.randomUUID()`)
 *   - `docs/CORE-INTERFACE.md` §4  — `UserMessageInput = Omit<UserMessage,"id"|"timestamp">`
 *   - `docs/CORE-INTERFACE.md` §5  — grace 턴·비정상 종료의 합성 메시지
 *   - `docs/CORE-INTERFACE.md` §8  — `ModelAssistantMessage = Omit<AssistantMessage,"id">`
 *   - `docs/CORE-INTERFACE.md` §9  — 불변 조건 8(트랜스크립트 id 유일성)
 *   - `docs/SESSION-STORE.md`  §3·§4·§7 — id를 넣은 **근거**(중복 방지의 구조화, `message_end`
 *                                    단독 구독의 충분성, 구멍 난 트랜스크립트 금지)
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 `[미규정]` 주석으로 판정을 요청한다.
 *
 * 이 파일은 자체 모의 `ModelClient`를 가진다. `test/mock-model-client.ts`는 계약을 지키는
 * 어댑터만 흉내 내므로 §8 어댑터 경계(계약을 어긴 어댑터가 id를 실어 보내는 경우)를
 * 실측할 수 없다.
 */

import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  Agent,
  type AgentEvent,
  type AgentHooks,
  type AgentMessage,
  type AgentTool,
  type AssistantMessage,
  type ModelClient,
  type ModelRequest,
  type ModelStreamEvent,
  type StopReason,
  type TokenUsage,
} from "../src/index.ts";

// ---------------------------------------------------------------------------
// 하네스
// ---------------------------------------------------------------------------

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** `crypto.randomUUID()` 산출 형식 — CORE-INTERFACE §2 / SESSION-STORE §3이 못박은 형식 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ProbeStep =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "toolCall"; toolCallId: string; toolName: string; args?: unknown }
  | { kind: "delay"; ms: number };

interface ProbeResponse {
  steps?: ProbeStep[];
  stopReason?: StopReason;
  /** `stopReason: "error"` + 이 문자열을 errorMessage로 하는 done */
  error?: string;
  /** done 없이 스트림을 닫는다 — §8: 코어가 `stopReason: "error"`로 합성해야 한다 */
  omitDone?: boolean;
  /**
   * 타입을 우회해 `done.message`에 id를 실어 보낸다. §8의 `ModelAssistantMessage`가
   * id를 배제하므로 정상 어댑터는 이럴 수 없다 — "발급자는 코어 하나"(§2)가 타입 장식이
   * 아니라 런타임 동작인지 실측하기 위한 적대적 어댑터다.
   */
  injectId?: string;
}

class ProbeModelClient implements ModelClient {
  readonly modelId = "qa-a/id-probe";
  /** 루프가 보낸 요청 원본 */
  readonly requests: ModelRequest[] = [];
  /** 요청 시점의 messages 직렬화 스냅샷 — 이후 in-place 변형과 무관하게 비교하기 위해 */
  readonly requestMessageJson: string[] = [];

  readonly #responses: ProbeResponse[];
  #cursor = 0;

  constructor(responses: ProbeResponse[]) {
    this.#responses = [...responses];
  }

  get callCount(): number {
    return this.#cursor;
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    this.requestMessageJson.push(JSON.stringify(request.messages));

    const response = this.#responses[this.#cursor];
    this.#cursor += 1;

    const content: AssistantMessage["content"] = [];

    const done = (stopReason: StopReason, errorMessage?: string): ModelStreamEvent => {
      const message: Record<string, unknown> = {
        role: "assistant",
        content: [...content],
        stopReason,
        usage: { ...ZERO_USAGE },
        timestamp: Date.now(),
      };
      if (errorMessage !== undefined) message.errorMessage = errorMessage;
      // 계약상 불가능한 필드 — 타입을 우회해 실어 보낸다(위 injectId 주석).
      if (response?.injectId !== undefined) message.id = response.injectId;
      return { type: "done", message } as unknown as ModelStreamEvent;
    };

    if (!response) {
      yield done("error", "ProbeModelClient: 시나리오가 소진되었다");
      return;
    }

    for (const step of response.steps ?? []) {
      if (signal.aborted) {
        yield done("aborted", "스트리밍 중 중단됨");
        return;
      }
      if (step.kind === "delay") {
        await sleep(step.ms);
        continue;
      }
      if (step.kind === "text") {
        const last = content.at(-1);
        if (last?.type === "text") last.text += step.text;
        else content.push({ type: "text", text: step.text });
        yield { type: "text_delta", text: step.text };
        continue;
      }
      if (step.kind === "thinking") {
        const last = content.at(-1);
        if (last?.type === "thinking") last.text += step.text;
        else content.push({ type: "thinking", text: step.text });
        yield { type: "thinking_delta", text: step.text };
        continue;
      }
      content.push({
        type: "toolCall",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        args: step.args ?? {},
      });
      yield {
        type: "toolcall",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        args: step.args ?? {},
      };
    }

    if (signal.aborted) {
      yield done("aborted", "스트리밍 중 중단됨");
      return;
    }
    // §8 — 계약상 금지된 "done 없는 스트림". 코어가 error로 합성하는지 본다.
    if (response.omitDone === true) return;
    if (response.error !== undefined) {
      yield done("error", response.error);
      return;
    }
    yield done(
      response.stopReason ??
        (content.some((block) => block.type === "toolCall") ? "tool_use" : "end_turn"),
    );
  }
}

interface ProbeAgentOptions {
  responses: ProbeResponse[];
  tools?: AgentTool[];
  hooks?: AgentHooks;
  messages?: AgentMessage[];
  maxTurnsPerRun?: number;
  systemPrompt?: string;
}

interface ProbeAgent {
  agent: Agent;
  model: ProbeModelClient;
  events: AgentEvent[];
}

function buildProbeAgent(options: ProbeAgentOptions): ProbeAgent {
  const model = new ProbeModelClient(options.responses);
  const agent = new Agent({
    session: {
      systemPrompt: options.systemPrompt ?? "QA-A id 계약 검증용 에이전트.",
      tools: options.tools ?? [],
      ...(options.messages ? { messages: options.messages } : {}),
    },
    modelClient: model,
    ...(options.hooks ? { hooks: options.hooks } : {}),
    ...(options.maxTurnsPerRun !== undefined ? { maxTurnsPerRun: options.maxTurnsPerRun } : {}),
  });
  const events: AgentEvent[] = [];
  agent.subscribe((event) => {
    events.push(event);
  });
  return { agent, model, events };
}

function echoTool(name = "echo"): AgentTool {
  return {
    name,
    label: `${name} 도구`,
    description: `${name} — id 계약 검증용`,
    paramsSchema: z.strictObject({}),
    execute: async () => ({ content: [{ type: "text", text: `${name} ok` }], source: "local" }),
  };
}

function startedMessages(events: readonly AgentEvent[]): AgentMessage[] {
  return events.flatMap((event) => (event.type === "message_start" ? [event.message] : []));
}

function endedMessages(events: readonly AgentEvent[]): AgentMessage[] {
  return events.flatMap((event) => (event.type === "message_end" ? [event.message] : []));
}

function idsOf(messages: readonly AgentMessage[]): string[] {
  return messages.map((message) => message.id);
}

/** 배열 안에 중복이 없음을 눈에 보이게 판정한다 (실패 시 중복된 id를 그대로 보여준다) */
function duplicatesOf(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

/** 런이 끝날 때까지 기다리되, 실패로 끝나는 경로(§3 리스너/훅 예외)도 삼키지 않고 반환한다 */
async function settle(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

// ---------------------------------------------------------------------------
// 1. 불변 조건 8 — 트랜스크립트 id 유일성 / 초안·최종만 id를 공유
//    CORE-INTERFACE §9 불변 조건 8, §2
// ---------------------------------------------------------------------------

describe("불변 조건 8 — 트랜스크립트의 모든 메시지는 유일한 id를 갖는다", () => {
  test("도구 호출이 섞인 런에서 방출된 모든 메시지의 id가 유일하다", async () => {
    const { agent, events } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        {
          steps: [
            { kind: "text", text: "도구를 쓴다" },
            { kind: "toolCall", toolCallId: "call-1", toolName: "echo" },
          ],
        },
        { steps: [{ kind: "toolCall", toolCallId: "call-2", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "끝" }], stopReason: "end_turn" },
      ],
    });

    await agent.prompt("도구 두 번 써봐");
    await agent.waitForIdle();

    const transcript = agent.state.messages;
    // user + assistant + toolResult + assistant + toolResult + assistant
    expect(transcript.length).toBe(6);

    const ids = idsOf(transcript);
    for (const id of ids) expect(typeof id).toBe("string");
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
    expect(duplicatesOf(ids)).toEqual([]);

    // 이벤트로 방출된 것도 같은 id 집합이어야 한다 — 소비자가 보는 것이 트랜스크립트다.
    expect(new Set(idsOf(endedMessages(events)))).toEqual(new Set(ids));
  });

  test("id의 형식은 crypto.randomUUID()다 (§2 · SESSION-STORE §3)", async () => {
    // SESSION-STORE §3이 형식을 명시적으로 못박았고("형식은 crypto.randomUUID()"),
    // 같은 문서 §2가 "메시지 id는 UUID라 정렬 의미가 없다"를 seq 컬럼 도입의 근거로
    // 삼는다. 즉 형식은 장식이 아니라 다른 결정의 전제다 — 그래서 형식을 검증한다.
    const { agent } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await agent.prompt("안녕");
    await agent.waitForIdle();

    for (const message of agent.state.messages) {
      expect(message.id).toMatch(UUID_V4);
    }
  });

  test("message_start와 message_end는 id로 1:1 대응하고, 그 밖의 id 공유는 없다", async () => {
    const { agent, events } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        {
          steps: [
            { kind: "text", text: "가" },
            { kind: "toolCall", toolCallId: "call-1", toolName: "echo" },
          ],
        },
        { steps: [{ kind: "text", text: "나" }] },
      ],
    });

    await agent.prompt("시작");
    await agent.waitForIdle();

    const startIds = idsOf(startedMessages(events));
    const endIds = idsOf(endedMessages(events));

    expect(duplicatesOf(startIds)).toEqual([]);
    expect(duplicatesOf(endIds)).toEqual([]);
    expect(new Set(startIds)).toEqual(new Set(endIds));

    // 같은 id의 start/end는 같은 메시지여야 한다(역할이 뒤바뀌면 상관이 깨진다).
    const startByRole = new Map(startedMessages(events).map((m) => [m.id, m.role]));
    for (const message of endedMessages(events)) {
      expect(startByRole.get(message.id)).toBe(message.role);
    }
  });

  test("스트리밍 초안·중간 델타·최종 메시지가 같은 id를 공유한다 (§2)", async () => {
    const { agent, events } = buildProbeAgent({
      responses: [
        {
          steps: [
            { kind: "text", text: "안" },
            { kind: "text", text: "녕" },
            { kind: "thinking", text: "생각" },
          ],
        },
      ],
    });

    await agent.prompt("인사해");
    await agent.waitForIdle();

    const assistantStarts = startedMessages(events).filter((m) => m.role === "assistant");
    expect(assistantStarts.length).toBe(1);
    const draftId = assistantStarts[0]!.id;
    expect(draftId).toMatch(UUID_V4);

    const updates = events.flatMap((event) =>
      event.type === "message_update" ? [event.message] : [],
    );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) expect(update.id).toBe(draftId);

    const assistantEnds = endedMessages(events).filter((m) => m.role === "assistant");
    expect(assistantEnds.length).toBe(1);
    expect(assistantEnds[0]!.id).toBe(draftId);

    // turn_end.message도 같은 최종 메시지다 — 다른 id면 렌더러·저장소가 두 개로 센다.
    const turnEnds = events.flatMap((event) => (event.type === "turn_end" ? [event.message] : []));
    expect(turnEnds.length).toBe(1);
    expect(turnEnds[0]!.id).toBe(draftId);

    // agent_end.messages도 같은 id를 그대로 실어야 한다.
    const agentEnd = events.find((event) => event.type === "agent_end");
    expect(agentEnd).toBeDefined();
    if (agentEnd?.type === "agent_end") {
      expect(idsOf(agentEnd.messages)).toEqual(idsOf(agent.state.messages));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. 입력 경계 — 호출자는 id·timestamp를 모른다
//    CORE-INTERFACE §4 (`UserMessageInput = Omit<UserMessage,"id"|"timestamp">`)
// ---------------------------------------------------------------------------

/**
 * 타입 수준 검증 — **실행하지 않는다.** 판정자는 `tsc --noEmit`(=`pnpm -F @neo-agent/core
 * typecheck`)이고, `vitest run`은 트랜스파일만 하므로 이 블록을 보지 않는다.
 *
 * `@ts-expect-error`는 "여기서 에러가 나야 한다"이므로, 구현이 id/timestamp를 받아들이도록
 * 넓어지는 순간 typecheck가 깨진다.
 */
async function typeLevelInputBoundary(agent: Agent): Promise<void> {
  const content = [{ type: "text" as const, text: "안녕" }];

  // 정상 형태 — §4의 `UserMessageInput`은 id·timestamp가 **없는** 객체다.
  // 이 호출이 에러가 나면(예: timestamp가 여전히 필수) 그것 자체가 계약 위반이다.
  await agent.prompt({ role: "user", content });
  agent.steer({ role: "user", content });
  agent.followUp({ role: "user", content });

  // @ts-expect-error §4 — 호출자는 id를 실을 수 없다. 발급자는 코어 하나다(§2)
  await agent.prompt({ role: "user", content, id: "caller-issued" });
  // @ts-expect-error §4 — 호출자는 timestamp를 실을 수 없다
  await agent.prompt({ role: "user", content, timestamp: 111 });
  // @ts-expect-error §4 — steer도 같은 입력 경계다
  agent.steer({ role: "user", content, id: "caller-issued" });
  // @ts-expect-error §4 — followUp도 같은 입력 경계다
  agent.followUp({ role: "user", content, timestamp: 111 });

  // §2 — id는 string 필수 필드다. 옵셔널이거나 없으면 여기서 깨진다.
  const message: AgentMessage = { role: "user", content, id: "past-1", timestamp: 1 };
  const _id: string = message.id;
  void _id;
}
void typeLevelInputBoundary;

describe("입력 경계 — 코어가 발급한 id·timestamp만 트랜스크립트에 남는다 (§4)", () => {
  test("prompt()에 실린 id·timestamp는 트랜스크립트에 반영되지 않는다", async () => {
    const { agent } = buildProbeAgent({ responses: [{ steps: [{ kind: "text", text: "응" }] }] });

    const before = Date.now();
    // 타입은 이미 막혀 있다(위 typeLevelInputBoundary). 런타임도 막는지가 이 테스트다 —
    // 타입만 좁고 런타임이 사용자 값을 받아들이면 §2의 "발급자는 코어 하나"가 장식이 된다.
    const forged = {
      role: "user",
      content: [{ type: "text", text: "안녕" }],
      id: "caller-forged-id",
      timestamp: 111,
    } as unknown as Parameters<Agent["prompt"]>[0];

    const failure = await settle(agent.prompt(forged));
    await agent.waitForIdle();

    // [미규정] 계약은 "코어가 채운다"만 말하고, 호출자가 id를 실었을 때 **덮어쓸지 던질지**를
    // 정하지 않았다. 둘 다 "호출자 발급 금지"를 만족하므로 여기서는 둘 다 통과시킨다.
    // 판정 요청: 던지는 쪽이면 CLI가 catch할 대상이 하나 늘어난다 — 문서에 한 줄 필요.
    if (failure !== undefined) {
      expect(agent.state.messages.length).toBe(0);
      return;
    }

    const user = agent.state.messages.find((message) => message.role === "user");
    expect(user).toBeDefined();
    expect(user?.id).not.toBe("caller-forged-id");
    expect(user?.id).toMatch(UUID_V4);
    expect(user?.timestamp).not.toBe(111);
    expect(user?.timestamp).toBeGreaterThanOrEqual(before);
  });

  test("steer()에 실린 id는 트랜스크립트에 반영되지 않는다", async () => {
    const { agent } = buildProbeAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 20 },
            { kind: "text", text: "첫 턴" },
          ],
          stopReason: "end_turn",
        },
        { steps: [{ kind: "text", text: "둘째 턴" }], stopReason: "end_turn" },
      ],
    });

    const run = agent.prompt("시작");
    await sleep(5);
    const forged = {
      role: "user",
      content: [{ type: "text", text: "끼어들기" }],
      id: "caller-forged-steer",
      timestamp: 222,
    } as unknown as Parameters<Agent["steer"]>[0];
    try {
      agent.steer(forged);
    } catch {
      // 던지는 구현도 "호출자 발급 금지"를 만족한다 — 위 [미규정]과 같은 자리.
    }
    await settle(run);
    await agent.waitForIdle();

    const ids = idsOf(agent.state.messages);
    expect(ids).not.toContain("caller-forged-steer");
    expect(duplicatesOf(ids)).toEqual([]);
    for (const message of agent.state.messages) {
      expect(message.timestamp).not.toBe(222);
    }
  });

  test("followUp()에 실린 id는 트랜스크립트에 반영되지 않는다", async () => {
    const { agent } = buildProbeAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 20 },
            { kind: "text", text: "첫 턴" },
          ],
          stopReason: "end_turn",
        },
        { steps: [{ kind: "text", text: "후속" }], stopReason: "end_turn" },
      ],
    });

    const run = agent.prompt("시작");
    await sleep(5);
    const forged = {
      role: "user",
      content: [{ type: "text", text: "후속 입력" }],
      id: "caller-forged-followup",
      timestamp: 333,
    } as unknown as Parameters<Agent["followUp"]>[0];
    try {
      agent.followUp(forged);
    } catch {
      // 위 [미규정]과 같은 자리.
    }
    await settle(run);
    await agent.waitForIdle();

    const ids = idsOf(agent.state.messages);
    expect(ids).not.toContain("caller-forged-followup");
    expect(duplicatesOf(ids)).toEqual([]);
  });

  test("문자열 prompt()도 id를 가진 UserMessage가 된다", async () => {
    const { agent } = buildProbeAgent({ responses: [{ steps: [{ kind: "text", text: "응" }] }] });
    await agent.prompt("문자열 입력");
    await agent.waitForIdle();

    const user = agent.state.messages.find((message) => message.role === "user");
    expect(user?.id).toMatch(UUID_V4);
  });
});

// ---------------------------------------------------------------------------
// 3. 어댑터 경계 — 어댑터도 id를 모른다
//    CORE-INTERFACE §8 (`ModelAssistantMessage = Omit<AssistantMessage,"id">`), §2
// ---------------------------------------------------------------------------

/** 타입 수준 검증 — 실행하지 않는다. 판정자는 `tsc --noEmit`. */
function typeLevelAdapterBoundary(): void {
  const base = {
    role: "assistant" as const,
    content: [],
    stopReason: "end_turn" as const,
    usage: ZERO_USAGE,
    timestamp: 0,
  };

  // 정상 — 어댑터가 주는 최종 메시지에는 id가 없다.
  const ok: ModelStreamEvent = { type: "done", message: base };
  void ok;

  const bad: ModelStreamEvent = {
    type: "done",
    // @ts-expect-error §8 — done.message는 Omit<AssistantMessage,"id">다. 어댑터는 id를 모른다
    message: { ...base, id: "adapter-issued" },
  };
  void bad;
}
void typeLevelAdapterBoundary;

describe("어댑터 경계 — 코어가 초안 id로 덮는다 (§8 · §2)", () => {
  test("타입을 우회해 id를 실어 보낸 어댑터의 값은 채택되지 않는다", async () => {
    const { agent, events } = buildProbeAgent({
      responses: [{ steps: [{ kind: "text", text: "응답" }], injectId: "adapter-issued-id" }],
    });

    await agent.prompt("안녕");
    await agent.waitForIdle();

    const draftId = startedMessages(events).find((m) => m.role === "assistant")?.id;
    expect(draftId).toBeDefined();
    expect(draftId).toMatch(UUID_V4);

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    expect(assistant?.id).toBe(draftId);
    // §2 "발급자는 코어 하나" — 어댑터 값이 새어 들어오면 여기서 잡힌다.
    expect(assistant?.id).not.toBe("adapter-issued-id");
    expect(idsOf(agent.state.messages)).not.toContain("adapter-issued-id");
  });

  test("여러 턴에 걸쳐 어댑터가 같은 id를 반복해 보내도 트랜스크립트 id는 유일하다", async () => {
    // 어댑터 값을 채택하면 두 어시스턴트 메시지가 같은 id를 갖게 되어 불변 조건 8이 깨진다.
    // 저장소의 `INSERT OR IGNORE`(SESSION-STORE §3) 아래에서는 **두 번째 턴이 조용히 사라진다.**
    const { agent } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        {
          steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }],
          injectId: "adapter-constant-id",
        },
        { steps: [{ kind: "text", text: "끝" }], injectId: "adapter-constant-id" },
      ],
    });

    await agent.prompt("두 턴 돌려");
    await agent.waitForIdle();

    const ids = idsOf(agent.state.messages);
    expect(duplicatesOf(ids)).toEqual([]);
    expect(ids).not.toContain("adapter-constant-id");
  });
});

// ---------------------------------------------------------------------------
// 4. 합성 메시지 — grace 턴·비정상 종료·실패 응답
//    CORE-INTERFACE §5, §3(에러 전용 이벤트 없음), §8(done 없는 스트림)
// ---------------------------------------------------------------------------

describe("합성 메시지도 id를 갖고 유일하다 (§5)", () => {
  test("grace 턴의 합성 UserMessage와 미실행 도구 결과가 id를 갖는다", async () => {
    const { agent, events } = buildProbeAgent({
      maxTurnsPerRun: 1,
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] },
        // grace 턴 응답에 도구 호출이 있으면 실행하지 않고 isError 짝을 채운다(§5).
        { steps: [{ kind: "toolCall", toolCallId: "call-2", toolName: "echo" }] },
      ],
    });

    await settle(agent.prompt("한도까지 돌려"));
    await agent.waitForIdle();

    const transcript = agent.state.messages;
    const ids = idsOf(transcript);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(duplicatesOf(ids)).toEqual([]);

    // 합성 UserMessage — 호출자가 만든 것은 1개뿐이므로 2개 이상이면 코어가 주입한 것이다.
    const users = transcript.filter((message) => message.role === "user");
    expect(users.length).toBe(2);
    expect(users[1]!.id).toMatch(UUID_V4);

    // 미실행 도구의 합성 결과 — 짝 정합성(§5)
    const errorResults = transcript.filter(
      (message) => message.role === "toolResult" && message.isError,
    );
    expect(errorResults.length).toBeGreaterThanOrEqual(1);
    for (const result of errorResults) expect(result.id).toMatch(UUID_V4);

    // §5 — 합성 짝은 tool_start/tool_end 없이 message_start/message_end로만 방출된다.
    // 저장소는 message_end만 구독하므로(SESSION-STORE §4), 방출되지 않으면 트랜스크립트에
    // 구멍이 난다 — §7이 금지한 결과다.
    expect(new Set(idsOf(endedMessages(events)))).toEqual(new Set(ids));
  });

  test("훅 예외로 비정상 종료해도 짝 없는 도구 호출이 남지 않고, 합성 결과에 id가 있다", async () => {
    const hooks: AgentHooks = {
      beforeToolCall: async () => {
        throw new Error("QA-A: 훅이 의도적으로 실패한다");
      },
    };
    const { agent, events } = buildProbeAgent({
      hooks,
      tools: [echoTool()],
      responses: [{ steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] }],
    });

    await settle(agent.prompt("도구 써봐"));
    await agent.waitForIdle();

    const transcript = agent.state.messages;
    const ids = idsOf(transcript);
    expect(duplicatesOf(ids)).toEqual([]);

    const toolCallIds = transcript
      .filter((message) => message.role === "assistant")
      .flatMap((message) => (message.role === "assistant" ? message.content : []))
      .flatMap((block) => (block.type === "toolCall" ? [block.toolCallId] : []));
    const resultCallIds = transcript.flatMap((message) =>
      message.role === "toolResult" ? [message.toolCallId] : [],
    );
    expect(new Set(resultCallIds)).toEqual(new Set(toolCallIds));

    for (const message of transcript) expect(message.id).toMatch(UUID_V4);
    expect(new Set(idsOf(endedMessages(events)))).toEqual(new Set(ids));
  });

  test("done 없이 끝난 스트림의 합성 실패 어시스턴트 메시지도 id를 갖는다 (§8)", async () => {
    const { agent, events } = buildProbeAgent({
      responses: [{ steps: [{ kind: "text", text: "절단" }], omitDone: true }],
    });

    await settle(agent.prompt("응답 줘"));
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant?.stopReason).toBe("error");
    expect(assistant?.id).toMatch(UUID_V4);

    // 합성 메시지도 초안 id를 이어받아야 렌더러의 상관이 끊기지 않는다(§2).
    const draftId = startedMessages(events).find((m) => m.role === "assistant")?.id;
    expect(assistant?.id).toBe(draftId);
  });

  test("실패 응답(stopReason: error)의 어시스턴트 메시지도 id를 갖는다", async () => {
    const { agent } = buildProbeAgent({
      responses: [{ steps: [{ kind: "text", text: "부분" }], error: "QA-A: 모델 실패" }],
    });

    await settle(agent.prompt("실패시켜"));
    await agent.waitForIdle();

    const ids = idsOf(agent.state.messages);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(duplicatesOf(ids)).toEqual([]);
  });

  test("중단(abort)된 런의 어시스턴트 메시지도 id를 갖는다", async () => {
    const { agent } = buildProbeAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 50 },
            { kind: "text", text: "늦은 응답" },
          ],
        },
      ],
    });

    const run = agent.prompt("오래 걸리는 작업");
    await sleep(5);
    agent.abort("QA-A 중단");
    await settle(run);
    await agent.waitForIdle();

    const ids = idsOf(agent.state.messages);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(duplicatesOf(ids)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. 재개 왕복 — AgentSessionInit.messages
//    CORE-INTERFACE §4, SESSION-STORE §5
// ---------------------------------------------------------------------------

describe("재개 왕복 — 과거 id 보존과 신규 id 비충돌 (§4 · SESSION-STORE §5)", () => {
  const past: AgentMessage[] = [
    {
      id: "past-user-1",
      role: "user",
      content: [{ type: "text", text: "예전 질문" }],
      timestamp: 1,
    },
    {
      id: "past-assistant-1",
      role: "assistant",
      content: [{ type: "text", text: "예전 답" }],
      stopReason: "end_turn",
      usage: ZERO_USAGE,
      timestamp: 2,
    },
  ];

  test("과거 트랜스크립트의 id가 그대로 보존된다", async () => {
    const { agent } = buildProbeAgent({
      messages: past.map((message) => ({ ...message })),
      responses: [{ steps: [{ kind: "text", text: "이어서 답" }] }],
    });

    // 프롬프트 전에도 이미 과거 id를 그대로 들고 있어야 한다 —
    // 재발급하면 저장소의 `INSERT OR IGNORE`가 같은 대화를 두 번 저장한다.
    expect(idsOf(agent.state.messages)).toEqual(["past-user-1", "past-assistant-1"]);

    await agent.prompt("이어서");
    await agent.waitForIdle();

    const ids = idsOf(agent.state.messages);
    expect(ids.slice(0, 2)).toEqual(["past-user-1", "past-assistant-1"]);
    expect(duplicatesOf(ids)).toEqual([]);
    for (const id of ids.slice(2)) expect(id).toMatch(UUID_V4);
  });

  test("agent_end.messages는 이 런에서 새로 생긴 메시지만 담는다 (§3)", async () => {
    const { agent, events } = buildProbeAgent({
      messages: past.map((message) => ({ ...message })),
      responses: [{ steps: [{ kind: "text", text: "이어서 답" }] }],
    });

    await agent.prompt("이어서");
    await agent.waitForIdle();

    const agentEnd = events.find((event) => event.type === "agent_end");
    expect(agentEnd).toBeDefined();
    if (agentEnd?.type !== "agent_end") return;

    const emitted = idsOf(agentEnd.messages);
    expect(emitted).not.toContain("past-user-1");
    expect(emitted).not.toContain("past-assistant-1");
    expect(emitted).toEqual(idsOf(agent.state.messages).slice(2));
  });

  test("한 에이전트의 트랜스크립트를 다음 에이전트로 넘겨도 id가 유일하다", async () => {
    const first = buildProbeAgent({ responses: [{ steps: [{ kind: "text", text: "1턴" }] }] });
    await first.agent.prompt("첫 세션");
    await first.agent.waitForIdle();

    const carried = first.agent.state.messages.map((message) => ({ ...message }));

    const second = buildProbeAgent({
      messages: carried,
      responses: [{ steps: [{ kind: "text", text: "2턴" }] }],
    });
    await second.agent.prompt("두 번째 세션");
    await second.agent.waitForIdle();

    const ids = idsOf(second.agent.state.messages);
    expect(duplicatesOf(ids)).toEqual([]);
    expect(ids.slice(0, carried.length)).toEqual(idsOf(carried));
  });
});

// ---------------------------------------------------------------------------
// 6. 계약의 **근거**가 참인지 실측
//    SESSION-STORE §3(중복 방지가 구조가 된다) · §4(message_end 단독 구독) · §7(구멍 금지)
//    CORE-INTERFACE §2(초안/최종 상관 — 렌더러가 쓴다), §2.4/불변 조건 6(캐시 안정성)
// ---------------------------------------------------------------------------

describe("근거 실측 — id가 실제로 그 효과를 내는가", () => {
  test("message_end만 구독해도 트랜스크립트에 구멍이 나지 않는다 (SESSION-STORE §4·§7)", async () => {
    // 저장소는 message_end만 구독한다는 것이 설계다. 어떤 메시지가 message_end 없이
    // 트랜스크립트에만 들어가면 DB에 구멍이 나고, §7이 금지한 결과가 된다.
    const { agent, events } = buildProbeAgent({
      maxTurnsPerRun: 2,
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] },
        { steps: [{ kind: "toolCall", toolCallId: "call-2", toolName: "echo" }] },
        { steps: [{ kind: "toolCall", toolCallId: "call-3", toolName: "echo" }] },
      ],
    });

    await settle(agent.prompt("한도까지"));
    await agent.waitForIdle();

    expect(idsOf(endedMessages(events))).toEqual(idsOf(agent.state.messages));
  });

  test("message_end·turn_end·agent_end를 함께 구독해도 INSERT OR IGNORE가 무해한 no-op이 된다", async () => {
    // SESSION-STORE §3이 id를 넣은 이유로 든 바로 그 주장이다. id가 없거나 재발급되면
    // 이 미니 저장소는 같은 대화를 중복 저장하거나 빠뜨린다.
    const { agent } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        {
          steps: [
            { kind: "text", text: "가" },
            { kind: "toolCall", toolCallId: "call-1", toolName: "echo" },
          ],
        },
        { steps: [{ kind: "text", text: "나" }] },
      ],
    });

    const rows = new Map<string, AgentMessage>();
    const insertOrIgnore = (message: AgentMessage): void => {
      if (!rows.has(message.id)) rows.set(message.id, message);
    };
    // 일부러 규약을 어겨 셋 다 구독한다.
    agent.subscribe((event) => {
      if (event.type === "message_end") insertOrIgnore(event.message);
      if (event.type === "turn_end") {
        insertOrIgnore(event.message);
        for (const result of event.toolResults) insertOrIgnore(result);
      }
      if (event.type === "agent_end") {
        for (const message of event.messages) insertOrIgnore(message);
      }
    });

    await agent.prompt("돌려");
    await agent.waitForIdle();

    expect([...rows.keys()]).toEqual(idsOf(agent.state.messages));
    expect(JSON.stringify([...rows.values()])).toBe(JSON.stringify(agent.state.messages));
  });

  test("렌더러가 id만으로 초안→델타→최종을 상관지을 수 있다 (§2)", async () => {
    const { agent } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        {
          steps: [
            { kind: "text", text: "가" },
            { kind: "text", text: "나" },
            { kind: "toolCall", toolCallId: "call-1", toolName: "echo" },
          ],
        },
        {
          steps: [
            { kind: "text", text: "다" },
            { kind: "text", text: "라" },
          ],
        },
      ],
    });

    const buffers = new Map<string, string>();
    const finalized = new Map<string, string>();
    agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        buffers.set(event.message.id, "");
      }
      if (event.type === "message_update" && event.delta.type === "text_delta") {
        const prior = buffers.get(event.message.id);
        // id 상관이 깨지면 여기서 undefined가 된다 — 렌더러가 붙일 자리를 잃는다.
        expect(prior).toBeDefined();
        buffers.set(event.message.id, (prior ?? "") + event.delta.text);
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        finalized.set(event.message.id, buffers.get(event.message.id) ?? "<상관 실패>");
      }
    });

    await agent.prompt("두 턴");
    await agent.waitForIdle();

    const assistants = agent.state.messages.filter((message) => message.role === "assistant");
    expect(assistants.length).toBe(2);
    for (const assistant of assistants) {
      const rendered = finalized.get(assistant.id);
      const actual = assistant.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      expect(rendered).toBe(actual);
    }
  });

  test("id는 요청 간 안정적이다 — 재발급하면 프롬프트 캐시가 매 턴 깨진다 (불변 조건 6)", async () => {
    // §2: "id는 와이어로 나가지 않는다 ... 모델 페이로드에 실리면 매 요청 프롬프트 캐시가
    // 깨진다." 코어 쪽에서 실측 가능한 것은 **접두의 안정성**이다 — 코어가 요청마다 id를
    // 새로 만들면 어댑터가 무시하더라도 트랜스크립트 정체성 자체가 흔들린다.
    const { agent, model } = buildProbeAgent({
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] },
        { steps: [{ kind: "toolCall", toolCallId: "call-2", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await agent.prompt("세 턴");
    await agent.waitForIdle();

    expect(model.requests.length).toBe(3);
    for (let i = 1; i < model.requests.length; i += 1) {
      const previous = JSON.parse(model.requestMessageJson[i - 1]!) as AgentMessage[];
      const current = JSON.parse(model.requestMessageJson[i]!) as AgentMessage[];
      expect(current.length).toBeGreaterThan(previous.length);
      // 접두가 바이트 단위로 같아야 한다 — id가 재발급되면 여기서 깨진다.
      expect(JSON.stringify(current.slice(0, previous.length))).toBe(JSON.stringify(previous));
    }
  });

  test("코어는 어댑터에 id가 실린 메시지를 넘긴다 — 무시는 어댑터의 책임이다 (§2 · §8)", async () => {
    // [미규정 아님, 확인] §8의 `ModelRequest.messages`는 `AgentMessage[]`이므로 id가 실린다.
    // "id는 와이어로 나가지 않는다"의 집행 지점은 코어가 아니라 어댑터의 와이어 변환이다.
    // 이 테스트는 그 비대칭이 실제 구현에서도 성립함을 고정한다 — 어댑터 QA의 전제가 된다.
    const { agent, model } = buildProbeAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 5 },
            { kind: "text", text: "가" },
          ],
        },
        { steps: [{ kind: "text", text: "나" }] },
      ],
    });

    const run = agent.prompt("첫 입력");
    await sleep(1);
    try {
      agent.steer({ role: "user", content: [{ type: "text", text: "끼어들기" }] });
    } catch {
      // steering 타이밍이 어긋나면 무시한다 — 이 테스트의 주장은 id 존재이지 큐가 아니다.
    }
    await settle(run);
    await agent.waitForIdle();

    const lastRequest = model.requests.at(-1);
    expect(lastRequest).toBeDefined();
    for (const message of lastRequest?.messages ?? []) {
      expect(typeof message.id).toBe("string");
      expect(message.id).toMatch(UUID_V4);
    }
  });
});

// ---------------------------------------------------------------------------
// [미규정] 판정 요청 목록 — 서술 보고는 유실되므로 여기에 남긴다
// ---------------------------------------------------------------------------
//
// 1. [미규정] 호출자가 (타입을 우회해) id·timestamp를 실었을 때 코어의 반응.
//    §4는 "코어가 채운다"만 말하고 **덮어쓰기/throw** 중 무엇인지 정하지 않았다.
//    위 "입력 경계" 테스트는 둘 다 통과시킨다. throw라면 CLI가 catch할 대상이 하나
//    늘어나므로 §4에 한 줄이 필요하다.
//
// 2. [미규정] `message_start`가 어떤 역할에 대해 방출되는가.
//    §3의 시그니처는 `message: AgentMessage`(역할 무관)이고, §5는 합성 짝에 대해서만
//    "message_start/message_end로만 방출"을 명시한다. UserMessage·ToolResultMessage의
//    `message_start` 방출 여부는 어디에도 없다. 위 테스트들은 방출된 것들 사이의
//    **1:1 대응**만 주장하고 방출 자체를 강제하지 않는다 — 다만 `message_end`는
//    SESSION-STORE §4·§7로부터 **전 메시지 필수**가 도출되므로 그쪽은 강제했다.
//
// 3. [미규정] `turn_end.message`·`agent_end.messages`가 `message_end`와 **같은 객체**인가
//    (동일 id의 별도 스냅샷인가). §3은 id 동일성만 함의하고 객체 동일성은 말하지 않는다.
//    "INSERT OR IGNORE 무해" 테스트는 JSON 동등만 요구하므로 두 해석 모두 통과한다.
//    다만 별도 스냅샷이면 저장소가 먼저 본 값과 나중 값이 갈릴 수 있어, 문서가 "같은
//    메시지"라고 한 줄 못박는 편이 안전하다.
//
// 4. [미규정] grace 턴 합성 `UserMessage`의 정확한 문구는 §5가 "구현 시 확정"으로 열어 뒀다.
//    따라서 위 테스트는 문구가 아니라 **개수(호출자 1개 + 합성 1개)** 로 판정한다.
//
// 5. [미규정] id 형식을 "UUID v4"로 강제할지, "유일한 문자열"까지만 요구할지.
//    §2·SESSION-STORE §3이 `crypto.randomUUID()`를 명시했고 SESSION-STORE §2가
//    "id는 UUID라 정렬 의미가 없다"를 `seq` 컬럼의 근거로 쓰므로 형식 검증을 넣었다.
//    형식을 계약에서 빼려면 `seq`의 근거도 함께 다시 써야 한다.
