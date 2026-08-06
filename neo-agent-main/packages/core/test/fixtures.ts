/**
 * 테스트 공용 픽스처 — 스파이 도구, 이벤트 레코더, 에이전트 조립.
 *
 * 구현을 흉내 내지 않는다. 여기 있는 것은 전부 `docs/CORE-INTERFACE.md`가 정의한
 * 공개 표면(`Agent`, `AgentTool`, `AgentEvent`)만 사용한다.
 */

import { z } from "zod";
import {
  Agent,
  type AgentEvent,
  type AgentHooks,
  type AgentMessage,
  type AgentTool,
  type ToolExecutionContext,
  type ToolResult,
  type UserMessage,
} from "../src/index.ts";
import { MockModelClient, type MockScriptedResponse } from "./mock-model-client.ts";

export interface SpyToolCall {
  toolCallId: string;
  params: unknown;
}

export interface SpyTool {
  tool: AgentTool;
  /** execute가 실제로 실행된 기록. 검증 실패·block 경로에서는 늘어나지 않아야 한다 */
  calls: SpyToolCall[];
}

export interface MakeSpyToolOptions {
  name: string;
  paramsSchema?: z.ZodType;
  execute?: (params: unknown, ctx: ToolExecutionContext) => Promise<ToolResult> | ToolResult;
}

export function makeSpyTool(options: MakeSpyToolOptions): SpyTool {
  const calls: SpyToolCall[] = [];
  const paramsSchema: z.ZodType = options.paramsSchema ?? z.strictObject({});
  const tool: AgentTool = {
    name: options.name,
    label: `${options.name} 도구`,
    description: `${options.name} 테스트 도구`,
    paramsSchema,
    execute: async (params, ctx) => {
      calls.push({ toolCallId: ctx.toolCallId, params });
      if (options.execute) return await options.execute(params, ctx);
      return { content: [{ type: "text", text: `${options.name} ok` }], source: "local" };
    },
  };
  return { tool, calls };
}

/** 구독 순서가 곧 수신 순서라는 계약(§3)을 쓰므로, 가장 먼저 구독한다 */
export function recordEvents(agent: Agent): AgentEvent[] {
  const events: AgentEvent[] = [];
  agent.subscribe((event) => {
    events.push(event);
  });
  return events;
}

export function eventTypes(events: readonly AgentEvent[]): string[] {
  return events.map((event) => event.type);
}

export interface BuildAgentOptions {
  responses: MockScriptedResponse[];
  tools?: AgentTool[];
  hooks?: AgentHooks;
  systemPrompt?: string;
  messages?: AgentMessage[];
  maxTurnsPerRun?: number;
}

export interface BuiltAgent {
  agent: Agent;
  model: MockModelClient;
  events: AgentEvent[];
}

export function buildAgent(options: BuildAgentOptions): BuiltAgent {
  const model = new MockModelClient(options.responses);
  const agent = new Agent({
    session: {
      systemPrompt: options.systemPrompt ?? "너는 테스트 에이전트다.",
      tools: options.tools ?? [],
      ...(options.messages ? { messages: options.messages } : {}),
    },
    modelClient: model,
    ...(options.hooks ? { hooks: options.hooks } : {}),
    ...(options.maxTurnsPerRun !== undefined ? { maxTurnsPerRun: options.maxTurnsPerRun } : {}),
  });
  const events = recordEvents(agent);
  return { agent, model, events };
}

/** 도구 결과 메시지 중 특정 toolCallId의 텍스트를 모은다 */
export function toolResultText(messages: readonly AgentMessage[], toolCallId: string): string {
  return messages
    .filter((message) => message.role === "toolResult" && message.toolCallId === toolCallId)
    .flatMap((message) => (message.role === "toolResult" ? message.content : []))
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

/**
 * 사용자 메시지 헬퍼 — timestamp를 고정해 비교를 안정시킨다.
 *
 * `id`는 트랜스크립트에 직접 밀어 넣는 용도로만 의미가 있다. `steer`/`followUp`에
 * 넘기면 코어가 `UserMessageInput`으로 받아 id·timestamp를 다시 발급한다(§4).
 */
export function userMessage(text: string, timestamp = 0): UserMessage {
  return { id: crypto.randomUUID(), role: "user", content: [{ type: "text", text }], timestamp };
}
