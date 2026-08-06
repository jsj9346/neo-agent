/**
 * 프로바이더 등록 계약 — `docs/CORE-INTERFACE.md` §8 컴플라이언스 게이트.
 *
 * 어댑터 구현 자체는 코어 밖(`packages/providers` 예정)이지만, **등록 계약은
 * 코어에 둔다.** 여기가 컴파일 타임 게이트이기 때문이다.
 *
 * OpenClaw는 근거를 4종(`vendor-documented | vendor-hidden-api-spec |
 * vendor-sdk-hook-only | internal-runtime`)으로 분류만 하고 강제하지 않아
 * 위반 경로가 살아남았다. 우리는 합법 종류 하나만 타입으로 존재시킨다 —
 * 다른 근거로 프로바이더를 등록하는 코드는 **작성 자체가 컴파일되지 않는다.**
 * 새 종류를 추가하려면 이 파일을 고쳐야 하고, 그 diff가 곧 컴플라이언스
 * 리뷰 지점이다.
 */

import type { ModelClient } from "./model.ts";

/** 유일한 합법 증거 종류 */
export interface ProviderEvidence {
  kind: "vendor-documented";
  /** 공식 문서 URL — 코드 리뷰에서 실링크를 검증한다 */
  url: string;
}

export interface ProviderRegistration {
  id: string;
  evidence: ProviderEvidence;
  /**
   * 정직한 신원. 템플릿 리터럴 타입으로 접두를 강제하므로 타 제품을 사칭하는
   * User-Agent는 컴파일되지 않는다(CLAUDE.md 컴플라이언스 경계).
   */
  userAgent: `neo-agent/${string}`;
  createClient(config: { apiKey: string; model: string }): ModelClient;
}
