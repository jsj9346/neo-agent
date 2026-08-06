/**
 * T-010 — 불변 조건 검증. `docs/CORE-INTERFACE.md` §9의 6종을 1:1로 매핑한다.
 *
 * 타입 수준 계약은 `@ts-expect-error`로 검증한다. 그 주석이 실제로 에러를 잡지
 * 못하면 `tsc --noEmit`이 "unused '@ts-expect-error' directive"로 실패한다 —
 * 즉 이 파일의 타입 테스트는 **타입체크가 통과하는 것 자체가 검증**이다.
 */

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  Agent,
  type AgentMessage,
  type AgentTool,
  type AssistantMessage,
  type ModelClient,
  type ModelStreamEvent,
  type ProviderEvidence,
  type ProviderRegistration,
  type ToolResult,
  type ToolResultMessage,
  toModelToolSchemas,
  type UserMessage,
} from "../src/index.ts";
import { buildAgent, eventTypes, makeSpyTool, userMessage } from "./fixtures.ts";
import { MockModelClient } from "./mock-model-client.ts";

function makeTool(name: string, schema: z.ZodType = z.strictObject({})): AgentTool {
  return {
    name,
    label: name,
    description: `${name} 도구`,
    paramsSchema: schema,
    execute: async () => ({ content: [{ type: "text", text: "ok" }], source: "local" }),
  };
}

// ---------------------------------------------------------------------------
// 불변 조건 1 — 세션 중 프롬프트 상태 불변 (§2.4)
// ---------------------------------------------------------------------------

describe("불변 조건 1 — 세션 중 프롬프트 상태 불변", () => {
  /**
   * 타입 전용 검증 — 실행하지 않는다. 여기의 `@ts-expect-error`가 에러를 잡지
   * 못하면 `tsc --noEmit`이 unused directive로 실패한다.
   */
  function stateHasNoSetters(agent: Agent): void {
    // @ts-expect-error — systemPrompt는 readonly. 세션 중 재할당 경로가 없다
    agent.state.systemPrompt = "다른 프롬프트";
    // @ts-expect-error — tools는 readonly 배열. push로도 늘릴 수 없다
    agent.state.tools.push(makeTool("write"));
    // @ts-expect-error — messages도 readonly 배열이다
    agent.state.messages.push(userMessage("주입"));
    // @ts-expect-error — Agent에 systemPrompt setter는 존재하지 않는다
    agent.systemPrompt = "다른 프롬프트";
    // @ts-expect-error — Agent에 setTools 류 메서드는 존재하지 않는다
    agent.setTools([]);
  }

  it("systemPrompt·tools에 setter가 없다 (타입 테스트)", () => {
    const agent = new Agent({
      session: { systemPrompt: "고정 프롬프트", tools: [makeTool("read")] },
      modelClient: new MockModelClient([]),
    });

    expect(stateHasNoSetters).toBeTypeOf("function");
    expect(agent.state.systemPrompt).toBe("고정 프롬프트");
    expect(agent.state.tools).toHaveLength(1);
  });

  it("런 2회 후에도 요청의 systemPrompt·tools가 바이트 동일하다", async () => {
    const built = buildAgent({
      systemPrompt: "너는 테스트 에이전트다.",
      tools: [makeTool("read"), makeTool("write", z.strictObject({ path: z.string() }))],
      responses: [
        { steps: [{ kind: "text", text: "1" }] },
        { steps: [{ kind: "text", text: "2" }] },
      ],
    });

    await built.agent.prompt("첫 번째");
    await built.agent.prompt("두 번째");

    expect(built.model.requests).toHaveLength(2);
    const [first, second] = built.model.requests;
    expect(first?.systemPrompt).toBe(second?.systemPrompt);
    expect(JSON.stringify(first?.tools)).toBe(JSON.stringify(second?.tools));
  });
});

// ---------------------------------------------------------------------------
// 불변 조건 2 — 모든 런은 완결된 이벤트 시퀀스로 끝난다 (§2.6)
// ---------------------------------------------------------------------------

