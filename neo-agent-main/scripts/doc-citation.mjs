/**
 * 문서 인용 형식의 **순수 판정**. 정본은 `docs/DOC-CITATION.md` §3이다.
 *
 * **이 모듈의 정본 범위는 «마크다운 구간» 일반이다** (§6 U-e 2026-08-23 판정). 이름이
 * «인용»을 말하지만 실물로 든 것은 펜스 상태 기계(Q-6)와 코드 표기 마스킹(Q-1·Q-4)이었고,
 * 둘 다 인용부호가 아니라 마크다운 구간이다 — 인용부호 구간은 *"그 위에 서는 한 소비자"*다.
 * 그래서 다른 규약의 구간 술어가 여기 산다: `DOC-STATUS.md` §3.6 C-10이 「선언이 살 수 없는
 * 구간」의 술어 셋(코드 표기·펜스·HTML 주석)을 이 자리로 보냈다. **모듈 이름은 안 바꾼다** —
 * 그 이름이 §6 U-e·여러 파일 머리·계약 테스트에 정본으로 박혀 있어 개명이 그 전부를 움직인다.
 * *"넓히는 것은 이름이 아니라 이 선언이다"*.
 *
 * **이 모듈은 임포트를 갖지 않는다 — 계약이다** (같은 판정). 0건인 것은 오래 관측이었고,
 * 그 관측에 다른 규약의 계약이 걸려 있다(`DOC-STATUS.md` §3.6 C-8 — 그 게이트는 매
 * `pnpm check`마다 적재되므로 `typescript`가 임포트 그래프에 들어오면 안 된다). 정확히 재는
 * 것은 *"이 모듈과 그 전이 임포트 그래프에 `typescript`가 없다"*이며, 무임포트는 그것을
 * 원리적으로 보장하는 오늘의 형태다. 형제 `scripts/comment-lexer.mjs`는 반대다 — 그 모듈은
 * 최상위에서 `typescript`를 임포트하고, 그것이 둘을 형제로 가른 근거다. **한 줄이라도 임포트가
 * 생기면 §6 U-e의 재도입 트리거가 발동한다.**
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
 * 인용부호 구간 — Q-1~Q-7 (2026-08-15 이관 · 같은 날 Q-4~Q-7 확정분 반영)
 *
 * **이 파일이 인용부호 구간을 재는 구현의 정본이다**(§6 U-e 2026-08-15 판정). 그 전에는
 * `packages/providers/test/docs-gate-parity.qa.test.ts`에 살고 `plans/`의 하니스 둘로 손
 * 복제돼 있었다. 게이트가 세 번째 소비자가 되는 자리에서 하나로 모았다 — **복제가 값을 못
 * 낸다는 것이 실증됐기 때문이다**: 그 파서의 알려진 한계 둘이 복제본에 그대로 상속됐다.
 *
 * **2026-08-23에 같은 항이 이 모듈의 정본 범위를 마크다운 구간 일반으로 넓혔고, 이 갈래는
 * 그 아래의 한 소비자가 됐다** — 머리말이 그 선언을 든다.
 *
 * QA 독립성은 파서를 복제해서가 아니라 **역검증 표본을 계약에서 독립으로 도출해서** 지킨다.
 * ======================================================================== */

