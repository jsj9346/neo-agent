/**
 * `@neo-agent/web` 공개 배럴.
 *
 * 웹 접근의 문 하나다 — SSRF 판정(`verifyUrl`), 피닝 연결(`fetchUrl`), 텍스트
 * 추출(`extractText`), 그리고 모델이 쓰는 도구(`createWebFetchTool`). 계약 정본은
 * `docs/WEB-ACCESS.md`이며, 이 패키지는 `packages/tools`·`packages/gate`와 무의존이다.
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

// §4 1~4단계 — SSRF 판정
export { type UrlVerdict, type VerifyUrlDeps, verifyUrl } from "./verdict.ts";

// §3·§5 도구
export {
  type CreateWebFetchToolOptions,
  createWebFetchTool,
  type WebFetchDetails,
} from "./web-fetch.ts";
