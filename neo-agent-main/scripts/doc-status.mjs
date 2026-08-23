/**
 * 문서 지위 선언의 **순수 판정**. 정본은 `docs/DOC-STATUS.md` §3·§3.3이다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 게이트 실행부는 `check-doc-status.mjs`에 있고 이 모듈을 임포트한다.
 *
 * **왜 두 파일인가.** 처음에는 한 파일이었고, 계약 테스트가 순수 함수만 쓰는데도
 * 임포트 순간 게이트 전체가 돌았다 — 실물 `docs/`가 레드인 날이면 `process.exit(1)`이
 * vitest 워커를 죽여 **"계약 위반"이 "테스트 파일이 사라짐"으로 나타난다.**
 * (`package-boundary.contract.test.ts`가 예산 게이트를 임포트 대신 텍스트로 읽는 이유가
 * 정확히 같은 함정이다.)
 *
 * `import.meta.main` 가드로 막지 않은 것은 의도다 — 그 속성은 Node 24.2.0에서 들어왔고
 * 이 워크스페이스의 `engines`는 `>=24`다. 24.0~24.1에서는 `undefined`라 가드가 거짓이 되어
 * **게이트 본문이 통째로 건너뛰어지고 `check:docs`가 조용히 exit 0**이 된다. 침묵 통과는
 * 이 게이트가 존재하는 이유 그 자체이므로(`ARCHITECTURE.md` §2.6), 런타임 조건 대신
 * 파일 경계로 갈랐다. 조건이 없으면 틀릴 수도 없다.
 */

// 「선언이 살 수 없는 구간」의 술어는 이 파일에 없다 — `DOC-STATUS.md` §3.6 C-10이 세 술어의
// 자리를 `doc-citation.mjs` 한 곳으로 정했고, *"이 규약의 파서는 그것을 부른다."* 여기에 다시
// 세우면 그 모듈 안팎에 상태 기계가 둘이 되고 그것이 `DOC-CITATION.md` §6 U-e가 금한 복제다.
//
// **`comment-lexer.mjs`를 경유하지 않는다.** 그 모듈은 최상위에서 `typescript`를 임포트하고,
// 이 파일은 `check-doc-status.mjs`를 통해 매 `pnpm check`마다 적재된다 — C-8이 받지 않는
// 형태다. C-10이 그 갈래를 버리지 않았다: `.md` 갈래는 서되 **그 갈래가 이 모듈을 부르고**,
// 이 규약의 파서는 갈래를 경유하지 않고 모듈을 직접 부른다.
import { scanInertContext } from "./doc-citation.mjs";

/** `docs/DOC-STATUS.md` §3.2의 닫힌 유니온. 값에 한정·괄호·마크업을 붙일 수 없다. */
const STATUS_VALUES = {
  "구현 완료": "implemented",
  "구현 전": "not-yet",
  "구현 주장 없음": "no-claim",
};

/** 앵커를 요구하는 값. `no-claim`만 `근거:`가 **금지**된다(§3.2). */
const ANCHORED_KINDS = new Set(["implemented", "not-yet"]);

/**
 * §3.3 — 머리는 머리에 있다. 본문 인용까지 읽으면 자기오염이 되살아난다.
 * 이 상한을 늘리려면 `DOC-STATUS.md` §3.3을 먼저 고친다.
 */
export const HEAD_LINE_LIMIT = 40;

/** 줄 시작에 고정한다 — 선행 공백도 `>` 인용도 받지 않는다(§3.3). */
const STATUS_LINE = /^- 상태: (.*)$/;
const ANCHOR_LINE = /^- 근거: (.*)$/;

/**
 * §3.6 C-5·C-10 — 미닫힘 자리를 사람이 읽는 한 줄로. **부류와 자리를 함께 든다.**
 *
 * 위반 이름이 곧 고칠 곳의 주소라는 것이 이 게이트의 설계이므로(§5.2), 부류만 내고 자리를
 * 빼면 그 설계가 새 갈래에서만 깨진다. 자리 표기는 `check-doc-citation.mjs`가 이미 쓰는
 * `줄:열`이고 둘 다 1-기반이다.
 *
 * @param {{kind: string, line: number, column: number}} unclosed
 * @param {string} consequence 이 갈래에서 무엇이 정해지지 않는지
 */
function unterminatedDetail(unclosed, consequence) {
  return `${unclosed.line}:${unclosed.column}에서 연 ${unclosed.kind} 구간이 파일 끝까지 안 닫혔다 — ${consequence}`;
}

