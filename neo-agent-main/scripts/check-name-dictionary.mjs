/**
 * 이름 사전 게이트 — 실행부.
 *
 * 정본은 `docs/LORE.md` §4.1(행 문법·토큰 집합)·§4.2(실패 갈래·fail-closed 그물·절 범위)이고,
 * 판정 규칙은 부작용 없는 `name-dictionary.mjs`에 있다. 이 파일이 맡는 것은 **파일 I/O와
 * 종료 코드**뿐이다 — 문서를 열어 판정에 넘기고, 순수 함수가 낸 판정을 exit 1로 옮기고,
 * 성공도 조용하지 않게 요약을 낸다.
 *
 * **왜 이 게이트가 있는가.** §4는 자기를 «감사 표면»이라 부르면서 그것을 재는 기계가
 * 0건이었고, 그 대가가 실물로 두 번 났다 — `BOUNDARY-LAYERS.md`가 신설되며 Smith가 지는 층의
 * 인덱스가 생겼는데 Smith 행이 안 자랐고, `Source Code / Fork` 행이 이름 둘을 묶어 Fork의
 * 정본 부재를 가리고 있었다(§4.1의 「왜 필요한가」). 그때 실패한 것이 사람의 주의력이므로
 * 산문 안내로는 대신할 수 없다.
 *
 * **경로는 `import.meta.url` 기준이다**(형제 게이트 넷과 같다). `process.cwd()`를 읽으면
 * 잘못된 디렉터리에서 실행됐을 때 "문서를 못 찾음 → 조용히 통과"라는 침묵 경로가 생긴다
 * (`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물이 함께 막는다.
 *
 * **이 파일은 임포트되지 않는다.** 임포트하면 아래 본문이 그대로 돌고 실패 시
 * `process.exit(1)`이 임포트한 쪽을 죽인다. 판정 함수가 필요하면 `name-dictionary.mjs`를
 * 쓴다 — 두 파일로 가른 근거는 §4.2 둘째 불릿이 든다.
 *
 * **순수 함수가 이미 내는 판정을 여기서 다시 내지 않는다.** §4.2의 fail-closed 그물 다섯 중
 * 넷(표 없음·0행·표 둘 이상·이름 중복)은 문면만으로 갈리므로 `parseDictionaryTable`이 든다.
 * 이 파일이 새로 지는 것은 파일을 열 수 없는 갈래(그물의 다섯째)와, 그 판정들을 실제로
 * 종료 코드로 옮기는 일이다.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countOpenGaps,
  FAIL_CLOSED,
  judge,
  parseDictionaryTable,
  VIOLATIONS,
} from "./name-dictionary.mjs";

const DOCS_DIR = new URL("../docs/", import.meta.url).pathname;
/** 이름 사전이 사는 자리. 이 파일이 없으면 대조할 것이 없다. */
const DICTIONARY_DOCUMENT = "LORE.md";

const HEADLINE = "게이트 위반 — 이름 사전 (정본: docs/LORE.md §4.1·§4.2):";

/**
 * 라벨 있는 실패로 끝낸다. 맨몸 예외로 죽으면 exit 1이라 fail-closed 성질은 유지되지만
 * 무엇이 깨졌나를 말하지 않는다 — `check-doc-citation.mjs`가 같은 자리를 먼저 닫았고
 * `check-boundary-index.mjs`가 그 형태를 물려받았다.
 *
 * @param {string} detail
 * @returns {never}
 */
function failClosed(detail) {
  console.error(HEADLINE);
  console.error(`  - [fail-closed] ${detail}`);
  process.exit(1);
}

/**
 * `parseDictionaryTable`의 실패 사유 → 출력 라벨. **목록으로 두는 것이 조건식보다 낫다** —
 * 조건식은 새 사유가 붙어도 안 붉고 그 사유를 조용히 fail-closed로 떨어뜨린다
 * (`DOC-STATUS.md` §3.6이 2026-08-23에 실물로 보여준 자리이고
 * `check-boundary-index.mjs`의 `PARSE_LABELS`가 같은 근거로 선다).
 *
 * 앞 셋은 §4.2 표의 실패 갈래이고 뒤 넷은 fail-closed 그물이다 — **일곱이 `ParseReason`
 * 유니온과 1:1이다.** 대응이 없는 사유가 오면 아래에서 `fail-closed`로 떨어지며 사유
 * 문자열을 그대로 낸다.
 */
const PARSE_LABELS = {
  "row-malformed": VIOLATIONS.rowMalformed,
  "name-doubled": VIOLATIONS.nameDoubled,
  "canonical-empty": VIOLATIONS.canonicalEmpty,
  "table-missing": FAIL_CLOSED.tableMissing,
  "table-empty": FAIL_CLOSED.tableEmpty,
  "table-duplicate": FAIL_CLOSED.tableDuplicate,
  "name-duplicate": FAIL_CLOSED.nameDuplicate,
};

