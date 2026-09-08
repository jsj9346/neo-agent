/**
 * `@neo-agent/providers` 공개 배럴.
 *
 * 코어의 `ModelClient` 교체 지점(`docs/CORE-INTERFACE.md` §8)에 꽂히는 어댑터들이
 * 여기 산다. 어댑터는 **공식 SDK + 공식 엔드포인트 + API 키**로만 모델에 접근하고
 * 신원을 `neo-agent/<version>`으로 정직하게 밝힌다(ARCHITECTURE §2.2).
 *
 * 어댑터는 크리덴셜을 스스로 읽지 않는다 — API 키는 파라미터로만 받는다
 * (`SAFE-DEFAULTS.md` §3). 파일·DB·프로세스 스폰 임포트는 의존성 예산 게이트가 막는다.
 */

export {
  type AnthropicClientConfig,
  AnthropicModelClient,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_TOKENS,
} from "./anthropic/client.ts";
// PROVIDERS §3 — 모델 컨텍스트 창. `ModelClient` 계약은 불변이고, 이것은
// 어댑터의 구체 표면이다(코어는 컨텍스트 크기를 소비하지 않는다).
export {
  type ContextWindowInfo,
  contextWindowForModel,
  FALLBACK_CONTEXT_WINDOW_TOKENS,
} from "./anthropic/context-window.ts";
export { ConversionError, toAnthropicMessages, toAnthropicTools } from "./anthropic/convert.ts";
export { anthropicProvider, NEO_AGENT_USER_AGENT } from "./anthropic/registration.ts";
// CLI-INTERFACE §2.3 — 온보딩의 모델 키 확인. 어댑터가 아니라 **확인 전용**이고,
// 여기 사는 이유는 SDK 접근이 이 패키지에만 있기 때문이다(PROVIDERS §2.2).
export {
  type ModelKeyVerdict,
  type VerifyModelKeyOptions,
  verifyModelKey,
} from "./anthropic/verify.ts";
