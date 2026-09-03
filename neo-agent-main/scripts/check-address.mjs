/**
 * 공개 트리 주소 게이트 — 실행부.
 *
 * 정본은 `docs/PUBLIC-TREE.md` §3이고, 판정 규칙(§3.1~§3.3)은 부작용 없는 `address.mjs`에
 * 있다. 이 파일은 §3.5(파일 순회·트리 지식 파생·fail-closed·출력)와 §6의 `unmapped-doc`
 * 계수만 맡는다.
 *
 * **왜 이 게이트가 있는가.** 이 레포는 작업 폴더에서 자기를 재 왔고, 작업 폴더에는 공개
 * 트리에 없는 파일이 있다(`PUBLIC-TREE.md` §2). 그래서 죽은 주소를 심어도 검사기 셋이
 * 전부 종료 코드 0을 냈다 — 결함이 없어서가 아니라 **결함이 사는 축을 아무도 안 재기
 * 때문**이다. 이 게이트가 그 축이다.
 *
 * **경로는 `import.meta.url` 기준이다**(형제 게이트 넷과 같다). `process.cwd()`를 읽으면
 * 잘못된 디렉터리에서 실행됐을 때 파일 0개 발견 → 전부 통과라는 침묵 경로가 생긴다
 * (`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물이 함께 막는다.
 *
 * **`check-doc-status.mjs`·`check-doc-citation.mjs`에 합치지 않는다**(§3.5). 그쪽의 대상은
 * 각각 머리 40줄과 주소의 **형식**이고, 이것은 주소의 **존재**다. 실패 메시지가 섞이면
 * 무엇이 깨졌는지가 흐려진다.
 *
 * **이 파일은 임포트되지 않는다.** 임포트하면 아래 본문이 그대로 돌고 실패 시
 * `process.exit(1)`이 임포트한 쪽을 죽인다 — 실물이 레드인 날엔 계약 위반이 «테스트 파일이
 * 사라짐»으로 나타난다. 판정 함수가 필요하면 `address.mjs`를 쓴다.
 *
 * ---
 *
 * **모집단 열거의 함정 — `git ls-files`에 `neo-agent-main/` + `**` + `/` + `*.md` 꼴 pathspec을
 * 주지 않는다.** git pathspec은 `:(glob)` 매직 없이 `**`를 특별 취급하지 않고 `*`가 `/`를
 * 포함해 매치한다. 그래서 그 패턴은 `neo-agent-main/` 뒤에 경로 구분자가 **하나 더 있는 것**만 잡고,
 * `neo-agent-main/README.md`·`neo-agent-main/CONTRIBUTING.md`를 오류도 경고도 없이 뺀다
 * (2026-09-03 실측 25 대 27). **빠지는 둘이 정확히 §6이 `unmapped-doc`을 재는 진입점**이고,
 * 그러면 §3.5의 「발견한 수 = 판정한 수」 그물은 25/25라 안 걸린다 — **조용한 초록이다.**
 * 정본 §3.1의 문면(*"공개 트리에 추적되는 `neo-agent-main/` 아래의 `.md` 전부"*)이 27을
 * 뜻하므로, 여기서는 pathspec을 아예 안 쓰고 **추적 목록 전량을 받아 접두·확장자로 거른다.**
 * 「간결하게」 pathspec으로 되돌리면 그 순간 위의 침묵이 돌아온다.
 *
 * **트리 지식은 오라클 둘로 갈려 있다**(§3.2). 공개 부류의 해결은 **추적되는가**로 묻고,
 * 비공개·동결 부류는 작업 폴더의 실재로 묻는다. 그래서 이 파일은 공개 트리에 대해
 * `existsSync`/`readdirSync`를 쓰지 않는다 — §7이 재현본을 `git archive`로 만들므로, 추적
 * 안 되는 파일에 기대 풀리는 주소는 작업 폴더에서만 초록이고 재현본에서 죽는다. 형제
 * `check-boundary-index.mjs`가 디스크를 훑는 것은 그쪽 대상이 추적 여부와 무관한 소스
 * 트리이기 때문이고, **이 규칙의 적용 대상이 아니다.**
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  codeSpans,
  documentSections,
  FROZEN_TREES,
  judgeAddress,
  PRIVATE_RECORD_PREFIXES,
  PRODUCT_TREE,
  readAddress,
  resolveAddress,
  unmappedDocs,
  VIOLATIONS,
} from "./address.mjs";

/** 레포 루트. 비공개·동결 오라클과 문서 본문 읽기의 기준점이다. */
const REPO_ROOT = new URL("../../", import.meta.url).pathname;
/** §6의 문서 디렉터리. `unmapped-doc`의 모집단이다. */
const DOCS_PREFIX = `${PRODUCT_TREE}docs/`;

