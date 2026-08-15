/**
 * 문서 인용 형식 게이트 — 실행부.
 *
 * `docs/*.md` 본문이 다른 자리를 가리킬 때 **죽는 형식의 주소**를 쓰지 않았는지 본다.
 * 정본은 `docs/DOC-CITATION.md`이며, 판정 규칙(§3)은 부작용 없는 `doc-citation.mjs`에 있고
 * 이 파일은 §4(파일 순회·fail-closed·출력)만 맡는다.
 *
 * **왜 이 게이트가 있는가.** 2026-08-13 전수 실측에서 우리 트리를 가리키는 줄번호 인용이
 * **전건 어긋나 있었다**(커밋 `9387efb` 시점). 동결 레퍼런스 트리를 가리키는 인용은 전건
 * 정확했다. 원인은 개인의 부주의가 아니라 이 레포의 기록 규율이다 — *"과거 기록은 고치지
 * 않는다"*를 지키면 정정 주석이 위에 쌓이고, 주석 하나에 아래 모든 줄번호가 동시에 죽는다.
 * 규율을 지킬수록 주소가 죽으므로 주의로는 고쳐지지 않는다(`DOC-CITATION.md` §2.1).
 *
 * **경로는 `import.meta.url` 기준이다**(`check-doc-status.mjs`·`check-core-budget.mjs`와 같다).
 * `process.cwd()`를 읽으면 잘못된 디렉터리에서 실행됐을 때 "문서 0개 발견 → 전부 통과"라는
 * 침묵 경로가 생긴다(`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물이 함께 막는다.
 *
 * **`check-doc-status.mjs`에 합치지 않는다.** 그쪽의 검사 대상은 머리 40줄이고 이것은 본문
 * 전체다. 실패 메시지가 섞이면 "무엇이 깨졌나"가 흐려진다 — 예산 게이트를 분리한 것과 같은 근거.
 *
 * **이 파일은 임포트되지 않는다.** 임포트하면 아래 본문이 그대로 돌고 실패 시
 * `process.exit(1)`이 임포트한 쪽을 죽인다. 판정 함수가 필요하면 `doc-citation.mjs`를 쓴다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findCitations, findD5Violations, judgeCitation } from "./doc-citation.mjs";

/** §1 — 강제 범위는 `neo-agent-main/docs/*.md`다. 기록(`plans/`·`kanban.md`)은 권고만 받는다. */
const DOCS_DIR = new URL("../docs/", import.meta.url).pathname;

// 순회 자체가 실패하는 경우(디렉터리 부재·권한)를 **라벨 있는 실패**로 바꾼다.
// 감싸지 않으면 Node의 기본 스택 트레이스로 죽는데, exit 1이라 fail-closed 성질은
// 유지되지만 "무엇이 깨졌나"를 말하지 않는다 — 실패 메시지가 흐려지지 않게 하려고
// 이 게이트를 `check-doc-status.mjs`에서 분리한 것과 같은 근거다(§4).
// **T-005 역검증이 이 자리를 찾았다** — 아래 fail-closed ①은 «디렉터리는 있는데 `.md`가
// 0개»만 덮고, «디렉터리 자체가 없음»은 여기까지 오지도 못했다.
let entries;
try {
  entries = readdirSync(DOCS_DIR, { withFileTypes: true });
} catch (error) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §4):");
  console.error(
    `  - [fail-closed] docs/를 읽지 못했다 (탐색 경로: ${DOCS_DIR}) — ${error.message}`,
  );
  process.exit(1);
}

const documents = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name)
  .sort();

const failures = [];
/** 판정한 문서 수. 발견 수와 어긋나면 그 자체로 실패다(아래 fail-closed ②). */
let judged = 0;
/** D-5 판정 건수. 성공 메시지가 이것을 함께 든다 — 조용히 0을 세는 상태를 드러내려고. */
let d5Checked = 0;

for (const name of documents) {
  const source = readFileSync(join(DOCS_DIR, name), "utf8");

  for (const citation of findCitations(source)) {
    const verdict = judgeCitation(citation.text);
    // 문서 이름은 여기서 붙는다 — `judgeCitation`은 파일명을 모른다(§3.2).
    if (!verdict.ok) {
      failures.push(`${name}:${citation.line}: [${verdict.violation}] ${verdict.detail}`);
    }
  }

  // §3.4 D-5 — 인용부호 구간의 바깥 겹침(§4 2026-08-15에 게이트 범위로 들어왔다).
  // **자리는 열까지 든다.** 표 안의 자리를 줄로만 지목하면 어느 칸인지 안 갈리고, 그 오기가
  // 실행까지 가는 것을 2026-08-15에 한 번 밟았다.
  for (const finding of findD5Violations(source)) {
    failures.push(
      `${name}:${finding.line}:${finding.column}: [${finding.violation}] ${finding.detail}`,
    );
  }
  d5Checked += 1;

  judged += 1;
}

// fail-closed ①: 발견한 문서가 0개면 경로 해석이 깨진 것이다. "전부 통과"로 보이는 침묵
// 경로를 여기서 막는다 — 이 스크립트가 cwd를 읽지 않는 이유와 같은 방어다.
if (documents.length === 0) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §4):");
  console.error(`  - [fail-closed] docs/에서 .md를 하나도 찾지 못했다 (탐색 경로: ${DOCS_DIR})`);
  process.exit(1);
}

// fail-closed ②: 판정 수가 발견 수와 다르면 어떤 문서가 조용히 건너뛰어진 것이다.
// `check-doc-status.mjs`가 쓰는 것과 같은 그물이며, 위 루프가 언젠가 `continue`를 얻어도
// 그 순간을 이쪽이 잡는다.
if (judged !== documents.length) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §4):");
  console.error(`  - [fail-closed] 발견 ${documents.length}건 중 ${judged}건만 판정했다`);
  process.exit(1);
}

if (failures.length > 0) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §3):");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("");
  console.error("  대체 형식은 §3.4 — 절 번호 · 필드 이름 · 문면 인용 · 경로+커밋.");
  console.error("  바깥 겹침(D-5)은 그 강조를 벗기면 닫힌다 — 안쪽 표기는 그대로 둔다.");
  process.exit(1);
}

// fail-closed ③: D-5를 잰 문서 수가 판정 수와 다르면 그 검사가 조용히 건너뛰어진 것이다.
// 계수가 0인 것이 정상인 검사라, 이 그물이 없으면 «위반 없음»과 «안 쟀음»이 구별되지 않는다.
if (d5Checked !== judged) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §4):");
  console.error(`  - [fail-closed] ${judged}건 중 ${d5Checked}건만 D-5를 쟀다`);
  process.exit(1);
}

// 성공도 조용하지 않다 — `ARCHITECTURE.md` §2.6(모든 행동은 가시적 결과로 끝난다).
// **D-5 건수를 함께 든다** — 0이 정상인 검사이므로, 몇 건을 재고 0이 나왔는지를 말하지 않으면
// 파서가 죽어 0을 내는 상태와 구별되지 않는다.
// **두 수를 «위반 수»로 읽히지 않게 쓴다** — `docs/*.md`가 18개일 때 판정 수와 D-5 검사 수가
// 우연히 같아 «D-5 18건»이 위반 18건으로 읽혔다(2026-08-15 QA 관찰).
console.log(
  `문서 인용 형식 통과 — 문서 ${judged}개에 줄번호 형식과 D-5를 각각 적용, 위반 0 (D-5 검사 ${d5Checked}개 문서).`,
);
