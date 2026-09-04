/**
 * 이름 사전의 **순수 판정**. 정본은 `docs/LORE.md` §4.1(행 문법·토큰 집합)·§4.2(게이트)다.
 *
 * §4는 자기를 «감사 표면»이라 부르면서 그것을 재는 기계가 0건이었고, 그 대가가 실물로 두 번
 * 났다 — `BOUNDARY-LAYERS.md`가 신설되며 Smith가 지는 층의 인덱스가 생겼는데 Smith 행이 안
 * 자랐고, `Source Code / Fork` 행이 이름 둘을 묶어 Fork의 정본 부재를 가리고 있었다(§4.1의
 * 「왜 필요한가」). 이 모듈이 그 의무를 잰다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를 끝내지
 * 않는다. 게이트 실행부는 `scripts/check-name-dictionary.mjs`에 있고 이 모듈을 임포트한다.
 * 두 파일로 가른 근거는 §4.2 둘째 불릿이 든다(`DOC-STATUS.md` §4·`PUBLIC-TREE.md` §3.5와
 * 같은 근거) — 한 파일이면 계약 테스트가 판정 함수를 임포트하는 것만으로 게이트가 돌고,
 * 실물이 레드인 날엔 `process.exit(1)`이 vitest 워커를 죽여 계약 위반이 테스트 파일 소실로
 * 나타난다.
 *
 * **§ 실재 판정과 층 선언 표 파싱은 `scripts/boundary-index.mjs`를 재사용한다.** 재구현하면
 * 같은 판정이 두 벌이 되고 둘이 갈리는 날 어느 쪽이 정본인지 말할 수 없다. 그 모듈은 자기
 * 임포트를 갖지 않으므로 이 임포트가 `pnpm check` 적재 경로에 무엇도 딸려 오게 하지 않는다.
 *
 * **판정은 관대하지 않다.** §4.1이 정본 셀의 토큰을 닫힌 집합으로 두었고 괄호 주석·자유
 * 산문을 금지한다 — 문법 밖의 문자열은 행 파싱 실패이지 건너뛸 행이 아니다. 건너뛰면 오타
 * 하나가 이름을 통째로 사전 밖으로 옮기고 게이트는 그린이 된다.
 */

import { hasSection, parseLayerTable } from "./boundary-index.mjs";

/** 절 번호 하나. `§` 뒤에 숫자와 점만 온다. `boundary-index.mjs`와 같은 값이다. */
const SECTION_NUMBER = String.raw`\d+(?:\.\d+)*`;

/**
 * 절 제목 — `## 4. ...` 꼴. `boundary-index.mjs`의 같은 이름 상수와 같은 값인데 그 모듈이
 * 이것을 export하지 않아(2026-09-04 실측) 여기서 다시 든다. 값이 갈리면 절 범위가 갈리므로
 * 어느 한쪽을 고칠 때 다른 쪽을 함께 본다.
 */
const SECTION_HEAD = /^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s/;
/** 아무 수준의 제목. 절 범위의 끝을 잡는 데만 쓴다(번호 없는 제목도 범위를 닫는다). */
const ANY_HEAD = /^#{2,6}\s/;
/** 표 행 — 파이프 넷으로 감싼 세 셀. §4.1이 「각 행은 정확히 세 셀」이라 적은 그것이다. */
const TABLE_ROW = /^\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/;
/** 표의 구분 행(`|---|---|---|`). */
const TABLE_DIVIDER = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

/** §4.1 — 정본 셀의 토큰 구분자. **앞뒤 공백이 있는** 가운데점이다. */
const TOKEN_SEPARATOR = " · ";

