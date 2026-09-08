/**
 * `@neo-agent/web` 공개 배럴.
 *
 * 웹 접근의 문 하나다 — SSRF 판정(`verifyUrl`), 피닝 연결(`fetchUrl`), 텍스트
 * 추출(`extractText`), 검색 전송·정규화(`searchTransport`·`normalizeSearchResponse`),
 * 그리고 모델이 쓰는 도구 둘(`createWebFetchTool`·`createWebSearchTool`). 계약 정본은
 * `docs/WEB-ACCESS.md`이며, 이 패키지는 `packages/tools`·`packages/gate`와 무의존이다.
 *
 * **소속 기준은 «모듈의 의도된 표면»이지 «현재 소비자 수»가 아니다**(`CLI-INTERFACE.md`
 * §1의 배럴 불릿). 지금 아무도 임포트하지 않아도 그 모듈이 무엇을 하는 곳인지 드러내는
 * 표면은 오른다 — 심볼마다 개별 판정하면 배럴이 테스트 편성에 따라 흔들린다.
 */

// §4 차단 대역
export { createBlockList } from "./blocklist.ts";

// §4 5~7단계 — 피닝 연결·홉 루프·유계
export {
  type FetchOptions,
  type FetchOutcome,
  fetchUrl,
  WEB_FETCH_MAX_BYTES,
  WEB_FETCH_MAX_REDIRECTS,
  WEB_FETCH_TIMEOUT_MS,
} from "./fetch.ts";

// §6 게이트 접점
export { WEB_TOOL_GATE_PROFILES, type WebToolGateProfile } from "./gate-profiles.ts";

// §3 HTML 텍스트 추출
export { extractText } from "./html.ts";

// §3.2 검색 응답 정규화·회계 — 0건 두 갈래를 닫힌 유니온으로 낸다
export {
  normalizeSearchResponse,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_MAX_SUMMARY_CHARS,
  type WebSearchAccounting,
  type WebSearchItem,
  type WebSearchNormalized,
} from "./search-normalize.ts";

// §3.2 검색 전송 — 고정 엔드포인트·유계·실패는 값
export {
  SEARCH_ENDPOINT,
  SEARCH_MAX_BYTES,
  SEARCH_TIMEOUT_MS,
  type SearchFailureKind,
  type SearchRequest,
  type SearchTransportOptions,
  type SearchTransportOutcome,
  searchTransport,
} from "./search-transport.ts";

// §4 1~4단계 — SSRF 판정
export { type UrlVerdict, type VerifyUrlDeps, verifyUrl } from "./verdict.ts";
// CLI-INTERFACE §2.3 — 온보딩의 검색 키 확인. 도구가 아니라 **확인 전용**이고,
// 여기 사는 이유는 엔드포인트 상수와 전송이 이 패키지에 있기 때문이다(WEB-ACCESS §3.2).
export {
  type SearchKeyVerdict,
  type VerifySearchKeyOptions,
  verifySearchKey,
} from "./verify-search-key.ts";

// §3·§5 도구
export {
  type CreateWebFetchToolOptions,
  createWebFetchTool,
  type WebFetchDetails,
} from "./web-fetch.ts";

// §3.2·§5 도구
export {
  type CreateWebSearchToolOptions,
  createWebSearchTool,
  type WebSearchDetails,
} from "./web-search.ts";
