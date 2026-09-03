/**
 * 경계 층 인덱스 게이트 — 실행부.
 *
 * 정본은 `docs/PUBLIC-TREE.md` §4이고, 판정 규칙(§4.2·§4.3)은 부작용 없는
 * `boundary-index.mjs`에 있다. 이 파일은 §4.4(파일 순회·스코프 펼침·fail-closed·출력)와
 * 재생성 쓰기 모드만 맡는다. 선언의 실물은 `docs/BOUNDARY-LAYERS.md`다.
 *
 * **왜 이 게이트가 있는가.** 2026-08-21에 `CLI-INTERFACE.md` §2.1이 세계관 어휘를 스스로
 * 타입·함수 이름으로 규정했고 구현이 자구까지 따랐다. 독립 QA도 계약 테스트도 위반을
 * 내지 않았다 — 둘 다 구현을 문서에 대조하는데 위반이 문서 쪽에서 났기 때문이다. 각 층이
 * 자기 계약에 대해서는 전부 맞았고, **층을 가로지르는 판정을 아무도 안 하고 있었다.**
 * 그때 실패한 것이 사람의 주의력이므로 산문 안내로는 대신할 수 없다(`PUBLIC-TREE.md` §2.1).
 *
 * **경로는 `import.meta.url` 기준이다**(형제 게이트 셋과 같다). `process.cwd()`를 읽으면
 * 잘못된 디렉터리에서 실행됐을 때 파일 0개 발견 → 전부 통과라는 침묵 경로가 생긴다
 * (`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물이 함께 막는다.
 *
 * **이 파일은 임포트되지 않는다.** 임포트하면 아래 본문이 그대로 돌고 실패 시
 * `process.exit(1)`이 임포트한 쪽을 죽인다. 판정 함수가 필요하면 `boundary-index.mjs`를 쓴다.
 *
 * 쓰기 모드: `node scripts/check-boundary-index.mjs --write`. 생성 구간만 갈아 끼우고
 * 구간 밖은 한 글자도 건드리지 않는다(§4.3).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  DECLARATION_SUFFIX,
  findGeneratedSpan,
  hasSection,
  headCitation,
  parseLayerTable,
  renderIndex,
  replaceGeneratedSpan,
  SOURCE_EXTENSION,
  VIOLATIONS,
} from "./boundary-index.mjs";

/** 경로 셀의 기준점. `PUBLIC-TREE.md` §4.2 — 경로는 `neo-agent-main/` 기준이다. */
const WORKSPACE_ROOT = new URL("../", import.meta.url).pathname;
const DOCS_DIR = new URL("../docs/", import.meta.url).pathname;
/** 층 선언과 생성 구간이 사는 자리. 이 파일이 없으면 대조할 것이 없다. */
const INDEX_DOCUMENT = "BOUNDARY-LAYERS.md";

const WRITE = process.argv.includes("--write");
const HEADLINE = "게이트 위반 — 경계 층 인덱스 (정본: docs/PUBLIC-TREE.md §4):";

/**
 * 라벨 있는 실패로 끝낸다. 맨몸 예외로 죽으면 exit 1이라 fail-closed 성질은 유지되지만
 * 무엇이 깨졌나를 말하지 않는다 — `check-doc-citation.mjs`가 같은 자리를 먼저 닫았다.
 *
 * @param {string} detail
 * @returns {never}
 */
function failClosed(detail) {
  console.error(HEADLINE);
  console.error(`  - [fail-closed] ${detail}`);
  process.exit(1);
}

const indexPath = join(DOCS_DIR, INDEX_DOCUMENT);
if (!existsSync(indexPath)) failClosed(`선언의 정본 ${INDEX_DOCUMENT}이 없다`);

let indexSource;
try {
  indexSource = readFileSync(indexPath, "utf8");
} catch (error) {
  failClosed(`${INDEX_DOCUMENT}을 읽지 못했다 — ${error.message}`);
}

/**
 * §4.4의 fail-closed 그물 중 문면에서 나는 둘(층 선언 0행 · 생성 구간 없음·미닫힘)과
 * 갈래 하나(행 파싱 실패)를 여기서 가른다. **목록으로 두는 것이 조건식보다 낫다** —
 * 조건식은 새 사유가 붙어도 안 붉고 그 사유를 조용히 fail-closed로 떨어뜨린다
 * (`DOC-STATUS.md` §3.6이 2026-08-23에 실물로 보여준 자리).
 */
const PARSE_LABELS = {
  "row-malformed": VIOLATIONS.rowMalformed,
};

const table = parseLayerTable(indexSource);
if (!table.ok) {
  const label = PARSE_LABELS[table.reason];
  console.error(HEADLINE);
  console.error(`  - [${label ?? "fail-closed"}] (${table.reason}) ${table.detail}`);
  process.exit(1);
}

/**
 * 디렉터리 아래의 소스 파일을 전부 낸다. 재귀는 의도다 — 스코프가 디렉터리일 때 한 층만
 * 세면 하위 디렉터리에 새 경계 자리를 두는 것이 인덱스를 우회하는 길이 된다.
 *
 * @param {string} dir 절대 경로
 * @returns {string[]} 절대 경로. 정렬은 호출자가 한다
 */
function sourceFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    failClosed(`스코프 디렉터리를 순회하지 못했다 (${dir}) — ${error.message}`);
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(SOURCE_EXTENSION) &&
      !entry.name.endsWith(DECLARATION_SUFFIX)
    ) {
      found.push(path);
    }
  }
  return found;
}

