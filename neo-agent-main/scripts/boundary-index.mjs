/**
 * 경계 층 인덱스의 **순수 판정**. 정본은 `docs/PUBLIC-TREE.md` §4다.
 *
 * 이 레포에는 문서→코드 방향의 수단만 있었다 — 파일 머리가 자기 정본 §를 인용하고
 * `scripts/check-doc-citation.mjs`가 그 형식을 잰다. **반대 방향이 없었다**: 파일 쪽에서
 * 내가 어느 계약의 일부인가를 묻는 수단이 2026-09-03까지 0이었고, 그 부재가 실물로
 * 증명된 자리를 `PUBLIC-TREE.md` §2.1이 든다. 이 모듈이 그 방향의 판정을 맡는다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 게이트 실행부는 `check-boundary-index.mjs`에 있고 이 모듈을 임포트한다.
 * 두 파일로 가른 근거는 `scripts/doc-citation.mjs` 머리와 같다 — 한 파일이면 계약
 * 테스트가 순수 함수만 쓰는데도 임포트 순간 게이트가 돌고, 실물이 레드인 날엔
 * `process.exit(1)`이 vitest 워커를 죽여 계약 위반이 테스트 파일 소실로 나타난다.
 *
 * **이 모듈은 임포트를 갖지 않는다.** `doc-citation.mjs`와 같은 이유이며(그 파일 머리),
 * 매 `pnpm check`마다 적재되는 자리에 `typescript`가 딸려 들어오는 것을 원리적으로 막는다.
 *
 * **판정은 관대하지 않다.** `DOC-STATUS.md` §5.1·`PUBLIC-TREE.md` §4.2와 같은 자리다 —
 * 마크업·괄호 주석·둘 이상의 값은 행 파싱 실패이고, 조용한 통과를 만들지 않는다.
 */

/**
 * 생성 구간의 여는 표시. **이 문자열이 정본이다** — `docs/BOUNDARY-LAYERS.md`는 이것을
 * 문면으로 다시 적지 않는다(적으면 그 설명 자체가 두 번째 구간을 열어 자기오염이 된다.
 * `DOC-STATUS.md` §2.2가 이름 붙인 형태이며 이 레포는 그것을 되풀이해 겪었다).
 */
export const SPAN_OPEN = "<!-- boundary-index: begin (generated) -->";
/** 생성 구간의 닫는 표시. 근거는 `SPAN_OPEN`과 같다. */
export const SPAN_CLOSE = "<!-- boundary-index: end -->";

/** 층 선언 표의 머리 행. 세 셀의 이름이 §4.2의 표와 같아야 한다. */
export const LAYER_TABLE_HEADER = Object.freeze(["층", "경로", "정본"]);

/** 디렉터리 스코프를 펼칠 때 소스 파일로 세는 확장자. 형식 선언 파일은 소스가 아니다. */
export const SOURCE_EXTENSION = ".ts";
/** 소스 파일에서 제외하는 꼬리 — 형식 선언은 계약을 강제하지 않는다. */
export const DECLARATION_SUFFIX = ".d.ts";

/** §4.2 — 경로 셀이 받지 않는 글자. 글롭 문법을 도입하지 않는다. */
const GLOB_CHARACTERS = "*?[]{}!";

/** 절 번호 하나. `§` 뒤에 숫자와 점만 온다. */
const SECTION_NUMBER = String.raw`\d+(?:\.\d+)*`;

/** 표 행 — 파이프 넷으로 감싼 세 셀. 관대하지 않다: 앞뒤 공백 외에는 아무것도 안 받는다. */
const TABLE_ROW = /^\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/;
/** 표의 구분 행(`|---|---|---|`). 셀 판별 전에 걸러 낸다. */
const TABLE_DIVIDER = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;
/** 절 제목 — `## 2. ...` 꼴. 층 선언 표가 사는 절을 찾는다. */
const SECTION_HEAD = /^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s/;

