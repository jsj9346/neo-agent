/**
 * 문서 인용 형식의 **순수 판정**. 정본은 `docs/DOC-CITATION.md` §3이다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 게이트 실행부는 `check-doc-citation.mjs`에 있고 이 모듈을 임포트한다.
 *
 * **왜 두 파일인가.** `doc-status.mjs`가 같은 이유로 갈렸다 — 한 파일이면 계약 테스트가
 * 순수 함수만 쓰는데도 임포트 순간 게이트가 돌고, 실물 `docs/`가 레드인 날엔
 * `process.exit(1)`이 vitest 워커를 죽여 **"계약 위반"이 "테스트 파일이 사라짐"으로
 * 나타난다.**
 *
 * `import.meta.main` 가드로 막지 않은 것은 의도다 — 그 속성은 Node 24.2.0에서 들어왔고
 * 이 워크스페이스의 `engines`는 `>=24`다. 24.0~24.1에서는 `undefined`라 가드가 거짓이 되어
 * **게이트 본문이 통째로 건너뛰어지고 조용히 exit 0**이 된다. 침묵 통과는 이 게이트가
 * 존재하는 이유 그 자체이므로(`ARCHITECTURE.md` §2.6), 런타임 조건 대신 파일 경계로 갈랐다.
 *
 * **왜 검사가 아니라 형식 금지인가**는 `DOC-CITATION.md` §2에 있다. 요지는 정밀도다 —
 * 우리 트리를 가리키는 줄번호 인용은 정당한 사용이 **정의상 0**이라 오탐이 구조적으로 없고,
 * 그래서 이것은 자유 서술에 의미 패턴을 거는 «격자»가 아니라 **닫힌 구문의 검출**이다.
 */

/**
 * §3.1 — 줄이 움직이지 않는 트리. `CLAUDE.md`가 읽기 전용으로 선언한 레퍼런스 스냅샷이며,
 * 실측에서 이쪽 인용은 전건 정확했다(2026-08-13, 커밋 `9387efb`).
 *
 * **접두는 인용 문자열 안에 있어야 한다.** 산문에 트리 이름을 적고 백틱 안엔 파일명만
 * 두는 형태를 허용하면 판별이 문자열 밖으로 새고, 그 순간 §2가 «오탐 0»으로 세운 근거가
 * 무너진다.
 */
export const FROZEN_TREES = Object.freeze(["openclaw-main/", "hermes-agent-main/"]);

/**
 * 금지 구문 둘(§3.2). **숫자를 필수로 요구하는 것이 §3.3의 `NN` 탈출을 성립시킨다** —
 * 예시가 `NN`이면 이 패턴에 애초에 걸리지 않으므로, 억제 목록도 인용 블록 예외도 두지
 * 않고 규약이 자기 자신을 설명할 수 있다.
 *
 * 경로 부분은 **줄 시작·공백·백틱·괄호 어디에 붙어도** 잡는다. 범위를 좁히면 그 좁힘이
 * 다음 부패가 사는 자리가 된다(§3.3 *"관대하지 않다"*).
 */
