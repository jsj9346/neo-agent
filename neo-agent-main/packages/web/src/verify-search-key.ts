/**
 * 온보딩의 검색 키 확인 — `docs/CLI-INTERFACE.md` §2.3 「키 확인」.
 *
 * **왜 이 패키지인가**: 검색 엔드포인트 상수와 전송이 여기 있다(`WEB-ACCESS.md` §3.2).
 * CLI에 다시 짜면 엔드포인트 상수가 둘이 되고, §4가 SSRF 판정을 면제한 근거
 * (*"엔드포인트가 상수라 모델이 호스트를 고를 수 없다"*)가 그 두 번째 자리에서
 * 다시 세워져야 한다. **새 네트워크 경로를 만들지 않는 것이 이 자리 선택의 전부다.**
 *
 * **게이트를 지나지 않는다**(§2.3). 승인 게이트의 모집단은 **모델이 부르는 도구**이고
 * (`APPROVAL-GATE.md` §4), 이것은 사용자가 방금 준 값을 그 값의 발급처에 대고 재는 것이다.
 *
 * **의존성 예산이 늘지 않는다** — 이 패키지가 이미 든 전송을 쓴다(core + zod 그대로).
 */

import { type SearchTransportOptions, searchTransport } from "./search-transport.ts";

/**
 * 확인 질의. **고정 상수다** — 사용자 입력도 모델 입력도 이 자리에 오지 않는다.
 *
 * 짧고 무해한 낱말 하나인 이유는 `WEB-ACCESS.md` §7의 비용 상한이다: 확인은 무료 한도
 * 안에서 끝나야 하고, 질의가 길어질 이유가 없다 — 재는 것은 **키가 받아들여지는가**이지
 * 결과의 내용이 아니다.
 */
const PROBE_QUERY = "neo-agent onboarding key check";

/**
 * 확인의 결과.
 *
 * **`invalid-key`와 `unverifiable`을 가르는 것은 문면 때문이다** — 처분은 §2.3대로 하나다
 * (다시 묻되 건너뛸 수 있다). 네트워크 실패를 «키가 틀렸다»로 접으면 사용자가 고칠 수
 * 없는 것을 고치려 든다(`ARCHITECTURE.md` §2.6).
 */
export type SearchKeyVerdict =
  | { readonly kind: "ok" }
  | { readonly kind: "invalid-key"; readonly cause: string }
  | { readonly kind: "unverifiable"; readonly cause: string };

export interface VerifySearchKeyOptions {
  readonly apiKey: string;
  /** 테스트 전용 주입. `searchTransport`의 그 자리와 같은 규율이다(§4 셋째 주입점) */
  readonly request?: SearchTransportOptions["request"];
  readonly signal?: AbortSignal;
}

/**
 * 검색 키를 한 번 확인한다. **던지지 않는다** — 전송이 이미 판별 유니온을 돌려주므로
 * 이 함수가 하는 일은 그 다섯 갈래를 온보딩의 둘로 접는 것뿐이다.
 */
export async function verifySearchKey(options: VerifySearchKeyOptions): Promise<SearchKeyVerdict> {
  const outcome = await searchTransport(
    { query: PROBE_QUERY, apiKey: options.apiKey },
    {
      ...(options.request === undefined ? {} : { request: options.request }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );

  if (outcome.ok) return { kind: "ok" };

  // `unauthorized`만 키의 문제다. 나머지 넷(rateLimited·providerError·malformedResponse·
  // transport)은 전부 «지금 확인할 수 없다»이고, 그것을 키 탓으로 접지 않는다.
  return outcome.kind === "unauthorized"
    ? { kind: "invalid-key", cause: outcome.reason }
    : { kind: "unverifiable", cause: outcome.reason };
}