/** 외부 주소 — 코드 스팬 문서명 + `§<절번호>`. 한 문서를 여럿으로 들면 `§5·§8`(공백 없음). */
const EXTERNAL_TOKEN = new RegExp(
  String.raw`^\`([^\`/]+\.md)\` §(${SECTION_NUMBER}(?:·§${SECTION_NUMBER})*)$`,
);
/** 내부 주소 — `§<절번호>` 하나. */
const INTERNAL_TOKEN = new RegExp(String.raw`^§(${SECTION_NUMBER})$`);
/** 전수 선언 — `전수:` + 외부 주소 하나. */
const EXHAUSTIVE_TOKEN = new RegExp(String.raw`^전수: \`([^\`/]+\.md)\` §(${SECTION_NUMBER})$`);
/** 결손 — `정본 없음:` + `§8 U-<자>`. */
const MISSING_TOKEN = /^정본 없음: §8 (U-[A-Za-z0-9]+)$/;
/** 해당 없음 — `해당 없음:` + 내부 주소 하나. */
const NOT_APPLICABLE_TOKEN = new RegExp(String.raw`^해당 없음: §(${SECTION_NUMBER})$`);

/** §8의 미결 항목 선언. `- **U-b — ...**` 꼴이며 취소선(`~~`)이 붙어도 같은 자리다. */
const UNRESOLVED_DECLARATION = /\*\*(U-[A-Za-z0-9]+)\s*—/g;

/**
 * §4.2 표의 실패 갈래 **여섯**. 이 이름이 그대로 게이트 출력의 라벨이 된다.
 *
 * **이 대응을 §4.2가 문면으로 확정했다**(2026-09-04 `K-482`) — *"위 표와 이 문단의 문구는
 * 실행부 라벨 «문자열»과 지시 관계이지 축자 동일이 아니다"*. 라벨이 §4.2가 든 개념을
 * 가리키기만 하면 되고 자구가 갈려도 위반이 아니다(`boundary-index.mjs`의 `VIOLATIONS`·
 * `DOC-STATUS.md` §5.1 말미가 같은 형태다). 이 집합이 닫혀 있다는 것(=§4.2 표와 1:1)은 계약이다.
 */
export const VIOLATIONS = Object.freeze({
  rowMalformed: "행 파싱 실패",
  nameDoubled: "이름이 둘",
  canonicalEmpty: "정본 셀이 비었다",
  deadSection: "정본 § 부재",
  ghostUnresolved: "미결 유령",
  exhaustiveShort: "전수 미달",
});

/**
 * §4.2의 **fail-closed 그물**. 위 여섯과 달리 「위반」이 아니라 「잴 수 없다」의 이름이고,
 * 다섯 다 통과가 아니라 실패다.
 *
 * 앞 다섯이 §4.2가 문면으로 든 그물이다. `exhaustiveUnsupported`는 그 목록에 없는 여섯째로,
 * 전수 대상이 오늘 지원 범위(`EXHAUSTIVE_TARGET`) 밖일 때 **조용히 통과시키지 않기 위해**
 * 이 모듈이 낸다 — §4.2가 이 경우를 규정하지 않는다. [미규정]
 */
export const FAIL_CLOSED = Object.freeze({
  tableMissing: "§4 절 범위에 표가 없다",
  tableEmpty: "표에 데이터 행이 0이다",
  tableDuplicate: "§4 절 범위에 표가 둘 이상이다",
  nameDuplicate: "이름 셀이 중복된다",
  docUnreadable: "주소가 든 문서를 열 수 없다",
  exhaustiveUnsupported: "전수 대상 지원 범위 밖",
});

/**
 * 오늘 전수 선언이 지목할 수 있는 유일한 대상.
 *
 * **`parseLayerTable`이 `BOUNDARY-LAYERS.md` §2 전용이기 때문이다** — 그 함수는 절 번호
 * `"2"`와 머리 `["층","경로","정본"]`을 하드코딩하고 생성 구간 표시를 먼저 요구한다. §4.1의
 * 전수 토큰은 일반형이라 다른 문서·다른 절을 가리키는 선언이 미래에 생길 수 있고, 그때는 이
 * 재사용이 안 맞아 **새 판단이 필요하다.** 그 갈래를 만나면 `judge`는 통과가 아니라
 * `FAIL_CLOSED.exhaustiveUnsupported`를 낸다.
 */
export const EXHAUSTIVE_TARGET = Object.freeze({ doc: "BOUNDARY-LAYERS.md", section: "2" });