const CITATION_PATTERNS = [
  /** `<경로>.md:<숫자>` — 백틱이 파일명 뒤에 붙는 형태(`` `X.md`:5 ``)까지 함께 잡는다. */
  /[A-Za-z0-9_./-]+\.md`?:\d+(?:-\d+)?/g,
  /** `§<절번호>:<숫자>` — 자기 문서의 절:줄. */
  /§\d+(?:\.\d+)*:\d+(?:-\d+)?/g,
];

/** §3.2 — 갈래는 둘이고 «기타»가 없다. 이 이름이 그대로 게이트 출력의 라벨이다. */
const UNPINNED_DOC_LINE = "unpinned-doc-line";
const SELF_SECTION_LINE = "self-section-line";

/**
 * 소스에서 인용 후보를 뽑는다. **탐색 범위는 파일 전체**다(§4) — 머리 규약과 달리 인용은
 * 본문에 살고 자리를 좁힐 수 없다. 좁힐 수 없는 대신 구문으로 줄인다.
 *
 * **문서 이름을 돌려주지 않는다**(§3.2). 순수 판정은 소스 텍스트만 받으므로 파일명을
 * 원리적으로 만들 수 없다 — 게이트 루프가 파일명과 짝지어 출력한다.
 *
 * @param {string} source
 * @returns {{ text: string, line: number }[]} 줄 번호는 1-기반. 판정에 쓰지 않고 출력에만 쓴다.
 */
export function findCitations(source) {
  const found = [];
  const lines = String(source ?? "").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of CITATION_PATTERNS) {
      // `g` 플래그를 가진 정규식은 `lastIndex`를 들고 다닌다. 줄마다 초기화하지 않으면
      // 앞 줄의 위치에서 이어 찾아 **일부 줄을 통째로 건너뛴다** — 조용한 미탐이다.
      pattern.lastIndex = 0;
      for (const match of lines[index].matchAll(pattern)) {
        found.push({ text: match[0], line: index + 1 });
      }
    }
  }

  // 한 줄에 두 갈래가 섞여도 등장 순서대로 읽히게 한다. 출력이 원문 순서와 어긋나면
  // "고칠 곳의 주소"라는 성질이 약해진다.
  return found.sort((a, b) => a.line - b.line);
}

/**
 * 인용 하나를 판정한다. §3.1의 기준은 **«대상 트리가 고정돼 있는가»** 하나이고, 그 판별은
 * 인용 문자열 안에서 완결된다.
 *
 * @param {string} text `findCitations`가 돌려준 `text`
 * @returns {{ ok: true } | { ok: false, violation: string, detail: string }}
 */
export function judgeCitation(text) {
  const value = String(text ?? "");

  if (value.startsWith("§")) {
    return {
      ok: false,
      violation: SELF_SECTION_LINE,
      detail: `자기 문서를 절:줄로 가리킨다 — ${value}. 절이 늘 때마다 자기 줄이 밀리므로 구조적으로 썩는다(§3.4: 문면 인용).`,
    };
  }

  // 동결 트리는 줄이 움직이지 않으므로 줄번호가 산다(§2.2). 접두가 **문자열 안에** 있을
  // 때만 인정한다 — 문맥을 읽어야 알 수 있는 기준은 기계가 못 재고 억제 목록을 부른다.
  if (FROZEN_TREES.some((tree) => value.startsWith(tree))) {
    return { ok: true };
  }

  return {
    ok: false,
    violation: UNPINNED_DOC_LINE,
    detail: `고정되지 않은 트리를 줄번호로 가리킨다 — ${value}. 동결 트리(${FROZEN_TREES.join(" · ")})가 아니면 줄번호를 쓰지 않는다(§3.4).`,
  };
}

/* ===========================================================================
 * 인용부호 구간 — Q-1·Q-2·Q-3 (2026-08-15 이관)
 *
 * **이 파일이 인용부호 구간을 재는 구현의 정본이다**(§6 U-e 2026-08-15 판정). 그 전에는
 * `packages/providers/test/docs-gate-parity.qa.test.ts`에 살고 `plans/`의 하니스 둘로 손
 * 복제돼 있었다. 게이트가 세 번째 소비자가 되는 자리에서 하나로 모았다 — **복제가 값을 못
 * 낸다는 것이 실증됐기 때문이다**: 그 파서의 알려진 한계 둘이 복제본에 그대로 상속됐다.
 *
 * QA 독립성은 파서를 복제해서가 아니라 **역검증 표본을 계약에서 독립으로 도출해서** 지킨다.
 * ======================================================================== */

/**
 * 코드 펜스 여는/닫는 줄. **들여쓰기를 가리지 않는다** — 마커가 있으면 펜스다.
 *
 * **상한을 두지 않는 것이 Q-1이다**(2026-08-15 · `K-112` ②). Q-1은 코드 표기를 **부류**로
 * 정하고 펜스(백틱·물결) 전부를 들이므로 몇 칸을 들여썼든 코드 표기다. 이 자리는 오래
 * 3칸 상한을 들고 있었고 그 상한은 계약보다 좁았다 — 실물이 0건이라 조용했을 뿐이다.
 *
 * **상한을 없애면서 단위 분해 쪽의 «중첩 펜스» 상수와 값이 같아졌고, 그래서 하나로 합쳤다.**
 * 그쪽이 상한을 안 둔 근거(목록 항목 «안»의 펜스는 항목 들여쓰기만큼 더 들어가 그 상한을
 * 넘는다)가 여기서도 그대로 서므로, 둘을 남기면 «다르다»고 말하는 주석만 낡는다.
 *
 * Q-2는 반대 방향의 자리이고 이 변경에 걸리지 않는다 — `docs/*.md`는 **마커 없는** 들여쓰기
 * 코드 블록을 쓰지 않는다. 4칸 들여쓰기는 마커가 없어 무엇인지 알려면 앞 블록을 읽어야 하고,
 * 그러면 판정이 문자열 안에서 안 끝난다. 계약이 그 형태를 금지했고 **그 형태를 안 지우는 것이
 * 여기서는 계약 준수다.** 이 정규식은 마커를 요구하므로 그런 블록을 애초에 안 잡는다.
 */
export const FENCE_LINE = /^\s*(`{3,}|~{3,})/;

/** 같은 길이의 공백으로 지운다 — 줄바꿈은 남겨 좌표계와 줄 구조를 보존한다. */
const blankOut = (chunk) => String(chunk).replace(/[^\n]/g, " ");

/**
 * 코드 «펜스»를 먼저 지운다. **펜스와 인라인 스팬이 한 부류인 것이 Q-1이다** — 코드 표기는
 * 목록이 아니라 부류이고, 그 근거 셋(값의 문법이 요구한다 · 판정이 문자열 안에서 끝난다 ·
 * 감싸서 규칙을 피하는 길이 안 열린다)이 형태를 가리지 않기 때문이다.
 *
 * 인라인 스팬보다 **반드시 먼저**다 — 순서가 뒤면 펜스 안의 백틱이 인라인 쌍으로 잘못
 * 짝지어져 마스크 경계가 원문 밖으로 번진다. `PROVIDERS.md`의 `typescript` 펜스 안에 백틱
 * 쌍이 실제로 들어 있어 이 순서가 실물에서 갈린다.
 *
 * @param {string} doc
 * @returns {string} 길이와 줄 구조가 보존된 마스킹 결과
 */
export function maskCodeFences(doc) {
  const lines = String(doc ?? "").split("\n");
  const out = [];
  let open = null;
  for (const line of lines) {
    const marker = FENCE_LINE.exec(line)?.[1];
    if (open === null) {
      if (marker === undefined) {
        out.push(line);
        continue;
      }
      open = marker;
      out.push(blankOut(line));
      continue;
    }
    if (marker !== undefined && marker[0] === open[0] && marker.length >= open.length) open = null;
    out.push(blankOut(line));
  }
  return out.join("\n");
}

/**
 * 인라인 코드 스팬을 지운다 — Q-1. 스팬은 줄 안에서 닫히는 것만 본다(이 레포 문서의 실물이
 * 전부 그렇고, 줄을 넘는 스팬을 인정하면 짝이 안 맞는 백틱 하나가 문서 절반을 삼킨다).
 *
 * **여는 백틱 런과 닫는 런의 길이가 같아야 한 스팬이다.** Q-1의 술어는 백틱 쌍 안인가이고
 * 백틱의 개수를 가르지 않으므로, 이중 백틱 스팬이 홑 백틱을 담는 형태도 통째로 지워져야
 * 한다. 런 길이를 안 맞추면 마스킹이 스팬 **중간**에서 끊겨 남은 조각이 인용부호 구간으로
 * 잡히고, 그 유령이 근거 없는 red를 만든다(2026-08-14 계약 위반 처분).
 *
 * 짝짓기는 CommonMark와 같다 — 왼쪽 런이 열고, 같은 길이의 «첫» 런이 닫는다. 짝이 없는
 * 런은 내용이므로 그대로 두고 다음 런을 여는 후보로 본다.
 *
 * @param {string} text
 * @returns {string}
 */
export function maskCodeSpans(text) {
  const source = String(text ?? "");
  const runs = [];
  for (let at = 0; at < source.length; at++) {
    if (source[at] !== "`") continue;
    let end = at;
    while (end < source.length && source[end] === "`") end++;
    runs.push({ start: at, end });
    at = end - 1;
  }

  const pieces = [];
  let cursor = 0;
  let index = 0;
  while (index < runs.length) {
    const open = runs[index];
    const width = open.end - open.start;
    let close = -1;
    for (let scan = index + 1; scan < runs.length; scan++) {
      const candidate = runs[scan];
      // 줄을 넘으면 짝짓지 않는다 — 위 문단의 «줄 안에서 닫히는 것만»이다.
      if (source.slice(open.end, candidate.start).includes("\n")) break;
      if (candidate.end - candidate.start === width) {
        close = scan;
        break;
      }
    }
    if (close === -1) {
      index++;
      continue;
    }
    const spanEnd = runs[close].end;
    pieces.push(source.slice(cursor, open.start), blankOut(source.slice(open.start, spanEnd)));
    cursor = spanEnd;
    index = close + 1;
  }
  pieces.push(source.slice(cursor));
  return pieces.join("");
}