const dictionaryPath = join(DOCS_DIR, DICTIONARY_DOCUMENT);
if (!existsSync(dictionaryPath)) failClosed(`이름 사전의 정본 ${DICTIONARY_DOCUMENT}이 없다`);

let dictionarySource;
try {
  dictionarySource = readFileSync(dictionaryPath, "utf8");
} catch (error) {
  failClosed(`${DICTIONARY_DOCUMENT}을 읽지 못했다 — ${error.message}`);
}

const table = parseDictionaryTable(dictionarySource);
if (!table.ok) {
  const label = PARSE_LABELS[table.reason];
  console.error(HEADLINE);
  console.error(`  - [${label ?? "fail-closed"}] (${table.reason}) ${table.detail}`);
  console.error("");
  console.error(
    label
      ? "  위 대괄호가 §4.2가 든 이름이다 — 표 파싱이 여기서 멈추고 남은 행은 안 잰다."
      : "  위 대괄호는 §4.2에 대응이 없는 새 사유다(괄호 안이 그 사유) — 표 파싱이 여기서 멈추고 남은 행은 안 잰다.",
  );
  console.error("  건너뛰면 오타 하나가 이름을 통째로 사전 밖으로 옮기고 게이트는 그린이 된다.");
  process.exit(1);
}

/**
 * 판정에 필요한 외부 문서 원문. **행이 실제로 드는 문서만 연다** — `docs/` 전체를 읽으면
 * 이 게이트가 무엇을 대조했는지가 출력에서 흐려지고, 안 열린 문서와 안 참조된 문서가
 * 구별되지 않는다.
 *
 * **읽지 못한 문서는 키를 안 만든다.** `judge`가 그것을 「주소가 든 문서를 열 수 없다」로
 * 들도록 하기 위함이다(§4.2 fail-closed 그물 다섯째) — 여기서 미리 실패로 끝내면 한 행씩
 * 왕복하게 되고, 어느 행이 그 문서를 들었는지도 안 나온다.
 */
const docs = new Map();
for (const row of table.rows) {
  for (const token of row.tokens) {
    if (token.kind !== "external" && token.kind !== "exhaustive") continue;
    if (docs.has(token.doc)) continue;
    const path = join(DOCS_DIR, token.doc);
    if (!existsSync(path)) continue;
    try {
      docs.set(token.doc, readFileSync(path, "utf8"));
    } catch {
      // 키를 안 만든다 — 위 주석과 같은 이유다.
    }
  }
}

const failures = [];
/** 실제로 `judge`를 통과시킨 행 수. 아래 fail-closed가 이 값을 행 수와 대조한다. */
let judged = 0;

for (const row of table.rows) {
  const verdict = judge(row, { self: dictionarySource, docs });
  judged += 1;
  if (verdict.ok) continue;
  for (const entry of verdict.violations) {
    failures.push(`${DICTIONARY_DOCUMENT}:${row.line}: [${entry.violation}] ${entry.detail}`);
  }
}

// fail-closed — 판정한 행이 표의 행 수와 다르면 위 순회가 행을 흘린 것이다. 「미판정 0」은
// 아래 요약이 주장하는 값이므로 주장만 하고 재지 않으면 그 줄이 장식이 된다.
if (judged !== table.rows.length) {
  failClosed(`행 ${table.rows.length}개 중 ${judged}개만 판정됐다`);
}

const openGaps = countOpenGaps(table.rows);
const unjudged = table.rows.length - judged;
const summary =
  `판정 ${table.rows.length} · 위반 ${failures.length} · 미판정 ${unjudged} ·` +
  ` 열린 결손 ${openGaps}`;

if (failures.length > 0) {
  console.error(HEADLINE);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("");
  console.error(`  ${summary}`);
  process.exit(1);
}

// 성공도 조용하지 않다 — `ARCHITECTURE.md` §2.6(모든 행동은 가시적 결과로 끝난다).
// **판정 행 수와 연 문서 수를 함께 든다** — 0이 정상인 검사가 아니므로, 몇 행을 재고
// 위반 0이 나왔는지를 말하지 않으면 표가 비어 통과하는 상태와 구별되지 않는다.
// **「열린 결손」이 여기 있는 것이 §4.1이 결손과 해당 없음을 서로 다른 리터럴로 가른
// 이유다** — *"게이트는 앞의 것만 «열린 결손»으로 센다"*. 이 수는 게이트가 강제하는 상수가
// 아니라 오늘의 실물 값이며, 결손이 닫히거나 새로 열리면 함께 움직인다.
console.log(
  `이름 사전 통과 — ${summary} (docs/${DICTIONARY_DOCUMENT} §4 표, 외부 문서 ${docs.size}개 대조).`,
);
