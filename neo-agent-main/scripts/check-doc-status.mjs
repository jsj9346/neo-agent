/**
 * 문서 지위 선언 게이트 — 실행부.
 *
 * `docs/*.md`의 머리가 선언한 구현 상태를 실물 경로와 대조한다. 정본은
 * `docs/DOC-STATUS.md`이며, 판정 규칙(§3·§3.3)은 부작용 없는 `doc-status.mjs`에 있고
 * 이 파일은 §4(파일 순회·앵커 존재 확인·fail-closed·출력)만 맡는다.
 *
 * **왜 이 게이트가 있는가.** 2026-08-13 전수 대조에서 문서 머리 8건이 거짓이었다.
 * 6건은 `상태: 구현 전`인데 패키지가 7일·4일간 존재했고(F-1), 1건은 `구현 완료(검색 제외)`가
 * 구현 5일 뒤 개정에도 살아남았다(F-2). 사람 눈으로 발견됐고, 그때까지 이것을 잡을
 * 기계적 수단은 0이었다.
 *
 * **경로는 `import.meta.url` 기준이다**(`check-core-budget.mjs`와 같다). `process.cwd()`를
 * 읽으면 잘못된 디렉터리에서 실행됐을 때 "문서 0개 발견 → 전부 통과"라는 침묵 경로가 생긴다
 * (`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물이 함께 막는다.
 *
 * **이 파일은 임포트되지 않는다.** 임포트하면 아래 본문이 그대로 돌고 실패 시
 * `process.exit(1)`이 임포트한 쪽을 죽인다. 판정 함수가 필요하면 `doc-status.mjs`를 쓴다 —
 * 그 파일의 머리에 두 파일로 가른 근거가 있다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { judge, parseDocStatus, parseStatusTable, uncoveredPackages } from "./doc-status.mjs";

/** 앵커 경로의 기준점. `docs/DOC-STATUS.md` §5 — "경로는 `neo-agent-main/` 기준". */
const WORKSPACE_ROOT = new URL("../", import.meta.url).pathname;
const DOCS_DIR = new URL("../docs/", import.meta.url).pathname;
/** 역방향 검사의 대상 트리. `docs/DOC-STATUS.md` §5.3 */
const PACKAGES_DIR = new URL("../packages/", import.meta.url).pathname;

/** §5 표의 자리. 배정의 정본이며, 이 파일이 없으면 대조할 것이 없다. */
const TABLE_DOCUMENT = "DOC-STATUS.md";

const documents = readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name)
  .sort();

const failures = [];
const passes = [];
/** 머리 판정에 성공한 문서만 담는다 — §5 표 대조의 피연산자(D-3). */
const declared = new Map();

for (const name of documents) {
  const source = readFileSync(join(DOCS_DIR, name), "utf8");
  const parsed = parseDocStatus(source);
  const anchorExists = "anchor" in parsed ? existsSync(join(WORKSPACE_ROOT, parsed.anchor)) : false;
  const verdict = judge(parsed, anchorExists);

  // 문서 이름은 여기서 붙는다 — `judge`는 파일명을 모른다(§3.1).
  if (verdict.ok) {
    const { kind, anchor } = verdict.status;
    passes.push(anchor ? `${name} — ${kind} ↔ ${anchor}` : `${name} — ${kind}`);
    declared.set(name, verdict.status);
  } else {
    failures.push(`${name}: [${verdict.violation}] ${verdict.detail}`);
  }
}

// fail-closed ①: 발견한 문서가 0개면 경로 해석이 깨진 것이다. "전부 통과"로 보이는
// 침묵 경로를 여기서 막는다 — 이 스크립트가 cwd를 읽지 않는 이유와 같은 방어다.
if (documents.length === 0) {
  console.error(`게이트 위반 — 문서 지위 선언: ${DOCS_DIR}에서 .md를 하나도 찾지 못했다`);
  process.exit(1);
}

