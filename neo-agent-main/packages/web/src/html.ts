/**
 * HTML 텍스트 추출 — `docs/WEB-ACCESS.md` §3.
 *
 * 자체 구현이다. 파서 라이브러리를 넣지 않는 이유는 의존성 예산(§2)이고, 품질
 * 기준은 §8이 T-012 실측으로 미뤘다.
 *
 * 순서가 중요한 두 가지:
 *
 * - **`script`/`style`/주석은 닫는 태그가 없어도 문서 끝까지 지운다.** 크기 상한으로
 *   잘린 응답에는 닫는 태그가 없다 — 쌍이 맞을 때만 지우는 추출기는 유계 처리와
 *   만나는 순간 스크립트 전문을 모델에게 보낸다. 도구 결과는 프롬프트이므로,
 *   그때 모델이 읽는 것은 문서가 아니라 공격자가 고른 텍스트다.
 * - **엔티티는 태그를 지운 뒤 한 번만 디코드한다.** 먼저 디코드하면 `&lt;script&gt;`가
 *   태그로 승격되고, 두 번 디코드하면 `&amp;lt;`가 `<`가 되어 **원문에 없던 마크업**이
 *   생긴다(§3, 판정 A-12) — 페이지가 자기 텍스트를 마크업으로 올리는 경로다.
 */

/** 닫히지 않았으면 문서 끝까지 — `$`가 그 역할을 한다 */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const SCRIPT = /<script\b[\s\S]*?(?:<\/script\s*>|$)/gi;
const STYLE = /<style\b[\s\S]*?(?:<\/style\s*>|$)/gi;

/**
 * 줄바꿈으로 바꿀 블록 요소. 지우기만 하면 `<p>가</p><p>나</p>`가 `가나`로 합쳐져
 * 문장이 바뀐다. 인라인 요소(`a`·`span`·`b` 등)는 그냥 지운다 — 거기에 줄바꿈을
 * 넣으면 한 문장이 조각난다.
 */
const BLOCK_TAG =
  /<\/?(?:address|article|aside|blockquote|br|canvas|caption|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|iframe|legend|li|main|nav|ol|option|p|pre|section|summary|table|tbody|td|tfoot|th|thead|title|tr|ul|video)\b[^>]*>/gi;

const ANY_TAG = /<[^>]*>/g;
/** 잘린 응답의 미완성 태그 — 닫는 `>`가 영영 오지 않는다 */
const UNTERMINATED_TAG = /<[^>]*$/;

const ENTITY = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * 이름 있는 엔티티 표. HTML5 전체 표(2,000여 개)는 넣지 않는다 — 실사용 페이지에서
 * 압도적 다수를 차지하는 것만 담고, 모르는 것은 원문 그대로 남긴다(추측 디코드보다
 * 원문 보존이 안전하다).
 */
const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  deg: "°",
  euro: "€",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  middot: "·",
  ndash: "–",
  // U+00A0이 아니라 보통 공백으로 접는다(판정 A-11) — 눈에 안 보이는 차이로
  // 모델의 문자열 비교가 어긋나는 것을 막는다.
  nbsp: " ",
  pound: "£",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  sect: "§",
  times: "×",
  trade: "™",
  yen: "¥",
};

function fromCodePoint(code: number): string | undefined {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return undefined;
  // 서러게이트 단독은 문자열을 깨뜨린다
  if (code >= 0xd800 && code <= 0xdfff) return undefined;
  // 제어문자는 공백으로 접는다 — 결과는 프롬프트에 실리는 텍스트다
  if (code < 0x20 && code !== 0x09 && code !== 0x0a) return " ";
  if (code === 0x7f) return " ";
  return String.fromCodePoint(code);
}

/** **한 번만** 돈다. 치환 결과를 다시 훑지 않는 것이 이 함수의 계약이다 */
function decodeEntitiesOnce(text: string): string {
  return text.replace(ENTITY, (match: string, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return fromCodePoint(Number.parseInt(body.slice(2), 16)) ?? match;
    }
    if (body.startsWith("#")) {
      return fromCodePoint(Number.parseInt(body.slice(1), 10)) ?? match;
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}

/**
 * HTML에서 사람이 읽는 텍스트만 남긴다. 어떤 입력에도 throw하지 않는다 —
 * 잘못된 content-type을 보내는 서버가 실재하고, 평문이 통째로 사라지면 모델은
 * "빈 페이지"라는 거짓을 읽는다.
 */
export function extractText(html: string): string {
  let text = html;

  text = text.replace(COMMENT, " ");
  text = text.replace(SCRIPT, " ");
  text = text.replace(STYLE, " ");

  // 원문 공백을 먼저 접는다(HTML 자신의 규칙). 그래야 아래에서 넣는 줄바꿈이
  // "블록 경계"라는 뜻만 갖는다. `pre`의 공백 보존은 다루지 않는다 — §8 품질 항목.
  text = text.replace(/\s+/g, " ");

  text = text.replace(BLOCK_TAG, "\n");
  text = text.replace(ANY_TAG, "");
  text = text.replace(UNTERMINATED_TAG, "");

  text = decodeEntitiesOnce(text);
  // 수치 엔티티(&#160;)로 들어온 NBSP도 보통 공백으로 접는다. 이스케이프로 쓰는
  // 이유는 소스에 비가시 문자를 두면 편집·grep에서 사라지기 때문이다.
  text = text.replaceAll("\u00A0", " ");

  text = text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
