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
import {
  findCitations,
  findD5Violations,
  findQ7Violations,
  judgeCitation,
} from "./doc-citation.mjs";

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
/**
 * **D-5를 실제로 잰 문서 수.** Q-7이 걸린 문서는 안 든다 — 구간 추출의 입력 가정이 깨진
 * 문서에서 D-5가 0인 것은 «위반 없음»이 아니라 «안 쟀다»이고, 그 둘을 가르는 것이 §4의
 * fail-closed 그물이 하는 일이다. 성공 메시지가 이 수를 든다.
 */
let d5Checked = 0;
/** Q-7을 잰 문서 수. 전량이어야 한다 — 아래 fail-closed ③이 그것을 잰다. */
let q7Checked = 0;
/** Q-7이 걸려 D-5 집계에서 뺀 문서 수. ④의 항등식이 이것을 쓴다. */
let q7Blocked = 0;

for (const name of documents) {
  const source = readFileSync(join(DOCS_DIR, name), "utf8");

  for (const citation of findCitations(source)) {
    const verdict = judgeCitation(citation.text);
    // 문서 이름은 여기서 붙는다 — `judgeCitation`은 파일명을 모른다(§3.2).
    if (!verdict.ok) {
      failures.push(`${name}:${citation.line}: [${verdict.violation}] ${verdict.detail}`);
    }
  }

  // §3.4 Q-7 — 구간 추출의 입력 가정(§4 2026-08-15). **D-5보다 먼저 본다.** 짝이 어긋난
  // 글자나 안 닫힌 펜스는 마스킹·짝짓기를 밀어 뒤의 정당한 인용을 삼키고, 그러면 그 문서의
  // D-5가 «조용한 0»이 된다. 그 0을 «위반 없음»으로 세면 게이트가 재지 않은 것을 잰 것처럼
  // 말한다 — 이 게이트가 존재하는 이유 그 자체다(`ARCHITECTURE.md` §2.6).
  //
  // 자리 규약은 D-5와 같다(문서:줄:열) 그리고 **문면을 안 싣는다** — 근거도 같다(§4).
  const q7Findings = findQ7Violations(source);
  for (const finding of q7Findings) {
    failures.push(
      `${name}:${finding.line}:${finding.column}: [${finding.violation}] ${finding.detail}`,
    );
  }
  q7Checked += 1;

  if (q7Findings.length > 0) {
    // **D-5를 아예 돌리지 않는다.** 이 문서의 구간 추출은 입력 가정이 깨진 상태라, 여기서
    // 나오는 D-5 값은 위반이든 0이든 근거가 없다. 문서는 이미 위에서 실패했다.
    q7Blocked += 1;
  } else {
    // §3.4 D-5 — 인용부호 구간의 바깥 겹침(§4 2026-08-15에 게이트 범위로 들어왔다).
    // **자리는 열까지 든다.** 표 안의 자리를 줄로만 지목하면 어느 칸인지 안 갈리고, 그 오기가
    // 실행까지 가는 것을 2026-08-15에 한 번 밟았다.
    for (const finding of findD5Violations(source)) {
      failures.push(
        `${name}:${finding.line}:${finding.column}: [${finding.violation}] ${finding.detail}`,
      );
    }
    d5Checked += 1;
  }

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

// fail-closed ③: Q-7을 잰 문서 수가 판정 수와 다르면 그 검사가 조용히 건너뛰어진 것이다.
// Q-7은 «다른 검사가 잰 값을 믿어도 되는가»를 재므로, 이것이 안 돈 문서는 D-5도 못 믿는다.
//
// fail-closed ④: D-5를 잰 문서와 Q-7이 막은 문서를 더하면 판정 수여야 한다. 이 항등식이
// 위 분기의 두 갈래를 함께 잰다 — 한쪽만 세면 그 차이가 «안 쟀음»으로 조용히 흡수된다.
//
// **셋 다 실패 출력보다 먼저다.** 계수 그물은 *"안 쟀다"*를 말하고 실패 목록은 *"재서 걸렸다"*를
// 말하는데, 뒤에 두면 다른 문서의 위반 하나가 이 침묵을 통째로 가린다. 2026-08-15 독립 QA가
// 그 자리를 커버리지 구멍으로 냈다(`plans/20260815-d5-gate-qa-report.md` F-7 — ③이 구조상
// 발화할 수 없다). 그 리포트가 든 근거 둘 중 «증가가 인접해 갈릴 수 없다»는 Q-7 분기가
// 없앴고, «먼저 exit 1 해서 도달 못 한다»는 이 순서 변경이 없앤다.
if (q7Checked !== judged) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §4):");
  console.error(`  - [fail-closed] ${judged}건 중 ${q7Checked}건만 Q-7을 쟀다`);
  process.exit(1);
}

if (d5Checked + q7Blocked !== judged) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §4):");
  console.error(
    `  - [fail-closed] ${judged}건 중 D-5를 잰 것 ${d5Checked}건 + Q-7이 막은 것 ${q7Blocked}건이 맞지 않는다`,
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error("게이트 위반 — 문서 인용 형식 (정본: docs/DOC-CITATION.md §3):");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("");
  console.error("  대체 형식은 §3.4 — 절 번호 · 필드 이름 · 문면 인용 · 경로+커밋.");
  console.error("  바깥 겹침(D-5)은 그 강조를 벗기면 닫힌다 — 안쪽 표기는 그대로 둔다.");
  console.error("  짝 어긋남(Q-7)은 짝을 맞추거나 그 글자를 코드 표기로 든다 — 그 문서의");
  console.error("  D-5는 «위반 없음»이 아니라 **안 쟀다**로 남는다(§4).");
  process.exit(1);
}

// 성공도 조용하지 않다 — `ARCHITECTURE.md` §2.6(모든 행동은 가시적 결과로 끝난다).
// **검사별 문서 수를 함께 든다** — 0이 정상인 검사들이므로, 몇 건을 재고 0이 나왔는지를
// 말하지 않으면 파서가 죽어 0을 내는 상태와 구별되지 않는다.
// **수를 «위반 수»로 읽히지 않게 쓴다** — `docs/*.md`가 18개일 때 판정 수와 D-5 검사 수가
// 우연히 같아 «D-5 18건»이 위반 18건으로 읽혔다(2026-08-15 QA 관찰).
// **여기 나오는 수는 «잰 것»만 말한다** — Q-7이 막은 문서는 `d5Checked`에 안 들어 있다.
console.log(
  `문서 인용 형식 통과 — 문서 ${judged}개에 줄번호 형식·Q-7·D-5를 각각 적용, 위반 0 (Q-7 검사 ${q7Checked}개 문서 · D-5 검사 ${d5Checked}개 문서).`,
);