function fieldValues(headLines, pattern) {
  const values = [];
  for (const line of headLines) {
    const match = pattern.exec(line);
    // [미규정] 값 끝의 공백만 지운다. `DOC-STATUS.md` §3.3은 "정확 일치"만 말하고
    // 후행 공백을 규정하지 않는다. 보이지 않는 문자로 게이트가 깨지는 쪽이 나쁘다고
    // 보아 관용했으나 문서가 정한 바는 아니다 — 판정 필요.
    //
    // **2026-08-23 — 이 관용에 §3.6 C-2의 한 성질이 얹혔다.** C-2가 열 오프셋 보존의 근거로
    // 든 자리(`- 상태: 구현 완료 <!-- 옛값 -->`)는 마스킹 뒤 값이 `"구현 완료"` + 공백이 되고,
    // 위 trim이 없으면 그 줄이 `unknown-value`가 된다. **C-2 자신은 그 자리를 *"표현할 수
    // 있어야 한다"*까지만 말하고 그 줄이 선언으로 살아남는 데까지는 계약을 안 든다** — 그래서
    // 그 통과는 계약이 아니라 오늘 구현의 성질이다. 이 미규정이 엄격 쪽으로 판정되면 그
    // 자리가 함께 뒤집힌다.
    if (match) values.push(match[1].replace(/\s+$/, ""));
  }
  return values;
}

/**
 * 문서 소스 텍스트 → 파싱 결과. **파일 I/O를 하지 않는다.**
 *
 * 판정을 순수하게 유지하는 것이 계약 테스트의 전제다 — 픽스처 파일도, 테스트용
 * 환경변수 손잡이도 없이 이 함수가 소유한 갈래를 전부 돌릴 수 있다.
 *
 * @param {string} source
 * @returns {{kind: string, anchor?: string} | {violation: string, detail: string}}
 */
export function parseDocStatus(source) {
  // §3.6 C-3 — **구간 계산은 전문에 대해 하고 머리 창은 그 뒤에 자른다.** 창 안에서만 계산하면
  // 창 밖에서 닫히는 펜스가 전부 「안 닫힌 구간」이 된다. 실측이다: 2026-08-23 전수에서 문서
  // 여섯의 머리 40줄 창이 열린 펜스 안에서 끝난다.
  const { masked, unclosed } = scanInertContext(source);
  if (unclosed !== null) {
    // C-5 — 「끝까지 구간」으로 관대하게 읽지 않는다. 그 읽기에서는 파일 어디에나 여는 표기
    // 하나를 두어 머리를 통째로 지울 수 있고, 결과가 `missing`으로 나와 **원인이 위반 이름에
    // 안 남는다.**
    return {
      violation: "context-unterminated",
      detail: unterminatedDetail(unclosed, "선언이 어디서 살 수 있는지가 정해지지 않는다"),
    };
  }

  const headLines = masked.split("\n").slice(0, HEAD_LINE_LIMIT);
  const statuses = fieldValues(headLines, STATUS_LINE);

  if (statuses.length === 0) {
    return { violation: "missing", detail: `머리 ${HEAD_LINE_LIMIT}줄 안에 "- 상태:" 줄이 없다` };
  }
  if (statuses.length > 1) {
    return { violation: "duplicate", detail: `"- 상태:" 줄이 ${statuses.length}개다` };
  }

  const raw = statuses[0];
  const kind = STATUS_VALUES[raw];
  if (!kind) {
    const allowed = Object.keys(STATUS_VALUES).join(" | ");
    return { violation: "unknown-value", detail: `"${raw}" — 허용값은 ${allowed}` };
  }

  const anchors = fieldValues(headLines, ANCHOR_LINE);
  // [미규정] `- 근거:` 줄이 둘 이상인 경우를 `DOC-STATUS.md` §3.1의 `Violation`이 규정하지
  // 않는다(§3.3의 "정확히 1개"는 `상태:` 줄만 센다). 임의로 새 위반 종류를 만들지 않고
  // fail-closed 방향(거부)으로 `duplicate`에 합쳐 둔다 — 모호한 선언을 통과시키는 것보다
  // 낫다. 판정 필요.
  if (anchors.length > 1) {
    return { violation: "duplicate", detail: `"- 근거:" 줄이 ${anchors.length}개다` };
  }

  if (ANCHORED_KINDS.has(kind)) {
    if (anchors.length === 0) {
      return { violation: "anchor-required", detail: `"${raw}"는 "- 근거:" 줄을 요구한다` };
    }
    return { kind, anchor: anchors[0] };
  }

  if (anchors.length > 0) {
    return { violation: "anchor-forbidden", detail: `"${raw}"에는 "- 근거:"를 둘 수 없다` };
  }
  return { kind };
}

