/**
 * HTML 텍스트 추출 — `docs/WEB-ACCESS.md` §3.
 *
 * 자체 구현이다. 파서 라이브러리를 넣지 않는 이유는 의존성 예산(§2)이고, 품질
 * 기준은 §8이 T-012 실측으로 미뤘다.
 *
 * 순서가 중요한 세 가지:
 *
 * - **`script`/`style`/주석은 닫는 태그가 없어도 문서 끝까지 지운다.** 크기 상한으로
 *   잘린 응답에는 닫는 태그가 없다 — 쌍이 맞을 때만 지우는 추출기는 유계 처리와
 *   만나는 순간 스크립트 전문을 모델에게 보낸다. 도구 결과는 프롬프트이므로,
 *   그때 모델이 읽는 것은 문서가 아니라 공격자가 고른 텍스트다.
 * - **엔티티는 태그를 지운 뒤 한 번만 디코드한다.** 먼저 디코드하면 `&lt;script&gt;`가
 *   태그로 승격되고, 두 번 디코드하면 `&amp;lt;`가 `<`가 되어 **원문에 없던 마크업**이
 *   생긴다(§3, 판정 A-12) — 페이지가 자기 텍스트를 마크업으로 올리는 경로다.
 * - **`<pre>`는 공백을 접기 전에 떼어내고 공백 정리가 끝난 뒤에 되돌린다.** 이 순서가
 *   아니면 코드의 개행·들여쓰기가 먼저 지워지고, 지워진 뒤에는 복구할 수 없다.
 *   문서 조회가 이 도구의 주 용도이고 **모델은 잘못된 코드를 무시하지 못한다.**
 */

/** 닫히지 않았으면 문서 끝까지 — `$`가 그 역할을 한다 */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const SCRIPT = /<script\b[\s\S]*?(?:<\/script\s*>|$)/gi;
const STYLE = /<style\b[\s\S]*?(?:<\/style\s*>|$)/gi;

/**
 * 태그의 속성 구간 — `>`는 **따옴표 밖에 있을 때만** 태그의 끝이다.
 *
 * `[^>]*`로 끝을 찾으면 `data-mw='{"parts":[{"wt":"…>…"}]}'` 같은 속성값 안의 `>`에서
 * 태그가 끝났다고 판단하고, 나머지 속성값이 본문 텍스트로 새어 나온다. T-012 실측:
 * 위키 계열 페이지에서 추출 출력의 **8.6~10.4%**가 이 경로로 들어온 위키텍스트
 * JSON이었고, 잔류 엔티티도 전부 여기서 나왔다. §3이 "태그 제거"를 규정한 이상
 * 이것은 포기 항목이 아니라 결함이다.
 *
 * **왜 백트래킹이 폭발하지 않는가.** 형태는 Friedl의 unrolled loop다.
 *
 * 1. 두 수량자가 같은 위치를 두고 다투지 않는다 — 필러는 따옴표를 못 먹고 반복
 *    그룹은 반드시 따옴표로 시작하므로 분기점이 **결정적**이다. `"[^"]*"`도 마찬가지로
 *    `[^"]*`가 따옴표를 넘지 못해 **바로 다음 따옴표와만** 짝이 된다(짝짓기 경우의
 *    수가 없다). 중첩 수량자가 곱해지는 경로가 없다.
 * 2. 반복 1회가 최소 2문자(따옴표 쌍)를 소비하므로 빈 반복이 없다.
 * 3. 필러에서 **`<`를 제외한 것이 유계 장치다.** 태그 안에 따옴표 밖 `<`는 오지
 *    않으므로(실측: 원문 11건에서 이 제외가 바꾸는 매치 0건) 필러는 다음 `<`에서
 *    스스로 멈춘다. 이것이 없으면 `>`가 없는 입력(`<a<a<a…`)에서 후보 시작마다
 *    문서 끝까지 훑고 되돌아오며 **입력 길이의 제곱**이 된다.
 *
 * 3번은 교체 전 `<[^>]*>`가 이미 갖고 있던 병리이기도 하다. 실측(이 머신):
 * `<a` 20만 회 반복에 옛 `<[^>]*>`는 **15.3초**, `[^>"']` 필러는 **17.7초**인데,
 * `<`를 제외하면 **4MB에서 14ms**로 선형이 된다. 즉 이 교체는 정확성만이 아니라
 * 기존 2차 거동을 함께 없앤다(`packages/gate`의 "유계 필러만" 규율과 같은 방향).
 */
const ATTRS = `[^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*`;

/**
 * 줄바꿈으로 바꿀 블록 요소. 지우기만 하면 `<p>가</p><p>나</p>`가 `가나`로 합쳐져
 * 문장이 바뀐다. 인라인 요소(`a`·`span`·`b` 등)는 그냥 지운다 — 거기에 줄바꿈을
 * 넣으면 한 문장이 조각난다.
 */
