/**
 * 이벤트 스트림 — `docs/CORE-INTERFACE.md` §3.
 *
 * 코어의 유일한 출력 채널. CLI 렌더러와 세션 저장소가 같은 스트림을 구독한다 —
 * 이 대칭이 전송 비의존(ARCHITECTURE §2.1)의 실체다.
 */

import type { AgentMessage, AssistantMessage, ToolResultMessage } from "./messages.ts";
import type { ModelStreamEvent } from "./model.ts";
import type { ToolResult } from "./tool.ts";

export type AgentEvent =
  // 런 수명주기
  | { type: "agent_start" }
  /** 이 런에서 새로 생긴 메시지들 */
  | { type: "agent_end"; messages: AgentMessage[] }
  // 턴 수명주기 — 턴 = 어시스턴트 응답 1개 + 그 도구 호출/결과
  | { type: "turn_start" }
  | { type: "turn_end"; message: AssistantMessage; toolResults: ToolResultMessage[] }
  // 메시지 수명주기 — 트랜스크립트에 추가되는 모든 메시지가 쌍으로 방출된다
  | { type: "message_start"; message: AgentMessage }
  /** 스트리밍 중인 어시스턴트 메시지만. `message`는 미확정 초안이다 */
  | { type: "message_update"; message: AssistantMessage; delta: ModelStreamEvent }
  | { type: "message_end"; message: AgentMessage }
  // 도구 실행 수명주기
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; toolName: string; partial: ToolResult }
  | {
      type: "tool_end";
      toolCallId: string;
      toolName: string;
      result: ToolResult;
      isError: boolean;
    };

export type AgentEventListener = (event: AgentEvent, signal: AbortSignal) => void | Promise<void>;

export type Unsubscribe = () => void;

/**
 * 구독 순서대로 **순차 await**하는 이미터.
 *
 * 리스너가 밀리면 루프도 밀린다(자연 배압). 리스너 예외는 삼키지 않고 그대로
 * 전파한다 — 저장 실패를 숨긴 채 대화가 계속되는 것이 더 나쁘다(§2.6).
 */
export class AgentEventEmitter {
  readonly #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async emit(event: AgentEvent, signal: AbortSignal): Promise<void> {
    // 방출 중 구독/해제가 일어나도 이번 방출의 대상은 고정한다. 단, 방출 도중
    // 해제된 리스너는 호출하지 않는다.
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue;
      await listener(event, signal);
    }
  }
}
