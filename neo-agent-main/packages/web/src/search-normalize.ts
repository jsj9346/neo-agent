/**
 * 검색 응답 정규화와 회계 — `docs/WEB-ACCESS.md` §3.2, 수치는 같은 문서 §8.
 *
 * 순수 함수다. 전송도 도구도 여기 없다 — 입력은 이미 파싱된 JSON이고 출력은
 * 도구가 문자열로 조립할 재료다. 그래서 이 파일은 아무것도 임포트하지 않는다.
 *
 * **이 층이 지는 불변 조건 넷:**
 *
 * 1. **회계는 조건 없이 항상 선다**(§3.2, §3.1의 A-19 승계). 몇 건을 받아 몇 건을
 *    실었고 차이가 있으면 그 사유의 *종류*가 무엇인지. 임계값을 두지 않고 원인을
 *    추측하지 않는다 — 수치를 주면 판단은 모델이 한다.
 * 2. **탈락한 값 자체는 이 파일의 어떤 반환 타입에도 자리가 없다**(§3.2, `K-418`/F-4).
 *    회계 줄은 데이터 봉투 **밖**이고, 봉투 밖은 모델이 지시로 읽는 구간이다. 값을
 *    담을 필드가 없으면 흘릴 수 없다 — 그래서 이것은 규율이 아니라 타입이다.
 *    (잃는 것도 없다: 탈락한 값은 정의상 https로 파싱되지 않는 문자열이라 모델이
 *    그것으로 할 수 있는 일이 없다.)
 * 3. **받은 건은 정확히 한 칸에 센다** — `received === kept + discardedInvalidUrl +
 *    discardedOverResultCap`. 상한을 먼저 자르고 그 뒤에 URL을 검증하는 순서가
 *    이 등식을 준다(상한 밖 항목은 들여다보지 않으므로 두 사유에 겹쳐 세일 수 없다).
 * 4. **0건은 두 갈래로 갈라 낸다**(§3.2). 검색사가 0건인 것과 받은 것이 전부 URL
 *    검증에서 탈락한 것은 모델의 다음 행동이 다르다 — 전자는 질의를 바꾸는 것,
 *    후자는 이 검색사로 다시 시도해도 같다. 그 구분을 닫힌 유니언으로 옮겨서
 *    호출자가 한 갈래를 빠뜨리면 타입 검사가 붉어지게 한다.
 *
 * 필드 이름(`results`·`title`·`url`·`content`)은 확정된 프로바이더의 응답 모양이다
 * (§7 프로바이더 확정 행). 매핑 규칙의 근거는
 * `plans/20260901-web-search-provider-measurement-report.md` §3②의 실측이다.
 */

/**
 * 결과 수 상한 — §8 실측 확정값. **파라미터로 열지 않는다**(§3.2): 열면 모델이
 * 상한을 정하게 되고 그때 유계는 계약이 아니라 기본값이 된다.
 *
 * 요청에도 같은 상수를 싣고(전송 계층이 이 이름을 임포트한다) 응답도 여기서 자른다.
 * 프로바이더가 더 주면 우리가 자르고 그 차이를 회계에 적는다 — 요청의 상수를 프로바이더가
 * 지킨다는 가정 위에 유계를 세우지 않는다. **리터럴은 이 한 자리뿐이다**: 요청과 절단이
 * 서로 다른 수를 들면 「상수 상한으로 몇 건이 빠졌나」라는 회계가 우리가 요청한 적 없는
 * 수를 근거로 서고, 그 어긋남은 아무것도 붉게 하지 않는다.
 */
export const WEB_SEARCH_MAX_RESULTS = 5;

/**
 * 요약문 길이 상한 — §8 실측 확정값(관측 max 1,503자). 초과분은 자르되 **잘렸다는
 * 사실을 항목마다 명시**한다(§3.2 「잘림 가시화」). 조용히 자르면 모델은 잘린 요약을
 * 그 페이지의 전부로 읽는다.
 */
export const WEB_SEARCH_MAX_SUMMARY_CHARS = 2000;

/**
 * 실은 항목 하나. **본문은 없다** — 제목·URL·검색사가 만든 짧은 요약까지가 이
 * 도구의 반환 전부이고, 그것이 §3.2가 드는 이 도구의 존재 근거다(본문을 함께
 * 돌려주면 판정한 적 없는 URL의 본문이 §4·§5·§6을 전부 건너뛰고 들어온다).
 */