const BLOCK_TAG = new RegExp(
  `<\\/?(?:address|article|aside|blockquote|br|canvas|caption|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|iframe|legend|li|main|nav|ol|option|p|pre|section|summary|table|tbody|td|tfoot|th|thead|title|tr|ul|video)\\b${ATTRS}>`,
  "gi",
);

/** 이름으로 시작하는 태그 전부. `<!doctype>`·`<?xml?>`도 여기 걸린다 */
const ANY_TAG = new RegExp(`<\\/?[a-zA-Z!?]${ATTRS}>`, "g");

/**
 * 위 두 패턴이 인식하지 못한 잔여물 — 따옴표 짝이 맞지 않는 깨진 마크업이다.
 * 교체 전 동작(`<[^>]*>`)을 이어받아 **정상 HTML에서만 정확해지고 깨진 HTML에서
 * 나빠지지는 않게** 한다. 정상 태그는 이미 위에서 사라졌으므로 이 패턴이 속성값
 * 누출을 되살리는 일은 없다.
 *
 * 여기서도 `<`를 제외하는 이유는 `ATTRS`와 같다 — 옛 `<[^>]*>`는 `<a<a<a…`에서
 * 2차로 갔다(실측 20만 회 반복에 15.3초 · 4MB면 사실상 정지). `<[^<>]*>`는 같은
 * 입력을 4MB에서 15ms에 끝낸다.
 */
const LOOSE_TAG = /<[^<>]*>/g;

/**
 * `<pre>` 블록 — **원문 공백이 의미를 갖는 유일한 요소다.**
 *
 * 여는 태그는 `ATTRS`를 그대로 쓴다(따옴표 인식·유계). 내용은 첫 `</pre>`까지 게으르게
 * 먹되, **닫는 태그가 없으면 문서 끝까지** 먹는다 — `script`/`style`과 같은 이유이자
 * 여기서는 더 급하다. 크기 상한으로 잘린 응답의 마지막 `<pre>`에는 닫는 태그가 없고,
 * 그때 이 패턴이 매치하지 않으면 **자리표시자가 심어지지 않은 채** 뒤 단계가 돌아
 * 블록이 통째로 한 줄로 접힌다(= 고치려던 결함이 잘린 응답에서만 되살아난다).
 *
 * 중첩은 다루지 않는다 — HTML에서 `<pre>` 안의 `<pre>`는 허용되지 않고, 텍스트로
 * 쓰인 `</pre>`는 원문에서 엔티티다. 첫 닫는 태그에서 끊는 것이 맞다.
 */
const PRE_BLOCK = new RegExp(`<pre\\b${ATTRS}>([\\s\\S]*?)(?:<\\/pre\\s*>|$)`, "gi");

/** `<pre>` 안에서 줄바꿈으로 살려야 하는 유일한 태그 */
const BR_TAG = new RegExp(`<br\\b${ATTRS}>`, "gi");

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
 * `<pre>` 하나의 내용을 코드 텍스트로 만든다.
 *
 * **보존 대상은 공백 구조이지 마크업이 아니다.** 하이라이터가 심은 `<code>`·
 * `<span class=…>`는 여기서도 지운다. 엔티티 디코드도 그대로 돈다 — `&lt;`가 남으면
 * 코드가 읽히지 않는다. 순서는 본문 경로와 같다(태그를 지운 뒤 한 번만 디코드).
 *
 * **줄 구조는 원문의 리터럴 개행에서 온다.** 줄마다 `<span>`으로 감싸면서 개행을 넣지
 * 않는 하이라이터는 이 방법으로 복원되지 않는다 `[미규정 EW-7]` — 실측 대상(MDN·
 * Node 공식 문서)은 리터럴 개행을 쓰므로 여기서는 성립한다.
 */
function extractPreText(inner: string): string {
  let code = inner.replace(BR_TAG, "\n");
  code = code.replace(ANY_TAG, "");
  code = code.replace(LOOSE_TAG, "");
  code = code.replace(UNTERMINATED_TAG, "");
  code = decodeEntitiesOnce(code);
  // 본문 경로와 같은 이유로 이스케이프로 쓴다 — 소스에 비가시 문자를 두지 않는다.
  code = code.replaceAll("\u00A0", " ");

  return (
    code
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      .split("\n")
      // 줄 끝 공백만 턴다. 줄 **앞** 공백은 들여쓰기이므로 손대지 않는다 — 파이썬·YAML은
      // 그것이 사라지면 문자가 전부 살아 있어도 의미가 소멸한다.
      .map((line) => line.replace(/[^\S\n]+$/, ""))
      .join("\n")
      .replace(/^\n+|\n+$/g, "")
  );
}