// ---------------------------------------------------------------------------
// §5 표 → 배정 맵 (정본: `docs/DOC-STATUS.md` §5.1)
//
// **머리 판정과 다른 이름공간을 쓴다.** §5.1 — *"§3.1의 `Violation`을 늘리지 않는다"*, 그
// 유니온은 문서 하나의 머리에 대한 순수 판정이고 표 대조는 *"판정 함수가 만들 수 없는
// 값이다"*. 그래서 아래 실패는 `Violation`이 아니라 `reason`을 든다 — 유니온을 늘리면
// `doc-status.contract.test.ts`의 전수 단언이 죽는데, 그 단언이 죽는 것이 옳은 신호인 경우와
// 계약을 어긴 경우가 구별되지 않는다.
//
// **배정 값에는 `DocStatus`를 그대로 재사용한다.** 표의 두 셀(`상태:`·`근거:`)이 정확히
// `DocStatus` 하나를 이루므로, §3.1의 불변(*"`근거:`의 유무가 kind에 의해 완전히 결정된다"*)이
// 표에서도 같은 형태로 지켜진다 — `구현 주장 없음`인데 경로가 붙은 행은 만들 수 없다.
// 별도 타입을 두면 그 규칙의 손으로 적은 두 번째 사본이 생긴다.
// ---------------------------------------------------------------------------

/** §5.1 — 절 범위의 시작. 이 파서는 `DOC-STATUS.md` §5 전용이다. */
const TABLE_SECTION_HEAD = /^## 5\./;

/**
 * §5.1 — 범위의 끝은 **그 다음에 처음 나오는 `###`**이지 `## 6.`이 아니다.
 * `## ` 경계로 잡으면 §5.1(계약 절) 자신의 표들이 범위에 들어오고, 나중에 §5.x에 세 셀 표가
 * 하나 생기면 그 행들이 문서 배정으로 섞인다.
 */
const SUBSECTION_HEAD = /^### /;

const TABLE_ROW = /^\|/;

