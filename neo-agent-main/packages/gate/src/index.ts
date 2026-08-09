/**
 * `@neo-agent/gate` 공개 배럴.
 *
 * 승인 게이트 — 계약 정본은 `docs/APPROVAL-GATE.md`.
 *
 * **이 게이트는 실수 방지 장치이지 보안 경계가 아니다. 유일한 경계는 OS다.**
 *
 * 게이트는 순수 판정 로직이다. 파일시스템(allowlist 영속화)·사용자 대화(프롬프트)·
 * 경로 실체 판정(classifier)은 전부 주입받으며, I/O성 내장 모듈을 임포트하지
 * 않는다 — 판정 모듈이 스스로 프로세스를 스폰하거나 네트워크에 나가는 경로를
 * 기계적으로 차단하는 것이 이 분리의 목적이다(의존성 예산 게이트가 검사).
 */

// §4 표시 위조 탐지. CLI는 `ApprovalRequest.display`를 그대로 쓰면 되고,
// 이 export는 표시 규칙 자체를 검증하는 쪽을 위한 것이다
export { analyzeDisplayText, type DisplayAnalysis, escapeInvisibles } from "./display.ts";
// §4 공개 인터페이스 — 배선 지점. `ApprovalGateHandle`은 호스트가 오염 추적
// 메서드(`noteToolResult`·`resetTaint`)를 배선할 때 참조한다
export { type ApprovalGateHandle, createApprovalGate } from "./hook.ts";
// §2 난독화 정규화 — deny 규칙 방언과 정규화 순서를 검증할 수 있게 연다
export {
  type ConfusableHit,
  compileGlob,
  MAX_ANALYSIS_CHARS,
  type NormalizationResult,
  normalizeForMatching,
} from "./normalize.ts";

// §2 계층 1·4의 목록. 정책을 문서화·감사하는 쪽에서 읽을 수 있게 연다
export {
  type GatePattern,
  HARDLINE_PATH_PATTERNS,
  HARDLINE_PATTERNS,
  hasShellOperator,
  RISK_PATTERNS,
  type RiskPattern,
} from "./patterns.ts";
// §2 파이프라인. 호스트 배선에는 `createApprovalGate` 하나면 되지만, 판정 계층을
// 그대로 관찰해야 하는 테스트·진단 도구를 위해 연다
export {
  evaluate,
  type FrozenGate,
  freezeGateConfig,
  type GateCallContext,
  type GateTaintState,
} from "./pipeline.ts";
// §3·§4 계약 타입
export type {
  AllowlistStore,
  ApprovalGateConfig,
  ApprovalMode,
  ApprovalPrompt,
  ApprovalRequest,
  ApprovalResponse,
  GateLayer,
  GateSubject,
  GateToolProfile,
  GateVerdict,
  PathClassifier,
  PathScope,
} from "./types.ts";
