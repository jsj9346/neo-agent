/**
 * 모델별 컨텍스트 창 — `docs/PROVIDERS.md` §3.
 *
 * 압축 판정(`shouldCompact`)은 `contextWindowTokens`를 필요로 하는데, 그 값이
 * **어느 모델이냐**에 달려 있으므로 어댑터가 소유한다. `ModelClient` 인터페이스에는
 * 넣지 않는다 — 코어는 컨텍스트 크기를 소비하지 않고(§8), `maxTokens`를 어댑터
 * 소유로 판정한 것(CORE-INTERFACE 구 O-2)과 같은 자리다. 소비자(CLI→compaction)가
 * composition root에서 이 구체 표면을 읽으면 충분하다.
 *
 * 이 파일은 데이터 테이블이다 — 임포트가 없어 예산 게이트에 영향이 없다.
 */

/**
 * 조회 결과. `known: false`면 테이블에 없는 모델이라 `tokens`가 추정값이며,
 * CLI가 기동 시 경고를 표시할 근거다(§8).
 */
export interface ContextWindowInfo {
  tokens: number;
  known: boolean;
}

/**
 * 미지 모델의 보수 기본값.
 *
 * 근거: 아래 테이블의 **최솟값과 같다**(Haiku 4.5의 200K). 현행 Anthropic 모델
 * 중 200K 미만은 없으므로, 모르는 모델이 실은 현행 모델 중 하나라면 이 값은
 * 과대추정이 아니다. 과대추정만이 위험한 방향이다 — 실제 창보다 크게 잡으면
 * 압축이 늦어져 프로바이더의 하드 한도에 먼저 부딪힌다(§2.3 안전한 기본값 위반).
 * 과소추정은 조기 압축(비용·맥락 손실)일 뿐이라 더 낮출 수도 있지만, 실재하지
 * 않는 모델을 위해 정상 사용을 상시 조기 압축시키는 쪽이 실질 피해가 크다.
 * threshold 기본값 0.75와 합치면 실효 트리거는 150K다.
 *
 * E-12 — **2026-08-06 승인.** `COMPACTION.md` §10이 "구현 시 확정"으로 남겼던
 * 미결이며 위 근거로 200_000이 채택됐다(§10 해소 표시, 판정 정본은
 * `plans/20260806-compaction-qa-report.md`). 열린 판정이 아니므로 미규정
 * 마커를 달지 않는다 — 닫힌 항목이 마커를 유지하면 진짜 열린 항목이 묻힌다.
 *
 * 아래 테이블의 창 값은 **2026-08-20에 아래 URL의 두 표(Latest · Legacy)와 전수 대조했다**
 * — 그 관측에서 불일치는 나오지 않았고, 대조가 뒤집은 것은 값이 아니라 값을 고른 근거
 * 문면이었다(아래 테이블 주석 · 처분 원장 `plans/20260820-product-K-013.md`).
 * **이 문장은 그날의 관측이지 오늘의 보증이 아니다** — 모델이 추가·개정되면 다시 대조해야
 * 하고, 그 재대조가 열린 항목으로 사는 자리는 `kanban.md`다(열린 것의 정본은 거기 하나다).
 */
export const FALLBACK_CONTEXT_WINDOW_TOKENS = 200_000;