const failures = [];
const entries = [];
/** 층별 파일 수. 성공 메시지가 이 값을 든다 — 0이 정상인 수가 아니라는 것을 보이려는 것이다. */
const counted = [];

for (const row of table.rows) {
  // 갈래 «정본 § 부재» — §4.2가 정본 셀에 § 포인터를 의무로 걸었고, `PUBLIC-TREE.md` §3.3의
  // `dead-section`과 같은 판정이다. 문서 자체가 없는 것도 같은 자리에서 잡는다.
  const docPath = join(DOCS_DIR, row.doc);
  if (!existsSync(docPath)) {
    failures.push(`${INDEX_DOCUMENT}:${row.line}: [${VIOLATIONS.deadSection}] ${row.doc}이 없다`);
  } else if (!hasSection(readFileSync(docPath, "utf8"), row.section)) {
    failures.push(
      `${INDEX_DOCUMENT}:${row.line}: [${VIOLATIONS.deadSection}] ${row.doc}에 §${row.section}이 없다`,
    );
  }

  const scope = join(WORKSPACE_ROOT, row.path);
  // fail-closed — 스코프가 0파일이면 통과가 아니다(§4.4). 경로가 없는 경우도 여기로 온다:
  // 층이 실물을 하나도 안 덮는 상태를 그린으로 읽으면 경로 오타 하나가 층을 끈다.
  if (!existsSync(scope)) failClosed(`${row.layer} — 스코프 경로가 없다 (${row.path})`);

  const files = (statSync(scope).isDirectory() ? sourceFiles(scope) : [scope])
    .filter((path) => path.endsWith(SOURCE_EXTENSION) && !path.endsWith(DECLARATION_SUFFIX))
    .map((path) => relative(WORKSPACE_ROOT, path))
    .sort();

  if (files.length === 0) failClosed(`${row.layer} — 스코프에 소스 파일이 0개다 (${row.path})`);
  counted.push(`${row.layer} ${files.length}개`);

  for (const file of files) {
    const citation = headCitation(readFileSync(join(WORKSPACE_ROOT, file), "utf8"), row.doc);
    // 갈래 «정본 없는 경계 파일» — 층 스코프 안의 파일이 머리에서 그 층의 정본 문서를
    // 인용하지 않는다(§4.4). **§가 아니라 문서를 잰다** — 배럴은 문서 이름만 드는 자리다.
    if (!citation.cited) {
      failures.push(`${file}: [${VIOLATIONS.uncited}] 머리가 ${row.doc}을 인용하지 않는다`);
    }
    entries.push({
      layer: row.layer,
      doc: row.doc,
      section: row.section,
      file,
      sections: citation.sections,
    });
  }
}

// fail-closed — 펼친 결과가 0이면 위의 층별 그물이 전부 헛돈 것이다. 층이 있는데 파일이
// 없는 상태는 위에서 이미 끝나므로 여기 오는 것은 순회 자체가 깨진 경우다.
if (entries.length === 0) failClosed("층 스코프를 펼친 결과가 0파일이다");

const body = renderIndex(entries);

if (WRITE) {
  const replaced = replaceGeneratedSpan(indexSource, body);
  if (!replaced.ok) failClosed(`(${replaced.reason}) ${replaced.detail}`);
  if (replaced.text !== indexSource) {
    writeFileSync(indexPath, replaced.text);
    console.log(`경계 층 인덱스 재생성 — docs/${INDEX_DOCUMENT}의 생성 구간을 갈아 끼웠다.`);
  } else {
    console.log(`경계 층 인덱스 재생성 — 바뀐 것이 없다.`);
  }
  indexSource = replaced.text;
}

// 갈래 «인덱스 불일치» — 생성 구간이 재생성 결과와 다르다. 실물이 자랐거나 사람이 구간을
// 고쳤다(§4.4). **구간 자체의 fail-closed는 위 `parseLayerTable`이 이미 통과시켰다** —
// 여기 오는 실패는 내용 차이 하나뿐이다.
const span = findGeneratedSpan(indexSource);
if (!span.ok) failClosed(`(${span.reason}) ${span.detail}`);
if (span.body !== body) {
  failures.push(
    `${INDEX_DOCUMENT}: [${VIOLATIONS.indexStale}] 생성 구간이 재생성 결과와 다르다` +
      ` — 파일 ${entries.length}개 기준. \`node scripts/check-boundary-index.mjs --write\`로 되맞춘다`,
  );
}

if (failures.length > 0) {
  console.error(HEADLINE);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("");
  console.error("  경계 층에 파일을 더하면 두 갈래가 함께 발동한다 — 인덱스 불일치와");
  console.error("  정본 없는 경계 파일. 그것이 인덱스가 실재한다는 것의 정의다(§4.4).");
  process.exit(1);
}

// 성공도 조용하지 않다 — `ARCHITECTURE.md` §2.6(모든 행동은 가시적 결과로 끝난다).
// **층별 파일 수를 함께 든다** — 0이 정상인 검사가 아니므로, 몇 개를 재고 위반 0이
// 나왔는지를 말하지 않으면 스코프가 비어 통과하는 상태와 구별되지 않는다.
console.log(
  `경계 층 인덱스 통과 — 층 ${table.rows.length}행이 파일 ${entries.length}개를 덮고,` +
    ` 전부 자기 층의 정본을 인용한다 (${counted.join(" · ")}).`,
);
