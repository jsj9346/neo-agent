/**
 * 압축 오케스트레이션 — `docs/COMPACTION.md` §3·§6·§7, `docs/CLI-INTERFACE.md` §5·§6.
 *
 * **⚠️ 지금은 스텁이다 — 본체는 T-009에서 구현한다.** T-008은 표면만 연다:
 * config 3키(`config.ts`)와 `/compact` 명령 등록(`registry.ts`), 그리고 둘을 잇는
 * 이 자리다. 계약상 압축은 CLI가 소유한다 — 판정 시점(런 종료 후 idle·재개 직후),
 * `branchSession` 호출, Agent 폐기 후 재생성, 결과 표시가 전부 여기로 온다.
 *
 * 자동과 수동이 **같은 경로**인 것이 계약이다(COMPACTION.md §3). 다른 점은 임계
 * 판정 하나뿐이라 `CompactTrigger`로 갈린다 — `/compact`는 임계 미달이어도 실행한다.
 */

import type { CliConfig } from "./config.ts";

/**
 * 압축이 소비하는 설정 — `CliConfig`에서 압축 관련 3키만 좁힌 것.
 *
 * `CompactionConfig`(COMPACTION.md §3)와 다른 타입인 것은 의도다. 저쪽은
 * `contextWindowTokens`·`summaryMaxTokens`까지 포함하는 compaction 패키지의 입력이고,
 * 그 두 값은 config 파일이 아니라 providers 어댑터와 구현 기본값에서 온다(§8).
 * 여기는 **설정 파일이 정하는 몫**만 담는다.
 */
export type CompactionSettings = Pick<
  CliConfig,
  "compactionAuto" | "compactionThreshold" | "compactionKeepRecentTurns"
>;

/**
 * 압축 발동 경로. `"manual"`은 임계 판정을 건너뛴다(COMPACTION.md §3).
 *
 * `"auto"`는 §7의 자동 중지 규칙(연속 2회 실패 또는 `not-possible` 시 그 프로세스에서
 * 자동 트리거 중지)의 적용 대상이기도 하다 — 수동은 언제나 시도할 수 있다.
 */
export type CompactTrigger = "manual" | "auto";

export interface CompactEnv {
  readonly settings: CompactionSettings;
  /** 압축은 침묵하지 않는다(COMPACTION.md §6) — 사실·결과·실패가 전부 이리로 나간다 */
  notify(text: string): void;
}

/**
 * 압축 1회를 수행한다 — **T-009에서 구현**.
 *
 * T-009가 채울 순서는 COMPACTION.md §6이 정해 놓았다: `shouldCompact` 판정(auto만)
 * → `planCompaction` → `generateSummary` → `store.branchSession` 한 트랜잭션 →
 * 구 Agent 폐기 후 새 Agent 생성 → 결과 표시(사실·before 토큰·유지 범위·새 세션 id).
 *
 * [미규정 E-41] 이 함수가 받을 나머지 주입물(store·현재 세션·`switchTo`·`ModelClient`·
 * `contextWindowTokens`·`AbortSignal`)의 형태는 T-009 소유다. T-008은 그것들을 미리
 * 짐작해 시그니처에 박지 않았다 — 지금 박으면 T-009가 계약이 아닌 짐작을 상속한다.
 * 지금 확정된 것은 **설정 3키가 여기로 흐른다**는 배선 하나뿐이다.
 */
export async function runCompaction(trigger: CompactTrigger, _env: CompactEnv): Promise<void> {
  // 스텁은 조용히 성공하지 않는다 — "압축했다고 믿는데 안 일어난 상태"가 정확히
  // ARCHITECTURE §2.6이 말하는 침묵 실패다. 디스패처가 잡아 표시한다(§5).
  throw new Error(
    `압축(${trigger})은 아직 배선되지 않았다 — T-009에서 구현한다. ` +
      "지금은 /new로 새 세션을 시작하면 컨텍스트가 비워진다.",
  );
}