// fail-closed ②: 판정되지 않은 문서는 통과가 아니다(`check-core-budget.mjs`와 같은 그물).
// 위 루프를 나중에 고치다 조용히 빠져나가는 경로가 생겨도 여기서 걸린다.
if (failures.length + passes.length !== documents.length) {
  console.error(
    `게이트 위반 — 문서 지위 선언: ${documents.length}개 중 ${failures.length + passes.length}개만 판정됐다`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// §5 표 ↔ 머리 대조 (정본: `docs/DOC-STATUS.md` §5.1)
//
// **왜 여기인가.** 위 루프는 문서가 *스스로 신고한* 값을 실물과 맞춘다 — 그 값이 §5가
// *배정한* 값인지는 묻지 않는다. 그 구멍은 실측됐다(2026-08-13 탐침): 표에 없는 새 문서가
// §3을 지킨 머리만 갖추면 게이트가 그린이었다. 아래 넷이 그 자리를 닫는다.
//
// 대조가 실행부에 있는 것은 §5.1의 계약이다 — 집합 대 집합이라 순수 판정이 만들 수 없는
// 값이고, 그래서 §3.1의 일곱 위반을 늘리지 않는다.
// ---------------------------------------------------------------------------

const tableFailures = [];

// fail-closed ③: 배정의 정본을 못 읽으면 대조할 것이 없다. 위 그물 둘과 같은 형태다.
const tablePath = join(DOCS_DIR, TABLE_DOCUMENT);
if (!existsSync(tablePath)) {
  console.error(`게이트 위반 — 문서 지위 선언: 배정의 정본 ${TABLE_DOCUMENT}이 없다`);
  process.exit(1);
}

const table = parseStatusTable(readFileSync(tablePath, "utf8"));
if (!table.ok) {
  // **라벨은 §5.1의 갈래 이름이다.** §5.1 — *"위 이름이 그대로 게이트 출력의 라벨이다."*
  // 파서의 `reason`은 그 아래 층의 진단이라 괄호로 딸려 나간다(머리말의 *"조정 가능(세부):
  // 실패 메시지 문구"*). 독립 QA 둘이 같은 자리를 잡았다 — 코드가 영문 `reason`을 라벨로
  // 찍고 있어 §5.1의 저 문장이 넷 중 하나에서 거짓이었다. 문서를 낮추지 않고 코드를 맞춘다.
  //
  // `row-malformed`만 §5.1의 갈래이고, 나머지 셋은 표 자체에 닿지 못한 경우라 fail-closed
  // 그물이다(§5.2 말미). 둘을 같은 라벨로 부르면 *"행 하나가 틀렸다"*와 *"배정의 정본을
  // 통째로 못 읽었다"*가 같은 주소를 갖게 된다.
  const label = table.reason === "row-malformed" ? "행 파싱 실패" : "fail-closed";
  console.error(
    `게이트 위반 — §5 표를 읽지 못했다 (정본: docs/DOC-STATUS.md §5.1):\n  - [${label}] (${table.reason}) ${table.detail}`,
  );
  process.exit(1);
}

const assigned = new Map(table.rows.map((row) => [row.doc, row.status]));

// 두 `DocStatus`의 구조 비교. 필드가 늘면 여기 한 자리만 고치면 되고, 고치지 않으면
// 새 필드가 조용히 대조에서 빠진다 — 비교를 한 함수에 가둔 이유다.
function sameStatus(left, right) {
  return left.kind === right.kind && left.anchor === right.anchor;
}

// 갈래 «표에 없는 문서» — 표의 누락. 2026-08-13 탐침이 통과했던 바로 그 경로다.
for (const name of documents) {
  if (!assigned.has(name)) {
    tableFailures.push(`${name}: [표에 없는 문서] §5 표가 이 문서를 배정하지 않았다`);
  }
}

// 갈래 «문서 없는 행» — 표의 유령.
for (const name of assigned.keys()) {
  if (!documents.includes(name)) {
    tableFailures.push(`${name}: [문서 없는 행] §5 표가 배정했으나 docs/에 파일이 없다`);
  }
}

// 갈래 «값 어긋남» — `구현 주장 없음` 도피처가 여기서 닫힌다.
//
// D-3(2026-08-13 확정) — 머리 판정이 이미 실패한 문서는 건너뛴다. 같은 원인을 두 줄로 내면
// *"고칠 곳이 둘"*로 읽히고, 위반 이름이 곧 고칠 곳의 주소라는 것이 이 게이트의 설계다.
// **건너뛴 문서는 아래에서 한 줄로 밝힌다** — 침묵 경로를 만들지 않는다(§4 · §2.6).
const skipped = [];
for (const [name, status] of assigned) {
  const actual = declared.get(name);
  if (!actual) {
    if (documents.includes(name)) skipped.push(name);
    continue;
  }
  if (!sameStatus(status, actual)) {
    const show = (value) => (value.anchor ? `${value.kind} ↔ ${value.anchor}` : value.kind);
    tableFailures.push(`${name}: [값 어긋남] 표는 "${show(status)}", 머리는 "${show(actual)}"`);
  }
}

// ---------------------------------------------------------------------------
// 역방향 — 문서 없는 패키지 (정본: `docs/DOC-STATUS.md` §5.3)
//
// 위 검사들은 전부 **문서에서 출발한다.** 그래서 어느 문서도 들지 않는 실물은 원리적으로
// 안 보인다 — `packages/providers`가 2026-08-06부터 2026-08-14까지 정본 문서 없이 살았고
// 그동안 이 게이트는 매번 그린이었다(§8 U-a). F-1과 같은 계열이고, 이 방향에는 그때도
// 기계가 없었다.
//
// 판정 층이 갈린다(§5.3): 「덮였다」의 집합 술어는 순수 `doc-status.mjs`에 있고 계약
// 테스트가 재며, 여기는 디스크 순회·라벨·종료만 맡는다.
// ---------------------------------------------------------------------------

const reverseFailures = [];

// 순회를 맨몸으로 두지 않는다 — `packages/`가 없으면 라벨 없는 Node 스택 트레이스로 죽어
// 진단이 사라진다(같은 결함이 이 레포에 카드로 있다: `K-045`).
let packageNames;
try {
  packageNames = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(PACKAGES_DIR, entry.name, "package.json")),
    )
    .map((entry) => entry.name)
    .sort();
} catch (error) {
  console.error(`게이트 위반 — 역방향 검사: ${PACKAGES_DIR}를 순회하지 못했다 (${error.message})`);
  process.exit(1);
}