/** 경로 셀 — 백틱으로 감싼 경로 하나. 그 밖의 글자가 있으면 행 파싱 실패다. */
const PATH_CELL = /^`([^`]+)`$/;
/** 정본 셀 — 백틱 문서명 하나 + `§<절번호>` 하나. */
const DOC_CELL = new RegExp(String.raw`^\`([^\`/]+\.md)\`\s+§(${SECTION_NUMBER})$`);
/** 층 셀 — 마크업·백틱·괄호 없는 이름 하나. */
const LAYER_CELL = /^[^`*_[\]()<>#§|]+$/;

/** §4.4의 실패 갈래. 이 이름이 그대로 게이트 출력의 라벨이 된다. */
export const VIOLATIONS = Object.freeze({
  indexStale: "인덱스 불일치",
  uncited: "정본 없는 경계 파일",
  rowMalformed: "층 선언 행 파싱 실패",
  deadSection: "정본 § 부재",
});

/**
 * 문자열 안에서 부분 문자열이 나오는 횟수. `String.prototype.split`을 쓰지 않는 것은
 * 표시가 겹칠 수 없다는 가정을 코드가 지지 않게 하려는 것이다.
 *
 * @param {string} text
 * @param {string} needle
 * @returns {number}
 */
function countOf(text, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

/**
 * 생성 구간을 찾는다. **없거나 안 닫혔거나 둘 이상이면 통과가 아니라 실패다**(§4.4의
 * fail-closed 그물). 관대하게 파일 끝까지로 읽지 않는 근거는 `DOC-STATUS.md` §3.6 C-5와
 * 같다 — 그 읽기에서는 표시 하나를 지워 인덱스를 통째로 없앨 수 있고, 원인이 위반 이름에
 * 안 남는다.
 *
 * @param {string} source
 * @returns {{ ok: true, start: number, end: number, body: string }
 *          | { ok: false, reason: string, detail: string }}
 */
export function findGeneratedSpan(source) {
  const text = String(source ?? "");
  const opens = countOf(text, SPAN_OPEN);
  const closes = countOf(text, SPAN_CLOSE);

  if (opens === 0) {
    return { ok: false, reason: "span-missing", detail: "생성 구간의 여는 표시가 없다" };
  }
  if (opens > 1) {
    return { ok: false, reason: "span-duplicate", detail: `여는 표시가 ${opens}개다` };
  }
  if (closes === 0) {
    return { ok: false, reason: "span-unterminated", detail: "생성 구간이 안 닫혔다" };
  }
  if (closes > 1) {
    return { ok: false, reason: "span-duplicate", detail: `닫는 표시가 ${closes}개다` };
  }

  const start = text.indexOf(SPAN_OPEN);
  const end = text.indexOf(SPAN_CLOSE);
  if (end < start + SPAN_OPEN.length) {
    return { ok: false, reason: "span-inverted", detail: "닫는 표시가 여는 표시보다 앞에 있다" };
  }

  return { ok: true, start, end, body: text.slice(start + SPAN_OPEN.length, end) };
}

/**
 * 절 번호가 실제로 그 문서에 있는가. `PUBLIC-TREE.md` §3.3의 `dead-section`과 같은 판정이고,
 * §4.2가 정본 셀에 § 포인터를 의무로 걸었으므로 이 술어가 그 의무를 잰다.
 *
 * @param {string} source 문서 원문
 * @param {string} section `§` 없는 절 번호 (예: `2` · `4.3`)
 * @returns {boolean}
 */
export function hasSection(source, section) {
  for (const line of String(source ?? "").split("\n")) {
    const head = SECTION_HEAD.exec(line);
    if (head !== null && head[2] === section) return true;
  }
  return false;
}

/**
 * 층 선언 표를 읽는다. **표의 자리는 §2 하나**이고(§4.2), 그 절 안의 첫 표만 읽는다 —
 * 문서의 다른 절이 표를 갖더라도 선언이 되지 않는다.
 *
 * 행 하나라도 문법에 안 맞으면 그 행을 건너뛰지 않고 **파싱 실패로 든다**. 건너뛰면
 * 오타 하나가 층을 통째로 인덱스 밖으로 옮기고, 게이트는 그린이 된다.
 *
 * @param {string} source `BOUNDARY-LAYERS.md` 원문
 * @returns {{ ok: true, rows: { layer: string, path: string, doc: string, section: string,
 *             line: number }[] }
 *          | { ok: false, reason: string, detail: string }}
 */
export function parseLayerTable(source) {
  const span = findGeneratedSpan(source);
  if (!span.ok) return span;

  const text = String(source ?? "");
  const lines = text.split("\n");

  // 생성 구간의 줄 범위. 선언 표가 구간 안에 있으면 그것은 생성물이 자기 입력이 되는
  // 순환이므로 실패다 — 손으로 유지되는 것은 표뿐이고 표는 구간 밖에 산다(§4.2·§4.3).
  const spanFirstLine = text.slice(0, span.start).split("\n").length;
  const spanLastLine = text.slice(0, span.end).split("\n").length;

  let sectionLevel = 0;
  let inTargetSection = false;
  let seenTable = false;
  let closedTable = false;
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const head = SECTION_HEAD.exec(line);
    if (head !== null) {
      const level = head[1].length;
      if (inTargetSection && level <= sectionLevel) inTargetSection = false;
      if (!seenTable && head[2] === "2") {
        inTargetSection = true;
        sectionLevel = level;
      }
      continue;
    }
    if (!inTargetSection || closedTable) continue;
    if (!line.startsWith("|")) {
      if (seenTable) closedTable = true;
      continue;
    }

    const number = index + 1;
    if (number >= spanFirstLine && number <= spanLastLine) {
      return {
        ok: false,
        reason: "table-in-span",
        detail: `층 선언 표가 생성 구간 안에 있다 (${number}행)`,
      };
    }

    const match = TABLE_ROW.exec(line);
    if (match === null) {
      return {
        ok: false,
        reason: "row-malformed",
        detail: `${number}행: 세 셀이 아니다`,
      };
    }
    seenTable = true;

    const cells = [match[1].trim(), match[2].trim(), match[3].trim()];
    if (cells.every((cell, at) => cell === LAYER_TABLE_HEADER[at])) continue;
    if (TABLE_DIVIDER.test(line)) continue;

    if (!LAYER_CELL.test(cells[0])) {
      return { ok: false, reason: "row-malformed", detail: `${number}행: 층 셀 — ${cells[0]}` };
    }
    const path = PATH_CELL.exec(cells[1]);
    if (path === null) {
      return { ok: false, reason: "row-malformed", detail: `${number}행: 경로 셀 — ${cells[1]}` };
    }
    for (const glob of GLOB_CHARACTERS) {
      if (path[1].includes(glob)) {
        return {
          ok: false,
          reason: "row-malformed",
          detail: `${number}행: 경로 셀에 글롭 문자 ${glob} — ${path[1]}`,
        };
      }
    }
    if (path[1].startsWith("/") || path[1].includes("..")) {
      return {
        ok: false,
        reason: "row-malformed",
        detail: `${number}행: 경로 셀은 워크스페이스 기준 상대 경로다 — ${path[1]}`,
      };
    }
    const doc = DOC_CELL.exec(cells[2]);
    if (doc === null) {
      return { ok: false, reason: "row-malformed", detail: `${number}행: 정본 셀 — ${cells[2]}` };
    }

    rows.push({ layer: cells[0], path: path[1], doc: doc[1], section: doc[2], line: number });
  }

  // fail-closed — 표가 없거나 데이터 행이 0이면 통과가 아니다(§4.4). 0행을 그린으로 읽으면
  // 층을 전부 지우는 것이 이 게이트를 끄는 가장 쉬운 방법이 된다.
  if (!seenTable) {
    return { ok: false, reason: "table-missing", detail: "§2에 층 선언 표가 없다" };
  }
  if (rows.length === 0) {
    return { ok: false, reason: "table-empty", detail: "층 선언 표에 데이터 행이 0이다" };
  }

  return { ok: true, rows };
}

/**
 * 파일 머리 주석. **머리는 파일 첫 블록 주석 하나**이고, 그 밖은 본문이다 — 본문까지 읽으면
 * 정정 주석과 설명이 인용으로 세어져 자기오염이 되살아난다(`DOC-STATUS.md` §2.2·§3.3).
 *
 * @param {string} source
 * @returns {string | null} 머리가 없으면 `null`
 */
export function headComment(source) {
  const text = String(source ?? "").trimStart();
  if (!text.startsWith("/**")) return null;
  const end = text.indexOf("*/");
  if (end < 0) return null;
  return text.slice(0, end + 2);
}

/**
 * 파일 머리가 인용한 정본 §. §4.3이 인덱스의 셋째 칸으로 든 값이다.
 *
 * **§ 없는 인용도 인용이다.** 배럴 파일은 계약 정본을 문서 이름만으로 드는 자리가 있고
 * (`packages/gate/src/index.ts`), §4.4의 갈래는 *문서*를 인용하지 않는 것을 위반으로 든다.
 * 그래서 반환값이 두 축이다 — 문서를 들었는가(`cited`)와 어느 §를 들었는가(`sections`).
 *
 * @param {string} source 파일 원문
 * @param {string} doc 층의 정본 문서명 (예: `APPROVAL-GATE.md`)
 * @returns {{ cited: boolean, sections: string[] }}
 */
export function headCitation(source, doc) {
  const head = headComment(source);
  if (head === null) return { cited: false, sections: [] };

  const name = String(doc ?? "");
  const mention = new RegExp(
    String.raw`\`(?:docs/)?${name.replace(/[.]/g, String.raw`\.`)}\``,
    "g",
  );
  const trailing = new RegExp(
    String.raw`^\s*§(${SECTION_NUMBER})(?:\s*·\s*§(?:${SECTION_NUMBER}))*`,
  );
  const each = new RegExp(String.raw`§(${SECTION_NUMBER})`, "g");

  let cited = false;
  const sections = [];
  for (const hit of head.matchAll(mention)) {
    cited = true;
    const after = head.slice(hit.index + hit[0].length);
    const run = trailing.exec(after);
    if (run === null) continue;
    for (const one of run[0].matchAll(each)) {
      if (!sections.includes(one[1])) sections.push(one[1]);
    }
  }
  return { cited, sections };
}

