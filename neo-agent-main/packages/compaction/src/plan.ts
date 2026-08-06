/**
 * 계획 — `docs/COMPACTION.md` §4.
 *
 * **자르는 지점은 user 메시지 경계로만 한정한다.** 유지 구간은 뒤에서부터
 * `keepRecentTurns`번째 user 메시지에서 시작한다(합성 user도 경계다 — 코어의
 * grace 턴·steer 주입이 여기 해당한다). 이 한정의 값 두 가지:
 *
 * - **도구 짝 고아가 구조적으로 불가능하다.** toolCall과 toolResult는 언제나 어느
 *   user 경계의 같은 쪽에 있다. 절단 지점 보정(`isCutPointMessage` 류)도,
 *   쪼개진 턴의 이중 요약도 필요 없다.
 * - **메시지별 토큰 추정이 불필요하다.** 턴 수 유지는 결정적이고 사용자에게 그대로
 *   설명된다("최근 2턴은 원문 유지").
 *
 * 순수 함수다 — I/O 0. 그래서 "압축 불가" 판정에 비용이 없고, 분기 직후의 오판
 * (§3: 자식이 부모 시절 usage를 실은 채 복사된다)이 모델 호출 없이 여기서 끝난다.
 */

import type { AgentMessage, UserMessage } from "@neo-agent/core";
import type { CompactionConfig } from "./config.ts";

/**
 * 호출자만 아는 사실 — 이 세션에 부모가 있는가.
 *
 * 저장소를 모르는 패키지이므로 `parent_session_id`를 직접 볼 수 없다. 참이면
 * `messages[0]`이 이전 요약(합성 `UserMessage`)이라는 것이 계약이다(§2 — 부모가
 * 있는 세션의 첫 메시지가 요약이고, 마커 문자열은 두지 않는다).
 */
export type PlanOptions = { hasPreviousSummary?: boolean };

export type CompactionPlan = {
  kind: "plan";
  /** 요약 대상 — 이전 요약 메시지(있으면)를 제외한 cut 이전 전부 */
  toSummarize: readonly AgentMessage[];
  /** 부모가 있는 세션의 첫 메시지에서 추출한 이전 요약. 반복 압축의 연속성(§5) */
  previousSummary?: string;
  /** cut 이후 전부 — id 그대로 자식 세션으로(§2, 자식 세션은 자기완결) */
  kept: readonly AgentMessage[];
};

export type CompactionNotPossible = {
  kind: "not-possible";
  /** 표시용 사유. 사용자가 읽는 문장이다(CLI가 그대로 렌더한다) */
  reason: string;
};

/**
 * 압축 계획을 세운다. 모델을 부르지 않으며 아무것도 영속화하지 않는다.
 *
 * `toSummarize`가 비면 `not-possible`이다 — user 턴이 `keepRecentTurns`개 이하인
 * 세션과 방금 분기된 세션이 여기 해당한다.
 *
 * [미규정 E-32] `hasPreviousSummary`가 참인데 `messages[0]`이 `UserMessage`가
 * 아니면 **throw한다.** 계약 위반의 출처가 호출자 배선 하나뿐이기 때문이다
 * (저장소가 분기 세션의 첫 행을 요약으로 보장한다 — SESSION-STORE §5). 대안은
 * `not-possible`로 돌려 자동 트리거 중지 규칙(§7)에 흡수시키는 것인데, 그러면
 * 배선 버그가 "압축할 수 없는 세션"으로 보여 조용히 살아남는다. 계약(§4)이 정한
 * 바가 없어 소리 나는 쪽으로 닫았다. 판단 요청.
 */
export function planCompaction(
  messages: readonly AgentMessage[],
  config: CompactionConfig,
  options?: PlanOptions,
): CompactionPlan | CompactionNotPossible {
  const hasPreviousSummary = options?.hasPreviousSummary ?? false;

  let previousSummaryMessage: UserMessage | undefined;
  if (hasPreviousSummary) {
    const first = messages[0];
    if (first === undefined || first.role !== "user") {
      throw new Error(
        "planCompaction: hasPreviousSummary가 참이면 messages[0]은 이전 요약(user 메시지)이어야 한다 — " +
          `${first === undefined ? "빈 트랜스크립트" : `role "${first.role}"`}가 왔다.`,
      );
    }
    previousSummaryMessage = first;
  }

  const keepRecentTurns = config.keepRecentTurns;
  const cut = findCutIndex(messages, keepRecentTurns);
  if (cut === undefined) {
    const userTurns = countUserTurns(messages);
    return {
      kind: "not-possible",
      reason: `유지 구간이 대화 전부다 — 사용자 턴이 ${userTurns}개로 유지 기준(최근 ${keepRecentTurns}턴) 이하다.`,
    };
  }

  // 이전 요약은 `toSummarize`에서 제외한다(§5) — 포함하면 요약이 자기 자신을 다시
  // 요약해 반복 압축마다 같은 내용이 이중 반영된다. 갱신은 `previousSummary`로 한다.
  const bodyStart = hasPreviousSummary ? 1 : 0;
  const toSummarize = messages.slice(bodyStart, cut);
  if (toSummarize.length === 0) {
    return {
      kind: "not-possible",
      reason: hasPreviousSummary
        ? `요약할 구간이 없다 — 이전 요약 뒤로 사용자 턴이 유지 기준(최근 ${keepRecentTurns}턴) 이하다.`
        : `요약할 구간이 없다 — 유지 기준(최근 ${keepRecentTurns}턴)이 대화 전부를 덮는다.`,
    };
  }

  const previousSummary =
    previousSummaryMessage === undefined ? undefined : textOf(previousSummaryMessage);

  return {
    kind: "plan",
    toSummarize,
    // `exactOptionalPropertyTypes: true` — 값이 없으면 키 자체를 두지 않는다.
    // 빈 문자열은 "보존할 이전 요약이 없다"와 같으므로 없는 것으로 취급한다.
    ...(previousSummary !== undefined && previousSummary.length > 0 ? { previousSummary } : {}),
    kept: messages.slice(cut),
  };
}

/**
 * 뒤에서 `keepRecentTurns`번째 user 메시지의 인덱스. 그만큼의 user 턴이 없으면
 * `undefined`.
 *
 * `keepRecentTurns`가 1 미만이면 "아무것도 원문 유지하지 않는다"는 뜻이므로 cut은
 * 트랜스크립트 끝이다(유지 0건, 전부 요약). CLI config는 1 이상의 정수만 통과시키므로
 * (`CLI-INTERFACE.md` §3) 실사용 경로에서는 오지 않지만, 루프가 조용히 `undefined`를
 * 돌려 "압축 불가"로 보이는 것보다 의미를 명시하는 편이 낫다.
 */
function findCutIndex(
  messages: readonly AgentMessage[],
  keepRecentTurns: number,
): number | undefined {
  if (keepRecentTurns < 1) return messages.length;

  let seen = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") continue;
    seen += 1;
    if (seen >= keepRecentTurns) return index;
  }
  return undefined;
}

function countUserTurns(messages: readonly AgentMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role === "user") count += 1;
  }
  return count;
}

/**
 * 이전 요약 메시지의 텍스트. 이미지 블록은 요약문에 실릴 수 없으므로 버린다 —
 * 이 메시지는 우리가 §6에서 만든 합성 메시지라 텍스트 블록 하나가 정상이다.
 */
function textOf(message: UserMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}