export interface WebSearchItem {
  readonly title: string;
  /** `https`로 실제 파싱에 성공한 URL의 정규화된 형태. 이 필드는 항상 유효한 https URL이다 */
  readonly url: string;
  readonly summary: string;
  /** 요약문이 §8 상한에서 잘렸는가. 도구가 이 사실을 문장으로 옮긴다 */
  readonly summaryTruncated: boolean;
}

/**
 * 회계 — **건수와 사유의 종류만**(§3.2, `K-418`/F-4). 탈락한 값을 담는 필드는
 * 의도적으로 없다. 사유의 종류는 계약이 열거한 둘뿐이다: URL 검증 탈락 / 상수 상한.
 *
 * 넷 다 조건 없이 항상 실린다 — 0이어도 필드가 사라지지 않는다. "다르면 사유를
 * 적는다"를 옵셔널 필드로 표현하면 «회계가 없는 상태»가 표현 가능해진다.
 */
export interface WebSearchAccounting {
  /** 프로바이더가 돌려준 항목 수 */
  readonly received: number;
  /** 실제로 실은 항목 수 */
  readonly kept: number;
  /** URL 검증에서 탈락한 항목 **수** */
  readonly discardedInvalidUrl: number;
  /** 결과 수 상한을 넘겨 들여다보지도 않은 항목 **수** */
  readonly discardedOverResultCap: number;
}

/**
 * 정규화 결과. **0건 두 갈래가 타입에 있다**(§3.2) — 호출자가 `switch`를 쓰면
 * 한 갈래를 빠뜨릴 수 없고, 두 갈래를 같은 문장으로 뭉뚱그리면 그것이 코드에
 * 보인다. `items`는 세 갈래 모두에 서므로 회계와 항목을 함께 읽는 자리는 갈리지 않는다.
 *
 * 불변 조건: `kind === "items"`이면 `items`는 비어 있지 않다.
 */
export type WebSearchNormalized =
  | {
      readonly kind: "items";
      readonly items: readonly WebSearchItem[];
      readonly accounting: WebSearchAccounting;
    }
  /** 검색사가 0건을 돌려줬다 — 질의를 바꾸면 달라질 수 있다 */
  | {
      readonly kind: "emptyFromProvider";
      readonly items: readonly [];
      readonly accounting: WebSearchAccounting;
    }
  /**
   * 받은 건이 URL 검증을 하나도 통과하지 못했다 — 이 검색사로 다시 시도해도 같다.
   *
   * 상한 밖 항목이 함께 있었으면(`discardedOverResultCap > 0`) "받은 전부"가 아니라
   * "본 전부"다. 요청이 상한을 함께 싣는 이상 실사용에서 성립하지 않는 조합이며,
   * 그 경우에도 회계의 두 수가 실제로 무엇이 일어났는지를 그대로 든다.
   */
  | {
      readonly kind: "emptyAfterUrlCheck";
      readonly items: readonly [];
      readonly accounting: WebSearchAccounting;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * §3.2 — **프로바이더가 돌려준 URL을 `https`로 실제 파싱해 검증한다.** 파싱에
 * 실패하거나 스킴이 https가 아니면 버린다. 근거 둘: ① 검증하지 않으면 URL 자리에
 * 임의의 문자열이 들어오고, 그 문자열은 봉투 안에 있으면서도 모델에게는 주소로
 * 읽힌다 ② 그 URL의 다음 소비자는 `web_fetch`이고 그 도구는 https만 받는다(§3.1).
 *
 * 문자열이 아닌 값도 여기서 걸린다 — 파싱 대상이 아니면 파싱에 실패한 것과 같고,
 * 계약이 열거한 사유 둘 밖에 새 사유를 만들지 않는다.
 *
 * `[미규정]` URL 안의 크리덴셜(`https://user:pass@host/`)은 여기서 걸리지 않는다.
 * §3.2가 든 탈락 조건은 «파싱 실패»와 «스킴이 https가 아님» 둘뿐이고, `web_fetch`가
 * 그것을 거부한다는 사실(§3.1)은 이 절이 탈락 사유로 열거하지 않았다. 계약을 임의로
 * 넓히지 않고 그대로 둔다 — 넓히려면 §3.2가 먼저다.
 */
function toVerifiedHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = URL.parse(value);
  if (parsed === null || parsed.protocol !== "https:") return undefined;
  return parsed.href;
}

