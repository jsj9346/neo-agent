/**
 * 검색 전송 계층 — `docs/WEB-ACCESS.md` §3.2 · §4 「설정 표면과 주입점을 구분한다」 · §8.
 *
 * `web_fetch`의 전송(`fetch.ts`)과 **한 줄도 공유하지 않는다.** 그쪽 계약이
 * *"쿠키·인증 헤더·리퍼러를 보내지 않는다"*(§3.1)인데 검색은 API 키 헤더가 있어야
 * 돌기 때문이다 — 도구 하나를 위해 다른 도구의 방어를 무르는 것이 §3.2가 금지한
 * 방향이고, 그래서 임포트 자체가 없다. §3.2의 계약 축 ①이 그것을 소스 텍스트로 잰다.
 *
 * **§4(SSRF 판정)가 이 경로에서 안 도는 것은 면제가 아니라 대상의 부재다.** §4가
 * 방어하는 것은 «모델이 준 호스트로 연결이 간다»는 상황인데, 여기서 연결처는 아래
 * 모듈 상수 하나이고 **함수 시그니처에 URL 인자가 없다** — 모델도 호스트도 그것을
 * 고를 방법이 구조적으로 없다. 이 근거는 그 상수 하나에 통째로 걸려 있고, 상수가
 * 설정·인자·응답 중 어느 것으로든 가변이 되는 날 이 문단은 그 자리에서 거짓이 된다
 * (§8 재도입 트리거).
 *
 * 실패는 값이다(`{ ok: false, kind, reason }`). throw 번역은 도구의 몫이다(§9 A-14).
 * **`kind`가 닫힌 유니온인 것이 §3.2의 «한도 초과와 인증 실패를 구분해 이름 부른다»를
 * 타입 수준에서 진다** — 도구가 이름을 짓되, 지을 이름의 목록은 여기서 결정된다.
 */

import { type RequestOptions, request } from "node:https";
// 결과 수 상한 하나만 읽는다. 정규화는 아무것도 임포트하지 않는 순수 모듈이라 순환이 없다.
import { WEB_SEARCH_MAX_RESULTS } from "./search-normalize.ts";

/**
 * 검색 API 엔드포인트. **어떤 인자도 이 값을 바꾸지 못한다**(§3.2 「엔드포인트는
 * 상수다」). 값의 출처는 `plans/20260902-tavily-api-contract.md` §1(공식 OpenAPI 스펙
 * 실독)이고, 프로바이더 확정 근거는 `docs/WEB-ACCESS.md` §7이다.
 */
export const SEARCH_ENDPOINT = "https://api.tavily.com/search";

/** 상수를 매 호출 다시 파싱하지 않는다. 이 객체도 모듈 밖으로 새지 않는다. */
/**
 * 전송 대상은 **호출마다 새로 짓는다.** 모듈 수준에 `URL` 하나를 두고 그것을 심에 넘기면
 * `WEB-ACCESS.md` §4의 「주입이 상수를 바꾸지 못한다」가 깨진다 — `URL`은 가변이라 심이
 * `url.host = …` 한 줄로 **그 뒤 모든 호출의 전송 대상**을 영구히 바꾼다(2026-09-02 T-009
 * 독립 검증이 실물로 잡았다). §9 A-16이 프로필 테이블을 `Object.freeze`로 동결한 것과 같은
 * 자리이고, 여기서는 동결 대신 **내주지 않는 것**이 수단이다(§9 A-3 — 가변 객체를 밖으로
 * 내주지 않는다). 상수는 문자열로 남고, 새 객체는 그 문자열에서만 나온다.
 */
function endpointUrl(): URL {
  return new URL(SEARCH_ENDPOINT);
}