/** §5.1 행 문법 — 백틱으로 감싼 파일명 하나. 볼드·괄호 주석 금지. */
const DOC_CELL = /^`([^`]+\.md)`$/;

/** §5.1 행 문법 — 백틱으로 감싼 경로 하나. */
const ANCHOR_CELL = /^`([^`]+)`$/;

/** §5.1 행 문법 — 앵커 없음을 뜻하는 EM DASH(U+2014) 하나. */
const NO_ANCHOR_CELL = "—";

function rowFailure(detail) {
  return { ok: false, reason: "row-malformed", detail };
}

/**
 * 표의 한 행 → `{doc, status}`. §5.1의 세 셀 문법을 정확 일치로만 받는다.
 *
 * @param {string} line
 * @returns {{doc: string, status: {kind: string, anchor?: string}} | {ok: false, reason: string, detail: string}}
 */
function parseTableRow(line) {
  // `| a | b | c |` → ["", " a ", " b ", " c ", ""]. 셀이 정확히 셋이 아니면 여기서 죽는다.
  const cells = line.split("|");
  // [미규정] 행 끝의 후행 공백만 관용한다. §5.1은 "정확히 세 셀"만 말하고 줄 끝 공백을
  // 규정하지 않는다 — 머리 파서의 값 trim과 같은 자리이며 같은 이유로 `K-034`에 속한다.
  if (cells.length !== 5 || cells[0] !== "" || cells[4].trim() !== "") {
    return rowFailure(`셀이 정확히 셋이 아니다: ${JSON.stringify(line)}`);
  }

  const [rawDoc, rawStatus, rawAnchor] = cells.slice(1, 4).map((cell) => cell.trim());

  const docMatch = DOC_CELL.exec(rawDoc);
  if (!docMatch) {
    return rowFailure(
      `문서 셀은 백틱으로 감싼 .md 파일명 하나여야 한다 — ${JSON.stringify(rawDoc)}`,
    );
  }
  const doc = docMatch[1];

  const kind = STATUS_VALUES[rawStatus];
  if (!kind) {
    const allowed = Object.keys(STATUS_VALUES).join(" | ");
    return rowFailure(`${doc}: "${rawStatus}" — 허용값은 ${allowed}`);
  }

  // 아래 두 갈래가 §3.1의 불변을 표에서 재현한다: 앵커의 유무가 kind에 의해 결정된다.
  if (rawAnchor === NO_ANCHOR_CELL) {
    if (ANCHORED_KINDS.has(kind)) {
      return rowFailure(
        `${doc}: "${rawStatus}"는 앵커 경로를 요구한다 — "${NO_ANCHOR_CELL}"이 왔다`,
      );
    }
    return { doc, status: { kind } };
  }

  const anchorMatch = ANCHOR_CELL.exec(rawAnchor);
  if (!anchorMatch) {
    return rowFailure(
      `${doc}: 근거 셀은 백틱 경로 하나 또는 "${NO_ANCHOR_CELL}"이어야 한다 — ${JSON.stringify(rawAnchor)}`,
    );
  }
  if (!ANCHORED_KINDS.has(kind)) {
    return rowFailure(`${doc}: "${rawStatus}"에는 앵커를 둘 수 없다`);
  }
  return { doc, status: { kind, anchor: anchorMatch[1] } };
}

/**
 * `DOC-STATUS.md` 전문 → §5 표의 배정 목록. **파일 I/O를 하지 않는다.**
 *
 * 집합 대조인 갈래는 여기 없다 — 집합 대 집합이라 순수 판정이 만들 수 없고, 실행부
 * (`check-doc-status.mjs`)가 fail-closed 그물과 같은 자리에서 한다. **§5.1이 재료의 소유를
 * 갈래마다 가른다** — «행 파싱 실패»와 «구간이 안 닫혔다»는 이 함수가 만든다.
 *
 * @param {string} source
 * @returns {{ok: true, rows: Array<{doc: string, status: {kind: string, anchor?: string}}>} | {ok: false, reason: string, detail: string}}
 */
export function parseStatusTable(source) {
  // §3.6 C-6 — **마스킹은 이 파서의 정규식 전부의 앞에 선다.** 머리 필드 둘만이 아니라 절
  // 제목·소제목·표 행·셀 판별까지 같은 마스킹 뒤에서 읽는다. 필드만 덮으면 범위를 정하는
  // 쪽이 그대로 뚫린 채 남는다 — 펜스 안의 `## 5.` 꼴 한 줄이 배정의 정본 범위를 통째로
  // 옮긴다. §5.1도 같은 것을 자기 문면으로 든다: *"절 범위는 마스킹 뒤에 정한다."*
  const { masked, unclosed } = scanInertContext(source);
  if (unclosed !== null) {
    // §5.1 갈래 «구간이 안 닫혔다». 실행부가 그 이름을 라벨로 붙인다.
    // **머리 갈래(`context-unterminated`)와 문자열이 다르다** — 두 이름공간이 갈려 있고,
    // 같은 문자열을 쓰면 그 분리가 조용히 깨진 채 아무 단언도 안 붉는다(§8 U-h).
    return {
      ok: false,
      reason: "inert-unclosed",
      detail: unterminatedDetail(
        unclosed,
        "배정의 정본을 어디까지 읽어야 하는지가 정해지지 않는다",
      ),
    };
  }

  const lines = masked.split("\n");

  const start = lines.findIndex((line) => TABLE_SECTION_HEAD.test(line));
  if (start === -1) {
    return { ok: false, reason: "section-missing", detail: '"## 5."로 시작하는 절 제목이 없다' };
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (SUBSECTION_HEAD.test(lines[index])) {
      end = index;
      break;
    }
  }

  // 연속된 `|` 시작 줄 = 하나의 파이프 블록.
  const blocks = [];
  let current = null;
  for (const line of lines.slice(start + 1, end)) {
    if (TABLE_ROW.test(line)) {
      if (!current) {
        current = [];
        blocks.push(current);
      }
      current.push(line);
    } else {
      current = null;
    }
  }

  if (blocks.length === 0) {
    return { ok: false, reason: "table-missing", detail: "§5 범위에 표가 없다" };
  }
  // D-2 (2026-08-13 확정) — 배정의 정본이 둘이 되는 상태를 통과시키지 않는다. 첫 블록만 읽으면
  // 새 표가 배정을 바꿔도 아무도 모른다.
  if (blocks.length > 1) {
    return { ok: false, reason: "table-ambiguous", detail: `§5 범위에 표가 ${blocks.length}개다` };
  }

  // D-1 (2026-08-13 확정) — 헤더와 구분선은 **위치**로 자른다. 마크다운 표의 정의상 고정 2행이다.
  // 셀 내용으로 판별하면(백틱 없는 문서 셀은 건너뛴다) 데이터 행이 백틱을 잃었을 때 그 문서가
  // 어느 갈래에도 안 걸린다 — 넷을 다 만들고도 구멍이 남는다.
  const dataRows = blocks[0].slice(2);
  if (dataRows.length === 0) {
    return { ok: false, reason: "table-missing", detail: "§5 표에 데이터 행이 없다" };
  }

  const rows = [];
  const seen = new Set();
  for (const line of dataRows) {
    const row = parseTableRow(line);
    if ("ok" in row) return row;
    // [미규정] 같은 문서가 두 행에 배정되는 경우를 §5.1이 규정하지 않는다. D-2와 **같은 모양의
    // 모호함**(배정의 정본이 둘)이므로 그 판정 근거를 그대로 적용해 fail-closed로 둔다 —
    // 관대하게 넘기면 나중 행이 앞 행을 조용히 덮는다. 판정 필요.
    if (seen.has(row.doc)) {
      return rowFailure(`${row.doc} 행이 둘 이상이다 — 배정의 정본이 둘이 된다`);
    }
    seen.add(row.doc);
    rows.push(row);
  }

  return { ok: true, rows };
}

/**
 * 파싱 결과 + 앵커 존재 여부 → 판정. **경로 판정을 주입받으므로 여기도 순수하다.**
 *
 * `not-yet`이 앵커를 들고 그 앵커가 **존재하면** 위반이라는 것이 이 게이트의 핵심이다 —
 * F-1 6건이 정확히 이 형태였고, 이 판정 덕에 구현이 착지하는 순간 게이트가 깨진다.
 *
 * 성공 갈래가 `status`를 **통째로** 들고 다니는 것이 계약이다(§3.1). `kind`와 옵셔널
 * `anchor`로 평탄화하면 `{kind:"no-claim", anchor:"x"}` 같은 무의미 상태가 다시 표현
 * 가능해진다 — §3.1이 *"`근거:` 줄의 존재 여부가 kind에 의해 완전히 결정된다"*고 못박은
 * 성질이 판정 경계에서 풀린다. 문서 이름은 이 타입에 없다: 게이트 루프가 파일명과 짝짓는다.
 *
 * @param {{kind: string, anchor?: string} | {violation: string, detail: string}} parsed
 * @param {boolean} anchorExists
 * @returns {{ok: true, status: object} | {ok: false, violation: string, detail: string}}
 */
export function judge(parsed, anchorExists) {
  if ("violation" in parsed) {
    return { ok: false, violation: parsed.violation, detail: parsed.detail };
  }
  if (parsed.kind === "implemented" && !anchorExists) {
    return { ok: false, violation: "anchor-missing", detail: `앵커 "${parsed.anchor}"가 없다` };
  }
  if (parsed.kind === "not-yet" && anchorExists) {
    return {
      ok: false,
      violation: "anchor-present",
      detail: `"구현 전"인데 앵커 "${parsed.anchor}"가 존재한다 — 머리가 낡았다`,
    };
  }
  return { ok: true, status: parsed };
}

/**
 * 역방향 — 어느 문서의 `근거:` 앵커에도 덮이지 않은 패키지를 낸다.
 * 정본: `docs/DOC-STATUS.md` §5.3.
 *
 * **순수 함수다.** 어떤 패키지가 실재하는지는 호출자(실행부)가 디스크에서 판정해 넘긴다 —
 * 두 피연산자가 모두 인자로 들어오므로 집합 대조 자체는 I/O가 필요 없다. §5.3이 「자리」를
 * 두 층으로 가른 근거가 이것이고, 그래서 이 술어에는 계약 테스트가 붙는다.
 *
 * **`judge()`의 `Violation`과 다른 이름공간이다** — 저쪽은 문서 하나의 머리에 대한 판정이고
 * 이것은 집합 대 집합이다(§5.1과 같은 구분).
 *
 * 「덮였다」의 정의(§5.3): 앵커가 `packages/<이름>` 자신이거나 `packages/<이름>/`로 시작한다.
 * **경계에 `/`를 요구하는 것이 핵심이다** — 맨 `startsWith`를 쓰면 `packages/store`가
 * `packages/storefront`를 덮는 오탐이 조용히 섞인다.
 *
 * @param {readonly string[]} anchors §5 표가 든 `근거:` 경로들. `구현 주장 없음` 행처럼
 *                                   앵커가 없는 것은 호출자가 걸러서 넘긴다
 * @param {readonly string[]} packages `packages/` 아래 실재하는 디렉터리 이름
 * @returns {string[]} 덮이지 않은 패키지의 경로(`packages/<이름>`). 빈 배열이면 적합
 */
export function uncoveredPackages(anchors, packages) {
  const uncovered = [];
  for (const name of packages) {
    const prefix = `packages/${name}`;
    const covered = anchors.some((anchor) => anchor === prefix || anchor.startsWith(`${prefix}/`));
    if (!covered) uncovered.push(prefix);
  }
  return uncovered;
}