/**
 * 코드 펜스 여는/닫는 줄. **들여쓰기도 인용 블록도 가리지 않는다** — 마커가 있으면 펜스다.
 *
 * **상한을 두지 않는 것이 Q-1이다**(2026-08-15 · `K-112` ②). Q-1은 코드 표기를 **부류**로
 * 정하고 펜스(백틱·물결) 전부를 들이므로 몇 칸을 들여썼든 코드 표기다. 이 자리는 오래
 * 3칸 상한을 들고 있었고 그 상한은 계약보다 좁았다 — 실물이 0건이라 조용했을 뿐이다.
 *
 * **상한을 없애면서 단위 분해 쪽의 «중첩 펜스» 상수와 값이 같아졌고, 그래서 하나로 합쳤다.**
 * 그쪽이 상한을 안 둔 근거(목록 항목 «안»의 펜스는 항목 들여쓰기만큼 더 들어가 그 상한을
 * 넘는다)가 여기서도 그대로 서므로, 둘을 남기면 «다르다»고 말하는 주석만 낡는다.
 *
 * **인용 블록 접두를 들이는 것도 같은 술어다**(2026-08-15 · `K-116`). 접두를 공백류로만
 * 받던 동안 `> ```…` 형태가 펜스로 안 잡혔고, 그래서 **코드 펜스 안의 큰따옴표가 인용부호
 * 구간으로 나와** D-5가 코드 블록 안 문면에 red를 냈다. Q-1의 부류 술어에는 **컨테이너
 * 조건이 없고**, Q-2가 *"들여쓴 **펜스**는 마커가 있으므로 … 몇 칸을 들여썼든 코드 표기다"*로
 * **마커가 가른다**를 한 번 더 못박는다 — 접두가 가르는 것이 아니다. 발견 경위와 재현은
 * `plans/20260815-doc-citation-contract-q-axis-verify-report.md` V-1이 든다.
 *
 * **순수 확장이다** — `(?:>\s*)*`가 빈 문자열에 맞으므로 이전에 잡히던 줄은 전부 그대로
 * 잡힌다. 그래서 이 변경은 원리적으로 **잡는 범위를 줄이지 않는다**. 실물에서도 계수가
 * 안 움직였다(2026-08-15: `docs/*.md` 인용부호 구간 703 · D-5 0 — 변경 전후 같다).
 *
 * **여닫의 «컨테이너»와 «들여쓰기»가 어긋난 쌍은 Q-6이 답했다**(2026-08-15 확정). 닫는 마커는
 * 여는 마커와 **같은 문자**이고 **런 길이가 여는 런 이상**이면 되고, 들여쓰기 폭도 인용 블록
 * 접두도 닫기 판정에 안 든다. 즉 **어긋나도 닫는** 이 구현의 동작이 계약이 고른 답과 같다.
 * 근거는 이 절이 이미 그은 선이다 — Q-2가 *"몇 칸을 들여썼든 코드 표기다"*로 들여쓰기를 열기
 * 판정에서 뺐으므로, 닫기에서 그 선을 뒤집으면 한 절 안에서 같은 낱말이 두 층위로 쓰인다.
 * (이 자리는 2026-08-15까지 그 축을 **미규정**으로 들고 판정을 `K-118`에 넘기고 있었다.)
 *
 * Q-2는 반대 방향의 자리이고 이 변경에 걸리지 않는다 — `docs/*.md`는 **마커 없는** 들여쓰기
 * 코드 블록을 쓰지 않는다. 4칸 들여쓰기는 마커가 없어 무엇인지 알려면 앞 블록을 읽어야 하고,
 * 그러면 판정이 문자열 안에서 안 끝난다. 계약이 그 형태를 금지했고 **그 형태를 안 지우는 것이
 * 여기서는 계약 준수다.** 이 정규식은 마커를 요구하므로 그런 블록을 애초에 안 잡는다.
 */