/**
 * 기준선 수치 — `docs/WEB-ACCESS.md` §8(2026-09-01 실측 확정, 24건 표본).
 *
 * - **128KB** — raw JSON 기준. 관측 max 26.9KB의 약 4.8배 여유다. §3.1의 4MB를 그대로
 *   쓰지 않는 이유는 검색 응답이 페이지 본문이 아니라 JSON이기 때문이고, 상한이 넓으면
 *   프로바이더가 무엇을 보내든 우리가 받아 버린다.
 * - **10초** — 관측 max 2.94초에 §3.1과 같은 배율(3.4배)을 적용했다.
 *
 * 계약은 *"유계 + 상수 + 잘림 가시화"*이고 값은 조정 가능하다(§8).
 *
 * **결과 수 상한(5건)은 여기 없다.** 같은 계약값이 요청에도 실리고 응답도 자르는데
 * (§3.2 「결과 수는 상수로 유계다」), 그것을 두 리터럴로 두면 한쪽만 바뀌는 날 요청과
 * 절단이 조용히 갈린다 — 그때 «상수 상한으로 몇 건이 빠졌나»라는 회계가 우리가 요청한
 * 적 없는 수를 근거로 서게 된다. 정본은 절단이 실제로 일어나는 `search-normalize.ts`의
 * `WEB_SEARCH_MAX_RESULTS`이고, 이 파일은 그것을 읽어 요청에 싣는다.
 */
export const SEARCH_MAX_BYTES = 128 * 1024;
export const SEARCH_TIMEOUT_MS = 10_000;

/**
 * 요청 신원은 정직하다(§3.2). 다른 제품을 사칭하는 UA·헤더·문자열 치환을 넣지 않는다
 * (`ARCHITECTURE.md` §2.2).
 *
 * 버전을 `package.json`에서 읽지 않는 이유는 `node:fs`가 이 패키지에서 금지이기
 * 때문이며(§2), 그래서 이 값은 `fetch.ts`의 같은 상수와 **손으로 맞춘다**. 둘이 갈려도
 * 오늘은 아무것도 붉어지지 않으므로 두 리터럴을 대조하는 축이 따로 선다.
 */
const VERSION = "0.1.0";
const USER_AGENT = `neo-agent/${VERSION}`;

/**
 * 요청 인자. **URL이 없다** — 위 상수 계약이 시그니처 수준에서 사는 자리다.
 *
 * 두 문자열을 객체로 받는 이유는 위치 인자면 호출자가 순서를 바꿔 **API 키를 검색
 * 질의로 보낼 수 있기** 때문이다. 그 실수는 타입 검사를 통과하고, 결과는 크리덴셜이
 * 프로바이더의 질의 로그로 나가는 것이다 — 이름 있는 필드로 그 상태를 표현 불가능하게
 * 만든다.
 */
export interface SearchRequest {
  /** 모델이 지은 검색 질의. 400자 상한은 도구 스키마가 전송 **전에** 건다(§3.2). */
  readonly query: string;
  /** 호스트(CLI)가 배선한 검색 API 키. 이 값은 사유 문자열 어디에도 실리지 않는다. */
  readonly apiKey: string;
}

export interface SearchTransportOptions {
  /**
   * §4가 허용한 세 번째 주입점. 기본값은 **실제 `node:https`의 `request`**이고,
   * 호스트(CLI)는 프로덕션에서 채우지 않는다 — `AnthropicClientConfig.fetch`·
   * §4 판정 주입점(`verify`)과 같은 규율이다.
   *
   * **주입이 상수를 바꾸지 못한다**: 위 `SearchRequest`에 URL이 없으므로 심을 채워도
   * 요청 대상은 여전히 모듈 상수이고, 심이 하는 일은 «무엇을 요청했나»의 관측뿐이다.
   * **모델은 닿을 수 없다** — 도구 파라미터가 `z.strictObject({ query })`라 여기로
   * 오는 경로가 타입 수준에서 없다(§4).
   */
  request?: typeof request;
  /** 호출자(도구)의 취소 신호. 주입점이 아니라 운영 인자다 — `fetch.ts`와 같은 자리. */
  signal?: AbortSignal;
}

