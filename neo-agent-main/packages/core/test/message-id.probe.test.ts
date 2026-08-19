/**
 * QA-A (T-009) — 메시지 id **계약의 근거**를 실측하는 2차 프로브.
 *
 * `message-id.contract.test.ts`가 계약 문장을 조항별로 고정한다면, 이 파일은 계약이
 * 존재하는 **이유**가 실제로 성립하는지를 종단으로 확인한다. 근거가 거짓이면 계약 문장이
 * 전부 통과해도 설계가 틀린 것이다.
 *
 * 실측 대상인 주장들:
 *   - SESSION-STORE §3 — "id가 있으면 중복 방지가 규약이 아니라 **구조**가 된다"
 *   - SESSION-STORE §4·§5 — "저장소는 `message_end`만 구독한다" + "그 배열이 그대로
 *     `AgentSessionInit.messages`가 된다" → **저장→재개 왕복이 무손실이어야 한다**
 *   - SESSION-STORE §2·§7 — 저장 경로는 `body`를 Zod로 검증한다. 합성 메시지든 실패
 *     메시지든 **저장 가능한 형태**가 아니면 §7이 금지한 "열지 못하는 대화"가 된다
 *   - CORE-INTERFACE §2 / 불변 조건 8 — "발급자는 코어 하나"
 *
 * 기대값의 출처는 위 문서뿐이다. 구현이 다르면 이 파일은 문서 편에 선다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, test } from "vitest";
import { z } from "zod";
import * as coreBarrel from "../src/index.ts";
import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type AssistantMessage,
  agentMessageSchema,
  type ModelClient,
  type ModelRequest,
  type ModelStreamEvent,
  type StopReason,
  type TokenUsage,
} from "../src/index.ts";

// ---------------------------------------------------------------------------
// 하네스 (contract 파일과 독립 — 이 파일만 읽어도 재현 가능하게 둔다)
// ---------------------------------------------------------------------------

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type Step =
  | { kind: "text"; text: string }
  | { kind: "toolCall"; toolCallId: string; toolName: string }
  | { kind: "delay"; ms: number };

interface Response {
  steps?: Step[];
  stopReason?: StopReason;
  error?: string;
  omitDone?: boolean;
}

class ProbeClient implements ModelClient {
  readonly modelId = "qa-a/id-probe-2";
  readonly requests: ModelRequest[] = [];
  readonly #responses: Response[];
  #cursor = 0;

  constructor(responses: Response[]) {
    this.#responses = [...responses];
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    const response = this.#responses[this.#cursor];
    this.#cursor += 1;
    const content: AssistantMessage["content"] = [];

    const done = (stopReason: StopReason, errorMessage?: string): ModelStreamEvent => ({
      type: "done",
      message: {
        role: "assistant",
        content: [...content],
        stopReason,
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        usage: { ...ZERO_USAGE },
        timestamp: Date.now(),
      },
    });

    if (!response) {
      yield done("error", "ProbeClient: 시나리오 소진");
      return;
    }

    for (const step of response.steps ?? []) {
      if (signal.aborted) {
        yield done("aborted", "중단됨");
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
      content.push({
        type: "toolCall",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        args: {},
      });
      yield { type: "toolcall", toolCallId: step.toolCallId, toolName: step.toolName, args: {} };
    }

    if (signal.aborted) {
      yield done("aborted", "중단됨");
      return;
    }
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

function echoTool(): AgentTool {
  return {
    name: "echo",
    label: "echo 도구",
    description: "echo — id 프로브용",
    paramsSchema: z.strictObject({}),
    execute: async () => ({ content: [{ type: "text", text: "echo ok" }], source: "local" }),
  };
}

interface Built {
  agent: Agent;
  model: ProbeClient;
  events: AgentEvent[];
  /** SESSION-STORE §4를 그대로 흉내 낸 미니 저장소 — `message_end`만 구독, INSERT OR IGNORE */
  rows: Map<string, string>;
}