/**
 * `<pre>` 자리표시자의 접두사. **호출마다 새로 만든다.**
 *
 * 고정 문자열이면 페이지가 그것을 본문에 심어 복원 단계를 교란할 수 있다 —
 * `web_fetch`의 boundary ID가 무작위인 것과 같은 이유다. 다만 여기는 **같은 호출
 * 안에서만 유효하면 되고 신뢰 경계가 아니므로**(교란의 상한이 "코드 블록이 엉뚱한
 * 자리에 한 번 더 나온다"이다) 비싼 수단은 필요 없다. `randomUUID`는 추출당 1회로
 * 무시할 만하고, `Math.random`과 달리 예측 가능성을 따로 변론할 필요가 없다.
 *
 * 글자 구성이 계약이다 — `[a-z0-9-]`뿐이라 아래 어느 단계에도 걸리지 않는다:
 * 공백이 없어 `\s+` 접기를 통과하고, `<`·`>`가 없어 태그 제거를 통과하며,
 * `&`·`;`가 없어 엔티티 디코드를 통과한다. 끝의 `-`는 인덱스 경계다(`-1-`이
 * `-12-`의 접두사가 되지 않게 한다).
 */
function newPreToken(): string {
  return `neo-agent-pre-${crypto.randomUUID().replaceAll("-", "")}-`;
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

  // `<pre>`를 **공백을 접기 전에** 떼어낸다. 아래 `\s+ → " "`가 코드의 개행과
  // 들여쓰기를 지우기 때문이고, 한 번 지워지면 뒤에서 복구할 방법이 없다.
  // T-012 실측: 이 처리가 없으면 코드 블록 **35/35가 한 줄로 접히고 그중 51%가
  // 줄 주석에 뒤 코드를 통째로 삼킨다**(`//`로 시작하는 블록은 예제 전체가 주석이
  // 된다). 모델은 네비 노이즈는 무시할 수 있어도 잘못된 코드는 무시하지 못한다.
  const blocks: string[] = [];
  const token = newPreToken();
  text = text.replace(PRE_BLOCK, (_match: string, inner: string) => {
    const code = extractPreText(inner);
    // 빈 블록까지 자리표시자로 만들 이유가 없다 — 되돌릴 것이 없다.
    if (code === "") return " ";
    blocks.push(code);
    return ` ${token}${blocks.length - 1}- `;
  });

  // 원문 공백을 먼저 접는다(HTML 자신의 규칙). 그래야 아래에서 넣는 줄바꿈이
  // "블록 경계"라는 뜻만 갖는다. 자리표시자는 공백·`<`·`>`·`&`를 담지 않으므로
  // 이 접기에도, 아래 태그 제거와 엔티티 디코드에도 걸리지 않는다.
  text = text.replace(/\s+/g, " ");

  text = text.replace(BLOCK_TAG, "\n");
  text = text.replace(ANY_TAG, "");
  text = text.replace(LOOSE_TAG, "");
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

  if (blocks.length === 0) return text.trim();

  // 코드는 **공백 정리가 전부 끝난 뒤에** 되돌린다 — 그 전에 넣으면 방금 위에서
  // 접힌다. 이것이 자리표시자를 쓰는 이유 전부다.
  //
  // **한 번만 훑는다.** 블록마다 `replaceAll`을 돌면 훑기 횟수가 블록 수에 비례해
  // 곱해진다 — 실측: `<pre>` 2.4만 개가 든 40만 자 입력에 **15.7초**(4MB면 정지).
  // 정규식 한 번 + 인덱스 조회로 바꾸면 같은 입력이 40ms다. 모르는 인덱스를 빈
  // 문자열로 돌리는 것이 안전망을 겸한다 — 복원되지 않은 자리표시자가 출력에
  // 남으면 모델이 그 문자열을 문서 내용으로 읽는다.
  text = text.replace(new RegExp(`${token}(\\d+)-`, "g"), (_match: string, index: string) => {
    const code = blocks[Number(index)];
    return code === undefined ? "" : `\n${code}\n`;
  });

  return (
    text
      // 자리표시자가 줄 중간에 있었다면 앞 텍스트에 꼬리 공백이 남는다. 코드 줄은
      // 위에서 이미 줄 끝 공백을 털었으므로 이 정리가 코드를 건드리지 않는다.
      .replace(/[^\S\n]+\n/g, "\n")
      // 이음매에서 빈 줄이 겹칠 수 있다. 코드 안의 3줄 이상 연속 빈 줄도 함께 한 줄로
      // 접히지만, 그것은 문서 전체의 공백 규칙과 같은 처리다.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
