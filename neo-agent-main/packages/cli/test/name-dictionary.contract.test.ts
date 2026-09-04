/**
 * 이름 사전의 포인터 의무 — `LORE.md` §4.1(행 문법)·§4.2(게이트)의 기계화(순수 판정 표면).
 *
 * **기대값의 출처는 둘뿐이다.** `docs/LORE.md` §4·§4.1·§4.2·§8 문면과
 * `scripts/name-dictionary.d.mts`의 시그니처·JSDoc. **`scripts/name-dictionary.mjs`의 구현
 * 본문은 열지 않았다** — 이 파일을 쓰는 동안 한 번도 읽지 않았고, 실행부
 * (`scripts/check-name-dictionary.mjs`)는 텍스트로도 열지 않았고 임포트하지도 않는다. 형제
 * `doc-status.contract.test.ts`·`address.contract.test.ts`가 같은 격리를 든다. 구현이 문서와
 * 어긋나면 **문서가 이긴다** — 실패는 실패인 채로 남긴다.
 *
 * **이 게이트의 실패 양태는 **조용한 통과**다.** §4가 스스로 부른 감사 표면은 2026-09-04까지
 * 사람의 주의력에만 기댔고, 그 대가가 실물로 두 번 났다(§4.1 첫 두 불릿 — Smith 행이 안 자랐고
 * `Source Code / Fork` 행이 결손을 가렸다). 구현을 보고 케이스를 짜면 파서가 이미 관대한 자리를
 * 그대로 재현하므로, 케이스는 전부 문면에서 먼저 도출했다.
 *
 * 축은 §4.1·§4.2의 계약 문장을 딴다:
 *   - 축 0  — 표면 상수. `VIOLATIONS`(§4.2 실패 갈래 여섯)·`FAIL_CLOSED`(그물)·
 *     `EXHAUSTIVE_TARGET`. 「닫혔다」가 계약인 값은 `skipLibCheck` 아래에서 타입이 안 재므로
 *     런타임 단언이 그 몫을 든다(`name-dictionary.d.mts` 머리)
 *   - 축 1  — 양성 대조군. §4.1 토큰 다섯 종류 각각의 정상 행
 *   - 축 2  — §4.1 셀 셋. 이름 셀의 슬래시 금지·볼드 허용, 가운데 셀의 무의무, 정본 셀의
 *     괄호 주석·자유 산문 금지
 *   - 축 3  — §4.1 토큰 형식. § 없는 문서 주소 · 빈 정본 셀 · 구분자 최소 쌍(` · ` 대 `§5·§8`)
 *   - 축 4  — §4.2 실패 갈래 여섯의 양성 사례 + 그 라벨
 *   - 축 5  — §4.2 fail-closed 그물. 순수 표면이 닿는 만큼(표 없음·0행·표 둘·이름 중복·문서 못 엶)
 *   - 축 6  — §4.2 절 범위. `### 4.1`·`### 4.2`의 예시 표가 데이터 행이 되지 않는다
 *   - 축 7  — §4.1 전수 선언. 미달과 초과 양쪽
 *   - 축 8  — §4.2 미결 유령 + §4.1 결손의 등록처
 *   - 축 9  — §4.2 정본 § 부재. 내부 주소·외부 주소 양쪽
 *   - 축 10 — §4.1 마지막 불릿·§4.2 말미의 U-f 경계. 오른쪽 열만 본다
 *   - 축 11 — §4.2 게이트가 잡지 못하는 것 셋(부재의 계약)
 *   - 축 12 — §4.2 판정/실행부 분리와 임포트 부작용
 *
 * **이 파일이 안 재는 것(커버리지 귀속처를 남긴다 — 안 적으면 그린으로 오인된다).**
 *   - **실행부의 배선 전부** — 파일 읽기, 순회, 종료 코드, 요약 줄(`판정 · 위반 · 미판정 ·
 *     열린 결손`)의 출력. `check-name-dictionary.mjs`를 임포트하지도 열지도 않는 것이 이 작업의
 *     계약이라 원리적으로 여기 밖이고, 그 자리는 **T-005의 역검증**이 든다.
 *   - **§4.2의 착지 순서**(표 정정과 검사기가 같은 커밋) — 커밋 단위의 계약이라 실행 시점에
 *     잴 것이 없다. T-006이 든다.
 *   - **실물 `docs/LORE.md` §4 표의 내용** — 열셋 행·열린 결손 둘의 실측은 T-005의 몫이다.
 *     여기서 실물 문서를 열면 이 파일이 계약이 아니라 실물의 사진이 된다.
 *   - **§4.2 「게이트가 잡지 못하는 것」 셋** — 부재의 계약이므로 축 11이 **게이트가 이 갈래를 안 낸다**로만 잰다(과잉 구현 금지).
 *
 * **[미규정] 표시가 붙은 자리는 정본이 값을 안 정한 곳이다.** 임의 판정하지 않고 계약이 실제로
 * 요구하는 만큼만 좁혀 걸었으며, 판정이 필요한 목록은 QA 리포트가 든다.
 *
 * 인용 계약 — `DOC-CITATION.md` §3.4 U-1·D-1·D-2가 이 파일의 주석에 걸린다(§6 U-b의 범위
 * 확장). 인용부호로 감싼 문면은 `docs/LORE.md`에 문자 그대로 있는 부분 문자열이다. 코드의
 * 문자열 리터럴은 픽스처이지 인용이 아니다.
 *
 * ---
 *
 * ## 대조 원장 — 계약 항목 57 중 51 대조 (2026-09-04)
 *
 * 항목은 §4 서두·§4.1·§4.2를 문장 단위로 끊어 센 것이다. **미대조 일곱은 전부 귀속처가 있다.**
 *
 * **분모 57과 51은 `K-481`·`K-482`(2026-09-04 §4.2 개정) 이전에 센 값이다.** 그 개정이 넷째
 * 불릿에 절을 더하고 문단 하나를 새로 넣었으므로 오늘 분모는 이보다 크다. 재계수는 이 사이클
 * 밖이고, 그때까지 이 두 수를 오늘 값으로 인용하지 않는다.
 *
 * | § | 항목 | 판정 |
 * |---|---|---|
 * | §4 | 각 행이 정본 포인터를 의무로 갖는다 / 포인터를 못 대면 결손 표시 | 대조 2/2 — 축 1·축 4 |
 * | §4.1 | 셀 셋 · 이름 하나 · 볼드 허용 · 슬래시 금지 · 가운데 셀 무의무 · 정본 셀 `·` 나열 · 괄호 주석 금지 · 자유 산문 금지 | 대조 8/8 — 축 2 |
 * | §4.1 | 토큰 닫힌 집합 다섯(외부·내부·전수·결손·해당 없음)의 형식 | 대조 5/5 — 축 1·축 3 |
 * | §4.1 | § 없는 문서 주소는 주소가 아니다 | 대조 1/1 — 축 3 |
 * | §4.1 | 정본 셀은 비어 있을 수 없다 · 주소 0개면 결손/해당 없음 필수 | 대조 2/2 — 축 3·축 1 |
 * | §4.1 | 결손과 해당 없음을 가르는 것은 §5.2 · 게이트는 앞의 것만 «열린 결손»으로 센다 | 대조 1/1 — 축 8 (`countOpenGaps`) |
 * | §4.1 | 결손의 등록처는 §8이다 | 대조 1/1 — 축 8 |
 * | §4.1 | 전수 선언이 완전성 축을 연다 · 의무는 포함이지 동일이 아니다 | 대조 2/2 — 축 7 |
 * | §4.1 | 짝 목록을 따로 두지 않는다(행 안의 선언) | 대조 1/1 — 축 7(전수 토큰이 행에서 온다) |
 * | §4.1 | 세계관 이름을 전부 지워도 검사기가 그대로 선다 | 대조 1/1 — 축 10 |
 * | §4.2 | 자리(스크립트 둘) · 판정/실행부 파일 분리 | 대조 2/2 — 축 12 |
 * | §4.2 | 기존 게이트에 합치지 않는다 | 미대조 — 배선의 계약. `package.json`과 실행부의 자리이고 T-005가 든다 |
 * | §4.2 | 절 범위는 `## 4.`와 다음 첫 제목 사이 — 수준을 가리지 않는다 | 대조 1/1 — 축 6 |
 * | §4.2 | 실패 갈래 여섯 | 대조 6/6 — 축 4 |
 * | §4.2 | 갈래 이름 = 출력 라벨 | 대조 1/1 — **[추정] 해소.** §4.2가 *"위 표와 이 문단의 문구는 실행부 라벨 «문자열»과 지시 관계이지 축자 동일이 아니다"*로 문면 확정(2026-09-04 `K-482`) → 문자열은 계약이 아니다. 축 0 |
 * | §4.2 | 「정본 § 부재」를 이 게이트가 직접 잰다(스팬 밖 §) | 대조 1/1 — 축 9 |
 * | §4.2 | fail-closed 그물 다섯 | 대조 5/5 — 축 5(넷은 파싱, 문서 못 엶은 판정) |
 * | §4.2 | 게이트가 잡지 못하는 것 셋 | 대조 3/3 — 축 11(부재로) |
 * | §4.2 | §8 U-f와 겹치지 않는다 | 대조 1/1 — 축 10 |
 * | §4.2 | 착지 순서가 강제된다 | 미대조 — 커밋 단위. T-006 |
 * | §4.2 | 착지 전 레드 여섯 행의 처방 | 대조 6/6(위반 쪽만) — 축 4-7. 정정 후 실물 대조는 T-005 |
 * | §4.2 | 착지 후 행 수 열셋 · 열린 결손 둘 | 미대조 — 실물 계수. T-005 |
 * | §4.2 | 전수 선언 한 토큰이 결손 둘을 닫는다 | 미대조 — 사후 서술이지 판정 대상이 아니다 |
 * | §4.1 | 전수 정본 집합의 계수 **단위**(문서 대 문서§ 쌍) | **미대조([미규정])** — §4.1이 안 정한다. 축 7의 `it.todo` |
 * | §4.1 | 결손 토큰이 해소된(취소선) 미결을 가리킬 때 | 대조 1/1 — 문면 그대로의 읽기만. 별도 갈래로 승격할지는 **[미규정]**. 축 8 |
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type CanonicalToken,
  collectUnresolvedIds,
  countOpenGaps,
  type DictionaryRow,
  EXHAUSTIVE_TARGET,
  FAIL_CLOSED,
  type JudgeContext,
  judge,
  normalizeName,
  type ParseReason,
  parseDictionaryTable,
  VIOLATIONS,
} from "../../../scripts/name-dictionary.mjs";

// ---------------------------------------------------------------------------
// 픽스처 — 전부 손으로 만든 문자열이다. 실물 `docs/`를 열지 않는다.
//
// 실물을 열면 문서를 고칠 때마다 이 파일이 흔들리고, 그러면 계약이 아니라 실물의 사진이 된다
// (`doc-status.contract.test.ts` 머리와 같은 근거).
// ---------------------------------------------------------------------------

/** §4 표의 머리. 실물과 같은 세 칸이다. */
const DICT_HEAD = ["| Matrix 개념 | neo-agent | 정본 |", "|---|---|---|"];

