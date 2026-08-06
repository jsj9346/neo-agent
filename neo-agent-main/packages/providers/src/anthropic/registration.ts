/**
 * Anthropic 프로바이더 등록 — 컴플라이언스 게이트의 실제 통과 지점.
 *
 * `ProviderRegistration`(코어 §8)은 `evidence.kind`가 `"vendor-documented"` 리터럴
 * 하나뿐인 유니온이고 `userAgent`는 `` `neo-agent/${string}` `` 템플릿 리터럴 타입이다.
 * 즉 **비공식 인증 경로나 타 제품 사칭 UA는 타입이 존재하지 않아 컴파일되지 않는다**
 * (ARCHITECTURE §2.2). OpenClaw는 같은 분류를 갖고도 강제하지 않아 위반 경로가
 * 남았다 — 우리는 분류가 아니라 게이트로 쓴다.
 *
 * 이 파일에 다른 종류의 인증 경로를 추가하려면 코어의 타입을 먼저 고쳐야 하고,
 * 그 diff가 곧 컴플라이언스 리뷰 지점이다.
 */

import type { ModelClient, ProviderRegistration } from "@neo-agent/core";
import { AnthropicModelClient } from "./client.ts";

/** 어댑터가 신고하는 신원. 이 문자열 그대로 User-Agent 헤더로 나간다 */
export const NEO_AGENT_USER_AGENT = "neo-agent/0.1.0" as const;

/**
 * 인증 방식의 근거 — Anthropic 공식 API 문서.
 *
 * 공식 엔드포인트 + `x-api-key` 헤더 API 키 인증이며, 소비자 구독 OAuth 토큰이나
 * 다른 클라이언트의 client_id를 재사용하는 경로는 쓰지 않는다.
 */
const EVIDENCE_URL = "https://docs.anthropic.com/en/api/overview";

export const anthropicProvider: ProviderRegistration = {
  id: "anthropic",
  evidence: { kind: "vendor-documented", url: EVIDENCE_URL },
  userAgent: NEO_AGENT_USER_AGENT,
  createClient(config: { apiKey: string; model: string }): ModelClient {
    return new AnthropicModelClient({
      apiKey: config.apiKey,
      model: config.model,
      userAgent: NEO_AGENT_USER_AGENT,
    });
  },
};
