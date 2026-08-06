/**
 * QA-A (T-010) — 압축 설계가 전제한 사실의 **코어 쪽 독립 실측**.
 *
 * 이 파일은 계약을 강제하지 않는다. `docs/COMPACTION.md`가 설계 근거로 **전제한**
 * 것들이 코어의 실제 동작에서 참인지 관찰하고 기록하는 것이 목적이다. 단언은
 * 전제가 거짓일 때 눈에 띄게 하려고 걸어 두되, 관찰값 자체를 `EVIDENCE`로 모아
 * 실측 기록(`plans/20260806-compaction-qa-a-evidence.md`)에 그대로 옮긴다.
 *
 * 실측 1 — grace·steer 합성 user 메시지가 트랜스크립트에 `UserMessage`로 실재하는가
 *          (COMPACTION §4 "합성 포함" — cut 경계 카운트의 전제)
 * 실측 2 — `stopReason: "error"`·`"aborted"` 어시스턴트 메시지의 usage 실제 형상
 *          (COMPACTION §3 "불완전할 수 있어 건너뛴다"의 전제)
 * 실측 4 — 중단이 `"aborted"`로 구분 가능한 형태인가 (코어 쪽 절반)
 */

import { afterAll, describe, expect, test } from "vitest";
import { z } from "zod";
import {
  Agent,
  type AgentMessage,
  type AgentTool,
  type AssistantMessage,
  type ModelClient,
  type ModelRequest,
  type ModelStreamEvent,
  type StopReason,
  type TokenUsage,
} from "../src/index.ts";

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** 관찰 결과 수집 — 콘솔에 찍어 실측 기록으로 옮긴다 */
const EVIDENCE: Record<string, unknown> = {};

afterAll(() => {
  // 실측 산출물이다 — 이 출력을 기록 파일로 옮긴다
  console.log(`\n[QA-A 실측 · core]\n${JSON.stringify(EVIDENCE, null, 2)}\n`);
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function settle(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

type Step =
  | { kind: "text"; text: string }
  | { kind: "toolCall"; toolCallId: string; toolName: string }
  | { kind: "delay"; ms: number };

interface Response {
  steps?: Step[];
  stopReason?: StopReason;
  error?: string;
  usage?: Partial<TokenUsage>;
  /** done을 방출하지 않고 스트림을 닫는다 — 코어의 합성 경로를 본다 */
  omitDone?: boolean;
  /** abort된 것을 감지해도 done을 내지 않고 조용히 닫는다 (실제 SDK 동작 모사) */
  silentOnAbort?: boolean;
}

class ProbeClient implements ModelClient {
  readonly modelId = "qa-a/compaction-evidence";
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
    const usage: TokenUsage = { ...ZERO_USAGE, ...response?.usage };

    if (!response) {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "ProbeClient: 시나리오 소진",
          usage,
          timestamp: Date.now(),
        },
      };
      return;
    }

    for (const step of response.steps ?? []) {
      if (signal.aborted) {
        if (response.silentOnAbort === true) return;
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [...content],
            stopReason: "aborted",
            errorMessage: "스트리밍 중 중단됨",
            usage,
            timestamp: Date.now(),
          },
        };
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
      yield {
        type: "toolcall",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        args: {},
      };
    }

    if (signal.aborted && response.silentOnAbort === true) return;
    if (response.omitDone === true) return;

    if (response.error !== undefined) {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [...content],
          stopReason: "error",
          errorMessage: response.error,
          usage,
          timestamp: Date.now(),
        },
      };
      return;
    }

    yield {
      type: "done",
      message: {
        role: "assistant",
        content: [...content],
        stopReason:
          response.stopReason ??
          (content.some((block) => block.type === "toolCall") ? "tool_use" : "end_turn"),
        usage,
        timestamp: Date.now(),
      },
    };
  }
}

