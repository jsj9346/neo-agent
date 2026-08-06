/**
 * 트리거 판정 — `docs/COMPACTION.md` §3.
 *
 * **판정 근거는 추정이 아니라 실측이다.** 모든 `AssistantMessage.usage`가 계약
 * 필수이므로(CORE-INTERFACE §2), 현재 컨텍스트 크기는 트랜스크립트의 마지막 유효
 * 어시스턴트 응답이 실제로 청구받은 토큰이다. 문자 수 기반 추정은 넣지 않는다
 * (§9 — CJK 보정 휴리스틱을 요구하고, threshold 마진이 이미 오차를 흡수한다).
 *
 * 순수 함수다 — 트랜스크립트를 읽기만 하고 아무것도 바꾸지 않는다.
 */

import type { AgentMessage } from "@neo-agent/core";
import type { CompactionConfig } from "./config.ts";

/**
 * 마지막 **유효** 어시스턴트 응답의 컨텍스트 토큰. 유효 usage가 없으면 `undefined`.
 *
 * `input + cacheRead + cacheWrite + output`이 그 응답이 본 컨텍스트의 전부다 —
 * 캐시 적중분(cacheRead)도 모델이 읽은 토큰이므로 뺄 이유가 없다.
 *
 * `stopReason`이 `"error"`·`"aborted"`인 응답은 건너뛴다. 실패한 호출의 usage는
 * 불완전할 수 있고(입력 토큰만 실린 채 끝나거나 아예 0), 그 값으로 판정하면 압축
 * 여부가 마지막 호출의 실패 시점에 좌우된다. 마지막 유효 응답 이후에 추가된
 * 메시지(사용자 입력·도구 결과)는 미반영이며, 그 오차는 threshold 마진이 흡수한다.
 *
 * [미규정 E-31] 이 함수는 배럴에 없다. `COMPACTION.md` §6은 압축 결과 표시에
 * "before 컨텍스트 토큰"을 의무화하는데, 그 수치를 만드는 규칙은 여기 하나뿐이다.
 * 배럴 스케치(T-001)가 정한 공개 표면에 없어서 임의로 넣지 않았다 — 열려면
 * `index.ts`에 `export { measureContextTokens } from "./trigger.ts";` 한 줄이다.
 * 열지 않으면 CLI가 같은 합산 규칙을 자기 쪽에 복제하게 된다(계약 이중화). 판단 요청.
 */
export function measureContextTokens(messages: readonly AgentMessage[]): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || message.role !== "assistant") continue;
    if (message.stopReason === "error" || message.stopReason === "aborted") continue;

    const { input, cacheRead, cacheWrite, output } = message.usage;
    return input + cacheRead + cacheWrite + output;
  }
  return undefined;
}

/**
 * 자동 압축 임계 판정 — `contextTokens > contextWindowTokens × threshold`.
 *
 * 유효 usage가 없으면 `false`다(§3). 모델 응답이 아직 하나도 없거나 전부 실패한
 * 트랜스크립트에는 압축할 근거 자체가 없다.
 *
 * 설정값의 타당성(양수·0~1 범위)은 검사하지 않는다 — `CompactionConfig`의 소유자는
 * CLI config이고 거기서 이미 검증한다(`CLI-INTERFACE.md` §3). 여기서 다시 던지면
 * 같은 규칙이 두 곳에 살게 된다.
 */
export function shouldCompact(
  messages: readonly AgentMessage[],
  config: CompactionConfig,
): boolean {
  const contextTokens = measureContextTokens(messages);
  if (contextTokens === undefined) return false;
  return contextTokens > config.contextWindowTokens * config.threshold;
}
