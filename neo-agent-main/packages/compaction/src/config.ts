/**
 * 압축 설정 — `docs/COMPACTION.md` §3의 계약 타입.
 *
 * 기본값(threshold 0.75 · keepRecentTurns 2 · summaryMaxTokens 8192)의 소유자는
 * 호출자(CLI config, `docs/CLI-INTERFACE.md` §3)다 — 이 패키지의 함수는 채워진
 * 설정을 받기만 하고 기본값을 갖지 않는다.
 */

export interface CompactionConfig {
  /** 모델 컨텍스트 창. providers가 제공(COMPACTION §8) — CLI가 배선 시 채운다 */
  contextWindowTokens: number;
  /** 자동 압축 임계 비율. 기본 0.75 */
  threshold: number;
  /** 원문 유지할 최근 user 턴 수. 기본 2 */
  keepRecentTurns: number;
  /** 요약 응답의 maxTokens. 기본 8192 */
  summaryMaxTokens: number;
}