function row(name: string, middle: string, canonical: string): string {
  return `| ${name} | ${middle} | ${canonical} |`;
}

/**
 * §8의 미결 목록. 해소된 항목(취소선) 하나를 함께 둔다 — 축 8의 [미규정] 자리다.
 */
const DEFAULT_UNRESOLVED = [
  "- ~~**U-a — 이미 해소된 항목.**~~ — 2026-08-21 해소.",
  "- **U-b — 설정 축에 정본이 없다.** 본문.",
  "- **U-g — Fork의 정본이 없다.** 본문.",
];

/**
 * `### 4.1` 본문의 예시 표 — 실물과 같은 두 칸/세 칸 혼합.
 *
 * **세 칸짜리 마지막 행이 이 축의 함정이다.** 셋째 칸이 우연히 합법 토큰(`§5.2`)이라, 절
 * 범위가 넓으면 파싱 실패가 아니라 **조용히 데이터 행 하나가 늘어난다.**
 */
const EXAMPLE_TABLE_41 = [
  "| 셀 | 형식 |",
  "|---|---|",
  "| 이름 | 세계관 이름 하나 |",
  "",
  "| 토큰 | 형식 | 뜻 |",
  "|---|---|---|",
  "| 외부 주소 | 코드 스팬 문서명 | 그 이름의 계약이 사는 자리 |",
  "| 내부 주소 | 절 번호 | §5.2 |",
];

/** `### 4.2` 본문의 예시 표. */
const EXAMPLE_TABLE_42 = ["| 갈래 | 뜻 |", "|---|---|", "| 행 파싱 실패 | 세 셀이 아니다 |"];

type LoreOptions = {
  /** §8 미결 목록을 갈아끼운다. */
  readonly unresolved?: readonly string[];
  /** §4 절 범위의 본문(표 포함)을 통째로 갈아끼운다. */
  readonly section4?: readonly string[];
};

/**
 * `LORE.md`를 닮은 최소 골격.
 *
 * 골격을 두는 것은 미관이 아니다 — 표만 던지면 **파일 맨 앞의 표를 읽는 파서**도 통과한다.
 * 실물은 §4 앞에 §1~§3이, 뒤에 §5·§8이 있고 §4 안에 소절 둘이 있다.
 */
function lore(rows: readonly string[], options: LoreOptions = {}): string {
  const body = options.section4 ?? [...DICT_HEAD, ...rows];
  return [
    "# 세계관 헌장 (Lore Charter)",
    "",
    "**한 줄 요약.**",
    "",
    "- 상태: 구현 완료",
    "- 근거: scripts/check-name-dictionary.mjs",
    "",
    "---",
    "",
    "## 1. 이 문서가 푸는 문제",
    "",
    "본문.",
    "",
    "## 3. 정점 정의 (불변)",
    "",
    "본문.",
    "",
    "## 4. 이름 사전 — 포인터 의무 (불변)",
    "",
    ...body,
    "",
    "### 4.1 행 문법 — 기계 대조의 계약 (2026-09-04 확정)",
    "",
    ...EXAMPLE_TABLE_41,
    "",
    "### 4.2 게이트",
    "",
    ...EXAMPLE_TABLE_42,
    "",
    "## 5. 헌장의 핵심 판정",
    "",
    "### 5.1 Smith는 Harness다",
    "",
    "#### 5.1.1 5축 대조",
    "",
    "### 5.2 Architect는 역할이지 캐릭터가 아니다",
    "",
    "## 8. 미결 — 이 문서가 정하지 않은 것",
    "",
    ...(options.unresolved ?? DEFAULT_UNRESOLVED),
    "",
  ].join("\n");
}

/** 정본 셀 하나만 바꿔가며 재는 자리 — 한 행짜리 표. */
function single(canonical: string, name = "**Neo**", middle = "사용자"): string {
  return lore([row(name, middle, canonical)]);
}

/** 가상 외부 문서. 절 제목의 형식은 이 레포의 실물 관행(`## N. 제목` / `### N.M 제목`)이다. */
function docWith(...sections: readonly string[]): string {
  const lines = ["# 가상 문서", "", "**한 줄 요약.**", "", "---", ""];
  for (const section of sections) {
    const depth = section.split(".").length + 1;
    const heading =
      depth === 2 ? `## ${section}. 절 제목` : `${"#".repeat(depth)} ${section} 절 제목`;
    lines.push(heading, "", "본문.", "");
  }
  return lines.join("\n");
}

/** `BOUNDARY-LAYERS.md`를 닮은 문서 — §2의 층 선언 표 + §3의 생성 구간. */
function boundaryLayers(layers: ReadonlyArray<readonly [string, string, string]>): string {
  return [
    "# 경계 층 인덱스",
    "",
    "**한 줄 요약.**",
    "",
    "---",
    "",
    "## 1. 경계",
    "",
    "본문.",
    "",
    "## 2. 층 선언",
    "",
    "| 층 | 경로 | 정본 |",
    "|---|---|---|",
    ...layers.map(([layer, path, canonical]) => `| ${layer} | ${path} | ${canonical} |`),
    "",
    "## 3. 인덱스",
    "",
    "<!-- boundary-index: begin (generated) -->",
    "",
    "| 층 | 층의 정본 | 파일 | 머리가 인용한 정본 |",
    "|---|---|---|---|",
    "| 승인 게이트 | `APPROVAL-GATE.md` §2 | `packages/gate/src/index.ts` | `APPROVAL-GATE.md` §2 |",
    "",
    "<!-- boundary-index: end -->",
    "",
  ].join("\n");
}