describe("불변 조건 2 — 모든 런은 완결된 이벤트 시퀀스로 끝난다", () => {
  it("성공 경로에서 agent_start·agent_end가 쌍으로 닫힌다", async () => {
    const built = buildAgent({ responses: [{ steps: [{ kind: "text", text: "ok" }] }] });
    await built.agent.prompt("해줘");

    const types = eventTypes(built.events);
    expect(types.filter((type) => type === "agent_start")).toHaveLength(1);
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);
    expect(types[0]).toBe("agent_start");
    expect(types.at(-1)).toBe("agent_end");
  });

  it("실패 경로(모델 에러)에서도 닫힌다", async () => {
    const built = buildAgent({ responses: [{ error: "upstream 500" }] });
    await built.agent.prompt("해줘");

    const types = eventTypes(built.events);
    expect(types[0]).toBe("agent_start");
    expect(types.at(-1)).toBe("agent_end");
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);
  });

  it("중단 경로에서도 닫힌다", async () => {
    const spy = makeSpyTool({
      name: "slow",
      execute: () => {
        built.agent.abort("중단");
        return { content: [{ type: "text", text: "부분" }], source: "local" };
      },
    });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "slow", args: {} }] },
        { steps: [{ kind: "text", text: "오면 안 됨" }] },
      ],
    });

    await built.agent.prompt("해줘");

    const types = eventTypes(built.events);
    expect(types[0]).toBe("agent_start");
    expect(types.at(-1)).toBe("agent_end");
    expect(types.filter((type) => type === "agent_end")).toHaveLength(1);
  });

  it("도구가 throw해도 닫힌다", async () => {
    const spy = makeSpyTool({
      name: "boom",
      execute: () => {
        throw new Error("펑");
      },
    });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "boom", args: {} }] },
        { steps: [{ kind: "text", text: "복구" }] },
      ],
    });

    await built.agent.prompt("해줘");
    const types = eventTypes(built.events);
    expect(types.at(-1)).toBe("agent_end");
  });

  /**
   * 회귀 — 이벤트 리스너가 throw하는 경로 (D-11 / D-11-R).
   *
   * §3의 확정 의미론:
   * > 리스너 예외는 삼키지 않지만, 나머지 리스너의 전달을 취소하지도 않는다.
   * > 한 이벤트는 항상 모든 리스너에게 전달되고, 모아둔 예외는 전달이 끝난 뒤
   * > 전파한다(2개 이상이면 `AggregateError`).
   *
   * 이 의미론이 불변 조건 2를 **리스너 단위로** 성립시킨다 — 모든 리스너가 모든
   * 이벤트를 받으므로 "`agent_start`는 못 받았는데 `agent_end`는 받는" 리스너가
   * 아예 생기지 않는다. 두 곳이 함께 지켜져야 한다:
   * `emit`의 예외 수집(`src/events.ts:62-81`)과 `agent_start`를 `try` **안**에서
   * 방출하는 것(`src/loop.ts:275-280`).
   */
  describe("리스너가 throw해도 시퀀스가 닫힌다 (회귀)", () => {
    function makeAgent(): { agent: Agent; model: MockModelClient } {
      const model = new MockModelClient([{ steps: [{ kind: "text", text: "ok" }] }]);
      const agent = new Agent({
        session: { systemPrompt: "sp", tools: [] },
        modelClient: model,
      });
      return { agent, model };
    }

    it("A·B·C 중 B가 agent_start에서 throw해도 셋 다 agent_start·agent_end를 받는다", async () => {
      const { agent } = makeAgent();
      const a: string[] = [];
      const b: string[] = [];
      const c: string[] = [];

      // A — 정상 (예: 세션 저장소)
      agent.subscribe((event) => {
        a.push(event.type);
      });
      // B — 첫 이벤트부터 터진다 (예: 렌더러 초기화 실패)
      agent.subscribe((event) => {
        b.push(event.type);
        if (event.type === "agent_start") throw new Error("리스너 폭발");
      });
      // C — B 뒤에 구독. 예전에는 B의 throw로 agent_start를 못 받았다 (D-11-R)
      agent.subscribe((event) => {
        c.push(event.type);
      });

      // fail-fast는 유지된다 — B가 던진 오류가 그대로 전파된다
      await expect(agent.prompt("해줘")).rejects.toThrow("리스너 폭발");

      // 짝 없는 이벤트를 받은 리스너가 0개다
      for (const received of [a, b, c]) {
        expect(received.filter((type) => type === "agent_start")).toHaveLength(1);
        expect(received.filter((type) => type === "agent_end")).toHaveLength(1);
        expect(received[0]).toBe("agent_start");
        expect(received.at(-1)).toBe("agent_end");
      }
      // B가 터진 뒤 런은 즉시 닫힌다 — 세 리스너 모두 같은 두 이벤트만 본다
      expect(a).toEqual(["agent_start", "agent_end"]);
      expect(a).toEqual(b);
      expect(b).toEqual(c);
    });

    it("런 도중(turn_end)에 throw해도 agent_end가 방출된다", async () => {
      const { agent } = makeAgent();
      const received: string[] = [];

      agent.subscribe((event) => {
        received.push(event.type);
      });
      agent.subscribe((event) => {
        if (event.type === "turn_end") throw new Error("턴 종료 리스너 폭발");
      });

      await expect(agent.prompt("해줘")).rejects.toThrow("턴 종료 리스너 폭발");

      expect(received.filter((type) => type === "agent_start")).toHaveLength(1);
      expect(received.filter((type) => type === "agent_end")).toHaveLength(1);
      expect(received.at(-1)).toBe("agent_end");
      // 터진 지점 직후에 바로 닫힌다 — 남은 턴은 진행하지 않는다
      expect(received.slice(-2)).toEqual(["turn_end", "agent_end"]);
    });

    it("리스너 2개가 throw하면 AggregateError로 묶여 전파된다", async () => {
      const { agent } = makeAgent();
      const tail: string[] = [];

      agent.subscribe((event) => {
        if (event.type === "agent_start") throw new Error("첫 번째 폭발");
      });
      agent.subscribe((event) => {
        if (event.type === "agent_start") throw new Error("두 번째 폭발");
      });
      // 둘 다 터져도 뒤 순번 리스너의 전달은 취소되지 않는다
      agent.subscribe((event) => {
        tail.push(event.type);
      });

      const error: unknown = await agent.prompt("해줘").then(
        () => undefined,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(AggregateError);
      const aggregate = error as AggregateError;
      expect(aggregate.errors).toHaveLength(2);
      expect((aggregate.errors as Error[]).map((each) => each.message)).toEqual([
        "첫 번째 폭발",
        "두 번째 폭발",
      ]);
      expect(tail).toEqual(["agent_start", "agent_end"]);
    });

    it("리스너가 터진 뒤에도 에이전트는 idle로 돌아온다", async () => {
      const { agent } = makeAgent();
      const unsubscribe = agent.subscribe((event) => {
        if (event.type === "agent_start") throw new Error("폭발");
      });

      await expect(agent.prompt("해줘")).rejects.toThrow("폭발");
      // waitForIdle은 대기 수단이지 오류 채널이 아니다 — 던지지 않는다(§3)
      await expect(agent.waitForIdle()).resolves.toBeUndefined();

      // 활성 런 상태가 남아 있지 않다 — 다음 prompt()가 throw하지 않는다
      unsubscribe();
      expect(agent.state.isStreaming).toBe(false);
      expect(agent.state.pendingToolCall).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 불변 조건 3 — 도구 인자는 검증 전에 실행되지 않는다
// ---------------------------------------------------------------------------

describe("불변 조건 3 — 도구 인자는 검증 전에 실행되지 않는다", () => {
  const schema = z.strictObject({ path: z.string() });

  it("closed object 위반(잉여 필드)이면 execute 스파이가 0회 호출된다", async () => {
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
              args: { path: "a.txt", extra: 1 },
            },
          ],
        },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");
    expect(spy.calls).toHaveLength(0);
  });

  it("타입 불일치여도 execute 스파이가 0회 호출된다", async () => {
    const spy = makeSpyTool({ name: "read", paramsSchema: schema });
    const built = buildAgent({
      tools: [spy.tool],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: { path: 42 } }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");
    expect(spy.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 불변 조건 4 — 훅을 통과하지 않은 도구 실행은 없다
// ---------------------------------------------------------------------------

describe("불변 조건 4 — 훅을 통과하지 않은 도구 실행은 없다", () => {
  it("모든 실행 경로에서 execute는 beforeToolCall의 allow 뒤에만 일어난다", async () => {
    const log: string[] = [];
    const allowed: string[] = [];

    const read = makeSpyTool({
      name: "read",
      paramsSchema: z.strictObject({ path: z.string() }),
      execute: (_params, ctx) => {
        log.push(`execute:${ctx.toolCallId}`);
        return { content: [{ type: "text", text: "ok" }], source: "local" };
      },
    });
    const danger = makeSpyTool({
      name: "danger",
      execute: (_params, ctx) => {
        log.push(`execute:${ctx.toolCallId}`);
        return { content: [{ type: "text", text: "ok" }], source: "local" };
      },
    });

    const built = buildAgent({
      tools: [read.tool, danger.tool],
      hooks: {
        beforeToolCall: async (ctx) => {
          log.push(`hook:${ctx.toolCallId}`);
          if (ctx.toolName === "danger") {
            return { decision: "block", reason: "차단" };
          }
          allowed.push(ctx.toolCallId);
          return { decision: "allow" };
        },
      },
      responses: [
        {
          steps: [
            // 미등록 도구 — 실행도 훅도 없다
            { kind: "toolCall", toolCallId: "c-unknown", toolName: "ghost", args: {} },
            // 검증 실패 — 실행 없다
            { kind: "toolCall", toolCallId: "c-invalid", toolName: "read", args: { bad: 1 } },
            // 훅이 차단 — 실행 없다
            { kind: "toolCall", toolCallId: "c-blocked", toolName: "danger", args: {} },
            // 정상 경로
            { kind: "toolCall", toolCallId: "c-ok", toolName: "read", args: { path: "a.txt" } },
          ],
        },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");

    // 실행된 것은 훅이 allow한 것과 정확히 같다 — 우회 경로가 없다
    const executed = log.filter((entry) => entry.startsWith("execute:"));
    expect(executed).toEqual(["execute:c-ok"]);
    expect(allowed).toEqual(["c-ok"]);

    // 그리고 실행은 언제나 같은 toolCallId의 훅 호출 뒤에 온다
    for (const entry of executed) {
      const id = entry.slice("execute:".length);
      expect(log.indexOf(`hook:${id}`)).toBeGreaterThanOrEqual(0);
      expect(log.indexOf(`hook:${id}`)).toBeLessThan(log.indexOf(entry));
    }

    expect(read.calls).toHaveLength(1);
    expect(danger.calls).toHaveLength(0);
  });

  it("훅이 없으면 실행되지만, 훅이 있으면 예외 없이 전부 통과한다", async () => {
    const beforeToolCall = vi.fn(async () => ({ decision: "allow" as const }));
    const spy = makeSpyTool({ name: "read" });

    const built = buildAgent({
      tools: [spy.tool],
      hooks: { beforeToolCall },
      responses: [
        {
          steps: [
            { kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} },
            { kind: "toolCall", toolCallId: "c2", toolName: "read", args: {} },
          ],
        },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");

    expect(spy.calls).toHaveLength(2);
    expect(beforeToolCall).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 불변 조건 5 — `source` 없는 도구 결과는 컴파일되지 않는다
// ---------------------------------------------------------------------------

describe("불변 조건 5 — source 없는 도구 결과는 컴파일되지 않는다", () => {
  it("ToolResult·ToolResultMessage 모두 source가 필수다 (타입 테스트)", () => {
    // @ts-expect-error — source 누락. taint 흔적을 타입으로 강제한다
    const missingResultSource: ToolResult = { content: [] };

    // @ts-expect-error — source 누락
    const missingMessageSource: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "c1",
      toolName: "read",
      content: [],
      isError: false,
      timestamp: 0,
    };

    const ok: ToolResult = { content: [], source: "local" };

    expect(missingResultSource).toBeDefined();
    expect(missingMessageSource).toBeDefined();
    expect(ok.source).toBe("local");
    expectTypeOf<ToolResult["source"]>().toEqualTypeOf<"local" | "network">();
  });
});

// ---------------------------------------------------------------------------
// 불변 조건 6 — 결정적(deterministic) 직렬화
// ---------------------------------------------------------------------------

describe("불변 조건 6 — 코어는 결정적 순서로 직렬화한다", () => {
  it("toModelToolSchemas는 같은 입력에 대해 바이트 동일한 산출물을 낸다", () => {
    const tools = [
      makeTool("zulu", z.strictObject({ b: z.string(), a: z.number() })),
      makeTool("alpha", z.strictObject({ path: z.string() })),
    ];

    expect(JSON.stringify(toModelToolSchemas(tools))).toBe(
      JSON.stringify(toModelToolSchemas(tools)),
    );
  });

  it("등록 순서를 보존한다 (이름 정렬이 아니다)", () => {
    const names = ["zulu", "alpha", "mike"];
    const schemas = toModelToolSchemas(names.map((name) => makeTool(name)));

    expect(schemas.map((schema) => schema.name)).toEqual(names);
    // 정렬된 순서와 다름을 명시적으로 확인 — 우연히 통과하는 테스트가 아니다
    expect(schemas.map((schema) => schema.name)).not.toEqual([...names].sort());
  });

  it("산출물은 closed object다 (type: object + additionalProperties: false)", () => {
    const schemas = toModelToolSchemas([makeTool("read", z.strictObject({ path: z.string() }))]);
    const inputSchema = schemas[0]?.inputSchema;

    expect(inputSchema?.type).toBe("object");
    expect(inputSchema?.additionalProperties).toBe(false);
    // 모델 페이로드에 불필요한 $schema는 실리지 않는다
    expect(inputSchema).not.toHaveProperty("$schema");
  });

  it("z.strictObject가 아닌 스키마는 거부된다 (§6)", () => {
    expect(() => toModelToolSchemas([makeTool("open", z.object({ path: z.string() }))])).toThrow(
      /strictObject/,
    );
  });

  it("중복 도구 이름은 거부된다", () => {
    expect(() => toModelToolSchemas([makeTool("read"), makeTool("read")])).toThrow(/Duplicate/);
  });

  it("루프를 경유한 2회 요청의 tools 페이로드가 바이트 동일하다", async () => {
    const spy = makeSpyTool({ name: "read" });
    const built = buildAgent({
      tools: [spy.tool, makeTool("write", z.strictObject({ path: z.string() }))],
      responses: [
        { steps: [{ kind: "toolCall", toolCallId: "c1", toolName: "read", args: {} }] },
        { steps: [{ kind: "text", text: "끝" }] },
      ],
    });

    await built.agent.prompt("해줘");

    expect(built.model.requests).toHaveLength(2);
    const payloads = built.model.requests.map((request) => JSON.stringify(request.tools));
    expect(payloads[0]).toBe(payloads[1]);
    expect(JSON.parse(payloads[0] ?? "[]")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 추가 타입 계약 (§2 메시지 모델, §8 컴플라이언스 게이트)
// ---------------------------------------------------------------------------

const dummyStream = async function* (): AsyncGenerator<ModelStreamEvent> {
  yield {
    type: "done",
    message: {
      role: "assistant",
      content: [],
      stopReason: "end_turn",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      timestamp: 0,
    },
  };
};

const dummyClient: ModelClient = { modelId: "dummy/1", stream: dummyStream };

describe("타입 계약 — 메시지 모델 (§2)", () => {
  it("AgentMessage는 정확히 3개 역할의 유니온이다", () => {
    expectTypeOf<AgentMessage["role"]>().toEqualTypeOf<"user" | "assistant" | "toolResult">();
    expectTypeOf<AgentMessage>().toEqualTypeOf<
      UserMessage | AssistantMessage | ToolResultMessage
    >();
    expectTypeOf<Extract<AgentMessage, { role: "user" }>>().toEqualTypeOf<UserMessage>();
  });

  it("AssistantMessage에서 usage 생략은 컴파일되지 않는다", () => {
    // @ts-expect-error — usage는 옵션이 아니다. 비용이 안 보이는 응답은 계약 위반
    const missingUsage: AssistantMessage = {
      role: "assistant",
      content: [],
      stopReason: "end_turn",
      timestamp: 0,
    };
    expect(missingUsage).toBeDefined();

    const ok: AssistantMessage = {
      role: "assistant",
      content: [],
      stopReason: "end_turn",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      timestamp: 0,
    };
    expect(ok.usage.input).toBe(1);
  });

  it("StopReason은 5종으로 닫혀 있다", () => {
    expectTypeOf<AssistantMessage["stopReason"]>().toEqualTypeOf<
      "end_turn" | "tool_use" | "max_tokens" | "error" | "aborted"
    >();
  });
});

describe("타입 계약 — 컴플라이언스 게이트 (§8)", () => {
  it("vendor-documented 외의 evidence 종류는 존재하지 않는다", () => {
    const evidence: ProviderEvidence = {
      // @ts-expect-error — internal-runtime은 타입에 존재하지 않는다. 위반 경로를 표현 불가로 만든다
      kind: "internal-runtime",
      url: "https://example.invalid",
    };
    expect(evidence.url).toBe("https://example.invalid");
    expectTypeOf<ProviderEvidence["kind"]>().toEqualTypeOf<"vendor-documented">();
  });

  it("타 제품을 사칭하는 User-Agent는 컴파일되지 않는다", () => {
    const spoofed: ProviderRegistration = {
      id: "anthropic",
      evidence: { kind: "vendor-documented", url: "https://docs.claude.com/en/api" },
      // @ts-expect-error — `neo-agent/${string}` 접두가 강제된다. 사칭 UA는 타입 에러
      userAgent: "claude-code/1.0",
      createClient: () => dummyClient,
    };
    expect(spoofed.id).toBe("anthropic");

    const honest: ProviderRegistration = {
      id: "anthropic",
      evidence: { kind: "vendor-documented", url: "https://docs.claude.com/en/api" },
      userAgent: "neo-agent/0.1 (cli)",
      createClient: () => dummyClient,
    };
    expect(honest.userAgent).toBe("neo-agent/0.1 (cli)");
  });
});