/**
 * 이름 셀의 비교용 정규화. 볼드·이탤릭·코드 스팬 마크업을 걷고 공백을 줄인다.
 *
 * §4.1은 이름 셀에 볼드를 허용하므로 `**Neo**`와 `Neo`는 **같은 이름**이다. 중복 판정을 원문
 * 그대로 하면 마크업 하나로 같은 이름을 두 번 등록하는 경로가 열린다.
 *
 * @param {string} cell 이름 셀 원문
 * @returns {string}
 */
export function normalizeName(cell) {
  return String(cell ?? "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * §8이 선언한 미결 항목의 식별자들. **해소된(취소선) 항목도 든다** — §4.2의 「미결 유령」은
 * *"결손 토큰이 든 `U-<자>`가 §8에 **없다**"*를 재지 그 항목이 아직 열려 있는지를 재지
 * 않는다. 해소된 항목을 가리키는 결손 토큰을 어떻게 볼지는 §4.1·§4.2 어디에도 없다. [미규정]
 *
 * @param {string} source `LORE.md` 원문
 * @returns {string[]} 예: `["U-a", "U-b", ...]`. 등장 순서, 중복 없음
 */
export function collectUnresolvedIds(source) {
  const range = sectionRange(String(source ?? ""), "8");
  if (range === null) return [];
  const ids = [];
  for (const hit of range.body.matchAll(UNRESOLVED_DECLARATION)) {
    if (!ids.includes(hit[1])) ids.push(hit[1]);
  }
  return ids;
}

/**
 * 행들이 든 **열린 결손**의 수. §4.1이 결손과 해당 없음을 서로 다른 리터럴로 가른 이유가
 * 이 값이다 — *"게이트는 앞의 것만 «열린 결손»으로 센다"*. 하나로 합치면 Architect가 영원한
 * 결손으로 세어져 닫힌 판정을 매 사이클 다시 연다.
 *
 * @param {readonly {tokens: readonly {kind: string}[]}[]} rows
 * @returns {number}
 */
export function countOpenGaps(rows) {
  let count = 0;
  for (const row of rows ?? []) {
    for (const token of row.tokens ?? []) {
      if (token.kind === "missing") count += 1;
    }
  }
  return count;
}

/**
 * 절 하나의 줄 범위. **끝은 다음 제목 직전**이다.
 *
 * §4.2는 §4의 범위를 *"`## 4.`와 그 다음에 처음 나오는 제목 사이다 — 수준을 가리지
 * 않는다(`##`~`######` 무엇이든 닫는다)"*로 정한다. `ANY_HEAD`가 그 문면의 **구현**이지
 * 문면 밖 보강이 아니다(2026-09-04 `K-481` 정정 — 이전 문면은 `###`만 들어 구현보다 좁았다).
 * 다음 `##`도 범위를 닫는 것이 §4가 소절을 잃는 날 범위가 §5까지 흘러 들어가 남의 표를 이름
 * 사전 행으로 읽는 것을 막는 fail-closed 방향이고, §4.2가 그 근거를 그대로 든다. 오늘
 * `LORE.md`는 `### 4.1`이 `## 5.`보다 앞이라 두 읽기가 같은 값을 낸다.
 *
 * @param {string} source
 * @param {string} section `§` 없는 절 번호
 * @returns {{ first: number, body: string, lines: string[] } | null} 1-기반 `first`
 */
function sectionRange(source, section) {
  const lines = String(source ?? "").split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const head = SECTION_HEAD.exec(lines[index]);
    if (head !== null && head[2] === section) {
      start = index;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (ANY_HEAD.test(lines[index])) {
      end = index;
      break;
    }
  }
  const body = lines.slice(start + 1, end);
  return { first: start + 2, body: body.join("\n"), lines: body };
}

/**
 * 정본 셀의 토큰 나열을 읽는다.
 *
 * **구분자 둘이 같은 글자다.** 토큰 사이는 ` · `(앞뒤 공백)이고 한 문서의 다중 §은
 * `§5·§8`(공백 없음)이다. 실물 Smith 행이 그 둘을 한 셀에 함께 쓴다 — 단순히 `·`로 쪼개면
 * `§5`·`§8`이 독립 토큰으로 잘못 세어진다. 그래서 **먼저 ` · `로 가르고, 공백 없는 `·§` 꼬리는
 * 외부 주소 토큰 안에서 같은 문서의 §목록으로 합친다.**
 *
 * @param {string} cell 정본 셀 원문(trim 완료)
 * @returns {{ ok: true, tokens: object[] } | { ok: false, reason: string, detail: string }}
 */
function parseCanonicalCell(cell) {
  const text = String(cell ?? "");
  if (text.length === 0) {
    return { ok: false, reason: "canonical-empty", detail: "정본 셀이 비었다" };
  }

  const tokens = [];
  for (const piece of text.split(TOKEN_SEPARATOR)) {
    const one = piece.trim();
    if (one.length === 0) {
      return { ok: false, reason: "row-malformed", detail: `빈 토큰 — ${text}` };
    }

    const exhaustive = EXHAUSTIVE_TOKEN.exec(one);
    if (exhaustive !== null) {
      tokens.push({ kind: "exhaustive", doc: exhaustive[1], section: exhaustive[2] });
      continue;
    }
    const missing = MISSING_TOKEN.exec(one);
    if (missing !== null) {
      tokens.push({ kind: "missing", unresolved: missing[1] });
      continue;
    }
    const notApplicable = NOT_APPLICABLE_TOKEN.exec(one);
    if (notApplicable !== null) {
      tokens.push({ kind: "not-applicable", section: notApplicable[1] });
      continue;
    }
    const external = EXTERNAL_TOKEN.exec(one);
    if (external !== null) {
      const sections = external[2].split("·").map((each) => each.replace(/^§/, ""));
      // 같은 § 를 두 번 드는 것은 정규화하지 않고 실패로 든다 — 조용한 정규화는 이 셀이
      // 무엇을 드는지를 원문과 다르게 만든다. §4.1이 이 경우를 정하지 않는다. [미규정]
      if (new Set(sections).size !== sections.length) {
        return { ok: false, reason: "row-malformed", detail: `§가 중복된다 — ${one}` };
      }
      tokens.push({ kind: "external", doc: external[1], sections });
      continue;
    }
    const internal = INTERNAL_TOKEN.exec(one);
    if (internal !== null) {
      tokens.push({ kind: "internal", section: internal[1] });
      continue;
    }

    return { ok: false, reason: "row-malformed", detail: `토큰 집합 밖 — ${one}` };
  }

  return { ok: true, tokens };
}

/**
 * §4의 이름 사전 표를 읽는다. **절 범위는 `## 4.`와 그 다음 첫 제목 사이**이므로 §4.1·§4.2가
 * 자기 본문에 든 예시 표 넷은 원리적으로 데이터 행이 되지 않는다(§4.2 넷째 불릿 —
 * `DOC-STATUS.md` §5.1이 자기 소절의 표에 데인 자리와 같은 형태다).
 *
 * **fail-closed 그물 다섯 중 넷이 여기 산다** — 표 없음·0행·표 둘 이상·이름 중복. 나머지
 * 하나(주소가 든 문서를 열 수 없다)만 파일 I/O가 필요해 `judge`가 든다.
 *
 * 행 하나라도 문법에 안 맞으면 그 행을 건너뛰지 않고 파싱 실패로 든다.
 *
 * @param {string} source `LORE.md` 원문
 * @returns {{ ok: true, rows: {name: string, line: number, tokens: object[]}[] }
 *          | { ok: false, reason: string, detail: string }}
 */
export function parseDictionaryTable(source) {
  const text = String(source ?? "");
  const range = sectionRange(text, "4");
  if (range === null) {
    return { ok: false, reason: "table-missing", detail: "`## 4.` 절 제목이 없다" };
  }

  // 표 = `|`로 시작하는 줄의 연속 덩어리. 덩어리가 둘 이상이면 표가 둘 이상이다.
  /** @type {{ line: number, text: string }[][]} */
  const blocks = [];
  /** @type {{ line: number, text: string }[] | null} */
  let current = null;
  for (let index = 0; index < range.lines.length; index += 1) {
    const line = range.lines[index];
    if (line.startsWith("|")) {
      if (current === null) {
        current = [];
        blocks.push(current);
      }
      current.push({ line: range.first + index, text: line });
    } else {
      current = null;
    }
  }

  if (blocks.length === 0) {
    return { ok: false, reason: "table-missing", detail: "§4 절 범위에 표가 없다" };
  }
  if (blocks.length > 1) {
    return {
      ok: false,
      reason: "table-duplicate",
      detail: `§4 절 범위에 표가 ${blocks.length}개다 (${blocks
        .map((block) => `${block[0].line}행`)
        .join(" · ")})`,
    };
  }

  const block = blocks[0];
  if (TABLE_ROW.exec(block[0].text) === null) {
    return {
      ok: false,
      reason: "row-malformed",
      detail: `${block[0].line}행: 표 머리가 세 셀이 아니다`,
    };
  }
  if (block.length < 2 || !TABLE_DIVIDER.test(block[1].text)) {
    return {
      ok: false,
      reason: "row-malformed",
      detail: `${block[0].line}행: 표에 구분 행이 없다`,
    };
  }
  if (block.length === 2) {
    return { ok: false, reason: "table-empty", detail: "이름 사전 표에 데이터 행이 0이다" };
  }

  const rows = [];
  const seen = new Map();
  for (const entry of block.slice(2)) {
    const match = TABLE_ROW.exec(entry.text);
    if (match === null) {
      return { ok: false, reason: "row-malformed", detail: `${entry.line}행: 세 셀이 아니다` };
    }
    const name = match[1].trim();
    // 가운데 셀(`match[2]`)은 **읽고 버린다** — §4.1이 그 셀을 "자유 서술. 이 셀은 의무를
    // 지지 않는다"로 명시한다. 판정 대상으로 들이면 그 문장이 실물에서 거짓이 된다.
    const canonical = match[3].trim();

    if (name.length === 0) {
      return { ok: false, reason: "row-malformed", detail: `${entry.line}행: 이름 셀이 비었다` };
    }
    if (name.includes("/")) {
      return {
        ok: false,
        reason: "name-doubled",
        detail: `${entry.line}행: 이름 셀이 슬래시로 둘 이상을 묶는다 — ${name}`,
      };
    }

    const key = normalizeName(name);
    const before = seen.get(key);
    if (before !== undefined) {
      return {
        ok: false,
        reason: "name-duplicate",
        detail: `${entry.line}행: 이름 셀이 중복된다 — ${key} (${before}행과 같다)`,
      };
    }
    seen.set(key, entry.line);

    const cell = parseCanonicalCell(canonical);
    if (!cell.ok) {
      return { ok: false, reason: cell.reason, detail: `${entry.line}행: ${cell.detail}` };
    }

    rows.push({ name, line: entry.line, tokens: cell.tokens });
  }

  if (rows.length === 0) {
    return { ok: false, reason: "table-empty", detail: "이름 사전 표에 데이터 행이 0이다" };
  }

  return { ok: true, rows };
}

/**
 * 행 하나를 §4.2의 실패 갈래에 대조한다.
 *
 * **파싱이 끝난 뒤에만 나오는 갈래 셋**(정본 § 부재·미결 유령·전수 미달)과 fail-closed
 * 그물의 나머지 하나(주소가 든 문서를 열 수 없다)가 여기 있다. 문서를 실제로 여는 부수효과는
 * 이 함수 밖에 있고 `context`가 그 주입 지점이다 — `doc-status.mjs`의
 * `judge(parsed, anchorExists)`와 같은 형태다.
 *
 * **한 행이 갈래 여럿에 걸릴 수 있으므로 첫 위반에서 멈추지 않는다.** 멈추면 한 사이클에
 * 하나씩만 보이고 고치는 사람이 같은 행을 여러 번 왕복한다.
 *
 * @param {{name: string, line: number, tokens: object[]}} row `parseDictionaryTable`의 행
 * @param {{self: string, docs: ReadonlyMap<string, string>}} context
 *   `self`는 이 문서(`LORE.md`) 원문 — 내부 주소의 § 실재와 §8의 미결 목록이 여기서 나온다.
 *   `docs`는 외부 문서명 → 원문. **키가 없으면 「열 수 없다」이지 통과가 아니다.**
 * @returns {{ ok: true } | { ok: false, violations: {violation: string, detail: string}[] }}
 */
export function judge(row, context) {
  const self = String(context?.self ?? "");
  const docs = context?.docs instanceof Map ? context.docs : new Map();
  const unresolved = collectUnresolvedIds(self);
  const name = String(row?.name ?? "");
  const tokens = row?.tokens ?? [];

  /** @type {{violation: string, detail: string}[]} */
  const violations = [];
  const push = (violation, detail) => violations.push({ violation, detail: `${name} — ${detail}` });

  // 이 행이 외부 주소로 실제로 드는 «문서 §» 쌍. 전수 대조의 좌변이다.
  const held = new Set();
  for (const token of tokens) {
    if (token.kind !== "external") continue;
    for (const section of token.sections) held.add(`${token.doc} §${section}`);
  }

  for (const token of tokens) {
    switch (token.kind) {
      case "external": {
        const source = docs.get(token.doc);
        if (source === undefined) {
          push(FAIL_CLOSED.docUnreadable, `\`${token.doc}\``);
          break;
        }
        for (const section of token.sections) {
          if (!hasSection(source, section)) {
            push(VIOLATIONS.deadSection, `\`${token.doc}\` §${section}`);
          }
        }
        break;
      }

      // 내부 주소와 해당 없음은 둘 다 이 문서 안의 §를 든다 — §4.2의 「정본 § 부재」는
      // *"주소가 든 §가 그 문서에 없다"*이고 문서 종류를 가리지 않는다.
      case "internal":
      case "not-applicable": {
        if (!hasSection(self, token.section)) {
          push(VIOLATIONS.deadSection, `§${token.section}`);
        }
        break;
      }

      case "missing": {
        if (!unresolved.includes(token.unresolved)) {
          push(VIOLATIONS.ghostUnresolved, `§8 ${token.unresolved}`);
        }
        break;
      }

      case "exhaustive": {
        if (token.doc !== EXHAUSTIVE_TARGET.doc || token.section !== EXHAUSTIVE_TARGET.section) {
          push(
            FAIL_CLOSED.exhaustiveUnsupported,
            `전수: \`${token.doc}\` §${token.section} — 오늘 이 게이트가 읽을 수 있는 전수 대상은 ` +
              `\`${EXHAUSTIVE_TARGET.doc}\` §${EXHAUSTIVE_TARGET.section} 하나다`,
          );
          break;
        }
        const source = docs.get(token.doc);
        if (source === undefined) {
          push(FAIL_CLOSED.docUnreadable, `전수: \`${token.doc}\``);
          break;
        }
        if (!hasSection(source, token.section)) {
          push(VIOLATIONS.deadSection, `전수: \`${token.doc}\` §${token.section}`);
          break;
        }
        const table = parseLayerTable(source);
        if (!table.ok) {
          push(
            FAIL_CLOSED.exhaustiveUnsupported,
            `전수: \`${token.doc}\` §${token.section} — ${table.reason}: ${table.detail}`,
          );
          break;
        }
        const required = [];
        for (const layer of table.rows) {
          const pair = `${layer.doc} §${layer.section}`;
          if (!required.includes(pair)) required.push(pair);
        }
        // **의무는 포함이지 동일이 아니다**(§4.1) — 행이 인덱스보다 넓은 것은 위반이 아니다.
        // 좁은 것만 잡는다.
        const short = required.filter((pair) => !held.has(pair));
        if (short.length > 0) {
          push(
            VIOLATIONS.exhaustiveShort,
            `전수: \`${token.doc}\` §${token.section} — 안 드는 정본: ${short.join(" · ")}`,
          );
        }
        break;
      }

      // 토큰 종류가 위 다섯 중 어느 것도 아니면 파서가 만들 수 없는 값이다. 조용히 넘기지
      // 않는다 — 넘기면 파서와 판정이 갈리는 날 그 갈림이 그린으로 나타난다.
      default: {
        push(VIOLATIONS.rowMalformed, `알 수 없는 토큰 종류 — ${String(token?.kind)}`);
        break;
      }
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