export const FENCE_LINE = /^\s*(?:>\s*)*(`{3,}|~{3,})/;

/** 같은 길이의 공백으로 지운다 — 줄바꿈은 남겨 좌표계와 줄 구조를 보존한다. */
const blankOut = (chunk) => String(chunk).replace(/[^\n]/g, " ");

/* ==========================================================================
 * 「선언이 살 수 없는 구간」의 주사 — `DOC-STATUS.md` §3.6 C-10·C-11 (2026-08-23)
 *
 * §6 U-e 2026-08-23 판정이 이 모듈의 정본 범위를 **마크다운 구간 일반**으로 이름 붙였고,
 * 저쪽 C-10이 그 규약의 구간 술어 셋(코드 표기·펜스·HTML 주석)을 이 자리로 보냈다.
 * 인용부호 구간(Q-1~Q-7)은 그 위에 서는 한 소비자다.
 *
 * **C-11 — 겹침은 부류별 선주사가 아니라 문서 순서 한 번의 주사로 판정한다.** C-4(*"구간이
 * 겹치면 바깥이 이긴다"*)는 **먼저 열린 구간이 이긴다**는 뜻이고, 부류마다 따로 훑어 마스크를
 * 겹쳐 쌓는 형태로는 만족되지 않는다. 그래서 아래 주사는 «바깥 구간이 없는 상태»에서
 * **다음에 열리는 것 하나**를 문서 순서로 찾아 그것의 닫는 표기만으로 닫는다.
 *
 * **주사를 하나로 두는 것이 계약이다.** 같은 상태 기계를 새 함수로 한 번 더 세우면 이 모듈
 * 안에 펜스 상태 기계가 둘이 되고, 그것이 §6 U-e가 금한 복제다 — 기존 두 표면
 * (`maskCodeFences`·`findQ7Violations`)은 이 주사를 **부류 집합을 좁혀** 쓴다(C-11).
 *
 * **부류가 둘일 때 옛 순차 파이프라인과 값이 같다는 것은 구현이 실측할 일이다**(C-11 말미).
 * 2026-08-23 실측: `neo-agent-main/docs/*.md` 21건 + 합성 표본 16건에서 `maskCodeFences`의
 * 출력과 `findQ7Violations`의 JSON이 재편 전후로 전건 일치했다. 근거:
 * `plans/20260823-doc-status-mask-plan.md` §4 T-002.
 * ======================================================================== */

/**
 * 구간의 부류 — C-10의 `InertKind`. 마스킹으로 배제하는 둘이고 목록은 닫혀 있다(C-1).
 *
 * 값은 저쪽 타입 블록의 문자열 그대로다. 부류를 세는 자리를 늘리지 않으려고 상수로 든다.
 */
const KIND_HTML_COMMENT = "html-comment";
const KIND_CODE_FENCE = "code-fence";

/** 기존 두 표면이 좁혀 쓰는 부류 집합 — C-11. */
const FENCE_ONLY = Object.freeze([KIND_CODE_FENCE]);

/**
 * 렉서 층의 원시 술어가 좁혀 쓰는 부류 집합 — C-10.
 *
 * **펜스가 여기 안 드는 것이 계약이다** — 렉서 층이 답하는 물음은 «무엇이 한 주석인가»이고
 * 「선언이 살 수 없는 구간」은 `DOC-STATUS.md`의 개념이지 렉서의 개념이 아니다.
 */
const COMMENT_ONLY = Object.freeze([KIND_HTML_COMMENT]);

/**
 * 마스킹으로 배제하는 부류 전부 — C-1. **코드 표기는 여기 안 든다**(C-9) — 구간을 열지
 * 않게 막는 데만 쓰고 결과에서 덮지 않는다. 덮지 않는 쪽이 좁고, 좁은 쪽으로 간다.
 */
const MASKED_KINDS = Object.freeze([KIND_HTML_COMMENT, KIND_CODE_FENCE]);

/** HTML 주석의 여닫 표기. 이 둘 말고 다른 표기는 주석을 열지도 닫지도 않는다. */
const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";

/**
 * 문서 순서 한 번의 주사 — 마스킹 결과와 **문서 끝에서 열린 채인 구간의 자리**를 함께 낸다.
 *
 * **둘을 한 함수가 내는 것이 Q-7의 요구이자 C-10의 계약이다.** 미닫힘은 마스킹의 부작용이
 * 아니라 마스킹이 아는 사실이고, 그 사실을 밖에서 다시 재려면 이 상태 기계를 복제해야 한다 —
 * 이 파일이 정본이 된 근거(§6 U-e 2026-08-15)가 바로 «복제가 값을 못 낸다»였다.
 *
 * **열린 채인 구간은 이 규칙상 최대 하나**이므로 `unclosed`가 단수다(C-11).
 *
 * **닫기 판정은 마커만 본다** — 같은 문자이고 런 길이가 여는 런 이상이면 닫는다. 들여쓰기
 * 폭도 인용 블록 접두도 닫기 판정에 안 든다(§3.4 Q-6).
 *
 * **마스킹은 글자 단위이고 줄을 안 지운다**(C-2) — 개행 아닌 글자만 공백으로 바뀌므로 줄 수와
 * 열 오프셋이 보존된다.
 *
 * **코드 표기는 구간을 열지 않되 덮이지도 않는다**(C-9) — 백틱으로 감싼 자리의 `<!--`·`-->`는
 * 글자일 뿐이므로 여는 후보에서 뺀다. 반대로 **닫기는 코드 표기를 안 본다**: 구간 «안»에서는
 * 모든 것이 바깥 구간의 내용이고 닫는 표기만이 그것을 닫는다(C-4).
 *
 * `spans`는 이 주사가 연 구간 전부다 — 렉서 층의 원시 술어가 이것을 쓴다(C-10). 마스킹
 * 결과만 필요한 소비자는 그 필드를 안 읽는다.
 *
 * @param {string} doc
 * @param {readonly string[]} kinds 이 주사가 여는 부류 집합
 * @returns {{ masked: string, unclosed: { kind: string, line: number, column: number } | null, spans: { start: number, end: number }[] }}
 */
function scanInert(doc, kinds) {
  const source = String(doc ?? "");
  const wantFence = kinds.includes(KIND_CODE_FENCE);
  const wantComment = kinds.includes(KIND_HTML_COMMENT);

  const lineStart = [0];
  for (let at = 0; at < source.length; at += 1) {
    if (source[at] === "\n") lineStart.push(at + 1);
  }
  /** 개행을 뺀 줄 끝 오프셋. */
  const lineEnd = (index) =>
    index + 1 < lineStart.length ? lineStart[index + 1] - 1 : source.length;

  /** `from` 이상에서 시작하는 첫 줄의 인덱스. `hint` 이전은 안 본다. */
  const lineIndexFrom = (from, hint) => {
    let index = hint;
    while (index < lineStart.length && lineStart[index] < from) index += 1;
    return index;
  };

  /** `offset`을 담은 줄의 인덱스. */
  const lineIndexOf = (offset) => {
    let low = 0;
    let high = lineStart.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStart[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  /**
   * `fromLine` 이상의 첫 펜스 줄. `open`이 주어지면 그것을 **닫는** 줄만 고른다(Q-6).
   *
   * 자리는 **마커의 첫 글자**다. `FENCE_LINE`이 `^`에 묶여 있으므로 `match[0]`은 접두까지
   * 통째로 물고, 그 길이에서 마커 길이를 빼면 마커가 시작하는 열이 나온다(1-기반).
   */
  const fenceLine = (fromLine, open) => {
    for (let index = fromLine; index < lineStart.length; index += 1) {
      const match = FENCE_LINE.exec(source.slice(lineStart[index], lineEnd(index)));
      if (match === null) continue;
      const marker = match[1];
      if (open !== null && !(marker[0] === open[0] && marker.length >= open.length)) continue;
      return { index, marker, column: match[0].length - marker.length + 1 };
    }
    return null;
  };

  /**
   * `at`이 코드 표기 «안»이면 그 표기의 끝 오프셋, 아니면 `null` — C-9.
   *
   * 짝짓기는 `maskCodeSpans`와 같은 술어다: 여는 런과 **길이가 같은 첫 런**이 닫고, 짝 없는
   * 런은 표기가 아니라 내용이다. 줄을 넘지 않으므로 판정 범위가 `at`의 줄 안에서 끝난다.
   *
   * **범위의 왼쪽 끝이 `from`인 것이 C-4의 귀결이다** — 바깥 구간에서 빠져나온 자리가 줄
   * 중간이면, 그 앞의 백틱은 이미 지나간 구간의 내용이라 여기서 짝을 이룰 수 없다.
   */
  const codeSpanAt = (from, at) => {
    const index = lineIndexOf(at);
    const start = Math.max(from, lineStart[index]);
    const end = lineEnd(index);

    const runs = [];
    for (let scan = start; scan < end; scan += 1) {
      if (source[scan] !== "`") continue;
      let run = scan;
      while (run < end && source[run] === "`") run += 1;
      runs.push({ start: scan, end: run });
      scan = run - 1;
    }

    let cursor = 0;
    while (cursor < runs.length) {
      const open = runs[cursor];
      const width = open.end - open.start;
      let close = -1;
      for (let scan = cursor + 1; scan < runs.length; scan += 1) {
        if (runs[scan].end - runs[scan].start === width) {
          close = scan;
          break;
        }
      }
      if (close === -1) {
        cursor += 1;
        continue;
      }
      if (at >= open.start && at < runs[close].end) return runs[close].end;
      cursor = close + 1;
    }
    return null;
  };

  /** `from` 이상의 첫 HTML 주석 여는 표기. 코드 표기 안의 것은 건너뛴다(C-9). */
  const commentOpen = (from) => {
    let at = from;
    while (at <= source.length) {
      const pos = source.indexOf(COMMENT_OPEN, at);
      if (pos === -1) return null;
      const inCode = codeSpanAt(from, pos);
      if (inCode === null) return pos;
      at = inCode;
    }
    return null;
  };

  const spans = [];
  let unclosed = null;
  let cursor = 0;
  let cursorLine = 0;

  while (cursor <= source.length) {
    // ① 바깥 구간이 없는 상태에서 **다음에 열리는 것 하나**를 문서 순서로 찾는다(C-11).
    //    여는 줄의 머리가 `cursor` 이상인 줄만 후보다 — 그보다 앞에서 시작한 줄은 그 머리가
    //    이미 지나간 구간 안이므로 마커가 바깥 구간의 내용일 뿐이다(C-4).
    cursorLine = lineIndexFrom(cursor, cursorLine);
    let opened = null;
    if (wantFence) {
      const fence = fenceLine(cursorLine, null);
      if (fence !== null) {
        opened = {
          kind: KIND_CODE_FENCE,
          index: fence.index,
          marker: fence.marker,
          start: lineStart[fence.index],
          line: fence.index + 1,
          column: fence.column,
        };
      }
    }
    if (wantComment) {
      const pos = commentOpen(cursor);
      // **같은 자리에서 둘이 후보이면 줄머리의 펜스 판별이 이긴다**(C-9) — 그래서 주석이
      // **더 앞**일 때만 후보를 바꾼다.
      if (pos !== null && (opened === null || pos < opened.start)) {
        const { line, column } = positionOf(source, pos);
        opened = { kind: KIND_HTML_COMMENT, start: pos, line, column };
      }
    }
    if (opened === null) break;

    // ② 그것의 **닫는 표기만으로** 닫는다. 부류를 더 열지 않는다 — 안쪽에서 다른 부류의
    //    여는 표기가 나와도 바깥 구간의 내용이다(C-4).
    //    안 닫히면 문서 끝까지가 구간이고, 그 사실을 자리와 함께 낸다(C-5 · Q-7).
    if (opened.kind === KIND_HTML_COMMENT) {
      // **[미규정]** 정본이 `<!-->`(여는 표기와 닫는 표기가 두 글자를 공유하는 형태)를 안
      // 정한다. 닫는 표기를 여는 표기 **뒤**에서만 찾으므로 그것은 미닫힘이고, 그 답이
      // fail-closed 쪽이라 이 게이트가 선 방향(`ARCHITECTURE.md` §2.6)과 같다.
      const close = source.indexOf(COMMENT_CLOSE, opened.start + COMMENT_OPEN.length);
      if (close === -1) {
        spans.push({ start: opened.start, end: source.length });
        unclosed = { kind: opened.kind, line: opened.line, column: opened.column };
        break;
      }
      const end = close + COMMENT_CLOSE.length;
      spans.push({ start: opened.start, end });
      cursor = end;
      continue;
    }

    const close = fenceLine(opened.index + 1, opened.marker);
    if (close === null) {
      spans.push({ start: opened.start, end: source.length });
      unclosed = { kind: opened.kind, line: opened.line, column: opened.column };
      break;
    }
    spans.push({ start: opened.start, end: lineEnd(close.index) });
    cursor = lineEnd(close.index);
    cursorLine = close.index + 1;
  }

  const pieces = [];
  let written = 0;
  for (const span of spans) {
    pieces.push(source.slice(written, span.start), blankOut(source.slice(span.start, span.end)));
    written = span.end;
  }
  pieces.push(source.slice(written));
  return { masked: pieces.join(""), unclosed, spans };
}

/**
 * HTML 주석 토큰의 구간 — **렉서 층의 원시 술어**(C-10). 답하는 물음은 «무엇이 한 주석인가»
 * 하나이고, 「선언이 살 수 없는 구간」은 모른다 — 그것은 `DOC-STATUS.md`의 개념이지 렉서의
 * 개념이 아니라서 펜스가 이 주사의 부류에 안 든다.
 *
 * **좌표 이름이 `pos`·`end`인 것은 형제 모듈과 같은 좌표계를 쓰기 때문이다** —
 * `scripts/comment-lexer.mjs`의 `commentTokenSpans`가 내는 값과 같은 형태이고, 그 모듈의
 * 확장자 표에 `.md` 갈래가 설 때 그 갈래가 이 함수를 부른다.
 *
 * **부류를 주석 하나로 좁혀 위 주사를 쓴다**(C-11) — 같은 상태 기계를 여기서 한 번 더 세우면
 * 이 모듈 안에 주석 스캐너가 둘이 되고, 그것이 §6 U-e가 금한 복제다.
 *
 * 문서 끝까지 안 닫힌 주석은 **끝까지가 한 구간**이다. `scripts/comment-lexer.mjs`의
 * TypeScript 갈래가 미닫힌 블록 주석에 대해 내는 값과 같은 형태다 — 「안 닫혔다」를 라벨 있는
 * 실패로 드는 것은 이 층이 아니라 그 위의 소비자다(C-5).
 *
 * @param {string} doc
 * @returns {{ pos: number, end: number }[]} `pos` 오름차순이고 구간은 겹치지 않는다
 */
export function htmlCommentSpans(doc) {
  return scanInert(doc, COMMENT_ONLY).spans.map((span) => ({ pos: span.start, end: span.end }));
}

/**
 * 「선언이 살 수 없는 구간」 중 **마스킹으로 배제하는 둘**(C-1) — HTML 주석과 펜스. 코드
 * 표기는 구간을 열지 않게 막는 데만 쓰고 결과에서 덮지 않는다(C-9).
 *
 * **산출이 하나의 술어 함수인 것이 계약이다**(C-10) — 셋을 호출자가 조립하면 C-4(겹침)와
 * C-9(투과)의 순서가 호출자마다 갈린다. 마스킹 결과와 미닫힘 자리를 한 함수가 함께 낸다.
 *
 * **`spans`를 안 내보낸다** — 반환 형태의 정본은 `DOC-STATUS.md` §3.6 C-10의 타입 블록이고
 * 그 블록이 필드 둘을 든다. 구간 목록이 필요한 물음은 위 원시 술어가 답한다.
 *
 * @param {string} doc
 * @returns {{ masked: string, unclosed: { kind: string, line: number, column: number } | null }}
 */
export function scanInertContext(doc) {
  const { masked, unclosed } = scanInert(doc, MASKED_KINDS);
  return { masked, unclosed };
}

/**
 * 코드 «펜스»를 먼저 지운다. **펜스와 인라인 스팬이 한 부류인 것이 Q-1이다** — 코드 표기는
 * 목록이 아니라 부류이고, 그 근거 셋(값의 문법이 요구한다 · 판정이 문자열 안에서 끝난다 ·
 * 감싸서 규칙을 피하는 길이 안 열린다)이 형태를 가리지 않기 때문이다.
 *
 * 인라인 스팬보다 **반드시 먼저**다 — 순서가 뒤면 펜스 안의 백틱이 인라인 쌍으로 잘못
 * 짝지어져 마스크 경계가 원문 밖으로 번진다. `PROVIDERS.md`의 `typescript` 펜스 안에 백틱
 * 쌍이 실제로 들어 있어 이 순서가 실물에서 갈린다.
 *
 * **부류를 펜스 하나로 좁혀 위 주사를 쓴다**(C-11) — 이 표면의 소비자는 인용부호 구간이고,
 * 그 축에는 HTML 주석이 부류로 들지 않는다.
 *
 * @param {string} doc
 * @returns {string} 길이와 줄 구조가 보존된 마스킹 결과
 */
export function maskCodeFences(doc) {
  return scanInert(doc, FENCE_ONLY).masked;
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
    // **여는 글자도 함께 제외한다.** 바로 아래 평문 형식이 `["“”]` 셋을 함께 빼는 것과 같은
    // 자리다 — 그 형식은 여닫 글자가 같은 문자라 한 클래스가 둘을 겸했을 뿐이고, 겹화살괄호는
    // 글자가 갈리므로 둘을 명시해야 같은 계약이 된다(Q-3 — 부류는 여는 글자와 닫는 글자에
    // 각각 걸린다).
    //
    // **안 빼면 짝 없는 여는 글자 하나가 뒤의 정당한 인용을 삼킨다.** 그러면 그 인용이 구간에서
    // 사라져 **D-5 검출이 조용히 꺼진다** — 2026-08-15 독립 QA가 실물로 재현했다. 줄바꿈을
    // 클래스에서 뺀 같은 날의 처분이 이 노출을 문서 전체로 넓혔다(그 전에는 한 줄에 갇혔다).
    ["«…»", "«[^«»]*»"],
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
 * 담으면 §3.2의 *"갈래를 둘로 닫는다"*가 그 순간 거짓이 된다.
 */
const OUTER_EMPHASIS_WRAP = "outer-emphasis-wrap";

/**
 * 소스에서 D-5 위반을 전부 찾는다.
 *
 * 계약은 §3.4다 — **D-7**(정확히 감쌀 때만) · **D-8**(강조 마커는 별표·밑줄 부류) ·
 * **D-9**(취소선은 부류 밖) · **Q-1~Q-6**(코드 표기 마스킹이 먼저 · 마스킹은 인용부호 셋
 * 전부에 걸린다 · 부류는 여닫 자리에 각각 걸리고 배치를 안 묻는다 · 펜스 닫기는 마커만 본다).
 *
 * **Q-7은 이 함수의 계약이 아니라 이 함수를 믿어도 되는가의 전제다.** 짝이 어긋난 문서에서
 * 여기 나오는 0은 «위반 없음»이 아니라 «안 쟀다»이고, 그 둘을 가르는 것은 호출자의 몫이다
 * (§4 · `findQ7Violations`).
 *
 * **`detail`에 문면을 싣지 않는다**(§4 2026-08-15). D-5의 원문은 인용된 문면이므로 게이트
 * 출력이 실행 리포트·devnote를 거쳐 S-4의 코퍼스에 들어간다 — §3.4가 자기 문면에 대해 둔
 * 자기오염 회피를 게이트가 우회하는 경로가 되면 안 된다. 자리와 마커 폭만 든다.
 *
 * **문서 이름을 돌려주지 않는다**(§3.2와 같은 근거) — 순수 판정은 소스 텍스트만 받는다.
 *
 * **열은 감싼 강조 마커의 첫 글자다**(2026-08-16 — §3.4 P-4 · §4). 위반 형태가 구간이 아니라
 * «구간 + 그것을 감싼 강조»이고, 처방이 손댈 첫 글자가 마커이기 때문이다 — 구간을 가리키면
 * 커서가 지울 자리 뒤에 선다. 줄은 안 바뀐다: 마커는 구간에 붙어 있어 같은 줄이다.
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

    // P-4 — 자리는 위반 형태의 첫 글자, 즉 감싼 마커의 시작이다. `outerWrap`이 든 폭만큼
    // 왼쪽으로 간다. `width`는 좌우 런의 최솟값이므로 오프셋이 음수가 될 수 없다.
    //
    // **비대칭 런(왼쪽 3·오른쪽 2)에서도 그 최솟값이 답이다** — §3.4가 2026-08-17에 추인으로
    // 닫았다(`DOC-CITATION.md` §3.4 D-7 · `K-125`). 그날까지 «위반 형태의 첫 글자»가 왼쪽 런의 첫
    // 글자인지 좁은 쪽 런의 첫 글자인지는 어디에도 안 적혀 있었고, 추인의 근거가 «구현이 이미
    // 그 값이기 때문»이므로 이 계산이 그대로 정본의 값이 됐다. 논거도 D-7 자신의 것이다 —
    // 좁은 쪽 런만이 인용을 정확히 감싸므로 그 폭에 대해서만 «바로 바깥»이 성립하고, 남는
    // 마커는 인용 밖 문자에 걸린 강조라 D-7이 이미 D-5 밖에 둔 것이다.
    const { line, column } = positionOf(doc, span.start - wrap.width);

    found.push({
      line,
      column,
      violation: OUTER_EMPHASIS_WRAP,
      detail: `인용부호 구간을 바깥에서 강조 마커 ${wrap.marker.length}겹으로 정확히 감쌌다 — 그 강조를 벗긴다(§3.4 D-5·D-7). 바깥 강조는 인용하는 쪽이 덧씌운 것이라 원문에 대해 아무것도 주장하지 않는다.`,
    });
  }

  return found.sort((a, b) => a.line - b.line || a.column - b.column);
}

/* ===========================================================================
 * Q-7 — 짝이 어긋난 입력을 조용한 0으로 두지 않는다
 *
 * 위 `quoteSpans`는 **글자가 짝을 이룬다고 가정한다.** 가정이 깨지면 틀린 답이 아니라
 * **0**이 나온다 — 짝 없는 평문 글자 하나가 좌우 짝짓기를 밀어 뒤의 정당한 인용을 삼키고,
 * 안 닫힌 펜스는 문서 끝까지 마스크해 뒤쪽 구간을 통째로 없앤다. 그러면 그 문서의 D-5
 * 검출이 조용히 꺼진다.
 *
 * **그래서 짝짓기를 고치는 대신 가정이 깨진 것을 드러낸다**(§3.4 Q-7). 평문은 여닫 글자가
 * 같은 문자라 어느 쪽이 여는 글자인지가 문자열 안에서 안 갈린다 — 겹화살괄호 갈래를 닫은
 * 수(여는 글자를 문자 부류에 더한다)가 여기서는 안 통한다. 게이트를 fail-closed로 두는
 * 선택이 이 자리에서도 그대로 선다(`ARCHITECTURE.md` §2.6).
 *
 * **겹화살괄호 부류는 이 검사 밖이다** — 여는 글자와 닫는 글자가 다르므로 짝이 어긋나도
 * 패리티가 안 밀린다. 재도입 트리거는 §3.4가 든다.
 * ======================================================================== */

/**
 * §3.4 Q-7의 위반 이름 둘.
 *
 * **`RuleViolation` 유니온에 든다 — D-5와 같은 유니온이다**(§4 2026-08-15). 셋 다 §3.4의
 * 규칙이고 판정이 문서 문자열 안에서 끝나므로 성질이 같다. §3.2가 든 갈래 둘(`CitationViolation`)과
 * 갈라 두는 근거는 그대로다 — 그쪽은 «인용 구문»의 갈래라 한 유니온에 담으면 §3.2의
 * *"갈래를 둘로 닫는다"*가 그 순간 거짓이 된다.
 */
const UNPAIRED_QUOTE_GLYPH = "unpaired-quote-glyph";
const UNCLOSED_CODE_FENCE = "unclosed-code-fence";

/**
 * 마스킹된 문서를 문단으로 자른다. 각 덩어리는 원문 좌표계의 시작 오프셋을 함께 든다.
 *
 * **경계는 `BLANK_LINE` 하나다** — `quoteSpans`가 후보를 버릴 때 쓰는 바로 그 값이다. 상한이
 * 다른 값이면 그물이 지키려는 대상과 어긋난다(§3.4 *"상한은 구간 추출이 쓰는 것과 같은 값이다"*).
 * 패리티의 단위가 S-5의 «단위»가 아닌 이유도 같은 자리다 — 파서가 단위 분해에 의존하기
 * 시작하면 정본의 결이 뒤집힌다.
 *
 * @param {string} masked 길이와 줄 구조가 원문과 같은 마스킹 결과
 * @returns {{ start: number, text: string }[]}
 */
function paragraphChunks(masked) {
  // `BLANK_LINE`은 `g`가 없다(`quoteSpans`는 `test`로만 쓴다). 여기서는 자리가 필요하므로
  // **같은 source에서** 전역 사본을 만든다 — 패턴을 새로 쓰지 않는 것이 요점이다.
  const boundary = new RegExp(BLANK_LINE.source, "g");
  const chunks = [];
  let start = 0;
  for (const match of masked.matchAll(boundary)) {
    chunks.push({ start, text: masked.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  chunks.push({ start, text: masked.slice(start) });
  return chunks;
}

/** 원문 오프셋을 1-기반 줄·열로. `findD5Violations`도 이것을 쓴다 — 한 계산이 두 갈래를 낸다. */
function positionOf(doc, offset) {
  const before = doc.slice(0, offset);
  return {
    line: before.split("\n").length,
    column: offset - (before.lastIndexOf("\n") + 1) + 1,
  };
}

/**
 * 소스에서 Q-7 위반을 전부 찾는다 — 갈래 둘.
 *
 * ① **문단 안 평문 부류 글자의 수가 홀수** → 그 문단의 첫 글자를 자리로 든다. **어느 글자가
 * 짝을 잃었는지는 문자열 안에서 안 갈리고, 그것이 이 규칙이 존재하는 이유 자체다** — 출력이
 * 특정 글자를 지목하면 그 지목이 거짓일 수 있다(§3.4).
 * ② **펜스가 문서 끝까지 안 닫힘** → 여는 줄을 자리로 든다. 이쪽은 자리가 특정된다.
 *
 * **마스킹이 먼저다**(Q-1·Q-4) — 코드 표기 안의 글자는 인용부호가 아니고, 그것이 정당한
 * 홀수 글자의 탈출구다(§3.3이 숫자에 대해 둔 탈출과 같은 자리).
 *
 * **`detail`에 문면을 싣지 않는다**(§4 2026-08-15) — D-5와 같은 근거다. 게이트 출력이 실행
 * 리포트·devnote를 거쳐 S-4의 코퍼스에 들어가는 경로를 막는다.
 *
 * **문서 이름을 돌려주지 않는다**(§3.2와 같은 근거) — 순수 판정은 소스 텍스트만 받는다.
 *
 * @param {string} source
 * @returns {{ line: number, column: number, violation: string, detail: string }[]}
 */
export function findQ7Violations(source) {
  const doc = String(source ?? "");
  // 부류를 펜스 하나로 좁혀 문서 순서 주사를 쓴다(C-11). 이 갈래가 세는 것은 Q-7의 미닫힌
  // **펜스**이므로 다른 부류가 들면 위반 이름과 부류가 어긋난다.
  const { masked, unclosed } = scanInert(doc, FENCE_ONLY);
  const withoutCode = maskCodeSpans(masked);
  const found = [];

  const glyph = new RegExp(PLAIN_QUOTE_GLYPH, "g");
  for (const chunk of paragraphChunks(withoutCode)) {
    // `g` 정규식은 `lastIndex`를 들고 다닌다. `String#match`가 초기화한다는 것에 기대지
    // 않고 직접 되돌린다 — 위 `findCitations`가 같은 함정에서 같은 처방을 쓴다.
    glyph.lastIndex = 0;
    const count = chunk.text.match(glyph)?.length ?? 0;
    if (count % 2 === 0) continue;
    const { line, column } = positionOf(withoutCode, chunk.start);
    found.push({
      line,
      column,
      violation: UNPAIRED_QUOTE_GLYPH,
      detail: `이 문단의 평문 인용부호 글자가 홀수라 인용부호 구간이 판정되지 않는다(§3.4 Q-7). 짝을 맞추거나, 짝이 없는 글자를 코드 표기로 들어 마스킹되게 한다. 자리는 문단의 첫 글자다 — 어느 글자가 짝을 잃었는지는 문자열 안에서 안 갈린다.`,
    });
  }

  if (unclosed !== null) {
    found.push({
      line: unclosed.line,
      column: unclosed.column,
      violation: UNCLOSED_CODE_FENCE,
      detail: `이 펜스가 문서 끝까지 안 닫혀 뒤쪽 인용부호 구간이 통째로 마스킹된다(§3.4 Q-7). 닫는 마커는 여는 마커와 같은 문자이고 런 길이가 여는 런 이상이어야 한다(Q-6).`,
    });
  }

  return found.sort((a, b) => a.line - b.line || a.column - b.column);
}
