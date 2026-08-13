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
 * (`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물 둘이 함께 막는다.
 *
 * **이 파일은 임포트되지 않는다.** 임포트하면 아래 본문이 그대로 돌고 실패 시
 * `process.exit(1)`이 임포트한 쪽을 죽인다. 판정 함수가 필요하면 `doc-status.mjs`를 쓴다 —
 * 그 파일의 머리에 두 파일로 가른 근거가 있다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { judge, parseDocStatus } from "./doc-status.mjs";

/** 앵커 경로의 기준점. `docs/DOC-STATUS.md` §5 — "경로는 `neo-agent-main/` 기준". */
const WORKSPACE_ROOT = new URL("../", import.meta.url).pathname;
const DOCS_DIR = new URL("../docs/", import.meta.url).pathname;

const documents = readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name)
  .sort();

const failures = [];
const passes = [];

for (const name of documents) {
  const source = readFileSync(join(DOCS_DIR, name), "utf8");
  const parsed = parseDocStatus(source);
  const anchorExists = "anchor" in parsed ? existsSync(join(WORKSPACE_ROOT, parsed.anchor)) : false;
  const verdict = judge(parsed, anchorExists);

  // 문서 이름은 여기서 붙는다 — `judge`는 파일명을 모른다(§3.1).
  if (verdict.ok) {
    const { kind, anchor } = verdict.status;
    passes.push(anchor ? `${name} — ${kind} ↔ ${anchor}` : `${name} — ${kind}`);
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

if (failures.length > 0) {
  console.error("게이트 위반 — 문서 지위 선언 (정본: docs/DOC-STATUS.md §3·§5):");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`문서 지위 선언 통과 — ${passes.length}/${documents.length}건:`);
for (const pass of passes) console.log(`  - ${pass}`);
