/**
 * 출처 검증 — `docs/WEB-UI.md` §4.1의 판정. **다섯째 축의 순수 함수 부분이다.**
 *
 * §4.1 결정 4가 *"입력은 읽은 헤더 셋과 바인드된 실포트이고 출력은 닫힌 판별 갈래다"*로
 * 이 파일의 형태를 정했다. 그래서 여기 있는 것은 값 → 값 함수 하나이고, 그 함수는
 * `IncomingMessage`도 `ServerResponse`도 모른다. 관문을 **어디에** 세우는가(라우팅보다
 * 앞의 한 자리)와 거절을 **어떤 응답으로** 내는가(403 · 평문 한 줄)는 `server.ts`가 진다.
 *
 * ## 임포트가 0인 이유
 *
 * §2.2가 요구한 것이 아니다 — 그 절은 `node:http`를 허용한다. 입력을 읽은 헤더 셋으로
 * 좁히면 `IncomingMessage` 타입이 필요 없어질 뿐이고, 그 결과로 이 파일은 실행 없이
 * 표 하나로 전수 검사된다. §2.2 위반을 실제로 재는 것은 `package-boundary.contract.test.ts`다.
 *
 * ## 무엇을 재고 무엇을 안 재는가
 *
 * 재는 것은 §4.1 결정 3의 검사 셋이고 그 전부다. 결정 5(안전한 메서드가 상태를 안 바꾼다)는
 * 이 함수가 기대는 **불변**이지 이 함수가 재는 것이 아니다 — 그 불변은 라우트 표가 지고,
 * 깨지는 날 이 함수의 모집단 분할이 그 라우트에 대해 조용히 무의미해진다.
 *
 * **이 축이 막지 못하는 것**은 §4.1 결정 7이 열거한 넷이다. 특히 첫째 —
 * *"헤더를 마음대로 짓는 클라이언트에게 이 축은 아무것도 아니다"* · *"그 경계는 OS이고
 * 문서 머리가 이미 그렇게 선언했다"*. 아래 판정 전부가 그 전제 위에 선다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 문서를 줄번호로
 * 가리키는 자리는 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호로 한다.
 */

// ---------------------------------------------------------------------------
// 입력 — §4.1 결정 3·4
// ---------------------------------------------------------------------------

/**
 * 판정의 입력. **요청 객체가 아니라 이미 읽힌 값들이다.**
 *
 * 헤더 셋을 값으로 받는 것이 이 함수를 순수하게 만들고, 그래서 §4.1 강제 수단이 요구한
 * 거절 여섯·통과 넷을 표로 전수 열거할 수 있다.
 */
export type OriginCheckInput = {
  /**
   * HTTP 메서드. 결정 3의 모집단 분할이 이 값 하나에 걸린다.
   *
   * **`undefined`를 안전한 메서드로 읽지 않는다.** 값이 없으면 안전하지 않은 메서드로
   * 떨어져 검사 셋을 전부 받는다 — 부재를 통과로 접는 형태를 결정 3이 금지했고
   * (*"부재는 통과가 아니다."*), 여기서도 같은 방향으로 접는다.
   */
  readonly method: string | undefined;
  /**
   * `Host` 헤더 값. 검사 1의 입력이다.
   *
   * **중복 헤더를 배열로 받는 갈래를 두지 않는다.** 2026-08-31 실측(Node v25.9.0)으로
   * 그 갈래가 도달 불가임이 확인됐다 — `node:http` 파서는 중복 `host`·`content-type`의
   * 첫 값만 남기고, `origin`·`sec-fetch-site`는 `", "`로 합친 **문자열**로 만든다.
   * 합쳐진 값은 아래 정확 일치에서 어차피 거절된다.
   *
   * 부르는 쪽이 배열 타입을 들고 있으면(`sec-fetch-site`처럼 `@types/node`의 색인
   * 시그니처를 타는 이름) 문자열이 아닌 값은 `undefined`로 좁혀 넘긴다 — 그 좁힘도
   * 거절 방향이다.
   */
  readonly host: string | undefined;
  /** `Origin` 헤더 값. 검사 3의 첫 입력 */
  readonly origin: string | undefined;
  /** `Sec-Fetch-Site` 헤더 값. `Origin`이 없을 때만 검사 3이 본다 */
  readonly secFetchSite: string | undefined;
  /** `Content-Type` 헤더 값. 검사 2의 입력 */
  readonly contentType: string | undefined;
  /**
   * **바인드된 실포트.** 상수 포트가 아니다 — §4.1 결정 2가
   * *"기대값은 서버가 알고, 요청이 준 값은 기대값에 들어가지 않는다"*로 허용 집합의
   * 출처를 바인드된 실주소로 못박았고, 상수를 재면 포트 0으로 뜬 서버에서 그 검사가
   * 거짓이 된다.
   */
  readonly port: number;
};

