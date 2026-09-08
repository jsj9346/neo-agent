/**
 * 온보딩의 모델 키 확인 — `docs/CLI-INTERFACE.md` §2.3 「키 확인」.
 *
 * **왜 이 패키지인가**: SDK 접근이 이 패키지에만 있고, `PROVIDERS.md` §2.2가
 * *"API 키는 파라미터로만 받는다"*로 그 경계를 정한다. 확인 함수를 CLI에 두면 CLI가
 * SDK를 직접 들어 그 계약이 무너진다 — §2.3이 그것을 계약으로 든다.
 *
 * **왜 이 호출인가**: 모델 메타데이터 조회는 **토큰 과금이 없고**, 키의 유효성과 모델
 * 이름의 실재를 **한 번에** 잰다. §2.3이 묻는 순서를 «모델 → 모델 키»로 계약한 것이
 * 이 호출을 1회로 닫기 위해서다 — 사용자가 고른 모델로 재야 «실제로 쓸 구성»이 확인된다.
 *
 * **프롬프트 캐시와 무관하다**(§2.3). 이 호출은 메시지 엔드포인트가 아니고 시스템
 * 프롬프트를 싣지 않는다 — `ARCHITECTURE.md` §2.4와 `CORE-INTERFACE.md` 불변 조건 6이
 * 재는 바이트를 만들지도 보내지도 않는다.
 *
 * **의존성 예산이 늘지 않는다** — 이 패키지가 이미 든 SDK를 쓴다(`PROVIDERS.md` §2.1).
 */

import Anthropic from "@anthropic-ai/sdk";
import { NEO_AGENT_USER_AGENT } from "./registration.ts";

/**
 * 확인의 결과. **원인을 가르는 것은 문면과 되묻기 «대상»을 위해서이지 처분을 가르기
 * 위해서가 아니다** — §2.3이 *"되묻기는 원인으로 갈래를 늘리지 않는다"*로 계약한다.
 *
 * `unverifiable`이 넷째 갈래인 이유: 네트워크 실패·타임아웃·5xx를 «키가 틀렸다»로 접으면
 * 문면이 거짓이 되고 사용자가 고칠 수 없는 것을 고치려 든다(`ARCHITECTURE.md` §2.6).
 */
export type ModelKeyVerdict =
  | { readonly kind: "ok" }
  /** 키가 거부됐다 — 되묻는 대상은 키 단계 */
  | { readonly kind: "invalid-key"; readonly cause: string }
  /** 키는 통했는데 그 모델을 못 찾았다 — 되묻는 대상은 모델 단계 */
  | { readonly kind: "unknown-model"; readonly cause: string }
  /** 확인 자체가 못 끝났다. 처분은 `invalid-key`와 같고 문면만 갈린다 */
  | { readonly kind: "unverifiable"; readonly cause: string };

export interface VerifyModelKeyOptions {
  readonly apiKey: string;
  readonly model: string;
  /** 시간 상한. 미지정이면 SDK 기본값 — 값의 정본은 아직 없다(`CLI-INTERFACE.md` §12) */
  readonly timeoutMs?: number;
  /** 테스트 전용 주입. 프로덕션은 SDK 기본 fetch(`PROVIDERS.md` §2.2와 같은 방향) */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * 키와 모델을 함께 확인한다. **던지지 않는다** — 실패는 전부 판별 유니온으로 나온다.
 *
 * 던지지 않는 것이 계약인 이유는 `client.ts`의 `stream()`과 같다: 호출자(온보딩 엔진)가
 * 되묻기 루프를 돌리는데, 던지면 그 루프가 try/catch로 갈래를 다시 만들어야 하고 그
 * 순간 «처분은 하나»라는 §2.3의 계약이 배선 쪽에서 갈린다.
 */
export async function verifyModelKey(options: VerifyModelKeyOptions): Promise<ModelKeyVerdict> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    // 재시도를 끈다. 되묻기가 사용자 손에 있으므로 SDK가 뒤에서 더 기다리면 화면이
    // 그만큼 오래 멈춰 있고, 그것이 §2.6이 금한 «답 없는 화면»이다.
    maxRetries: 0,
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    defaultHeaders: { "user-agent": NEO_AGENT_USER_AGENT },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  try {
    await client.models.retrieve(options.model);
    return { kind: "ok" };
  } catch (error) {
    return classify(error);
  }
}

/**
 * 실패를 세 갈래로 나눈다. **상태 코드가 아는 것만 단정하고 나머지는 `unverifiable`이다** —
 * 모르는 것을 «키가 틀렸다»로 접는 것이 이 함수가 피하는 전부다.
 */
function classify(error: unknown): ModelKeyVerdict {
  const status = (error as { status?: unknown }).status;
  const cause = messageOf(error);

  if (status === 401 || status === 403) return { kind: "invalid-key", cause };
  if (status === 404) return { kind: "unknown-model", cause };
  return { kind: "unverifiable", cause };
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return String(error);
}
