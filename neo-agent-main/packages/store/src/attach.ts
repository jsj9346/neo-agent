/**
 * 이벤트 구독 배선 — `docs/SESSION-STORE.md` §4.
 *
 * 저장소는 CLI 렌더러와 **같은 이벤트 스트림의 구독자**다(§1). 코어는 저장소를
 * 모르고, 저장소도 에이전트 루프를 모른다 — 아는 것은 `AgentEvent` 하나다.
 */

import type { DatabaseSync } from "node:sqlite";
import type { Agent, Unsubscribe } from "@neo-agent/core";
import { appendMessage } from "./messages.ts";

/**
 * `message_end`를 세션에 배선하고 해지 함수를 돌려준다.
 *
 * **저장소는 렌더러보다 먼저 구독해야 한다**(§4). 코어의 구독 계약이 "리스너는
 * 구독 순서대로 await된다"를 보장하므로, 그 순서는 **사용자가 화면에서 본 것은
 * 이미 저장된 것**이라는 뜻이 된다. 반대 순서면 렌더링된 뒤 저장이 실패하는
 * 창이 생긴다. 이 함수는 순서를 강제할 수 없다 — 호출자의 배선 순서가 계약이다.
 *
 * 종료 시 flush가 따로 필요 없다: `waitForIdle()`이 리스너 settlement까지
 * 기다린다(CORE-INTERFACE §3).
 */
export function attachSessionStore(db: DatabaseSync, agent: Agent, sessionId: string): Unsubscribe {
  return agent.subscribe((event) => {
    // 구독하는 것은 `message_end` 하나뿐이다(§4). 나머지를 무시하는 이유는
    // 서로 다르다:
    //
    // - `message_start` — 스트리밍 초안이다. `stopReason`·`usage`가 미확정
    //   자리표시자라 저장하면 **거짓 기록**이 남는다. `stopReason: "end_turn"`인
    //   미완성 어시스턴트 메시지는 재개 시 정상 종료된 턴으로 보인다(§3).
    //   그리고 초안과 최종은 **같은 id**를 공유하므로, 초안을 먼저 넣으면 최종이
    //   `INSERT OR IGNORE`에 먹혀 거짓 기록이 그대로 굳는다 — 아래 셋과 달리
    //   이쪽은 멱등이 구해 주지 못한다.
    // - `message_update` — 같은 초안의 갱신본이다.
    // - `turn_end.message`·`agent_end.messages` — `message_end`로 이미 저장됐다.
    //   실수로 함께 구독해도 `INSERT OR IGNORE`가 no-op으로 만든다(§3).
    if (event.type !== "message_end") return;

    // 실패를 잡지 않는다(§7). 리스너 예외로 전파되어 런이 실패하고 `prompt()`가
    // reject한다 — 저장이 안 되는데 대화가 계속되면 사용자는 저장된 줄 안다.
    appendMessage(db, sessionId, event.message);
  });
}