function echoTool(name = "echo"): AgentTool {
  return {
    name,
    label: `${name} 도구`,
    description: `${name} — 실측용`,
    paramsSchema: z.strictObject({}),
    execute: async () => ({ content: [{ type: "text", text: `${name} ok` }], source: "local" }),
  };
}

function buildAgent(options: {
  responses: Response[];
  tools?: AgentTool[];
  maxTurnsPerRun?: number;
  messages?: AgentMessage[];
}): { agent: Agent; model: ProbeClient } {
  const model = new ProbeClient(options.responses);
  const agent = new Agent({
    session: {
      systemPrompt: "QA-A 압축 실측용 에이전트.",
      tools: options.tools ?? [],
      ...(options.messages ? { messages: options.messages } : {}),
    },
    modelClient: model,
    ...(options.maxTurnsPerRun !== undefined ? { maxTurnsPerRun: options.maxTurnsPerRun } : {}),
  });
  return { agent, model };
}

function userTexts(messages: readonly AgentMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) =>
      message.role === "user"
        ? message.content
            .map((block) => (block.type === "text" ? block.text : "<非텍스트>"))
            .join("")
        : "",
    );
}

// ---------------------------------------------------------------------------
// 실측 1 — grace·steer 합성 user 메시지가 트랜스크립트에 UserMessage로 실재하는가
//   COMPACTION §4: "뒤에서부터 keepRecentTurns번째 user 메시지(합성 포함 — grace·steer
//   주입도 경계다)". 합성 메시지가 role:"user"가 아니거나 트랜스크립트에 없으면
//   cut 경계 카운트가 사용자 발화 수와 어긋난다.
// ---------------------------------------------------------------------------