/** 오늘의 `BOUNDARY-LAYERS.md` §2가 드는 층 넷. */
const LAYERS_FOUR: ReadonlyArray<readonly [string, string, string]> = [
  ["승인 게이트", "`packages/gate/src`", "`APPROVAL-GATE.md` §2"],
  ["코어 루프 한도", "`packages/core/src/loop.ts`", "`CORE-INTERFACE.md` §5"],
  ["컨텍스트 압축 트리거", "`packages/compaction/src/trigger.ts`", "`COMPACTION.md` §3"],
  ["프로바이더 근거 강제", "`packages/core/src/provider.ts`", "`CORE-INTERFACE.md` §8"],
];

const DEFAULT_DOCS: Readonly<Record<string, string>> = {
  "ARCHITECTURE.md": docWith("1", "2.6"),
  "APPROVAL-GATE.md": docWith("2"),
  "BOUNDARY-LAYERS.md": boundaryLayers(LAYERS_FOUR),
  "CLI-INTERFACE.md": docWith("2.1", "5"),
  "COMPACTION.md": docWith("3"),
  "CORE-INTERFACE.md": docWith("5", "8"),
  "DISTRIBUTION.md": docWith("2"),
  "SAFE-DEFAULTS.md": docWith("1"),
  "TOOLS-INTERFACE.md": docWith("2", "3"),
  "WEB-UI.md": docWith("3", "4"),
};

function ctx(self: string, overrides: Readonly<Record<string, string>> = {}): JudgeContext {
  return { self, docs: new Map(Object.entries({ ...DEFAULT_DOCS, ...overrides })) };
}

// ---------------------------------------------------------------------------
// 단언 헬퍼
// ---------------------------------------------------------------------------

function parseRows(source: string): readonly DictionaryRow[] {
  const parsed = parseDictionaryTable(source);
  expect(parsed, `실제: ${JSON.stringify(parsed)}`).toHaveProperty("ok", true);
  return parsed.ok ? parsed.rows : [];
}

/**
 * §4.2의 **어느** 실패인지까지 단언한다.
 *
 * **실패했다**만 재면 갈래들이 서로 자리를 바꿔도 전부 그린이다. 이 게이트에서 그것은 치명적인데,
 * 갈래 이름이 곧 고칠 곳의 주소이기 때문이다 — 「이름이 둘」은 행을 가르라는 뜻이고 「정본 셀이
 * 비었다」는 포인터를 대라는 뜻이라 처방이 다르다.
 */
function expectParseReason(source: string, expected: ParseReason): void {
  const parsed = parseDictionaryTable(source);
  expect(parsed, `실제: ${JSON.stringify(parsed)}`).toMatchObject({ ok: false, reason: expected });
  const detail = parsed.ok ? "" : parsed.detail;
  expect(typeof detail).toBe("string");
  expect(detail.length).toBeGreaterThan(0);
}

function violationsOf(source: string, overrides: Readonly<Record<string, string>> = {}): string[] {
  const rows = parseRows(source);
  expect(rows.length).toBeGreaterThan(0);
  const context = ctx(source, overrides);
  return rows.flatMap((each) => {
    const judged = judge(each, context);
    return judged.ok ? [] : judged.violations.map((verdict) => verdict.violation);
  });
}

function expectJudgeOk(source: string, overrides: Readonly<Record<string, string>> = {}): void {
  expect(violationsOf(source, overrides)).toEqual([]);
}

function expectJudgeViolation(
  source: string,
  expected: string,
  overrides: Readonly<Record<string, string>> = {},
): void {
  const violations = violationsOf(source, overrides);
  expect(violations, `실제: ${JSON.stringify(violations)}`).toContain(expected);
}

/**
 * 판정이 살아 있다는 것을 같은 단언 안에서 증명하는 대조군 행. 「정본 § 부재」로 반드시 잡힌다.
 *
 * **부재의 계약을 재는 자리에는 이것이 필수다.** *"게이트가 잡지 못하는 것"*을 **위반이 안
 * 난다**로만 재면 **아무것도 판정하지 않는 구현**도 그린이다 — 역검증에서 실제로 확인했다
 * (전부 통과시키는 스텁이 그 케이스들을 전부 통과시켰다).
 */
const CONTROL_ROW = row("대조군", "판정이 살아 있는지 재는 행", "`ARCHITECTURE.md` §9.9");

/** 대상 행이 위반을 **하나도 보태지 않는다** — 대조군의 한 건만 남는다. */
function expectNoExtraViolation(
  target: string,
  overrides: Readonly<Record<string, string>> = {},
): void {
  const violations = violationsOf(lore([target, CONTROL_ROW]), overrides);
  expect(violations, `실제: ${JSON.stringify(violations)}`).toEqual([VIOLATIONS.deadSection]);
}