/**
 * 실패의 종류. **닫힌 유니온이다** — 새 실패 양태는 여기 이름을 얻어야 하고, 그래서
 * 「그 밖의 오류」로 조용히 흡수되는 경로가 없다(`ARCHITECTURE.md` §2.6).
 *
 * - `unauthorized` — 사용자가 키를 고쳐야 한다. 기다려도 안 풀린다.
 * - `rateLimited` — 기다리면 풀린다.
 * - `providerError` — 프로바이더 쪽 사정. 우리가 할 것이 없다.
 * - `malformedResponse` — 2xx인데 JSON이 아니다.
 * - `transport` — 연결 실패·시간 초과·크기 초과·취소.
 */
export type SearchFailureKind =
  | "unauthorized"
  | "rateLimited"
  | "providerError"
  | "malformedResponse"
  | "transport";

export type SearchTransportOutcome =
  | {
      ok: true;
      /**
       * 파싱된 응답 JSON. **`unknown`이다** — 프로바이더가 준 모양을 여기서 단정하지
       * 않는다. 형태 검증과 정규화는 다음 층의 계약이다.
       */
      json: unknown;
    }
  | { ok: false; kind: SearchFailureKind; reason: string };

/**
 * 상태 코드를 사유의 종류로 옮긴다.
 *
 * **한도 초과는 코드 하나가 아니라 셋이다** — 429(레이트) · 432(플랜·키 사용량) ·
 * 433(종량제 지출). 429만 보고 분기하면 나머지 둘이 「그 밖의 오류」로 떨어지고, 그때
 * 모델은 *"기다리면 풀린다"*를 듣지 못한다. 432·433은 IANA 미등록 확장이라 클래스가
 * 아니라 **숫자로 직접** 분기한다. 출처는 `plans/20260902-tavily-api-contract.md` §2.
 */
function classifyStatus(status: number): SearchFailureKind {
  if (status === 401) return "unauthorized";
  if (status === 429 || status === 432 || status === 433) return "rateLimited";
  return "providerError";
}

/**
 * 요청 본문에 싣는 상수들.
 *
 * **`include_raw_content`를 켜지 않는다.** 켜면 §3.2의 *"본문을 돌려주지 않는다"*와
 * 정면으로 충돌한다 — 그 계약의 존재 근거가 «판정하지 않은 URL의 본문이 §4·§5·§6을
 * 건너뛰고 들어오는 경로를 만들지 않는다»이기 때문이다. 프로바이더 기본값이 꺼짐이라
 * 생략해도 같지만, 기본값에 기대면 그 기본값이 바뀌는 날 계약이 조용히 깨진다.
 *
 * `include_answer`도 같은 이유로 끈다 — 프로바이더가 지은 답변 문장은 우리가 정한
 * 반환 범위(제목·URL·요약) 밖이다.
 *
 * 나머지 파라미터(`search_depth`·`topic`·`country`·`language`·필터류)는 **싣지 않는다.**
 * 도구 표면으로 열지 않기로 한 것들이고(§3.2 「파라미터는 `query` 하나다」), 상수로
 * 미리 고르는 것도 실측 없이 내리는 판단이다. 프로바이더 기본값을 받는다.
 */
const REQUEST_CONSTANTS = Object.freeze({
  max_results: WEB_SEARCH_MAX_RESULTS,
  include_answer: false,
  include_raw_content: false,
});

/**
 * 검색 API를 한 번 호출한다.
 *
 * 지키는 것:
 * - **리다이렉트를 따르지 않는다.** `node:https`가 자동 추종하지 않으므로 이것은
 *   「안 짜는 것」이다 — 고정 엔드포인트에 대한 추종은 곧 «상수가 아닌 주소로 연결한다»다.
 * - **2xx가 아니면 거부한다 — 3xx도 거부다.** §3.1은 리다이렉트를 따르므로 3xx를
 *   따로 다루지만, 여기서는 따르지 않기로 한 이상 3xx는 실패다.
 * - **TLS 기본값을 그대로 쓴다.** 종단의 신원은 TLS가 지고, 이 경로는 이 코드베이스에서
 *   유일하게 크리덴셜을 나르는 전송이다(§3.2 2026-09-02 확정).
 * - **잘린 응답을 부분 파싱하지 않는다.** 상한 초과는 성공이 아니라 실패이며, 성공
 *   갈래의 반환 타입에 `truncated` 같은 필드가 아예 없다 — 없으면 부분 결과를 결과인
 *   척 돌려줄 방법이 없다.
 */