describe("실측 1 — 합성 user 메시지의 실재 (COMPACTION §4)", () => {
  test('grace 턴의 합성 메시지가 role:"user"로 트랜스크립트에 남는다', async () => {
    const { agent } = buildAgent({
      maxTurnsPerRun: 1,
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] },
        { steps: [{ kind: "text", text: "마무리합니다" }], stopReason: "end_turn" },
      ],
    });

    await settle(agent.prompt("한도까지 돌려"));
    await agent.waitForIdle();

    const users = agent.state.messages.filter((message) => message.role === "user");
    EVIDENCE["1-grace"] = {
      전체_역할_순서: agent.state.messages.map((message) => message.role),
      user_메시지_수: users.length,
      user_텍스트: userTexts(agent.state.messages),
      합성_user의_필드: users[1]
        ? { role: users[1].role, id_타입: typeof users[1].id, timestamp: typeof users[1].timestamp }
        : null,
    };

    // 호출자가 만든 것은 1개다. 2개 이상이면 코어가 합성 UserMessage를 주입했다는 뜻.
    expect(users.length).toBe(2);
    expect(users[1]?.role).toBe("user");
  });

  test('steer 주입이 role:"user"로 트랜스크립트에 남는다', async () => {
    const { agent, model } = buildAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 30 },
            { kind: "text", text: "첫 턴" },
          ],
          stopReason: "end_turn",
        },
        { steps: [{ kind: "text", text: "둘째 턴" }], stopReason: "end_turn" },
      ],
    });

    const run = agent.prompt("시작");
    await sleep(5);
    let steerError: unknown;
    try {
      agent.steer({ role: "user", content: [{ type: "text", text: "아니 그거 말고" }] });
    } catch (error) {
      steerError = error;
    }
    await settle(run);
    await agent.waitForIdle();

    const users = agent.state.messages.filter((message) => message.role === "user");
    EVIDENCE["1-steer"] = {
      steer_예외: steerError === undefined ? null : String(steerError),
      전체_역할_순서: agent.state.messages.map((message) => message.role),
      user_메시지_수: users.length,
      user_텍스트: userTexts(agent.state.messages),
      모델_호출_수: model.requests.length,
      // steer 메시지가 다음 모델 요청 페이로드에도 실렸는가
      마지막_요청_역할_순서: model.requests.at(-1)?.messages.map((message) => message.role) ?? [],
    };

    expect(steerError).toBeUndefined();
    expect(users.length).toBe(2);
    expect(users[1]?.role).toBe("user");
    expect(userTexts(agent.state.messages)[1]).toContain("아니 그거 말고");
  });

  test("비정상 종료의 합성 도구 결과는 user가 아니라 toolResult다 (cut 경계 오염 없음)", async () => {
    // grace 턴이 채우는 미실행 도구 짝이 user로 새면 cut 경계가 부풀려진다.
    const { agent } = buildAgent({
      maxTurnsPerRun: 1,
      tools: [echoTool()],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "call-1", toolName: "echo" }] },
        { steps: [{ kind: "toolCall", toolCallId: "call-2", toolName: "echo" }] },
      ],
    });

    await settle(agent.prompt("한도"));
    await agent.waitForIdle();

    const roles = agent.state.messages.map((message) => message.role);
    EVIDENCE["1-graceToolPair"] = {
      전체_역할_순서: roles,
      user_수: roles.filter((role) => role === "user").length,
      isError_toolResult_수: agent.state.messages.filter(
        (message) => message.role === "toolResult" && message.isError,
      ).length,
    };

    expect(roles.filter((role) => role === "user").length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 실측 2 — 실패·중단 어시스턴트 메시지의 usage 형상
//   COMPACTION §3: "stopReason이 error·aborted인 응답의 usage는 불완전할 수 있어
//   건너뛴다." 전제가 참이려면 (a) 그런 메시지가 실제로 생기고 (b) usage가
//   현재 컨텍스트 크기를 대표하지 못하는 값(0 자리표시자 또는 부분값)이어야 한다.
// ---------------------------------------------------------------------------

describe("실측 2 — error·aborted 어시스턴트 메시지의 usage 형상 (COMPACTION §3)", () => {
  test("어댑터가 준 error done의 usage를 코어가 그대로 싣는다", async () => {
    const { agent } = buildAgent({
      responses: [
        {
          steps: [{ kind: "text", text: "부분 응답" }],
          error: "프로바이더 500",
          usage: { input: 12_345, cacheRead: 6_000, cacheWrite: 700, output: 0 },
        },
      ],
    });

    await settle(agent.prompt("실패시켜"));
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    EVIDENCE["2-adapterError"] = {
      stopReason: assistant?.role === "assistant" ? assistant.stopReason : null,
      usage: assistant?.role === "assistant" ? assistant.usage : null,
      errorMessage: assistant?.role === "assistant" ? assistant.errorMessage : null,
    };

    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") return;
    expect(assistant.stopReason).toBe("error");
  });

  test("코어가 합성한 error 메시지(done 없는 스트림)의 usage", async () => {
    const { agent } = buildAgent({
      responses: [{ steps: [{ kind: "text", text: "절단" }], omitDone: true }],
    });

    await settle(agent.prompt("절단시켜"));
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    EVIDENCE["2-coreSynthesizedError"] = {
      stopReason: assistant?.role === "assistant" ? assistant.stopReason : null,
      usage: assistant?.role === "assistant" ? assistant.usage : null,
      errorMessage: assistant?.role === "assistant" ? assistant.errorMessage : null,
    };

    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") return;
    expect(assistant.stopReason).toBe("error");
    // §3의 전제 — 이 usage로 컨텍스트 크기를 판정하면 0에 가까운 거짓값이 된다.
    expect(assistant.usage).toBeDefined();
  });

  test("중단(abort)된 런의 어시스턴트 usage — 어댑터가 done을 주는 경우", async () => {
    const { agent } = buildAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 60 },
            { kind: "text", text: "늦은 응답" },
          ],
          usage: { input: 9_999, cacheRead: 100, cacheWrite: 0, output: 0 },
        },
      ],
    });

    const run = agent.prompt("오래 걸리는 작업");
    await sleep(5);
    agent.abort("QA-A 중단");
    await settle(run);
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    EVIDENCE["2-abortedWithDone"] = {
      stopReason: assistant?.role === "assistant" ? assistant.stopReason : null,
      usage: assistant?.role === "assistant" ? assistant.usage : null,
      errorMessage: assistant?.role === "assistant" ? assistant.errorMessage : null,
    };

    expect(assistant?.role).toBe("assistant");
  });

  test("중단(abort)된 런의 어시스턴트 usage — 어댑터가 조용히 닫는 경우", async () => {
    // CORE-INTERFACE §8: 실제 Anthropic SDK raw 스트림은 중단 시 throw 없이 종료한다.
    const { agent } = buildAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 60 },
            { kind: "text", text: "늦은 응답" },
          ],
          silentOnAbort: true,
          usage: { input: 9_999, cacheRead: 100, cacheWrite: 0, output: 0 },
        },
      ],
    });

    const run = agent.prompt("오래 걸리는 작업");
    await sleep(5);
    agent.abort("QA-A 중단");
    await settle(run);
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    EVIDENCE["2-abortedSilent"] = {
      stopReason: assistant?.role === "assistant" ? assistant.stopReason : null,
      usage: assistant?.role === "assistant" ? assistant.usage : null,
      errorMessage: assistant?.role === "assistant" ? assistant.errorMessage : null,
    };

    expect(assistant?.role).toBe("assistant");
  });

  test("정상 응답의 usage는 온전하다 — 대조군", async () => {
    const { agent } = buildAgent({
      responses: [
        {
          steps: [{ kind: "text", text: "정상" }],
          stopReason: "end_turn",
          usage: { input: 1_000, output: 200, cacheRead: 300, cacheWrite: 40 },
        },
      ],
    });

    await agent.prompt("정상 응답");
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    EVIDENCE["2-control"] = {
      stopReason: assistant?.role === "assistant" ? assistant.stopReason : null,
      usage: assistant?.role === "assistant" ? assistant.usage : null,
    };

    expect(assistant?.role === "assistant" ? assistant.usage : null).toEqual({
      input: 1_000,
      output: 200,
      cacheRead: 300,
      cacheWrite: 40,
    });
  });
});