/**
 * 텍스트 필드를 문자열로 받는다.
 *
 * `[미규정]` 제목·요약이 문자열이 아니거나 없을 때를 §3.2가 정하지 않았다. 항목을
 * 버리는 갈래는 계약이 열거하지 않은 **세 번째 탈락 사유**를 만들게 되므로 택하지
 * 않았고, URL로 제목을 지어내는 갈래는 없는 사실을 만드는 일이라 택하지 않았다.
 * 빈 문자열은 «우리가 가진 것이 없다»이지 날조가 아니다. 실측 120건에서 발생 0건이다.
 */
function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 요약문을 §8 상한으로 자른다. `content`의 `[...]` 절단 마커는 검색사가 비연속
 * 발췌를 이어붙인 흔적이지 마크업이 아니므로 **그대로 싣는다**(§8 2026-09-01 확정
 * — 마크업 태그 오염은 실측에서 0건이었고, 없는 문제에 규칙을 더하지 않는다).
 */
function capSummary(text: string): { summary: string; truncated: boolean } {
  if (text.length <= WEB_SEARCH_MAX_SUMMARY_CHARS) return { summary: text, truncated: false };
  let end = WEB_SEARCH_MAX_SUMMARY_CHARS;
  // 서로게이트 쌍 한가운데서 자르면 짝 잃은 코드 유닛이 남는다. 계약이 정한 것은
  // "자른다"이지 "깨뜨린다"가 아니므로 한 칸 물러선다.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { summary: text.slice(0, end), truncated: true };
}

/**
 * 파싱된 검색 응답을 도구가 쓸 모양으로 정규화한다.
 *
 * @throws 응답에 결과 배열이 없을 때. **`?? []`로 삼키지 않는다** — 그렇게 하면
 * 프로바이더가 응답 모양을 바꾼 날 «검색사가 0건을 돌려줬다»는 거짓 문장이 조용히
 * 서고, 그것이 `ARCHITECTURE.md` §2.6이 최상위로 두는 silent failure다. 응답 모양이
 * 계약과 다른 것은 프로바이더 오류이고, 프로바이더 오류는 사유를 담은 throw다(§3.2).
 */
export function normalizeSearchResponse(raw: unknown): WebSearchNormalized {
  if (!isRecord(raw) || !Array.isArray(raw.results)) {
    throw new Error(
      "The search provider returned a response without a results array; the response shape does not match the expected search API contract.",
    );
  }

  const received = raw.results.length;
  // 상한을 먼저 적용한다(불변 조건 3). 상한 밖 항목은 URL 검증에 들어가지 않으므로
  // 한 항목이 두 사유에 겹쳐 세일 수 없다.
  const inspected = raw.results.slice(0, WEB_SEARCH_MAX_RESULTS);
  const discardedOverResultCap = received - inspected.length;

  const items: WebSearchItem[] = [];
  let discardedInvalidUrl = 0;

  for (const entry of inspected) {
    // 조용히 버리지 않는 것이 계약의 절반이다(§3.2 · `ARCHITECTURE.md` §2.6).
    // 여기서 세는 것은 **건수뿐**이다 — 탈락한 문자열은 어디에도 남기지 않는다.
    if (!isRecord(entry)) {
      discardedInvalidUrl += 1;
      continue;
    }
    const url = toVerifiedHttpsUrl(entry.url);
    if (url === undefined) {
      discardedInvalidUrl += 1;
      continue;
    }
    const { summary, truncated } = capSummary(toText(entry.content));
    items.push({
      title: toText(entry.title),
      url,
      summary,
      summaryTruncated: truncated,
    });
  }

  const accounting: WebSearchAccounting = {
    received,
    kept: items.length,
    discardedInvalidUrl,
    discardedOverResultCap,
  };

  if (items.length > 0) return { kind: "items", items, accounting };
  if (received === 0) return { kind: "emptyFromProvider", items: [], accounting };
  return { kind: "emptyAfterUrlCheck", items: [], accounting };
}
