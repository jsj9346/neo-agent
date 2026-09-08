/**
 * `OnboardingVerifier`의 기본 구현 — `docs/CLI-INTERFACE.md` §2.3 「키 확인」.
 *
 * **이 파일은 얇은 어댑터다. 판정을 새로 쓰지 않는다.** 판정의 정본은 두 확인 함수이고
 * (`packages/providers`의 `verifyModelKey`, `packages/web`의 `verifySearchKey`), 여기서
 * 하는 일은 그것들의 판별 유니온을 `VerificationResult`로 **접는 것** 하나뿐이다.
 * 상태 코드를 다시 읽거나 실패를 다시 분류하는 코드가 이 파일에 생기면, 그 순간
 * §2.3이 한 곳에 몬 판정이 둘이 된다.
 *
 * **왜 확인 함수가 CLI에 없는가**(§2.3이 계약으로 든다): 여기 두면 CLI가 모델 SDK를 직접
 * 들어 `PROVIDERS.md` §2.2의 «어댑터가 유일한 입구»가 무너지고, 검색 쪽은 엔드포인트
 * 상수가 둘이 되어 §4가 SSRF 판정을 면제한 근거(*"엔드포인트가 상수"*)를 두 번째 자리에서
 * 다시 세워야 한다. **그래서 이 파일이 부르는 것은 워크스페이스 형제 배럴 둘뿐이고,
 * 모델 SDK도 검색 엔드포인트 상수도 임포트하지 않는다.**
 *
 * 그 부재는 게이트가 잰다 — `packages/cli/src` 전역에 그 둘의 이름이 0건이어야 한다.
 * **그래서 이 주석도 그 이름들을 리터럴로 쓰지 않는다**: 산문이 가드를 히트시키면 가드가
 * «임포트한다»와 «언급한다»를 구별하지 못하게 되고, 그 순간 검사가 아무것도 못 잡는다.
 *
 * **의존성 예산이 늘지 않는다** — 두 배럴 다 `packages/cli`가 이미 든 형제다(§1).
 *
 * **주입점을 새로 열지 않는다** — 이것은 `CliDeps`·`WiringFactories`에 오르지 않는다.
 * 조립이 필요할 때 부르면 되는 기본 구현이고, 테스트가 필요로 하는 주입은 이미
 * 두 확인 함수 각자의 자리에 있다(`fetch` · `request`).
 */

import { type ModelKeyVerdict, verifyModelKey } from "@neo-agent/providers";
import { type SearchKeyVerdict, verifySearchKey } from "@neo-agent/web";
import type { OnboardingVerifier, VerificationResult } from "./onboarding.ts";

/**
 * 두 판별 유니온의 공통 접기. **기계적이다** — `ok`는 그대로, 나머지는 전부 «되묻는다»로
 * 접히고 `kind`·`cause`가 그대로 실린다.
 *
 * **갈래를 여기서 늘리거나 줄이지 않는다**(§2.3 *"되묻기는 원인으로 갈래를 늘리지 않는다"*).
 * `step`을 안 싣는 것도 계약이다 — 되묻는 **대상 단계**는 엔진이 고른다.
 *
 * 두 유니온을 한 함수로 받는 것이 성립하는 이유는 실패 갈래의 모양이 같아서다
 * (`{ kind, cause }`). `SearchKeyVerdict`에 `unknown-model`이 없는 것은 그대로 유지된다 —
 * 이 함수는 없는 갈래를 만들어 내지 않는다.
 */
function fold(verdict: ModelKeyVerdict | SearchKeyVerdict): VerificationResult {
  return verdict.kind === "ok"
    ? { kind: "ok" }
    : { kind: "rejected", rejection: { kind: verdict.kind, cause: verdict.cause } };
}

/**
 * 온보딩이 쓰는 확인 구현을 만든다.
 *
 * **시간 상한을 이 자리가 정하지 않는다 — `[추정]`.** `CLI-INTERFACE.md` §12의
 * 「온보딩 확인 호출의 시간 상한」이 아직 열려 있고, 그 항이 *"이 문서가 수를 지지 않는다"*를
 * 명시한다. 그래서 **각자 기본값을 그대로 둔다**:
 *
 * - 모델 — `timeoutMs`를 **넘기지 않는다** → SDK 기본값.
 * - 검색 — 아무것도 안 넘기면 전송이 자기 `SEARCH_TIMEOUT_MS`를 그대로 건다.
 *
 * **오늘 두 값이 다르고, 그것이 §12가 등재한 미결 그대로다.** 맞출 것인가 각자 둘 것인가가
 * 정해지기 전에 이 파일이 수를 쓰면, 그 수가 정본 없는 세 번째 자리가 된다.
 */
export function createOnboardingVerifier(): OnboardingVerifier {
  return {
    modelKey: async (apiKey, model) => fold(await verifyModelKey({ apiKey, model })),
    searchKey: async (apiKey) => fold(await verifySearchKey({ apiKey })),
  };
}