/**
 * 평문 큰따옴표의 **부류** — Q-3. 곧은 것과 곡선 것을 가리지 않는다.
 *
 * **부류는 여는 글자와 닫는 글자에 각각 걸린다** — 한쪽만 곡선인 혼합 쌍도 인용부호 구간이다.
 * 쌍으로 읽으면 한쪽만 곡선으로 쓰는 도피처가 열린다. 문자 클래스로 쓰는 것 자체가 그
 * 계약이다 — 쌍별 패턴으로 쓰면 표기 방식이 계약을 바꾼다.
 *
 * **홑따옴표는 밖이다** — 아포스트로피와 표기가 같아 판정이 문자열 안에서 안 끝난다.
 */
const PLAIN_QUOTE_GLYPH = '["“”]';

/**
 * 인용부호 구간 **안**에 올 수 있는 글자 — 인용부호 자신만 뺀다.
 *
 * **줄바꿈은 빼지 않는다**(2026-08-15 · `K-112` ①). 계약 어디도 인용부호 구간이 한 줄
 * 안이라고 말하지 않고, 실물이 있다 — `MEMORY.md`에 손 줄바꿈된 인용 여덟 자리. 줄 안에서만
 * 보면 그 자리들이 구간에서 통째로 빠지고 **U-1도 D-5도 그것을 안 본다.**
 *
 * **상한은 빈 줄이다.** 무경계로 열면 짝이 안 맞는 큰따옴표 하나가 문서 절반을 삼킨다 —
 * 바로 위 `maskCodeSpans`가 코드 스팬에 대해 같은 이유로 줄 경계를 뒀다. 계약이 상한을
 * 정하지 않았으므로 **문단 경계를 고른 것은 이 구현의 선택이고**, 근거는 셋이다:
 * ① 빈 줄은 문자열 안에서 판정되므로 판정이 밖으로 새지 않는다 ② 마크다운에서 문단을 넘는
 * 인라인 표기는 렌더링되지 않으므로 그런 구간은 인용이 아니다 ③ 단위(S-5)를 상한으로 쓰면
 * 파서가 단위 분해에 의존하게 되어 정본의 결이 뒤집힌다.
 */