function build(options: {
  responses: Response[];
  tools?: AgentTool[];
  messages?: AgentMessage[];
  maxTurnsPerRun?: number;
}): Built {
  const model = new ProbeClient(options.responses);
  const agent = new Agent({
    session: {
      systemPrompt: "QA-A id 프로브.",
      tools: options.tools ?? [],
      ...(options.messages ? { messages: options.messages } : {}),
    },
    modelClient: model,
    ...(options.maxTurnsPerRun !== undefined ? { maxTurnsPerRun: options.maxTurnsPerRun } : {}),
  });

  const events: AgentEvent[] = [];
  const rows = new Map<string, string>();
  // 저장소는 렌더러보다 먼저 구독한다(SESSION-STORE §4). 여기서도 같은 순서를 지킨다.
  agent.subscribe((event) => {
    if (event.type !== "message_end") return;
    // 저장은 body JSON 통짜다(SESSION-STORE §2). `INSERT OR IGNORE`.
    if (!rows.has(event.message.id)) rows.set(event.message.id, JSON.stringify(event.message));
  });
  agent.subscribe((event) => {
    events.push(event);
  });
  return { agent, model, events, rows };
}

function idsOf(messages: readonly AgentMessage[]): string[] {
  return messages.map((message) => message.id);
}

function duplicatesOf(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

async function settle(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

/** 미니 저장소가 모은 행을 `loadSession()`처럼 되살린다 — 읽을 때 Zod 검증(SESSION-STORE §2) */
function loadFromRows(rows: Map<string, string>): AgentMessage[] {
  return [...rows.values()].map((body) => agentMessageSchema.parse(JSON.parse(body)));
}

// ---------------------------------------------------------------------------
// 1. 발급자 단일성의 구조적 강제
// ---------------------------------------------------------------------------

describe("발급자는 코어 하나 — 구조로 강제되는가 (§2 · 불변 조건 8)", () => {
  test("공개 배럴은 id 발급기를 노출하지 않는다", () => {
    // §2 "발급자는 코어 하나다 ... 어댑터와 호출자는 id를 모른다". 발급기가 공개 표면에
    // 있으면 소비자가 자기 id를 만들어 넣는 경로가 열리고, 단일 발급자는 규약으로 내려간다.
    const suspicious = Object.keys(coreBarrel).filter((name) =>
      /^(new|generate|make).*Id$/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });

  test("한 인스턴스가 여러 런을 돌아도 트랜스크립트 전체에서 id가 유일하다", async () => {
    const { agent } = build({
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "1턴 끝" }] },
        { steps: [{ kind: "text", text: "2턴 끝" }] },
        { steps: [{ kind: "toolCall", toolCallId: "c2", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "3턴 끝" }] },
      ],
    });

    await agent.prompt("첫 런");
    await agent.waitForIdle();
    await agent.prompt("둘째 런");
    await agent.waitForIdle();
    await agent.prompt("셋째 런");
    await agent.waitForIdle();

    // 4(user+assistant+toolResult+assistant) + 2(user+assistant) + 4 = 10.
    // 개수를 고정해 두는 이유는 id 중복이 **메시지 유실**로 나타나는 경로를 함께 막기 위함이다.
    const ids = idsOf(agent.state.messages);
    expect(ids.length).toBe(10);
    expect(duplicatesOf(ids)).toEqual([]);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  test("스트리밍 중 state.streamingMessage의 id는 초안 id와 같다 (§4)", async () => {
    const { agent } = build({
      responses: [
        {
          steps: [
            { kind: "text", text: "가" },
            { kind: "text", text: "나" },
          ],
        },
      ],
    });

    const observed: Array<{ eventId: string; stateId: string | undefined }> = [];
    agent.subscribe((event) => {
      if (event.type !== "message_update") return;
      observed.push({ eventId: event.message.id, stateId: agent.state.streamingMessage?.id });
    });

    await agent.prompt("스트리밍");
    await agent.waitForIdle();

    expect(observed.length).toBeGreaterThan(0);
    for (const sample of observed) {
      // 두 값이 갈리면 렌더러가 "지금 그리는 메시지"를 state로 조회할 수 없다.
      expect(sample.stateId).toBe(sample.eventId);
    }
  });

  test("호출자가 중복 id를 실은 과거 트랜스크립트로 재개해도 불변 조건 8은 깨지지 않는다", async () => {
    // [미규정] §4는 `AgentSessionInit.messages`에 대해 id 유효성 검사를 규정하지 않는다.
    // 그러나 불변 조건 8("트랜스크립트의 모든 메시지는 유일한 id를 갖는다")은 조건 없이
    // 트랜스크립트를 대상으로 한다 — **원인 쪽이 미규정이어도 문서가 금지한 결과**다.
    // 판정 요청: 강제 방식(생성 시 fail-fast / 재발급 / 무처리)을 §4에 한 줄로 정할 것.
    // §6이 도구 등록에 대해 "강제 시점은 세션 생성(fail-fast)"을 이미 골랐으므로 전례가 있다.
    const collided: AgentMessage[] = [
      { id: "dup-1", role: "user", content: [{ type: "text", text: "가" }], timestamp: 1 },
      {
        id: "dup-1",
        role: "assistant",
        content: [{ type: "text", text: "나" }],
        stopReason: "end_turn",
        usage: ZERO_USAGE,
        timestamp: 2,
      },
    ];

    let agent: Agent | undefined;
    try {
      agent = build({
        responses: [{ steps: [{ kind: "text", text: "응" }] }],
        messages: collided,
      }).agent;
    } catch {
      // fail-fast도 불변 조건 8을 지키는 방식이다 — 통과로 본다.
      return;
    }

    await settle(agent.prompt("이어서"));
    await agent.waitForIdle();

    expect(duplicatesOf(idsOf(agent.state.messages))).toEqual([]);

    // 위가 깨졌을 때의 **실제 결과**: 저장소의 `INSERT OR IGNORE`(SESSION-STORE §3) 아래에서
    // 중복 id의 두 번째 메시지가 조용히 사라진다. id가 "무해한 no-op"을 만든다는 근거는
    // 유일성을 전제로만 참이다 — 그 전제가 깨지면 같은 기제가 침묵 유실 장치로 뒤집힌다.
    const rows = new Map<string, AgentMessage>();
    for (const message of agent.state.messages) {
      if (!rows.has(message.id)) rows.set(message.id, message);
    }
    expect(rows.size).toBe(agent.state.messages.length);
  });
});

// ---------------------------------------------------------------------------
// 2. 저장→재개 왕복 — SESSION-STORE §4·§5·§7이 약속한 것
// ---------------------------------------------------------------------------

describe("저장→재개 왕복이 무손실인가 (SESSION-STORE §4 · §5 · §7)", () => {
  test("message_end만 구독한 저장소가 트랜스크립트를 그대로 복원한다", async () => {
    const { agent, rows } = build({
      tools: [echoTool()],
      responses: [
        {
          steps: [
            { kind: "text", text: "가" },
            { kind: "toolCall", toolCallId: "c1", toolName: "echo" },
          ],
        },
        { steps: [{ kind: "text", text: "나" }] },
      ],
    });

    await agent.prompt("돌려");
    await agent.waitForIdle();

    // §2 — DB에서 나온 JSON은 외부 입력이므로 Zod로 검증한다. 합성이든 아니든 통과해야 한다.
    //
    // 비교는 값 동등(`toEqual`)으로 한다. JSON **키 순서**는 계약이 아니다 — 실제로 코어의
    // 어시스턴트 메시지는 어댑터가 준 객체에 id를 덧붙이므로 id가 마지막 키이고, Zod 파싱본은
    // 스키마 순서(id가 첫 키)로 재배열된다. 저장소는 body를 파싱해서 쓰므로(SESSION-STORE §2)
    // 무해하다. 다만 저장소가 언젠가 body 문자열을 직접 비교하면(중복 감지·diff) 이 차이가
    // 함정이 된다 — id 위치를 메시지 종류 간에 통일해 두는 편이 안전하다(개선 제안, 위반 아님).
    const loaded = loadFromRows(rows);
    expect(idsOf(loaded)).toEqual(idsOf(agent.state.messages));
    expect(loaded).toEqual(agent.state.messages);
  });

  test("복원한 트랜스크립트로 새 Agent를 만들어도 id가 보존되고 충돌하지 않는다", async () => {
    const first = build({
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "1세션 끝" }] },
      ],
    });
    await first.agent.prompt("첫 세션");
    await first.agent.waitForIdle();

    const restored = loadFromRows(first.rows);
    const second = build({
      messages: restored,
      responses: [{ steps: [{ kind: "text", text: "2세션 끝" }] }],
    });

    await second.agent.prompt("이어서");
    await second.agent.waitForIdle();

    const ids = idsOf(second.agent.state.messages);
    expect(ids.slice(0, restored.length)).toEqual(idsOf(restored));
    expect(duplicatesOf(ids)).toEqual([]);

    // 재개 세션의 저장소는 과거 메시지를 다시 저장하지 않는다(이미 DB에 있다).
    // 즉 두 저장소의 행을 합쳐도 중복이 생기지 않는다 — INSERT OR IGNORE의 전제.
    const merged = new Map([...first.rows, ...second.rows]);
    expect(merged.size).toBe(first.rows.size + second.rows.size);
  });

  test("grace 턴의 합성 메시지도 저장 가능한 형태다 (§7 — 열지 못하는 대화 금지)", async () => {
    const { agent, rows } = build({
      maxTurnsPerRun: 1,
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "echo" }] },
        { steps: [{ kind: "toolCall", toolCallId: "c2", toolName: "echo" }] },
      ],
    });

    await settle(agent.prompt("한도까지"));
    await agent.waitForIdle();

    // Zod가 던지면 저장소가 그 대화를 영영 열지 못한다(§7). 합성 메시지가 그 원인이 되면
    // 사용자는 "턴 한도를 친 대화만 사라지는" 현상을 만난다.
    const loaded = loadFromRows(rows);
    expect(idsOf(loaded)).toEqual(idsOf(agent.state.messages));

    // 복원본으로 재개까지 되어야 왕복이 닫힌다 — 도구 호출-결과 짝도 함께 실려야 한다(§5).
    const resumed = build({
      messages: loaded,
      responses: [{ steps: [{ kind: "text", text: "이어서" }] }],
    });
    await resumed.agent.prompt("계속");
    await resumed.agent.waitForIdle();
    expect(duplicatesOf(idsOf(resumed.agent.state.messages))).toEqual([]);
  });

  test("실패·중단으로 끝난 런의 메시지도 저장 가능한 형태다", async () => {
    const failed = build({
      responses: [{ steps: [{ kind: "text", text: "부분" }], omitDone: true }],
    });
    await settle(failed.agent.prompt("실패시켜"));
    await failed.agent.waitForIdle();
    expect(idsOf(loadFromRows(failed.rows))).toEqual(idsOf(failed.agent.state.messages));

    const aborted = build({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 50 },
            { kind: "text", text: "늦음" },
          ],
        },
      ],
    });
    const run = aborted.agent.prompt("오래");
    await sleep(5);
    aborted.agent.abort("QA-A 중단");
    await settle(run);
    await aborted.agent.waitForIdle();
    expect(idsOf(loadFromRows(aborted.rows))).toEqual(idsOf(aborted.agent.state.messages));
  });
});