// ---------------------------------------------------------------------------
// 출력 — §4.1 결정 4·6
// ---------------------------------------------------------------------------

/**
 * 거절 사유. **닫힌 유니온**이고, §4.1 결정 3의 검사 셋에서 유도된다.
 *
 * 검사마다 «요구한 이름이 없다»와 «있는데 값이 허용 밖이다»를 따로 든다. 결정 3이
 * *"부재는 통과가 아니다."*로 둘 다 거절로 두었지만 **둘은 같은 사건이 아니고**, 이
 * 사유를 읽는 것은 결정 6이 지목한 사람 — 버그로 거절당한 우리 화면을 보는 사용자다.
 * 「Origin을 안 실었다」와 「Origin이 다른 오리진이다」가 한 낱말로 뭉치면 그 사용자가
 * 고칠 자리를 못 찾는다.
 *
 * §4.1 강제 수단이 든 거절 여섯과의 대응(전수):
 *
 * | §4.1이 든 조합 | 이 유니온 |
 * |---|---|
 * | 허용 밖 `Host` | `host-not-allowed` |
 * | 허용 밖 `Origin` | `origin-not-allowed` |
 * | `Origin`도 `Sec-Fetch-Site`도 없음 | `origin-and-sec-fetch-site-missing` |
 * | `Sec-Fetch-Site: cross-site` | `sec-fetch-site-not-same-origin` |
 * | 폼 미디어 타입 | `content-type-not-json` |
 * | `content-type` 없음 | `content-type-missing` |
 *
 * 일곱째 `host-missing`은 그 열거에 이름이 없다. **모집단 밖이라서가 아니라 그 열거가
 * 서버 레벨 계약 테스트의 조합 목록이기 때문이고**, 결정 3의 부재 규칙이 `Host`에도
 * 그대로 걸린다 — 검사 1의 모집단은 모든 요청이다.
 */
export type OriginRejectionReason =
  | "host-missing"
  | "host-not-allowed"
  | "content-type-missing"
  | "content-type-not-json"
  | "origin-not-allowed"
  | "origin-and-sec-fetch-site-missing"
  | "sec-fetch-site-not-same-origin";

/**
 * 판정의 결과. **닫힌 판별 갈래이고 «통과인데 사유가 있다»가 표현되지 않는다.**
 *
 * `reason?: never` 가드의 근거는 `protocol.ts` 머리가 실측과 함께 든 것과 같다 —
 * 판별자가 리터럴로 박힌 신선한 객체 리터럴은 가드가 없어도 초과 속성 검사가 잡지만,
 * 변수에 담기거나 조건 분기로 조립된 값은 그 검사를 안 받는다.
 */
export type OriginVerdict =
  | { readonly ok: true; readonly reason?: never }
  | { readonly ok: false; readonly reason: OriginRejectionReason };

// ---------------------------------------------------------------------------
// 상수 — §4.1 결정 3
// ---------------------------------------------------------------------------

/**
 * 안전한 메서드 둘. §4.1 결정 3이 든 그대로이고 **나머지 전부가 안전하지 않은 메서드**다.
 *
 * `OPTIONS`가 여기 없는 것이 결정 6의 *"프리플라이트에 답하지 않는다."*를 이 층에서
 * 이행하는 방식이다 — 프리플라이트 전용 갈래를 두지 않고, `OPTIONS`가 검사 2·3에서
 * 거절되는 것이 곧 프리플라이트 실패다.
 */
const SAFE_METHODS: readonly string[] = ["GET", "HEAD"];

/** 검사 2의 통과 조건. 미디어 타입 하나이고 파라미터는 묻지 않는다 */
const JSON_MEDIA_TYPE = "application/json";

/** 검사 3의 대체 경로. `Origin`이 없을 때 요구되는 값이고 정확 일치다 */
const SAME_ORIGIN = "same-origin";