const NOT_QUOTE_GLYPH = '[^"“”]';

/**
 * 문단 경계 — 빈 줄(공백만 있는 줄 포함). 인용부호 구간은 이것을 넘지 않는다.
 *
 * 정규식 안에서 «빈 줄을 안 담는다»를 직접 쓰기 어려우므로, 구간 후보를 뽑은 뒤 이 패턴으로
 * 걸러낸다. 판정은 여전히 문자열 안에서 끝난다.
 */
const BLANK_LINE = /\n[ \t]*\n/;

/**
 * 인용부호 셋의 구간을 원문 좌표계로 뽑는다 — `*"…"*` · «…» · 평문 큰따옴표.
 *
 * **추출 순서가 계약이다.** 첫 형식을 먼저 잡지 않으면 그 안쪽 평문이 따로 잡혀 한 인용이
 * 두 구간이 된다. 이미 잡힌 구간과 겹치는 후보는 버린다.
 *
 * **0건은 정상 결과다.** 큰따옴표가 전부 코드 표기 안이면 옳은 답이 0건이다. 0건을 던짐으로
 * 두면 그 답을 원리적으로 표현할 수 없다 — 파서가 조용히 죽는 것을 막는 규율은 코퍼스를
 * 먹이는 쪽(문서 단위 호출자)이 든다.
 *
 * @param {string} doc
 * @returns {{ start: number, end: number, form: string }[]} 원문 좌표계의 반열린 구간
 */
