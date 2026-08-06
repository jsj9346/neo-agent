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
 */

export type { CompactionConfig } from "./config.ts";