// fail-closed ④: 패키지가 0개면 경로 해석이 깨진 것이다. §4의 «문서 0개» 그물과 같은 자리.
if (packageNames.length === 0) {
  console.error(`게이트 위반 — 역방향 검사: ${PACKAGES_DIR}에서 패키지를 하나도 찾지 못했다`);
  process.exit(1);
}

// 앵커가 없는 배정(`구현 주장 없음`)은 덮을 수 없으므로 걸러서 넘긴다 — 술어는 앵커 목록만 본다.
const tableAnchors = table.rows
  .map((row) => row.status.anchor)
  .filter((anchor) => anchor !== undefined);

for (const path of uncoveredPackages(tableAnchors, packageNames)) {
  reverseFailures.push(
    `${path}: [문서 없는 패키지] §5 표의 어떤 근거 앵커도 이 패키지를 덮지 않는다`,
  );
}

if (failures.length > 0 || tableFailures.length > 0 || reverseFailures.length > 0) {
  if (failures.length > 0) {
    console.error("게이트 위반 — 문서 지위 선언 (정본: docs/DOC-STATUS.md §3·§5):");
    for (const failure of failures) console.error(`  - ${failure}`);
  }
  if (tableFailures.length > 0) {
    console.error("게이트 위반 — §5 표 ↔ 머리 대조 (정본: docs/DOC-STATUS.md §5.1):");
    for (const failure of tableFailures) console.error(`  - ${failure}`);
  }
  if (reverseFailures.length > 0) {
    console.error("게이트 위반 — 역방향: 문서 없는 패키지 (정본: docs/DOC-STATUS.md §5.3):");
    for (const failure of reverseFailures) console.error(`  - ${failure}`);
  }
  if (skipped.length > 0) {
    console.error(`  (머리 판정 실패로 표 대조를 건너뛴 문서: ${skipped.join(", ")})`);
  }
  process.exit(1);
}

console.log(`문서 지위 선언 통과 — ${passes.length}/${documents.length}건:`);
for (const pass of passes) console.log(`  - ${pass}`);
console.log(`§5 표 대조 통과 — 배정 ${assigned.size}건이 실물 머리와 일치한다.`);
console.log(`역방향 통과 — 패키지 ${packageNames.length}개가 전부 §5 표의 근거 앵커에 덮인다.`);