/**
 * 기지 모델 테이블 — 어댑터 소유.
 *
 * 근거: Anthropic 공식 모델 문서의 컨텍스트 창(= Models API `max_input_tokens`)
 * — https://platform.claude.com/docs/en/about-claude/models/overview
 * 값은 **입력 컨텍스트 창**이며 최대 출력 토큰(`max_tokens`)이 아니다. 압축 판정이
 * 재는 것은 트랜스크립트가 차지하는 입력 쪽이다(§3 — usage의 input+cache+output 합).
 *
 * 여기 없는 모델은 의도적으로 비워 둔다 — 값을 지어 넣는 것보다 `known: false`로 경고를
 * 띄우는 쪽이 정직하다. 과대추정된 하드코딩은 조용히 하드 한도 충돌을 만든다. 기준은
 * **위 문서가 그 모델의 창을 어떤 형태로든 주는가**다: 두 표(Latest · Legacy)의 열이 주면
 * 그 값을 싣고, 열이 없어도 본문이 다른 모델과 같다고 명시하면 그것으로 싣는다
 * (`claude-mythos-5`가 그 형태다 — 표에 열이 없고 본문이 Fable 5와 specs가 같다고 든다).
 * 어느 쪽도 없으면 비운다 — `claude-opus-4-1`은 2026-08-20 관측에서 페이지 전체에 히트가
 * 없었다. 창 값이 없는 것이 아니라 모델 자체가 없으므로 넣을 근거가 성립하지 않는다.
 *
 * **2026-08-06부터 이 자리는 «위 문서가 구세대 모델의 컨텍스트 창을 명시하지 않는다»고
 * 적고 있었고, 그것은 거짓이었다.** 같은 커밋의 아래 테이블이 그 문서가 `Legacy models`로
 * 분류한 모델들에 값을 주고 있었으므로 페이지를 열지 않아도 성립할 수 없는 문면이었다.
 * 2026-08-20 대조로 정정했고, 그때 `claude-opus-4-5`·`claude-sonnet-4-5`가 테이블에
 * 들어왔다 — 둘 다 그 `Legacy models` 표가 200k로 명시한다.
 *
 * 키는 별칭(별도 날짜 접미사 없는 정본 id). 날짜 스냅샷 id는 조회 시 접미사를
 * 떼어 같은 항목으로 맞춘다(아래).
 */
const CONTEXT_WINDOW_BY_MODEL: ReadonlyMap<string, number> = new Map([
  // 1M 컨텍스트 세대
  ["claude-fable-5", 1_000_000],
  ["claude-mythos-5", 1_000_000], // Project Glasswing 참여 조직 전용
  ["claude-opus-5", 1_000_000],
  ["claude-opus-4-8", 1_000_000],
  ["claude-opus-4-7", 1_000_000],
  ["claude-opus-4-6", 1_000_000],
  ["claude-sonnet-5", 1_000_000],
  ["claude-sonnet-4-6", 1_000_000],
  // 200K — 이 테이블의 최솟값이자 `FALLBACK_CONTEXT_WINDOW_TOKENS`의 근거다.
  // 「현행 모델 중 최소」로 읽지 않는다: 현행 세대(Haiku 4.5)와 위 문서가 `Legacy models`로
  // 분류한 둘이 같은 값을 갖는 묶음이라, 세대를 기준으로 서술하면 구성이 바뀔 때 낡는다.
  ["claude-opus-4-5", 200_000],
  ["claude-sonnet-4-5", 200_000],
  ["claude-haiku-4-5", 200_000],
]);

/** 날짜 스냅샷 접미사(`-20251001`) — 별칭과 같은 모델이므로 조회 시 떼어 낸다 */
const DATE_SNAPSHOT_SUFFIX = /-\d{8}$/;

/**
 * 모델 id로 컨텍스트 창을 조회한다. 미지 모델은 보수 기본값 + `known: false`.
 *
 * 조회는 두 단계다: 정확 일치 → 날짜 스냅샷 접미사를 뗀 뒤 재시도. 후자가 있는
 * 이유는 CLI 기본값이 날짜형 id(`claude-haiku-4-5-20251001`)이기 때문이다 —
 * 별칭과 같은 모델을 미지로 판정해 헛경고를 띄우지 않는다. 접두 일치(startsWith)는
 * 채택하지 않았다: 서로 접두 관계인 id가 생기면 오탐이 조용히 섞인다.
 *
 * 입력은 공백 제거 후 소문자화해 조회한다. Anthropic의 모델 id는 소문자뿐이라
 * 정보 손실이 없고, 설정 파일 오타(대문자·앞뒤 공백)로 헛경고가 나지 않는다.
 */
export function contextWindowForModel(model: string): ContextWindowInfo {
  const normalized = model.trim().toLowerCase();

  const exact = CONTEXT_WINDOW_BY_MODEL.get(normalized);
  if (exact !== undefined) return { tokens: exact, known: true };

  const withoutSnapshot = normalized.replace(DATE_SNAPSHOT_SUFFIX, "");
  const aliased = CONTEXT_WINDOW_BY_MODEL.get(withoutSnapshot);
  if (aliased !== undefined) return { tokens: aliased, known: true };

  return { tokens: FALLBACK_CONTEXT_WINDOW_TOKENS, known: false };
}