const HEADLINE = "게이트 위반 — 공개 트리 주소 (정본: docs/PUBLIC-TREE.md §3):";

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

/* ==========================================================================
 * 추적 목록 — 공개 오라클의 유일한 재료
 * ======================================================================= */

let trackedRaw;
try {
  trackedRaw = execFileSync("git", ["-C", REPO_ROOT, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  failClosed(`추적 목록을 얻지 못했다 (탐색 경로: ${REPO_ROOT}) — ${error.message}`);
}

const trackedFiles = new Set(trackedRaw.split("\0").filter((path) => path !== ""));
if (trackedFiles.size === 0) failClosed(`추적 목록이 비었다 (탐색 경로: ${REPO_ROOT})`);

/** 추적 파일의 조상 디렉터리 전부. 공개 오라클이 «디렉터리»를 답하는 재료다. */
const trackedDirs = new Set();
for (const path of trackedFiles) {
  let at = path.indexOf("/");
  while (at >= 0) {
    trackedDirs.add(path.slice(0, at));
    at = path.indexOf("/", at + 1);
  }
}

/**
 * §3.2 — 공개 트리 오라클. **추적되는가로 묻는다**(디스크가 아니다).
 *
 * @param {string} path 레포 루트 기준 경로
 * @returns {"file" | "directory" | "absent"}
 */
function probePublic(path) {
  if (trackedFiles.has(path)) return "file";
  if (trackedDirs.has(path)) return "directory";
  return "absent";
}

/**
 * §3.2 — 비공개·동결 트리 오라클. **작업 폴더의 실재로 묻는다.** 그 트리들은 애초에 추적
 * 대상이 아니므로 추적 목록으로는 물을 수 없고, 그래서 정본이 오라클을 둘로 갈랐다.
 *
 * @param {string} path 레포 루트 기준 경로
 * @returns {"file" | "directory" | "absent"}
 */
function probeRecord(path) {
  const absolute = join(REPO_ROOT, path);
  try {
    return statSync(absolute).isDirectory() ? "directory" : "file";
  } catch {
    return "absent";
  }
}

/**
 * 그 접두의 트리가 이 실행 환경에 있는가. 없으면 **미판정**이다(§3.2) — 통과가 아니다.
 * clone한 자리에는 비공개·동결 트리가 없고, 그것을 조용히 통과시키면 게이트가 실행 환경에
 * 따라 다른 것을 재면서 같은 초록을 낸다.
 *
 * @param {string} prefix `readAddress`가 돌려준 접두(꼬리 슬래시가 있을 수 있다)
 * @returns {boolean}
 */
function treePresent(prefix) {
  const trimmed = String(prefix).replace(/\/+$/, "");
  if (trimmed === "") return false;
  return existsSync(join(REPO_ROOT, trimmed));
}

/* ==========================================================================
 * §3.1 — 모집단. **pathspec을 안 쓴다**(머리의 함정 문단)
 * ======================================================================= */

const documents = [...trackedFiles]
  .filter((path) => path.startsWith(PRODUCT_TREE) && path.endsWith(".md"))
  .sort();

// fail-closed ① — 모집단이 0파일이면 통과가 아니다(§3.5). 잘못된 디렉터리에서 실행됐거나
// 추적 목록이 깨진 상태이고, 둘 다 «위반 0»으로 읽히면 안 된다.
if (documents.length === 0) {
  failClosed(`추적되는 ${PRODUCT_TREE} 아래 .md를 하나도 찾지 못했다 (탐색 경로: ${REPO_ROOT})`);
}

/**
 * §3.2 — 맨 이름 색인. 모집단은 `neo-agent-main/` 한정이다(2026-09-03 유저 결정).
 * 디렉터리를 걷지 않는 것이 계약이고, 걷기로 하면 진입점이 문서를 맨 이름으로 드는 자리가
 * 안 풀리는데 그 자리가 §6이 재는 집합 전부다.
 */
const basenameIndex = new Map();
for (const path of documents) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const hits = basenameIndex.get(name);
  if (hits === undefined) basenameIndex.set(name, [path]);
  else hits.push(path);
}

// fail-closed ② — 공개 트리 파일명 색인이 비었다(§3.5). 위 ①이 이미 막는 자리와 겹치지만,
// 색인 파생이 언젠가 갈라져도 이쪽이 따로 잡는다.
if (basenameIndex.size === 0) failClosed("공개 트리의 파일명 색인이 비었다");

/**
 * §3.1 꼴 ① — 공개 트리 최상위 엔트리. *"레포 루트를 읽고 아래 두 목록을 뺀 나머지"*.
 *
 * **[미규정]** 정본이 「읽는다」를 디스크로 정했는지 추적 목록으로 정했는지 안 정했다.
 * 여기서는 **추적 목록**을 쓴다 — ① §3.2가 공개 부류의 해결을 추적성으로 못박았으므로
 * 모집단 파생만 디스크를 쓰면 한 절 안에서 기준이 둘이 된다 ② §7이 재현본을 `git archive`로
 * 만드는데 그 재현본에 `node_modules`가 없다. **갈리는 원소는 오늘 `node_modules` 하나이고
 * 디스크 기준을 쓰면 위반이 9 늘어난다**(`plans/20260903-public-tree-address-audit.md` §7.4).
 * 이것은 구현의 해석이지 정본의 문면이 아니다.
 */
const topLevelEntries = [
  ...new Set(
    [...trackedFiles].map((path) => {
      const at = path.indexOf("/");
      return at < 0 ? path : path.slice(0, at);
    }),
  ),
]
  .filter((entry) => {
    const excluded = [...PRIVATE_RECORD_PREFIXES, ...FROZEN_TREES].map((prefix) =>
      prefix.replace(/\/+$/, ""),
    );
    return !excluded.includes(entry);
  })
  .sort();

/**
 * §6 — 진입점. *"공개 트리의 최상위 문서"*이고 오늘 실물은 `README.md`·`CONTRIBUTING.md` 둘이다.
 *
 * **[미규정]** §6은 *"진입점은 둘이다"*라고 수를 닫아 적었는데 무엇으로 그 둘을 고르는지는
 * 안 정했다. 여기서는 **모집단 중 공개 트리 최상위에 있는 `.md`**로 파생한다 — 이름을 박으면
 * 셋째 최상위 문서가 생기는 날 그 문서가 조용히 진입점 밖이 되고, 그것이 §6이 재려는
 * 완전성을 깨뜨리는 방향이다. 임의로 정하지 않고 표시만 남긴다.
 */
const entryDocs = documents.filter((path) => !path.slice(PRODUCT_TREE.length).includes("/"));

/* ==========================================================================
 * §3.5 — 순회
 * ======================================================================= */

/** 착지한 문서의 절 번호. 여러 주소가 같은 문서를 가리키므로 메모한다. */
const sectionCache = new Map();

/**
 * §3.3 `dead-section`의 재료. **본문은 디스크에서 읽는다** — §3.2가 추적성으로 묻게 한 것은
 * 「해결되는가」이지 「무엇이 쓰여 있는가」가 아니고, 내용은 추적 목록에서 나오지 않는다.
 *
 * @param {string} path 착지 경로(레포 루트 기준)
 * @returns {readonly string[]}
 */
function sectionsOf(path) {
  const cached = sectionCache.get(path);
  if (cached !== undefined) return cached;
  let sections;
  try {
    sections = documentSections(readFileSync(join(REPO_ROOT, path), "utf8"));
  } catch (error) {
    // 착지가 이미 «있다»고 답한 파일이므로 여기 오는 것은 순회가 깨진 경우다. 빈 목록을
    // 돌려주면 그 문서의 모든 § 인용이 거짓 `dead-section`이 된다 — 조용한 레드다.
    failClosed(`착지한 문서를 읽지 못했다 (${path}) — ${error.message}`);
  }
  sectionCache.set(path, sections);
  return sections;
}

const failures = [];
/** 부류별 자리 수. **미판정도 든다** — 그 갈래에서만 접두가 부류를 대신 말한다(§3.2). */
const byClass = { public: 0, internal: 0, frozen: 0 };
/** 위반 갈래별 자리 수. **갈래는 서로 배타적이다** — 한 주소는 판정을 정확히 하나 받는다. */
const byViolation = Object.fromEntries(Object.values(VIOLATIONS).map((name) => [name, 0]));
/** 진입점이 든 문서의 착지 경로(§6의 재료). **원문을 다시 안 훑는다.** */
const entryLandings = new Set();

let judged = 0;
let spanCount = 0;
let addressCount = 0;
let unjudgedCount = 0;

for (const document of documents) {
  let source;
  try {
    source = readFileSync(join(REPO_ROOT, document), "utf8");
  } catch (error) {
    failClosed(`모집단 문서를 읽지 못했다 (${document}) — ${error.message}`);
  }

  const isEntry = entryDocs.includes(document);
  const context = {
    docPath: document,
    probePublic,
    probeRecord,
    treePresent,
    basenameIndex,
    sectionsOf,
  };

  for (const span of codeSpans(source)) {
    spanCount += 1;
    const read = readAddress(span.text, topLevelEntries);
    // 꼴 넷 어디에도 안 걸리면 주소가 아니다 — 위반이 아니라 **모집단 밖**이다(§3.1).
    if (!read.ok) continue;
    addressCount += 1;

    const verdict = judgeAddress(read, context);
    if (!verdict.ok) {
      byViolation[verdict.violation] += 1;
      failures.push(
        `${document}:${span.line}: [${verdict.violation}] \`${span.text}\` — ${verdict.detail}`,
      );
      continue;
    }

    byClass[verdict.cls] += 1;
    if (verdict.unjudged === true) {
      unjudgedCount += 1;
      continue;
    }
    // §6의 재료 — 진입점 주소가 **착지한** 경로다. `judgeAddress`가 통과시킨 자리이므로
    // 착지가 반드시 하나 이상이고, 첫 적중이 답이다(§3.2).
    if (isEntry) {
      const landing = resolveAddress(read, context)[0];
      if (landing !== undefined) entryLandings.add(landing.path);
    }
  }

  judged += 1;
}

// fail-closed ③ — **판정되지 않은 문서는 통과가 아니다**(§3.5). 위 루프가 언젠가 `continue`를
// 얻어도 그 순간을 이 항등식이 잡는다. `check-doc-citation.mjs`가 쓰는 것과 같은 그물이다.
if (judged !== documents.length) {
  failClosed(`발견 ${documents.length}건 중 ${judged}건만 판정했다`);
}

/* ==========================================================================
 * §6 — 기여자 진입점의 완전성
 * ======================================================================= */

const docsFiles = documents.filter((path) => path.startsWith(DOCS_PREFIX));
for (const unmapped of unmappedDocs(docsFiles, entryLandings)) {
  byViolation[VIOLATIONS.unmappedDoc] += 1;
  failures.push(
    `${unmapped}: [${VIOLATIONS.unmappedDoc}] 진입점 ${entryDocs.length}개 어디에도 안 들린다` +
      ` — 합집합이 전부이면 된다(§6). 진입점 하나가 이 문서를 주소로 든다`,
  );
}

/* ==========================================================================
 * 출력 — 성공도 조용하지 않다
 * ======================================================================= */

/** 부류별·갈래별 요약 한 줄. **겹쳐 세지 않는다** — 한 주소는 정확히 한 칸에만 든다. */
const summary =
  `문서 ${judged}개 · 코드 스팬 ${spanCount} · 주소 ${addressCount}` +
  ` (공개 ${byClass.public} · 비공개 ${byClass.internal} · 동결 ${byClass.frozen})` +
  ` · 미판정 ${unjudgedCount}`;

/**
 * 갈래별 수를 세어 한 줄로 낸다. **`shadowed-address`와 `ambiguous-basename`을 갈라 센다** —
 * 앞은 부류 갈림이고 뒤는 색인 다중 적중이라 다른 갈래다. 「착지 후보 2+」 같은 상위 개념으로
 * 묶으면 뒤쪽이 앞쪽에 겹쳐 세어진다.
 */
const violationLine = Object.entries(byViolation)
  .map(([name, count]) => `${name} ${count}`)
  .join(" · ");

if (failures.length > 0) {
  console.error(HEADLINE);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("");
  console.error(`  ${summary}`);
  console.error(`  갈래: ${violationLine}`);
  console.error("");
  console.error("  처방은 §3.4 — 세 트리 어디에서도 안 풀리는 이름은 코드 스팬을 걷고,");
  console.error("  다른 트리의 경로는 그 트리 접두를 붙이고, 없어진 절은 §<절번호>(구)로 쓴다.");
  // fail-closed ④ — `shadowed-address`는 위반 목록에 들면서 **동시에** 그물이다(§3.5).
  // 해결 순서를 계약으로 둔 §3.2가 그 자리에서 진 빚이고, 하나라도 있으면 순서가 부류를
  // 대신 정하고 있다는 뜻이라 «고칠 주소 하나»로 읽히면 안 된다.
  if (byViolation[VIOLATIONS.shadowedAddress] > 0) {
    console.error("");
    console.error(
      `  - [fail-closed] ${VIOLATIONS.shadowedAddress}가 ${byViolation[VIOLATIONS.shadowedAddress]}건 있다` +
        " — 착지 순서가 부류를 대신 정하고 있다(§3.2·§3.5).",
    );
  }
  process.exit(1);
}

// 성공도 조용하지 않다 — `ARCHITECTURE.md` §2.6(모든 행동은 가시적 결과로 끝난다).
// **부류별 수와 미판정 수를 함께 든다** — 0이 정상인 검사이므로, 무엇을 몇 개 재고 위반 0이
// 나왔는지를 말하지 않으면 모집단이 비어 통과하는 상태와 구별되지 않는다. 미판정은
// «통과»가 아니라 «물을 수 없었다»이고, 재현본에서는 이 수가 0이 아니다(§3.2).
console.log(`공개 트리 주소 통과 — ${summary}, 위반 0 (진입점 ${entryDocs.length}개).`);