/**
 * 허용 집합의 호스트 이름 둘. §4.1 결정 2의 집합이 이 둘에 실포트를 붙여 지어진다.
 *
 * `[::1]`이 없는 것은 결정 2가 명시로 배제했기 때문이다 — 바인드가 루프백 IPv4 하나라
 * 그 이름으로 닿는 연결이 성립하지 않고, *"넣으면 도달 불가능한 갈래를 허용 집합에
 * 두는 것이 된다"*.
 */
const ALLOWED_HOSTNAMES: readonly string[] = ["127.0.0.1", "localhost"];

/** 허용 오리진의 스킴. 루프백 평문이 §4의 결정이므로 `https`가 여기 없다 */
const ORIGIN_SCHEME = "http://";

// ---------------------------------------------------------------------------
// 판정 — §4.1 결정 3
// ---------------------------------------------------------------------------

/**
 * 요청의 출처를 판정한다. **부작용이 없고 시계·전역을 안 읽는다.**
 *
 * 검사 순서는 결정 3의 표 순서 그대로다 — 1(모든 요청) → 2 → 3. 안전한 메서드는
 * 검사 1만 받고, 그 밖의 전부가 셋을 다 받는다.
 *
 * **셋이 서로를 대신하지 않는다**(결정 3). 검사 2·3은 브라우저의 규칙에 기대고 검사 1은
 * 그 어느 것도 아니다 — 리바인딩에서는 공격자 페이지가 우리와 같은 오리진이 되어 검사
 * 2·3이 전부 통과하고, 그 자리를 막는 것은 검사 1뿐이다. 그래서 아래 어느 검사도
 * 「다른 검사가 이미 막는다」를 이유로 접히지 않는다.
 */
export function checkOrigin(input: OriginCheckInput): OriginVerdict {
  // --- 검사 1 — `Host`. 모집단은 모든 요청이다 -----------------------------
  const host = present(input.host);
  if (host === undefined) return reject("host-missing");
  if (!allowedHosts(input.port).includes(host)) return reject("host-not-allowed");

  // 안전한 메서드는 여기서 끝난다. 결정 5가 «GET·HEAD로 도달하는 것은 둘 다 읽기»를
  // 계약으로 세웠고, 그 불변이 이 조기 반환의 근거 전부다.
  if (isSafeMethod(input.method)) return { ok: true };

  // --- 검사 2 — `content-type`. 안전하지 않은 메서드만 --------------------
  const contentType = present(input.contentType);
  if (contentType === undefined) return reject("content-type-missing");
  if (mediaType(contentType) !== JSON_MEDIA_TYPE) return reject("content-type-not-json");

  // --- 검사 3 — `Origin` / `Sec-Fetch-Site`. 안전하지 않은 메서드만 -------
  const origin = present(input.origin);
  if (origin !== undefined) {
    return allowedOrigins(input.port).includes(origin)
      ? { ok: true }
      : reject("origin-not-allowed");
  }

  const site = present(input.secFetchSite);
  if (site === undefined) return reject("origin-and-sec-fetch-site-missing");
  return site === SAME_ORIGIN ? { ok: true } : reject("sec-fetch-site-not-same-origin");
}

// ---------------------------------------------------------------------------
// 부품
// ---------------------------------------------------------------------------

const reject = (reason: OriginRejectionReason): OriginVerdict => ({ ok: false, reason });

/**
 * 허용 Host 집합. §4.1 결정 2가 든 그대로이고 **정확 일치**로 쓰인다.
 *
 * *"정확 일치다."* — 접두·접미 검사를 두지 않는다. 열면 이 집합이 접미사 검사가 되고,
 * *"접미사 검사는 §9.1이 자산 경로에서 이미 거부한 형태다"*.
 *
 * **[추정]** 그 일치를 **문자열 동등**으로 읽는다 — 대소문자 정규화를 하지 않으므로
 * `LOCALHOST:14017`은 통과하지 않는다. §4.1은 이 자리를 안 든다. 접는 쪽으로 가면
 * 허용 집합이 문서가 든 두 문자열보다 넓어지고, 결정 2가 *"정확 일치다."*를 세운 근거가
 * 「집합이 조용히 넓어지는 형태를 안 만든다」이므로 넓히는 방향을 안 고른다. 실경로에서
 * 브라우저는 요청 URL의 권한부를 그대로 실어 이 정규화가 필요해지지 않는다.
 *
 * **[미규정]** 포트가 80일 때 브라우저는 `Host`에서 포트를 뺀다. §4.1이 든 집합은
 * `<이름>:<실포트>` 형태 둘로 닫혀 있어 그 요청은 여기서 거절된다. 루프백 80 바인드는
 * 권한이 필요해 오늘 실경로가 아니고, 여는 것은 집합을 넓히는 문서 개정이지 이 함수의
 * 판단이 아니다 — 그래서 여기서 메우지 않는다.
 */