/** 판정과 실행부의 자리 — §4.2 첫 불릿이 파일 이름으로 든다. */
const SCRIPTS_DIR = fileURLToPath(new URL("../../../scripts/", import.meta.url));
const PURE_MODULE = join(SCRIPTS_DIR, "name-dictionary.mjs");
const GATE_MODULE = join(SCRIPTS_DIR, "check-name-dictionary.mjs");
const SELF_FILE = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// 축 0 — 표면 상수
//
// §4.2의 실패 갈래는 **여섯**이고 fail-closed 그물은 **다섯**이다. 두 집합이 닫혀 있다는 것이
// 계약이므로(`name-dictionary.d.mts` 머리 — 손으로 쓴 선언이 런타임 값과 대조되지 않는다),
// 여기서 런타임으로 잰다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 0: 표면", () => {
  it("판정 함수와 상수가 실제로 임포트된다", () => {
    // 임포트가 조용히 undefined를 주면 아래 단언들이 전부 TypeError로 죽기는 하지만, 진단이
    // "판정이 틀렸다"가 아니라 "배선이 끊겼다"를 가리키게 여기서 먼저 잰다.
    expect(typeof parseDictionaryTable).toBe("function");
    expect(typeof judge).toBe("function");
    expect(typeof normalizeName).toBe("function");
    expect(typeof collectUnresolvedIds).toBe("function");
    expect(typeof countOpenGaps).toBe("function");
  });

  it("실패 갈래가 §4.2 표와 1:1인 여섯이다", () => {
    // §4.2 표의 갈래: 행 파싱 실패 · 이름이 둘 · 정본 셀이 비었다 · 정본 § 부재 · 미결 유령 ·
    // 전수 미달.
    expect(Object.keys(VIOLATIONS).sort()).toEqual(
      [
        "canonicalEmpty",
        "deadSection",
        "exhaustiveShort",
        "ghostUnresolved",
        "nameDoubled",
        "rowMalformed",
      ].sort(),
    );
    const labels = Object.values(VIOLATIONS);
    expect(new Set(labels).size, `라벨이 겹친다: ${JSON.stringify(labels)}`).toBe(6);
    for (const label of labels) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("fail-closed 그물의 다섯이 전부 이름을 갖는다", () => {
    // §4.2: *"§4 절 범위에 표가 없다 · 0행 · 표가 둘 이상이다 · 이름 셀이 중복된다 · 주소가 든
    // 문서를 열 수 없다"*. 그리고 *"다섯 다 통과가 아니라 실패다"*.
    for (const key of [
      "tableMissing",
      "tableEmpty",
      "tableDuplicate",
      "nameDuplicate",
      "docUnreadable",
    ] as const) {
      expect(typeof FAIL_CLOSED[key], key).toBe("string");
      expect(FAIL_CLOSED[key].length, key).toBeGreaterThan(0);
    }
    const labels = Object.values(FAIL_CLOSED);
    expect(new Set(labels).size, `라벨이 겹친다: ${JSON.stringify(labels)}`).toBe(labels.length);
  });

  it("그물의 라벨이 위반 갈래의 라벨과 섞이지 않는다", () => {
    // §4.2가 그물을 실패 갈래 표 **밖**에 따로 든다. 이름이 겹치면 「잴 수 없다」가 「위반이다」로
    // 읽히고, 고치는 사람이 표를 고치러 간다.
    const overlap = Object.values(FAIL_CLOSED).filter((label) =>
      (Object.values(VIOLATIONS) as string[]).includes(label),
    );
    expect(overlap, `겹친 라벨: ${JSON.stringify(overlap)}`).toEqual([]);
  });

  it("전수 선언의 지원 대상이 `BOUNDARY-LAYERS.md`다", () => {
    // §4.2 말미가 그 인접성을 이름으로 든다 — *"이 문서에서 `BOUNDARY-LAYERS.md`로 가는
    // 인접성을 만든다"*.
    //
    // [미규정] **절 번호는 §4.1·§4.2 어디도 문면으로 안 정한다.** 오늘 그 문서의 층 선언 표가
    // §2에 있다는 실물 사실에서 온 값이라 여기서는 형태만 좁혀 잰다.
    expect(EXHAUSTIVE_TARGET.doc).toBe("BOUNDARY-LAYERS.md");
    expect(EXHAUSTIVE_TARGET.section.length).toBeGreaterThan(0);
  });

  it("라벨 «문자열»은 계약이 아니다 — 이 파일은 심볼로만 지목한다", () => {
    // **이 대응(갈래 이름 = 출력 라벨)을 §4.2가 문면으로 확정했다**(2026-09-04 `K-482`) —
    // *"위 표와 이 문단의 문구는 실행부 라벨 «문자열»과 지시 관계이지 축자 동일이 아니다"*.
    // 라벨이 §4.2가 든 개념을 가리키기만 하면 되고 자구가 갈려도 위반이 아니다. 머리의 조정
    // 가능 목록도 같은 결을 든다 — *"§4.2 게이트의 실패 메시지 문구와 스크립트의 파일 위치"*가
    // **문구는 개정 없이 바꿀 수 있는 층**임을 명시한다. 그래서 축 4~축 9는 전부
    // `VIOLATIONS.*` 심볼로 지목하고, 여기서는 **닫힌 집합**(§4.2 표와 1:1)만 잰다.
    const labels = Object.values(VIOLATIONS);
    expect(labels).toHaveLength(6);
    for (const label of labels) {
      expect(label.trim()).toBe(label);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 1 — 양성 대조군 (§4.1 토큰 다섯)
//
// **이 축이 없으면 축 2~축 9 전체가 공허하다.** 전부 거부하는 파서도 위반 케이스는 남김없이
// 통과시킨다 — 2026-08-13에 이 레포가 실제로 밟은 함정이라 여기서 반복하지 않는다.
// ---------------------------------------------------------------------------

describe("LORE §4.1 — 축 1: 양성 대조군", () => {
  it("외부 주소 — 코드 스팬 문서명 + 절 번호", () => {
    const rows = parseRows(single("`ARCHITECTURE.md` §1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokens).toEqual([
      { kind: "external", doc: "ARCHITECTURE.md", sections: ["1"] },
    ] satisfies CanonicalToken[]);
    expectJudgeOk(single("`ARCHITECTURE.md` §1"));
  });

  it("내부 주소 — 이 문서 안의 절", () => {
    const source = single("§3");
    expect(parseRows(source)[0]?.tokens).toEqual([
      { kind: "internal", section: "3" },
    ] satisfies CanonicalToken[]);
    expectJudgeOk(source);
  });

  it("전수 선언 — `전수:` + 외부 주소 하나", () => {
    const canonical =
      "`APPROVAL-GATE.md` §2 · `CORE-INTERFACE.md` §5·§8 · `COMPACTION.md` §3 · 전수: `BOUNDARY-LAYERS.md` §2";
    const source = single(canonical, "**Smith**", "Harness");
    const tokens = parseRows(source)[0]?.tokens ?? [];
    expect(tokens).toContainEqual({
      kind: "exhaustive",
      doc: "BOUNDARY-LAYERS.md",
      section: "2",
    } satisfies CanonicalToken);
    expectJudgeOk(source);
  });

  it("결손 — `정본 없음:` + §8의 미결 하나", () => {
    const source = single("정본 없음: §8 U-g", "**Fork**", "새 Matrix의 생성");
    expect(parseRows(source)[0]?.tokens).toEqual([
      { kind: "missing", unresolved: "U-g" },
    ] satisfies CanonicalToken[]);
    expectJudgeOk(source);
  });

  it("해당 없음 — 대응물이 없어야 맞는 자리", () => {
    const source = single("해당 없음: §5.2", "Architect", "개발자");
    expect(parseRows(source)[0]?.tokens).toEqual([
      { kind: "not-applicable", section: "5.2" },
    ] satisfies CanonicalToken[]);
    expectJudgeOk(source);
  });

  it("여러 토큰이 ` · `로 나열된 행", () => {
    const source = single("`CLI-INTERFACE.md` §5 · `ARCHITECTURE.md` §2.6 · 정본 없음: §8 U-b");
    const rows = parseRows(source);
    expect(rows[0]?.tokens).toHaveLength(3);
    expectJudgeOk(source);
  });

  it("행 번호가 1-기반으로 실린다", () => {
    const source = single("§3");
    const lines = source.split("\n");
    const expected = lines.findIndex((line) => line.includes("| **Neo** |")) + 1;
    expect(parseRows(source)[0]?.line).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 축 2 — §4.1 셀 셋
//
// *"이 표의 각 행은 정확히 세 셀이다"*.
// ---------------------------------------------------------------------------

describe("LORE §4.1 — 축 2: 셀 셋", () => {
  it("셀이 둘이면 행 파싱 실패", () => {
    expectParseReason(lore(["| Neo | `ARCHITECTURE.md` §1 |"]), "row-malformed");
  });

  it("셀이 넷이면 행 파싱 실패", () => {
    expectParseReason(lore(["| Neo | 사용자 | `ARCHITECTURE.md` §1 | 덤 |"]), "row-malformed");
  });

  it("이름 셀의 볼드는 허용된다", () => {
    // §4.1 이름 칸: *"세계관 이름 **하나**. 볼드는 허용하되 슬래시로 둘을 묶지 않는다"*.
    const rows = parseRows(single("`CLI-INTERFACE.md` §2.1", "**Red Pill**", "첫 기동 동의"));
    expect(rows).toHaveLength(1);
    expect(normalizeName(rows[0]?.name ?? "")).toBe("Red Pill");
  });

  it("이름 셀이 슬래시로 둘을 묶으면 「이름이 둘」", () => {
    // §4.2: *"이름 셀이 슬래시로 둘 이상을 묶는다"*. 정본 셀은 흠 없는 값을 둔다 — 그래야
    // 실패가 이름 쪽에서 왔다는 것이 갈린다.
    expectParseReason(
      lore([row("Source Code / Fork", "Matrix의 규칙", "`DISTRIBUTION.md` §2")]),
      "name-doubled",
    );
  });

  it("가운데 셀은 의무를 지지 않는다", () => {
    // §4.1: *"자유 서술"* · *"이 셀은 의무를 지지 않는다"*. 괄호 주석·슬래시·죽은 주소를 전부
    // 담아도 판정이 안 바뀐다. 여기가 새면 파서가 행 전체를 훑고 있다는 뜻이다.
    const middle = "Workers/Programs (파일·서버·클라우드) — §9.9 · `NOWHERE.md` §7";
    const source = single("`ARCHITECTURE.md` §1", "Neo-Agent", middle);
    expect(parseRows(source)).toHaveLength(1);
    expectJudgeOk(source);
  });

  it("정본 셀의 괄호 주석은 행 파싱 실패", () => {
    // §4.1 정본 칸: *"괄호 주석과 자유 산문 금지"*. §4.2 착지 전 레드의 Matrix 행이 이 형태다.
    expectParseReason(
      lore([row("Matrix", "Digital World", "`TOOLS-INTERFACE.md` §3 (닿는 범위의 경계)")]),
      "row-malformed",
    );
  });

  it("정본 셀의 꼬리 산문은 행 파싱 실패", () => {
    // §4.2 착지 전 레드의 Smith 행 — 꼬리 산문.
    expectParseReason(
      lore([row("**Smith**", "Harness", "`COMPACTION.md` §3 — 층별 대조는 §5.1.1")]),
      "row-malformed",
    );
  });

  it("정본 셀의 볼드 산문은 행 파싱 실패", () => {
    // §4.2 착지 전 레드의 Oracle 행 — *"결손이 볼드 산문이다"*.
    expectParseReason(
      lore([
        row(
          "**Oracle**",
          "안내자",
          "`CLI-INTERFACE.md` §5 · `ARCHITECTURE.md` §2.6 — **설정 축은 정본 없음**, §8 U-b",
        ),
      ]),
      "row-malformed",
    );
  });

  it("리터럴 없는 「해당 없음」 산문은 행 파싱 실패", () => {
    // §4.2 착지 전 레드의 Architect 행 — 괄호 주석 · 리터럴 없음.
    expectParseReason(
      lore([row("Architect", "개발자", "해당 없음 (사람의 역할) · §5.2")]),
      "row-malformed",
    );
  });
});

// ---------------------------------------------------------------------------
// 축 3 — §4.1 토큰 형식
// ---------------------------------------------------------------------------

describe("LORE §4.1 — 축 3: 토큰 형식", () => {
  it("§ 없는 문서 주소는 주소가 아니다", () => {
    // §4.1: *"§ 없는 문서 주소는 주소가 아니다"* — *"문서 하나를 통째로 가리키는 포인터는
    // «어디를 보라»를 말하지 않아 의무를 지지 않는다"*. §4.2 착지 전 레드의 Agents / Tools
    // 행이 이 형태다.
    expectParseReason(lore([row("Agents", "Workers", "`CORE-INTERFACE.md`")]), "row-malformed");
  });

  it("§ 있는 주소와 § 없는 주소가 섞여도 실패", () => {
    // 하나만 §를 잃어도 실패다. 안 그러면 **하나라도 있으면 통과**가 되어 Smith 행의 원래 형태
    // (`APPROVAL-GATE.md`·`SAFE-DEFAULTS.md`에 § 없음)가 조용히 통과한다.
    expectParseReason(
      lore([row("**Smith**", "Harness", "`APPROVAL-GATE.md` · `CORE-INTERFACE.md` §5")]),
      "row-malformed",
    );
  });

  it("정본 셀이 비면 「정본 셀이 비었다」", () => {
    // §4.1: *"정본 셀은 비어 있을 수 없다"*. §4.2: *"주소도 결손 토큰도 없다"*.
    expectParseReason(lore([row("Neo", "사용자", "")]), "canonical-empty");
    expectParseReason(lore([row("Neo", "사용자", "   ")]), "canonical-empty");
  });

  it("`—`만 든 정본 셀도 비어 있다", () => {
    // 대시는 토큰 집합 밖이다. 파싱 실패든 빈 셀이든 **조용히 통과하지 않는 것**이 계약이다.
    const parsed = parseDictionaryTable(lore([row("Neo", "사용자", "—")]));
    expect(parsed, `실제: ${JSON.stringify(parsed)}`).toHaveProperty("ok", false);
  });

  it("구분자 최소 쌍 — `§5·§8`은 한 문서의 절 목록이다", () => {
    // §4.1 외부 주소 칸: *"한 문서를 여럿으로 들면 `§5·§8`"*. 토큰 경계는 앞뒤 공백이 있는
    // ` · `이고 절 목록의 `·`는 공백이 없다 — 같은 글자라 파서가 단순히 `·`로 쪼개면 절이
    // 독립 토큰으로 잘못 세어진다.
    const one = parseRows(single("`CORE-INTERFACE.md` §5·§8"));
    expect(one[0]?.tokens).toEqual([
      { kind: "external", doc: "CORE-INTERFACE.md", sections: ["5", "8"] },
    ] satisfies CanonicalToken[]);
  });

  it("구분자 최소 쌍 — ` · `는 토큰 경계다", () => {
    const two = parseRows(single("`CORE-INTERFACE.md` §5 · `COMPACTION.md` §3"));
    expect(two[0]?.tokens).toEqual([
      { kind: "external", doc: "CORE-INTERFACE.md", sections: ["5"] },
      { kind: "external", doc: "COMPACTION.md", sections: ["3"] },
    ] satisfies CanonicalToken[]);
  });

  it("두 구분자가 한 행에 섞여도 갈린다", () => {
    // 실물 Smith 행이 정확히 이 형태다.
    const rows = parseRows(single("`CORE-INTERFACE.md` §5·§8 · `COMPACTION.md` §3"));
    expect(rows[0]?.tokens).toEqual([
      { kind: "external", doc: "CORE-INTERFACE.md", sections: ["5", "8"] },
      { kind: "external", doc: "COMPACTION.md", sections: ["3"] },
    ] satisfies CanonicalToken[]);
  });

  it("결손 토큰은 §8의 미결만 가리킨다", () => {
    // §4.1 결손 칸: *"`정본 없음:` + `§8 U-<자>`"*. 다른 문서를 가리키는 결손은 토큰 집합 밖이다.
    expectParseReason(
      lore([row("**Fork**", "새 Matrix", "정본 없음: `DISTRIBUTION.md` §2")]),
      "row-malformed",
    );
    expectParseReason(lore([row("**Fork**", "새 Matrix", "정본 없음: §7 U-g")]), "row-malformed");
  });

  it("해당 없음 토큰은 내부 주소 하나만 든다", () => {
    // §4.1 해당 없음 칸: *"`해당 없음:` + 내부 주소 하나"*.
    expectParseReason(
      lore([row("Architect", "개발자", "해당 없음: `ARCHITECTURE.md` §1")]),
      "row-malformed",
    );
  });

  it("전수 선언은 외부 주소 하나만 든다", () => {
    // §4.1 전수 선언 칸: *"`전수:` + 외부 주소 하나"*.
    expectParseReason(lore([row("**Smith**", "Harness", "전수: §5.1.1")]), "row-malformed");
  });

  it("토큰 집합 밖의 접두는 행 파싱 실패", () => {
    // §4.1: *"정본 셀의 토큰은 닫힌 집합이다"* — 집합 밖의 문자열은 새 종류가 아니라 실패다.
    expectParseReason(lore([row("Neo", "사용자", "참고: `ARCHITECTURE.md` §1")]), "row-malformed");
    expectParseReason(lore([row("Neo", "사용자", "미정")]), "row-malformed");
  });
});

// ---------------------------------------------------------------------------
// 축 4 — §4.2 실패 갈래 여섯
//
// 갈래 여섯 각각에 양성 사례를 둔다. 앞 셋은 파싱 단계, 뒤 셋은 판정 단계다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 4: 실패 갈래 여섯", () => {
  it("① 행 파싱 실패", () => {
    expectParseReason(lore(["| Neo | 사용자 |"]), "row-malformed");
  });

  it("② 이름이 둘", () => {
    expectParseReason(
      lore([row("Agents / Tools", "Workers·Programs", "`CORE-INTERFACE.md` §5")]),
      "name-doubled",
    );
  });

  it("③ 정본 셀이 비었다", () => {
    expectParseReason(lore([row("Neo", "사용자", "")]), "canonical-empty");
  });

  it("④ 정본 § 부재", () => {
    expectJudgeViolation(single("`ARCHITECTURE.md` §9.9"), VIOLATIONS.deadSection);
  });

  it("⑤ 미결 유령", () => {
    expectJudgeViolation(single("정본 없음: §8 U-z"), VIOLATIONS.ghostUnresolved);
  });

  it("⑥ 전수 미달", () => {
    const canonical = "`APPROVAL-GATE.md` §2 · 전수: `BOUNDARY-LAYERS.md` §2";
    expectJudgeViolation(single(canonical, "**Smith**", "Harness"), VIOLATIONS.exhaustiveShort);
  });

  it("한 행이 갈래 여럿에 걸리면 전부 든다", () => {
    // `name-dictionary.d.mts`의 `Judgement`: 첫 위반에서 멈추면 한 사이클에 하나씩만 보이고
    // 고치는 사람이 같은 행을 여러 번 왕복한다.
    const canonical = "`ARCHITECTURE.md` §9.9 · 정본 없음: §8 U-z";
    const violations = violationsOf(single(canonical));
    expect(violations).toContain(VIOLATIONS.deadSection);
    expect(violations).toContain(VIOLATIONS.ghostUnresolved);
  });

  it("착지 전 레드 여섯 행이 전부 위반으로 잡힌다", () => {
    // §4.2 *"착지 전 레드는 여섯 행이고 전부 처방이 이미 있다"*의 왼쪽(위반 쪽). 오른쪽(처방
    // 적용 후 실물이 그린인가)은 T-005의 몫이다.
    const preLanding: ReadonlyArray<readonly [string, string]> = [
      ["Matrix", "`TOOLS-INTERFACE.md` §3 (닿는 범위의 경계)"],
      [
        "**Smith**",
        "`APPROVAL-GATE.md` · `SAFE-DEFAULTS.md` · `CORE-INTERFACE.md` §5·§8 · `COMPACTION.md` §3 — 층별 대조는 §5.1.1",
      ],
      [
        "**Oracle**",
        "`CLI-INTERFACE.md` §5 · `ARCHITECTURE.md` §2.6 — **설정 축은 정본 없음**, §8 U-b",
      ],
      ["Architect", "해당 없음 (사람의 역할) · §5.2"],
      ["Agents / Tools", "`CORE-INTERFACE.md` · `TOOLS-INTERFACE.md`"],
      ["Source Code / Fork", "`DISTRIBUTION.md` §2 (링크 설치 = 소스 트리가 런타임)"],
    ];
    for (const [name, canonical] of preLanding) {
      const parsed = parseDictionaryTable(lore([row(name, "가운데 셀", canonical)]));
      expect(parsed, `${name}: ${JSON.stringify(parsed)}`).toHaveProperty("ok", false);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 5 — §4.2 fail-closed 그물
//
// *"다섯 다 통과가 아니라 실패다"*. 넷은 파싱 단계에서, 「주소가 든 문서를 열 수 없다」는
// 판정 단계에서 난다(`name-dictionary.d.mts`의 `ParseReason`·`JudgeContext`).
//
// **실행부의 배선(종료 코드·출력)은 여기 밖이다** — T-005의 역검증이 든다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 5: fail-closed 그물", () => {
  it("§4 절 범위에 표가 없으면 실패", () => {
    expectParseReason(lore([], { section4: ["표가 없는 산문뿐이다."] }), "table-missing");
  });

  it("`## 4.` 절 자체가 없어도 실패", () => {
    const noSection4 = lore([]).replace("## 4. 이름 사전 — 포인터 의무 (불변)", "## 4x. 다른 절");
    expectParseReason(noSection4, "table-missing");
  });

  it("표가 0행이면 실패", () => {
    expectParseReason(lore([], { section4: [...DICT_HEAD] }), "table-empty");
  });

  it("절 범위에 표가 둘 이상이면 실패", () => {
    expectParseReason(
      lore([], {
        section4: [
          ...DICT_HEAD,
          row("Neo", "사용자", "§3"),
          "",
          ...DICT_HEAD,
          row("Matrix", "Digital World", "`TOOLS-INTERFACE.md` §3"),
        ],
      }),
      "table-duplicate",
    );
  });

  it("이름 셀이 중복되면 실패", () => {
    expectParseReason(
      lore([row("Neo", "사용자", "§3"), row("Neo", "다른 서술", "`ARCHITECTURE.md` §1")]),
      "name-duplicate",
    );
  });

  it("마크업만 다른 이름도 중복이다", () => {
    // `normalizeName`의 계약 — §4.1이 이름 셀에 볼드를 허용하므로 볼드 유무는 다른 이름이
    // 아니다. 여기가 새면 `**Neo**`를 한 줄 더 넣는 것이 중복 검사의 우회로가 된다.
    expectParseReason(
      lore([row("Neo", "사용자", "§3"), row("**Neo**", "다른 서술", "`ARCHITECTURE.md` §1")]),
      "name-duplicate",
    );
  });

  it("주소가 든 문서를 열 수 없으면 실패 — 통과가 아니다", () => {
    // §4.2 그물의 다섯째. 이 자리가 조용히 통과하면 오타 하나로 정본 대조가 통째로 사라진다.
    const violations = violationsOf(single("`NOWHERE.md` §1"));
    expect(violations, `실제: ${JSON.stringify(violations)}`).toContain(FAIL_CLOSED.docUnreadable);
  });

  it("「문서를 열 수 없다」가 「정본 § 부재」로 뭉개지지 않는다", () => {
    // §4.2가 그물과 실패 갈래를 **다른 목록**으로 든다. 뭉개면 처방이 갈린다 — 앞은 배선을
    // 고치라는 뜻이고 뒤는 문서를 고치라는 뜻이다.
    const violations = violationsOf(single("`NOWHERE.md` §1"));
    // 대조군 — 아무것도 안 내는 판정도 이 부정 단언을 통과한다. 「무언가는 났다」를 함께 잰다.
    expect(violations.length, `실제: ${JSON.stringify(violations)}`).toBeGreaterThan(0);
    expect(violations).not.toContain(VIOLATIONS.deadSection);
  });

  it("전수 대상이 지원 범위 밖이어도 조용히 통과하지 않는다", () => {
    // [미규정] §4.2는 이 경우를 규정하지 않는다(`name-dictionary.d.mts`가 같은 자리에
    // [미규정]을 단다). **어느 라벨인지는 여기서 판정하지 않고** 「통과가 아니다」만 잰다 —
    // 통과시키면 게이트가 재지 않은 것을 잰 것처럼 보고한다.
    const canonical = "`ARCHITECTURE.md` §1 · 전수: `ARCHITECTURE.md` §1";
    const violations = violationsOf(single(canonical, "**Smith**", "Harness"));
    expect(violations.length, `실제: ${JSON.stringify(violations)}`).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 축 6 — §4.2 절 범위
//
// «절 범위는 `## 4.`와 그 다음에 처음 나오는 제목 사이다 — 수준을 가리지 않는다(`##`~`######`
// 무엇이든 닫는다)». §4.1의 예시 표 둘이 정확히 그 함정이고, `DOC-STATUS.md` §5.1이 자기
// 소절의 표에 데인 자리다. **`###`까지로만 좁히지 않는다** — 좁은 읽기는 §4가 소절을 전부
// 잃는 날 범위를 `## 5.`까지 흘려보낸다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 6: 절 범위", () => {
  it("§4.1·§4.2 본문의 예시 표가 데이터 행이 되지 않는다", () => {
    const rows = parseRows(lore([row("Neo", "사용자", "§3")]));
    expect(rows).toHaveLength(1);
    expect(rows.map((each) => normalizeName(each.name))).toEqual(["Neo"]);
  });

  it("예시 표가 있어도 「표가 둘 이상」으로 오판하지 않는다", () => {
    // 범위를 잘못 잡으면 그물이 오히려 먼저 터져 원인이 «표가 둘»로 보고된다.
    const parsed = parseDictionaryTable(lore([row("Neo", "사용자", "§3")]));
    expect(parsed, `실제: ${JSON.stringify(parsed)}`).toHaveProperty("ok", true);
    // 대조군 — 예시 표를 삼켜 행이 는 형태도 «ok: true»다. 행 수를 함께 잰다.
    expect(parsed.ok ? parsed.rows.length : -1).toBe(1);
  });

  it("§5 이후의 표도 데이터 행이 되지 않는다", () => {
    const source = lore([row("Neo", "사용자", "§3")]).replace(
      "### 5.1 Smith는 Harness다",
      ["### 5.1 Smith는 Harness다", "", ...DICT_HEAD, row("침입자", "가짜", "§3")].join("\n"),
    );
    const names = parseRows(source).map((each) => normalizeName(each.name));
    expect(names, `실제: ${JSON.stringify(names)}`).toEqual(["Neo"]);
  });

  it("절 범위 안의 표만 센다 — 여러 행이 순서대로 실린다", () => {
    const rows = parseRows(
      lore([
        row("Neo", "사용자", "§3"),
        row("Matrix", "Digital World", "`TOOLS-INTERFACE.md` §3"),
        row("**Fork**", "새 Matrix", "정본 없음: §8 U-g"),
      ]),
    );
    expect(rows.map((each) => normalizeName(each.name))).toEqual(["Neo", "Matrix", "Fork"]);
  });
});

// ---------------------------------------------------------------------------
// 축 7 — §4.1 전수 선언
//
// *"전수 선언이 완전성 축을 연다"* / *"의무는 포함이지 동일이 아니다"*.
// ---------------------------------------------------------------------------

describe("LORE §4.1 — 축 7: 전수 선언", () => {
  const smith = (canonical: string) => single(canonical, "**Smith**", "Harness");
  const FULL =
    "`APPROVAL-GATE.md` §2 · `CORE-INTERFACE.md` §5·§8 · `COMPACTION.md` §3 · 전수: `BOUNDARY-LAYERS.md` §2";

  it("정본 집합을 전부 들면 통과", () => {
    expectNoExtraViolation(row("**Smith**", "Harness", FULL));
  });

  it("한 문서를 통째로 빠뜨리면 「전수 미달」", () => {
    // 계수 단위가 문서든 문서§ 쌍이든 이 케이스는 양쪽 읽기에서 모두 미달이다.
    const short =
      "`APPROVAL-GATE.md` §2 · `CORE-INTERFACE.md` §5·§8 · 전수: `BOUNDARY-LAYERS.md` §2";
    expectJudgeViolation(smith(short), VIOLATIONS.exhaustiveShort);
  });

  it("초과는 위반이 아니다 — 의무는 포함이지 동일이 아니다", () => {
    // §4.1: *"이름은 인덱스보다 넓을 수 있으나 좁을 수 없다"*. 오늘의 실물 Smith 행이 정확히
    // 이 초과 사례다(`SAFE-DEFAULTS.md` §1은 `BOUNDARY-LAYERS.md` §2 표에 없다).
    const wide = `${FULL} · \`SAFE-DEFAULTS.md\` §1`;
    expectNoExtraViolation(row("**Smith**", "Harness", wide));
  });

  it("정본 집합이 자라면 미달이 드러난다 — 손 유지 목록이 늦게 자라는 방향", () => {
    // §4.1의 발단: `BOUNDARY-LAYERS.md`가 신설됐는데 Smith 행이 안 자랐다. 인덱스에 층이
    // 하나 늘면 같은 행이 그 순간 레드여야 한다.
    const grown = boundaryLayers([
      ...LAYERS_FOUR,
      ["새 층", "`packages/new/src`", "`WEB-UI.md` §3"],
    ]);
    expectJudgeViolation(smith(FULL), VIOLATIONS.exhaustiveShort, {
      "BOUNDARY-LAYERS.md": grown,
    });
  });

  it("전수 선언이 없으면 완전성을 묻지 않는다", () => {
    // §4.2 *"전수 선언이 없는 행의 완전성"*은 게이트가 잡지 못하는 것으로 명시돼 있다.
    expectNoExtraViolation(row("**Smith**", "Harness", "`APPROVAL-GATE.md` §2"));
  });

  it("전수 대상 문서를 열 수 없으면 조용히 통과하지 않는다", () => {
    const violations = violationsOf(smith(FULL), { "BOUNDARY-LAYERS.md": "" });
    expect(violations.length, `실제: ${JSON.stringify(violations)}`).toBeGreaterThan(0);
  });

  it.todo(
    "[미규정] 전수 정본 집합의 계수 단위 — 문서 단위(오늘 셋)인가 문서§ 쌍 단위(오늘 넷)인가. `CORE-INTERFACE.md` §5만 들고 §8을 뺀 행이 미달인지 §4.1이 안 정한다. 판정 필요",
  );
});

// ---------------------------------------------------------------------------
// 축 8 — §4.2 미결 유령 · §4.1 결손의 등록처
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 8: 미결 유령과 열린 결손", () => {
  it("§8에 있는 미결을 가리키면 통과", () => {
    expectNoExtraViolation(row("**Oracle**", "안내자", "정본 없음: §8 U-b"));
  });

  it("§8에 없는 미결을 가리키면 「미결 유령」", () => {
    // §4.2: *"결손 토큰이 든 `U-<자>`가 §8에 없다"*.
    expectJudgeViolation(single("정본 없음: §8 U-z"), VIOLATIONS.ghostUnresolved);
  });

  it("§8의 목록이 줄면 그 순간 유령이 된다", () => {
    const withoutG = single("정본 없음: §8 U-g");
    const trimmed = lore([row("**Fork**", "새 Matrix", "정본 없음: §8 U-g")], {
      unresolved: ["- **U-b — 설정 축에 정본이 없다.** 본문."],
    });
    expectJudgeOk(withoutG);
    expectJudgeViolation(trimmed, VIOLATIONS.ghostUnresolved);
  });

  it("`collectUnresolvedIds`가 §8의 식별자를 든다", () => {
    const ids = collectUnresolvedIds(lore([row("Neo", "사용자", "§3")]));
    expect(ids).toContain("U-b");
    expect(ids).toContain("U-g");
    expect(ids).not.toContain("U-z");
  });

  it("해소된(취소선) 미결도 §8에 있는 것으로 센다", () => {
    // [미규정] §4.2가 재는 것은 *"결손 토큰이 든 `U-<자>`가 §8에 없다"*뿐이고, 해소된 항목을
    // 가리키는 것이 별도 갈래인지는 정하지 않는다. **문면 그대로**의 읽기만 건다 — 취소선
    // 항목은 §8에 있으므로 유령이 아니다. 이 자리의 처분은 판정 필요.
    expectNoExtraViolation(row("**Red Pill**", "첫 기동 동의", "정본 없음: §8 U-a"));
  });

  it("`countOpenGaps`가 결손만 센다 — 해당 없음은 세지 않는다", () => {
    // §4.1: 리터럴을 둘로 가른 이유가 이 값이다 — *"하나로 합치면 Architect가 영원한 결손으로
    // 세어져 닫힌 판정을 매 사이클 다시 연다"*.
    const rows = parseRows(
      lore([
        row("**Oracle**", "안내자", "`CLI-INTERFACE.md` §5 · 정본 없음: §8 U-b"),
        row("**Fork**", "새 Matrix", "정본 없음: §8 U-g"),
        row("Architect", "개발자", "해당 없음: §5.2"),
        row("Neo", "사용자", "§3"),
      ]),
    );
    expect(countOpenGaps(rows)).toBe(2);
  });

  it("결손이 없는 표의 열린 결손은 0이다", () => {
    const rows = parseRows(lore([row("Architect", "개발자", "해당 없음: §5.2")]));
    expect(countOpenGaps(rows)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 축 9 — §4.2 정본 § 부재
//
// *"주소가 든 §가 그 문서에 없다"*. §4.2가 이 갈래를 자기 안에 둔 이유는 `PUBLIC-TREE.md` §3의
// `dead-section`이 문서명과 §가 같은 코드 스팬 안일 때만 발화하는데 이 레포는 §를 언제나 스팬
// 바깥에 쓰기 때문이다 — 즉 오늘 이 표의 §가 실재하는지는 아무도 안 잰다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 9: 정본 § 부재", () => {
  it("외부 주소의 § 실재를 잰다 — 스팬 바깥의 §다", () => {
    expectJudgeOk(single("`ARCHITECTURE.md` §2.6"));
    expectJudgeViolation(single("`ARCHITECTURE.md` §2.7"), VIOLATIONS.deadSection);
  });

  it("다중 § 중 하나만 죽어도 잡는다", () => {
    expectJudgeViolation(single("`CORE-INTERFACE.md` §5·§9"), VIOLATIONS.deadSection);
  });

  it("내부 주소의 § 실재도 잰다", () => {
    // *"주소가 든 §가 그 문서에 없다"*는 문서 종류를 안 가린다. 내부 주소는 이 문서
    // (`LORE.md`) 자신의 절이다.
    expectJudgeOk(single("§5.2"));
    expectJudgeViolation(single("§9.9"), VIOLATIONS.deadSection);
  });

  it("해당 없음 토큰이 든 내부 주소도 잰다", () => {
    expectJudgeViolation(single("해당 없음: §9.9", "Architect", "개발자"), VIOLATIONS.deadSection);
  });

  it("전수 선언이 든 §도 잰다", () => {
    const canonical = "`APPROVAL-GATE.md` §2 · 전수: `BOUNDARY-LAYERS.md` §9";
    const violations = violationsOf(single(canonical, "**Smith**", "Harness"));
    expect(violations.length, `실제: ${JSON.stringify(violations)}`).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 축 10 — §8 U-f와의 경계
//
// §4.1 말미: *"세계관 이름을 전부 지워도 이 검사기는 그대로 선다"*.
// §4.2 말미: *"이 게이트는 **오른쪽 열만** 본다"* — U-f의 오탐에 원리적으로 안 걸린다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 10: 오른쪽 열만 본다", () => {
  const CANONICALS = [
    "§3",
    "`TOOLS-INTERFACE.md` §3",
    "정본 없음: §8 U-b",
    "해당 없음: §5.2",
    "`ARCHITECTURE.md` §9.9",
  ];

  function verdictsFor(names: readonly string[]): string[] {
    const source = lore(
      names.map((name, index) => row(name, `가운데 셀 ${index}`, CANONICALS[index] ?? "§3")),
    );
    return violationsOf(source);
  }

  it("세계관 이름을 전부 지워도 판정이 같다", () => {
    const lore판정 = verdictsFor(["Neo", "Matrix", "**Oracle**", "Architect", "Jack-in"]);
    const 무세계관판정 = verdictsFor(["가", "나", "다", "라", "마"]);
    expect(무세계관판정).toEqual(lore판정);
    // 대조군 — 판정이 전부 비었으면 위 동일성은 공허하다.
    expect(lore판정).toContain(VIOLATIONS.deadSection);
  });

  it("기능 어휘 이름(`Agents`·`Tools`·`Source Code`)이 판정을 바꾸지 않는다", () => {
    // U-f의 첫째 미결이 정확히 이 어휘들의 오탐이다. 이 게이트는 왼쪽 열을 어휘로 쓰지 않는다.
    const 기능어휘 = verdictsFor(["Agents", "Tools", "Source Code", "Program", "Zion"]);
    expect(기능어휘).toEqual(verdictsFor(["A", "B", "C", "D", "E"]));
    // 대조군 — 양쪽이 다 비어 있으면 위 동일성은 공허하다.
    expect(기능어휘).toContain(VIOLATIONS.deadSection);
  });

  it("가운데 셀에 세계관 어휘가 몰려 있어도 판정이 안 바뀐다", () => {
    const 세계관어휘 = "Smith·Oracle·Architect·Zion·Matrix";
    // 합법 행 — 가운데 셀이 어휘로 가득해도 위반이 안 생긴다.
    expectNoExtraViolation(row("Neo", 세계관어휘, "`ARCHITECTURE.md` §1"));
    // 위반 행 — 가운데 셀이 위반을 **가리지도** 않는다. 양쪽이 다 비지 않는 대조다.
    const plain = violationsOf(single("`ARCHITECTURE.md` §9.9", "Neo", "사용자"));
    const loaded = violationsOf(single("`ARCHITECTURE.md` §9.9", "Neo", 세계관어휘));
    expect(plain).toContain(VIOLATIONS.deadSection);
    expect(loaded).toEqual(plain);
  });
});

// ---------------------------------------------------------------------------
// 축 11 — §4.2 「게이트가 잡지 못하는 것」 셋 (부재의 계약)
//
// 셋 다 **통과해야 한다**가 아니라 **게이트가 이 갈래를 안 낸다**로 잰다. 과잉 구현이면 여기서
// 붉고, 그 초과는 §4.2 문면이 명시적으로 밖에 둔 것이라 계약 위반이다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 11: 잡지 못하는 것", () => {
  it("가운데 셀의 서술과 §8의 열거가 어긋나도 위반이 아니다", () => {
    // Oracle 행이 축 다섯을 들고 §8 U-b가 넷을 셈하는 실물의 어긋남. *"산문 대 산문이라 이
    // 문법이 안 닿는다"*.
    expectNoExtraViolation(
      row(
        "**Oracle**",
        "안내자 — 사용법·현재 상태·설정·오류 해결·다음 행동 제안(다섯)",
        "`CLI-INTERFACE.md` §5 · 정본 없음: §8 U-b",
      ),
    );
  });

  it("전수 선언이 없는 행의 완전성은 묻지 않는다", () => {
    expectNoExtraViolation(row("**Smith**", "Harness", "`APPROVAL-GATE.md` §2"));
  });

  it("그 §가 그 이름을 지는지는 묻지 않는다", () => {
    // *"주소가 해결된다는 것과 그 대상이 말한 것을 담고 있다는 것은 다르다"* — `DOC-CITATION.md`
    // §3.4의 대조 축이고 여기 밖이다. §가 실재하기만 하면 통과다.
    expectNoExtraViolation(row("Jack-in", "휴대용 콘솔", "`WEB-UI.md` §3"));
  });
});

// ---------------------------------------------------------------------------
// 축 12 — §4.2 판정과 실행부의 분리
//
// *"판정과 실행부를 파일로 가른다"* — *"한 파일이면 계약 테스트가 판정 함수를 임포트하는 것만으로
// 게이트가 돌고 실패 시 테스트 워커가 죽는다"*. `doc-status.contract.test.ts`가 실물로 잡아
// 고친 결함이라 여기서 회귀를 막는다.
// ---------------------------------------------------------------------------

describe("LORE §4.2 — 축 12: 판정/실행부 경계", () => {
  it("판정과 실행부가 서로 다른 파일에 산다", () => {
    expect(existsSync(PURE_MODULE), PURE_MODULE).toBe(true);
    expect(existsSync(GATE_MODULE), GATE_MODULE).toBe(true);
  });

  it("실행부에는 `.d.mts`가 없다", () => {
    // 있으면 계약 테스트가 실행부를 타입 안전하게 임포트할 수 있게 되어 위 경계가 되살아난다 —
    // 타입 선언의 부재가 곧 **이건 임포트하는 것이 아니다**의 표시다.
    expect(existsSync(join(SCRIPTS_DIR, "name-dictionary.d.mts"))).toBe(true);
    expect(existsSync(join(SCRIPTS_DIR, "check-name-dictionary.d.mts"))).toBe(false);
  });

  it("이 파일이 실행부를 임포트하지 않는다", () => {
    // 자기 소스를 읽어 잰다. 실행부를 임포트하지 않는 것이 이 계약 테스트의 전제이고, 이 단언이
    // 없으면 다음 사람이 편의로 한 줄 넣어도 아무도 모른다.
    const importLines = readFileSync(SELF_FILE, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("import ") || line.startsWith("} from "));
    expect(importLines.join("\n")).not.toContain("check-name-dictionary");
    // 대조군 — 순수 모듈은 실제로 임포트되고 있다.
    expect(importLines.join("\n")).toContain("name-dictionary.mjs");
  });

  it("순수 판정 모듈은 임포트만으로 출력하지도 종료하지도 않는다", () => {
    // **자식 프로세스로 잰다.** 이 파일은 이미 그 모듈을 임포트한 뒤라 여기서는 부작용을
    // 관측할 수 없고, 부작용이 있었다면 관측할 자리는 이미 지나갔다 — vitest 워커가 죽어 이
    // 파일이 통째로 사라지는 형태로.
    //
    // `cwd`를 리포 밖(임시 디렉터리)에 둔다: 모듈이 상대 경로로 `docs/`를 읽으려 하면 여기서
    // 죽는다.
    const probe = `await import(${JSON.stringify(pathToFileURL(PURE_MODULE).href)});process.stdout.write("REACHED");`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: tmpdir(),
      encoding: "utf8",
    });
    expect(result.stderr, "순수 모듈이 stderr에 무언가를 썼다").toBe("");
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toBe("REACHED");
  });

  it("판정 함수가 파일을 열지 않는다 — 문서 지식은 전부 주입된다", () => {
    // `JudgeContext`가 *"이 모듈은 파일을 안 읽는다"*를 든다. 실물 `docs/`와 무관한 가짜
    // 문서만으로 판정이 성립하는 것이 그 증거다 — 실물을 읽었다면 `NOWHERE-DOC.md`가 열릴 리
    // 없는데도 아래가 통과한다.
    expectNoExtraViolation(row("Neo", "사용자", "`NOWHERE-DOC.md` §7"), {
      "NOWHERE-DOC.md": docWith("7"),
    });
    // 반대 방향 — 주입한 문서에 그 §가 없으면 같은 행이 레드다. 주입이 실제로 읽힌다는 증거.
    expectJudgeViolation(single("`NOWHERE-DOC.md` §7"), VIOLATIONS.deadSection, {
      "NOWHERE-DOC.md": docWith("1"),
    });
  });
});