export function quoteSpans(doc) {
  const masked = maskCodeSpans(maskCodeFences(doc));
  const spans = [];
  for (const [form, source] of [
    ['*"…"*', `\\*${PLAIN_QUOTE_GLYPH}${NOT_QUOTE_GLYPH}*${PLAIN_QUOTE_GLYPH}\\*`],
    ["«…»", "«[^»]*»"],
    ['"…"', `${PLAIN_QUOTE_GLYPH}${NOT_QUOTE_GLYPH}*${PLAIN_QUOTE_GLYPH}`],
  ]) {
    for (const match of masked.matchAll(new RegExp(source, "g"))) {
      const start = match.index;
      const end = start + match[0].length;
      // 문단 경계를 넘는 후보는 인용부호 구간이 아니다 — 위 `NOT_QUOTE_GLYPH` 문단의 상한.
      if (BLANK_LINE.test(match[0])) continue;
      if (spans.some((span) => start < span.end && span.start < end)) continue;
      spans.push({ start, end, form });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** D-8 — 강조 마커는 별표·밑줄 **부류**다. 종류를 열거로 굳히지 않는다. */
const EMPHASIS_CHARS = Object.freeze(new Set(["*", "_"]));
/** D-9 — 취소선은 이 부류 밖이다. 세지 않되 형태는 알아본다. */
const STRIKETHROUGH_CHAR = "~";

/** `at`의 왼쪽으로 이어지는 같은 글자의 런 길이 */
function runLeft(doc, at, ch) {
  let n = 0;
  while (at - n - 1 >= 0 && doc[at - n - 1] === ch) n++;
  return n;
}

/** `at`에서 오른쪽으로 이어지는 같은 글자의 런 길이 */
function runRight(doc, at, ch) {
  let n = 0;
  while (at + n < doc.length && doc[at + n] === ch) n++;
  return n;
}

/**
 * 구간 `[start, end)`를 **바깥에서 정확히** 감싼 마커를 돌려준다. 없으면 `null`.
 *
 * **«정확히»가 D-7이다.** 왼쪽 끝 바로 앞 글자와 오른쪽 첫 글자가 같은 마커여야 한 쌍이고,
 * 강조 런이 인용과 다른 문자를 **함께** 담으면 여기서 `null`이 나온다 — 그 강조는 인용이
 * 아니라 인용을 품은 표현을 겨눈 것이라 D-5의 근거(벗겨도 U-1이 잃는 것이 없다)가 서지 않는다.
 *
 * `*`와 `_`를 섞은 것은 쌍이 아니다. 취소선은 `kind`로 갈라 돌려주고 D-5 계수에서는 뺀다(D-9).
 *
 * @param {string} doc 원문(마스킹 전) — 구간 좌표계와 같아야 한다
 * @param {number} start
 * @param {number} end
 * @returns {{ char: string, width: number, marker: string, kind: "강조" | "취소선" } | null}
 */
export function outerWrap(doc, start, end) {
  const source = String(doc ?? "");
  const left = source[start - 1];
  const right = source[end];
  if (left === undefined || right === undefined) return null;
  if (left !== right) return null;
  const isEmphasis = EMPHASIS_CHARS.has(left);
  const isStrike = left === STRIKETHROUGH_CHAR;
  if (!isEmphasis && !isStrike) return null;
  const width = Math.min(runLeft(source, start, left), runRight(source, end, right));
  if (width < 1) return null;
  // `~` 하나는 취소선이 아니다 — 마크다운이 쌍을 요구한다.
  if (isStrike && width < 2) return null;
  return { char: left, width, marker: left.repeat(width), kind: isEmphasis ? "강조" : "취소선" };
}

/* ===========================================================================
 * D-5 — 인용부호 구간의 바깥 겹침
 * ======================================================================== */

/**
 * §3.4 D-5의 위반 이름.
 *
 * **`CitationViolation`과 다른 유니온이다**(§4 · 유저 결정 2). §3.2가 든 갈래 둘은
 * «인용 구문»(줄번호 형태)의 것이고 D-5는 §3.4의 규칙이라 성질이 다르다 — 한 유니온에
 * 담으면 §3.2의 «갈래는 둘이고 «기타»가 없다»가 그 순간 거짓이 된다.
 */
const OUTER_EMPHASIS_WRAP = "outer-emphasis-wrap";

/**
 * 소스에서 D-5 위반을 전부 찾는다.
 *
 * 계약은 §3.4다 — **D-7**(정확히 감쌀 때만) · **D-8**(강조 마커는 별표·밑줄 부류) ·
 * **D-9**(취소선은 부류 밖) · **Q-1~Q-3**(코드 표기 마스킹이 먼저, 인용부호 셋 다 부류).
 *
 * **`detail`에 문면을 싣지 않는다**(§4 2026-08-15). D-5의 원문은 인용된 문면이므로 게이트
 * 출력이 실행 리포트·devnote를 거쳐 S-4의 코퍼스에 들어간다 — §3.4가 자기 문면에 대해 둔
 * 자기오염 회피를 게이트가 우회하는 경로가 되면 안 된다. 자리와 마커 폭만 든다.
 *
 * **문서 이름을 돌려주지 않는다**(§3.2와 같은 근거) — 순수 판정은 소스 텍스트만 받는다.
 *
 * @param {string} source
 * @returns {{ line: number, column: number, violation: string, detail: string }[]}
 */
export function findD5Violations(source) {
  const doc = String(source ?? "");
  const found = [];

  for (const span of quoteSpans(doc)) {
    const wrap = outerWrap(doc, span.start, span.end);
    if (wrap === null) continue;
    // D-9 — 취소선은 부류 밖이다. 벗기면 «철회됐다»가 사라지므로 D-5의 근거가 안 선다.
    if (wrap.kind !== "강조") continue;

    const before = doc.slice(0, span.start);
    const line = before.split("\n").length;
    const column = span.start - (before.lastIndexOf("\n") + 1) + 1;

    found.push({
      line,
      column,
      violation: OUTER_EMPHASIS_WRAP,
      detail: `인용부호 구간을 바깥에서 강조 마커 ${wrap.marker.length}겹으로 정확히 감쌌다 — 그 강조를 벗긴다(§3.4 D-5·D-7). 바깥 강조는 인용하는 쪽이 덧씌운 것이라 원문에 대해 아무것도 주장하지 않는다.`,
    });
  }

  return found.sort((a, b) => a.line - b.line || a.column - b.column);
}