const allowedHosts = (port: number): readonly string[] =>
  ALLOWED_HOSTNAMES.map((name) => `${name}:${String(port)}`);

/** 허용 오리진 집합. 같은 이름 둘에 스킴이 붙고, 역시 정확 일치다(§4.1 결정 2) */
const allowedOrigins = (port: number): readonly string[] =>
  ALLOWED_HOSTNAMES.map((name) => `${ORIGIN_SCHEME}${name}:${String(port)}`);

/**
 * 안전한 메서드인가. **`undefined`는 안전하지 않은 쪽이다**(위 `method` 필드의 근거).
 *
 * **[추정]** 메서드 이름을 대문자 정규화하지 않는다. HTTP 메서드 토큰은 규격상
 * 대소문자를 가리므로 `get`은 `GET`이 아니고, 정규화하면 안전한 메서드의 집합이
 * 규격보다 넓어진다 — 넓어지는 방향은 검사 2·3을 면제하는 방향이라 접지 않는다.
 */
const isSafeMethod = (method: string | undefined): boolean =>
  method !== undefined && SAFE_METHODS.includes(method);

/**
 * 값이 실제로 있는가. **빈 문자열은 부재로 읽는다.**
 *
 * `Host:` 처럼 이름만 있고 값이 빈 헤더를 «있다»로 세면 아래 정확 일치가 빈 문자열을
 * 재게 되고, 그러면 사유가 「허용 밖」으로 잘못 붙는다. 처분은 어느 쪽이든 거절이므로
 * 이 선택이 여닫는 문은 없고 갈리는 것은 §4.1 결정 6이 사용자에게 보일 사유뿐이다.
 */
const present = (value: string | undefined): string | undefined =>
  value !== undefined && value !== "" ? value : undefined;

/**
 * `Content-Type` 값에서 미디어 타입만 뽑는다. 파라미터는 버린다 —
 * §4.1 결정 3의 통과 조건이 *"미디어 타입이 `application/json`이다"*이므로
 * `application/json; charset=utf-8`은 통과해야 한다.
 *
 * **[추정]** 미디어 타입을 소문자로 접어 비교한다. 규격상 미디어 타입은 대소문자를
 * 안 가리고, 접는 방향으로 열리는 문이 없다 — 어느 표기든 `application/json`은
 * CORS 단순 요청 자격을 못 얻으므로 교차 오리진 폼이 이 값을 만들 수 없다는 검사 2의
 * 근거가 그대로 선다. §4.1은 이 자리를 안 든다.
 */
const mediaType = (contentType: string): string => {
  const semicolon = contentType.indexOf(";");
  const head = semicolon === -1 ? contentType : contentType.slice(0, semicolon);
  return head.trim().toLowerCase();
};

// ---------------------------------------------------------------------------
// 이 파일이 들추지 않는 것 — `rawHeaders`
// ---------------------------------------------------------------------------
//
// **[추정]** `node:http` 파서가 버린 헤더를 `rawHeaders`로 들추지 않는다. 입력은 파서가
// 읽은 헤더 셋이고 그 전부다.
//
// 2026-08-31 실측(Node v25.9.0): 중복 `host`가 오면 `request.headers.host`에는 **첫 값**이
// 남고 둘째 값은 `rawHeaders`에만 있다. 즉 「첫 `Host`는 허용 집합에 있고 둘째는 공격자
// 도메인」인 요청을 이 함수는 통과시킨다.
//
// 그것을 문으로 세지 않는 근거는 §4.1 결정 7의 첫째 항이다 — 중복 `Host`를 실어 보내는
// 것은 브라우저가 스스로 붙이는 헤더가 아니라 헤더를 마음대로 짓는 클라이언트의 행위이고,
// *"그 경계는 OS이고 문서 머리가 이미 그렇게 선언했다"*. 이 축이 재는 것은 그 부류가 아니다.
//
// **[추정]**인 이유: §4.1이 `rawHeaders`를 이름으로 들지 않는다. 위 판단은 결정 7의 경계
// 서술에서 유도한 것이고, 문서 승격 여부는 이 파일이 정하지 않는다.