// ---------------------------------------------------------------------------
// 실측 4 (코어 절반) — 중단이 "aborted"로 구분 가능한가
//   COMPACTION §7의 자동 중지 규칙(연속 2회 실패 카운트)에 취소를 넣을지의 전제.
// ---------------------------------------------------------------------------

describe("실측 4 — 코어 경로에서 중단이 error와 구분되는가", () => {
  test("agent.abort()의 결과 stopReason이 aborted이고 error와 구분된다", async () => {
    const { agent } = buildAgent({
      responses: [
        {
          steps: [
            { kind: "delay", ms: 60 },
            { kind: "text", text: "늦은 응답" },
          ],
          silentOnAbort: true,
        },
      ],
    });

    const run = agent.prompt("작업");
    await sleep(5);
    agent.abort("사용자 Ctrl+C");
    const failure = await settle(run);
    await agent.waitForIdle();

    const assistant = agent.state.messages.find((message) => message.role === "assistant");
    EVIDENCE["4-coreAbort"] = {
      "prompt()_reject": failure === undefined ? null : String(failure),
      stopReason: assistant?.role === "assistant" ? assistant.stopReason : null,
      errorMessage: assistant?.role === "assistant" ? assistant.errorMessage : null,
      state_errorMessage: agent.state.errorMessage ?? null,
    };

    // 문서상 요구는 "중단된 런의 어시스턴트 메시지는 stopReason: aborted로 남는다"
    // (CORE-INTERFACE §4). error와 값이 다르면 압축 쪽에서 구분 가능하다.
    expect(assistant?.role === "assistant" ? assistant.stopReason : null).toBe("aborted");
  });
});