// ---------------------------------------------------------------------------
// 3. 공개 Zod 스키마가 id를 계약으로 강제하는가 (§2 · SESSION-STORE §3)
// ---------------------------------------------------------------------------

describe("공개 Zod 스키마의 id 강제 (§2)", () => {
  test("id 없는 메시지는 검증을 통과하지 못한다", () => {
    const withoutId = {
      role: "user",
      content: [{ type: "text", text: "가" }],
      timestamp: 1,
    };
    expect(agentMessageSchema.safeParse(withoutId).success).toBe(false);

    const withId = { ...withoutId, id: "any-id" };
    expect(agentMessageSchema.safeParse(withId).success).toBe(true);
  });

  test("코어가 발급한 메시지는 직렬화 왕복 후에도 id가 그대로다", async () => {
    const { agent } = build({
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });
    await agent.prompt("돌려");
    await agent.waitForIdle();

    for (const message of agent.state.messages) {
      const round = agentMessageSchema.parse(JSON.parse(JSON.stringify(message)));
      expect(round.id).toBe(message.id);
      // 키 순서는 계약이 아니다(위 주석 참조) — 값 동등으로 무손실만 판정한다.
      expect(round).toEqual(message);
    }
  });
});

// ---------------------------------------------------------------------------
// [미규정] 이 파일이 남기는 판정 요청
// ---------------------------------------------------------------------------
//
// 6. [미규정] `AgentSessionInit.messages`의 id 유효성(중복·빈 문자열)에 대한 코어의 책임.
//    불변 조건 8은 결과를 금지하지만 §4는 강제 방식을 정하지 않는다. §6의 도구 등록
//    fail-fast가 전례다. 위 "중복 id로 재개" 테스트는 fail-fast·재발급 둘 다 통과시킨다.
//
// 7. [미규정] 재개 세션의 저장소가 과거 메시지를 다시 쓰지 않는다는 것은 SESSION-STORE
//    §4의 "message_end만 구독"에서 **따라 나오는** 성질이지 명시된 조항이 아니다.
//    (`agent_end.messages`가 이 런의 새 메시지만 담기 때문에 성립한다 — CORE-INTERFACE §3.)
//    저장소 구현이 재개 시 전체 트랜스크립트를 한 번 동기화하는 쪽으로 가면 이 성질이
//    깨지고, id 덕에 `INSERT OR IGNORE`가 그것을 무해하게 만든다. 즉 id는 여기서도
//    설계 여지를 열어 준다 — 근거가 참임을 확인했다.