/**
 * 생성 구간의 본문을 만든다. **입력이 같으면 출력이 같다** — 이 함수가 결정론이 아니면
 * 인덱스 불일치가 실물의 변화가 아니라 실행 순서를 재게 된다.
 *
 * **칸이 넷인 것은 §2의 표와 구조로 갈리게 하려는 것이다.** 셋으로 두면 파일 스코프 층의
 * 생성 행이 그 층의 선언 행과 **글자 하나까지 같아진다**(2026-09-03 실측 — 넷 중 셋이 그
 * 상태였다). 파서는 §2 안만 읽으므로 오작동하지 않지만, 같은 줄이 두 곳에 있는 문서는
 * 사람과 grep 양쪽에서 어느 쪽이 손으로 유지되는 자리인지 말하지 못한다. §4.2가 세 셀로
 * 닫은 것은 **선언 행**이고, 생성 행은 그 문법의 대상이 아니다.
 *
 * @param {{ layer: string, doc: string, section: string, file: string,
 *           sections: string[] }[]} entries
 * @returns {string}
 */
export function renderIndex(entries) {
  const lines = ["| 층 | 층의 정본 | 파일 | 머리가 인용한 정본 |", "|---|---|---|---|"];
  for (const entry of entries) {
    const cited =
      entry.sections.length === 0
        ? `\`${entry.doc}\``
        : `\`${entry.doc}\` ${entry.sections.map((one) => `§${one}`).join("·")}`;
    lines.push(
      `| ${entry.layer} | \`${entry.doc}\` §${entry.section} | \`${entry.file}\` | ${cited} |`,
    );
  }
  return `\n\n${lines.join("\n")}\n\n`;
}

/**
 * 생성 구간을 새 본문으로 갈아 끼운다. 구간 **밖은 한 글자도 건드리지 않는다** — 재생성이
 * 사람이 쓴 문면을 지우면 이 도구를 아무도 안 돌리게 된다.
 *
 * @param {string} source
 * @param {string} body `renderIndex`의 산출
 * @returns {{ ok: true, text: string } | { ok: false, reason: string, detail: string }}
 */
export function replaceGeneratedSpan(source, body) {
  const span = findGeneratedSpan(source);
  if (!span.ok) return span;
  const text = String(source ?? "");
  return {
    ok: true,
    text: text.slice(0, span.start + SPAN_OPEN.length) + body + text.slice(span.end),
  };
}
