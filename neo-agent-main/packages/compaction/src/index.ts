/**
 * `@neo-agent/compaction` 공개 배럴.
 *
 * 판정(shouldCompact)·계획(planCompaction)·요약 생성(generateSummary)만 안다.
 * 저장소를 모른다 — 산출물을 값으로 돌려주고 영속화·Agent 교체는 CLI가 한다.
 * 의존성은 `@neo-agent/core` 하나(타입 + createUserMessage + ModelClient)이고,
 * 디스크·네트워크로 나가는 모듈 임포트는 예산 게이트가 기계 차단한다.
 * 계약 정본은 `docs/COMPACTION.md`.
 *
 * 모듈 배치 (T-001 스케치 — 공개 표면은 계약, 내부 분할은 조정 가능):
 *   config.ts     CompactionConfig (§3)
 *   trigger.ts    shouldCompact — 실측 usage 기반 판정 (§3)
 *   plan.ts       planCompaction — user 턴 경계 cut (§4)
 *   serialize.ts  트랜스크립트 직렬화 — thinking 제외 (§5)
 *   summary.ts    generateSummary — 주입된 ModelClient 호출, 실패는 throw (§5)
 *
 * E-31(`measureContextTokens`)·E-34(`CompactionSummaryError`)는 Architect 판정으로
 * 배럴에 열렸다(2026-08-06) — §6 before 토큰 표시의 합산 규칙 이중화 방지, §7 취소/
 * 실패 구분. 판정 기록은 QA 리포트.
 */

// §3 설정 — 기본값의 소유자는 CLI config다
export type { CompactionConfig } from "./config.ts";
// §4 계획 — 순수 함수, user 턴 경계 cut
export {
  type CompactionNotPossible,
  type CompactionPlan,
  type PlanOptions,
  planCompaction,
} from "./plan.ts";
// §5 요약 생성 — 실패는 throw(부분 요약 반환 금지). 에러 타입을 여는 것은 §7의
// 자동 중지 카운트가 취소(aborted)를 실패로 세지 않기 위한 판정 근거다
export {
  CompactionSummaryError,
  generateSummary,
  type SummaryFailureReason,
} from "./summary.ts";
// §3 판정 — 마지막 유효 어시스턴트의 실측 usage로만. measureContextTokens는
// §6 결과 표시(before 토큰)의 수치를 만드는 유일한 규칙이다
export { measureContextTokens, shouldCompact } from "./trigger.ts";
