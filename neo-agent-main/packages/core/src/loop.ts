/**
 * 에이전트 루프 — `docs/CORE-INTERFACE.md` §5.
 *
 * 레퍼런스의 이중 while 구조를 유지하되 도구 실행은 순차(sequential) 고정이다.
 * 근거: 승인 게이트가 MVP 필수인데 병렬 실행 중 승인 프롬프트가 겹치는 UX는
 * 그 자체가 설계 과제고, 파일 편집 + 셸 실행 조합은 순서 의존이 잦다.
 *
 * 이 모듈의 계약은 하나로 요약된다 — **어떤 경로로 끝나든 이벤트 시퀀스는
 * 완결된다**(불변 조건 2). 성공·모델 실패·도구 throw·중단이 전부
 * `agent_start ... agent_end` 안에서 가시적 결과로 남는다.
 */

import type { AgentEvent, AgentEventEmitter } from "./events.ts";
import type { AgentHooks } from "./hooks.ts";
import type {
  AgentMessage,
  AssistantMessage,
  ToolCallContent,
  ToolResultMessage,
  UserMessage,
} from "./messages.ts";
import type { ModelClient, ModelRequest, ModelStreamEvent, ModelToolSchema } from "./model.ts";
import { type AgentTool, type ToolResult, validateToolArgs } from "./tool.ts";

export interface LoopContext {
  systemPrompt: string;
  toolsByName: ReadonlyMap<string, AgentTool>;
  /** 생성 시 1회 변환된 배열. 매 요청 같은 참조를 보내 바이트 안정성을 지킨다 */
  toolSchemas: ModelToolSchema[];
  modelClient: ModelClient;
  hooks: AgentHooks;
  /** 트랜스크립트 — 코어가 소유하고 루프가 이어 붙인다 */
  messages: AgentMessage[];
  emitter: AgentEventEmitter;
  signal: AbortSignal;
  /** 이 런을 여는 사용자 메시지 */
  initialMessage: UserMessage;
  /** steering 큐에서 하나 꺼낸다 (one-at-a-time 고정) */
  takeSteering: () => UserMessage | undefined;
  /** follow-up 큐에서 하나 꺼낸다 (one-at-a-time 고정) */
  takeFollowUp: () => UserMessage | undefined;
  onStreamingChange: (message: AssistantMessage | undefined) => void;
  onPendingToolCall: (toolCallId: string | undefined) => void;
}

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

function emptyUsage(): AssistantMessage["usage"] {
  return { ...EMPTY_USAGE };
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message.length > 0 ? `${error.name}: ${error.message}` : error.name;
  }
  return String(error);
}

function abortReasonText(signal: AbortSignal): string {
  const reason: unknown = signal.reason;
  if (typeof reason === "string" && reason.length > 0) return reason;
  if (reason instanceof Error) return errorText(reason);
  return "The run was aborted.";
}

/** 코어가 만들어내는 오류 결과. 모델이 다음 행동을 정정할 재료다 */
function coreErrorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], source: "local" };
}

function isToolCall(content: AssistantMessage["content"][number]): content is ToolCallContent {
  return content.type === "toolCall";
}

/**
 * 스트리밍 초안에 델타를 반영한다. 같은 종류의 델타가 이어지면 직전 블록에
 * 이어 붙여 콘텐츠 블록이 잘게 쪼개지지 않게 한다.
 */
function applyDelta(draft: AssistantMessage, event: ModelStreamEvent): void {
  if (event.type === "text_delta") {
    const last = draft.content.at(-1);
    if (last?.type === "text") last.text += event.text;
    else draft.content.push({ type: "text", text: event.text });
    return;
  }
  if (event.type === "thinking_delta") {
    const last = draft.content.at(-1);
    if (last?.type === "thinking") last.text += event.text;
    else draft.content.push({ type: "thinking", text: event.text });
    return;
  }
  if (event.type === "toolcall") {
    draft.content.push({
      type: "toolCall",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args,
    });
  }
}