export function searchTransport(
  input: SearchRequest,
  options: SearchTransportOptions = {},
): Promise<SearchTransportOutcome> {
  const requestImpl = options.request ?? request;

  return new Promise<SearchTransportOutcome>((resolve) => {
    if (options.signal?.aborted === true) {
      resolve({ ok: false, kind: "transport", reason: "Aborted before the search request." });
      return;
    }

    const payload = Buffer.from(
      JSON.stringify({ ...REQUEST_CONSTANTS, query: input.query }),
      "utf8",
    );

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: SearchTransportOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(outcome);
    };

    const requestOptions: RequestOptions = {
      method: "POST",
      headers: {
        // 인증 헤더. 이 값은 로그·사유 문자열 어디에도 다시 나타나지 않는다.
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": USER_AGENT,
        // 스스로 압축을 풀지 않으므로 압축을 요청하지 않는다 — 상한이 raw 바이트라
        // 압축된 응답에서는 상한이 뜻을 잃는다.
        "accept-encoding": "identity",
        "content-length": payload.byteLength,
      },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };

    // URL을 **첫 인자로** 넘긴다. 심이 관측하는 것이 정확히 이 값이고(§3.2 계약 축 ②),
    // 옵션에 흩어 놓으면 «무엇을 요청했나»가 조각으로만 보인다.
    const req = requestImpl(endpointUrl(), requestOptions, (res) => {
      const status = res.statusCode ?? 0;

      if (status < 200 || status >= 300) {
        res.resume();
        req.destroy();
        // **프로바이더가 준 본문 문자열을 사유에 옮기지 않는다.** 사유는 우리가 상태
        // 코드로 짓는다 — 프로바이더 문자열을 그대로 실으면 봉투 밖 구간(모델이 지시로
        // 읽는 자리)으로 외부 문자열이 나가는 경로가 열린다(§3.2, 회계 줄과 같은 자리).
        finish({
          ok: false,
          kind: classifyStatus(status),
          reason: `HTTP ${status} from the search API.`,
        });
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;

      res.on("data", (chunk: Buffer) => {
        if (settled) return;
        total += chunk.length;
        if (total > SEARCH_MAX_BYTES) {
          // 여기서 모은 것을 파싱하지 않는다. 잘린 JSON은 결과가 아니다.
          finish({
            ok: false,
            kind: "transport",
            reason: `Search response exceeded ${SEARCH_MAX_BYTES} bytes.`,
          });
          res.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        if (settled) return;
        const text = Buffer.concat(chunks).toString("utf8");
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          finish({
            ok: false,
            kind: "malformedResponse",
            reason: "Search API returned a response that is not valid JSON.",
          });
          return;
        }
        finish({ ok: true, json });
      });

      res.on("error", (error: Error) => {
        finish({
          ok: false,
          kind: "transport",
          reason: `Search response stream failed: ${error.message}`,
        });
      });
    });

    req.on("error", (error: Error) => {
      finish({ ok: false, kind: "transport", reason: `Search request failed: ${error.message}` });
    });

    // 시간 상한은 **소켓을 파괴한다** — 값만 돌려주고 연결이 살아 있으면 상한이 아니다.
    timer = setTimeout(() => {
      finish({
        ok: false,
        kind: "transport",
        reason: `Search request timed out after ${SEARCH_TIMEOUT_MS}ms.`,
      });
      req.destroy();
    }, SEARCH_TIMEOUT_MS);

    req.end(payload);
  });
}