function makeFailedAssistant(
  stopReason: "error" | "aborted",
  errorMessage: string,
  content: AssistantMessage["content"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
    stopReason,
    errorMessage,
    usage: emptyUsage(),
    timestamp: Date.now(),
  };
}

/**
 * 런 하나를 끝까지 실행하고 이 런에서 새로 생긴 메시지들을 돌려준다.
 *
 * 호출자(`Agent`)는 큐와 상태만 소유하고, 이벤트 시퀀스의 완결성은 전적으로
 * 이 함수가 책임진다.
 */
export async function runAgentLoop(ctx: LoopContext): Promise<AgentMessage[]> {
  const newMessages: AgentMessage[] = [];

  const emit = (event: AgentEvent): Promise<void> => ctx.emitter.emit(event, ctx.signal);

  /** 트랜스크립트에 추가되는 모든 메시지는 message_start/message_end 쌍으로 방출된다 */
  const append = async (message: AgentMessage): Promise<void> => {
    ctx.messages.push(message);
    newMessages.push(message);
    await emit({ type: "message_start", message });
    await emit({ type: "message_end", message });
  };

  const streamAssistant = async (): Promise<AssistantMessage> => {
    // 스트리밍 중 초안의 stopReason·usage는 미확정 자리표시자다.
    // 정본은 message_end / turn_end가 싣는 최종 메시지.
    const draft: AssistantMessage = {
      role: "assistant",
      content: [],
      stopReason: "end_turn",
      usage: emptyUsage(),
      timestamp: Date.now(),
    };
    ctx.onStreamingChange(draft);
    await emit({ type: "message_start", message: draft });

    let final: AssistantMessage | undefined;
    try {
      const request: ModelRequest = {
        systemPrompt: ctx.systemPrompt,
        // 어댑터가 트랜스크립트를 들고 있다가 뒤늦게 읽는 일이 없도록 스냅샷을 넘긴다
        messages: [...ctx.messages],
        tools: ctx.toolSchemas,
      };
      for await (const event of ctx.modelClient.stream(request, ctx.signal)) {
        if (event.type === "done") {
          final = event.message;
          break;
        }
        applyDelta(draft, event);
        await emit({ type: "message_update", message: draft, delta: event });
      }
    } catch (error) {
      // ModelClient는 throw하지 않는 것이 계약이다(§8). 그래도 어댑터 결함으로
      // 새어 나온 예외가 이벤트 시퀀스를 끊게 두지 않는다(불변 조건 2).
      final = makeFailedAssistant(
        ctx.signal.aborted ? "aborted" : "error",
        errorText(error),
        draft.content,
      );
    }

    if (!final) {
      final = makeFailedAssistant(
        ctx.signal.aborted ? "aborted" : "error",
        ctx.signal.aborted
          ? abortReasonText(ctx.signal)
          : "The model stream ended without a done event.",
        draft.content,
      );
    }

    ctx.onStreamingChange(undefined);
    ctx.messages.push(final);
    newMessages.push(final);
    await emit({ type: "message_end", message: final });
    return final;
  };

  const executeToolCall = async (call: ToolCallContent): Promise<ToolResultMessage> => {
    const { toolCallId, toolName, args } = call;
    await emit({ type: "tool_start", toolCallId, toolName, args });
    ctx.onPendingToolCall(toolCallId);

    let result: ToolResult;
    let isError = true;

    const tool = ctx.toolsByName.get(toolName);
    if (!tool) {
      const available = [...ctx.toolsByName.keys()].join(", ");
      result = coreErrorResult(
        `Unknown tool "${toolName}". Available tools: ${available || "(none)"}.`,
      );
    } else if (ctx.signal.aborted) {
      result = coreErrorResult(
        `Tool "${toolName}" was not executed: ${abortReasonText(ctx.signal)}`,
      );
    } else {
      // 불변 조건 3 — 검증 전에는 실행하지 않는다.
      const validation = validateToolArgs(tool, args);
      if (!validation.ok) {
        result = coreErrorResult(validation.message);
      } else {
        // 불변 조건 4 — 훅을 우회하는 실행 경로는 존재하지 않는다.
        const decision = ctx.hooks.beforeToolCall
          ? await ctx.hooks.beforeToolCall({ toolCallId, toolName, args }, ctx.signal)
          : ({ decision: "allow" } as const);

        if (decision.decision === "block") {
          result = coreErrorResult(`Tool "${toolName}" was blocked: ${decision.reason}`);
        } else {
          let updates: Promise<void> = Promise.resolve();
          const onUpdate = (partial: ToolResult): void => {
            updates = updates.then(() =>
              emit({ type: "tool_update", toolCallId, toolName, partial }),
            );
          };
          try {
            result = await tool.execute(validation.value, {
              toolCallId,
              signal: ctx.signal,
              onUpdate,
            });
            isError = false;
          } catch (error) {
            // 도구는 실패를 throw로 알린다(§6). 루프가 모델이 읽을 오류로 변환한다.
            result = coreErrorResult(`Tool "${toolName}" failed: ${errorText(error)}`);
          } finally {
            await updates;
          }
        }
      }
    }

    if (ctx.hooks.afterToolCall) {
      const override = await ctx.hooks.afterToolCall(
        { toolCallId, toolName, args, result, isError },
        ctx.signal,
      );
      if (override) {
        // 부분 오버라이드 — 생략한 필드는 원본을 유지한다
        if (override.content !== undefined) result = { ...result, content: override.content };
        if (override.isError !== undefined) isError = override.isError;
      }
    }

    ctx.onPendingToolCall(undefined);
    await emit({ type: "tool_end", toolCallId, toolName, result, isError });

    const message: ToolResultMessage = {
      role: "toolResult",
      toolCallId,
      toolName,
      content: result.content,
      isError,
      source: result.source,
      timestamp: Date.now(),
    };
    await append(message);
    return message;
  };

  try {
    // agent_start도 try 안에서 방출한다. 밖에 두면 리스너 하나가 throw했을 때
    // 이미 agent_start를 받은 다른 리스너들이 agent_end를 영영 못 받는다 —
    // §3이 "크래시로 이벤트 시퀀스가 끊기는 것은 코어 결함"이라고 못박은 경우다.
    await emit({ type: "agent_start" });
    await append(ctx.initialMessage);

    let failed = false;
    // 외부 루프 — follow-up 큐가 비고 자연 종료할 때까지
    outer: while (!failed) {
      // 내부 루프 — 모델이 도구를 더 부르지 않을 때까지
      while (true) {
        if (ctx.signal.aborted) break outer;

        await emit({ type: "turn_start" });

        const steering = ctx.takeSteering();
        if (steering) await append(steering);

        const assistant = await streamAssistant();
        const toolCalls = assistant.content.filter(isToolCall);

        const toolResults: ToolResultMessage[] = [];
        for (const call of toolCalls) {
          toolResults.push(await executeToolCall(call));
        }

        await emit({ type: "turn_end", message: assistant, toolResults });

        if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
          failed = true;
          break outer;
        }
        if (toolCalls.length === 0) break;
        if (ctx.signal.aborted) break outer;
      }

      const followUp = ctx.takeFollowUp();
      if (!followUp) break;
      await append(followUp);
    }

    // 중단도 가시적 결과다(§4) — 어느 지점에서 끊겼든 트랜스크립트에 표식을 남긴다.
    if (ctx.signal.aborted) {
      const last = newMessages.at(-1);
      const alreadyMarked = last?.role === "assistant" && last.stopReason === "aborted";
      if (!alreadyMarked) {
        await append(makeFailedAssistant("aborted", abortReasonText(ctx.signal), []));
      }
    }
  } finally {
    ctx.onStreamingChange(undefined);
    ctx.onPendingToolCall(undefined);
    await emit({ type: "agent_end", messages: newMessages });
  }

  return newMessages;
}
