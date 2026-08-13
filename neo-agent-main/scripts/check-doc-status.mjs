/**
 * 문서 지위 선언 게이트.
 *
 * `docs/*.md`의 머리가 선언한 구현 상태를 실물 경로와 대조한다. 정본은
 * `docs/DOC-STATUS.md`이며 이 스크립트는 그 §3(필드)·§3.3(파서 규칙)·§4(판정)의 구현이다.
 *
 * **왜 이 게이트가 있는가.** 2026-08-13 전수 대조에서 문서 머리 8건이 거짓이었다.
 * 6건은 `상태: 구현 전`인데 패키지가 7일·4일간 존재했고(F-1), 1건은 `구현 완료(검색 제외)`가
 * 구현 5일 뒤 개정에도 살아남았다(F-2). 사람 눈으로 발견됐고, 그때까지 이것을 잡을
 * 기계적 수단은 0이었다.
 *
 * **부재를 찾는 grep이 아니라 필드를 읽는 파서인 이유.** 이 레포는 자기오염을 세 번 겪었다 —
 * 정정 주석이 옛 문면을 되살리고 그 문자열을 찾는 grep이 설명 텍스트에 걸린다. 필드는
 * `DOC-STATUS.md` §2.2가 말한 대로 "주장이 사는 범위"를 한 줄로 축소한다. 정정 주석이
 * 옛 상태를 아무리 인용해도 `>` 블록이라 파서 밖이다.
 *
 * **파서를 관대하게 만들지 않는다**(§3.3). `**구현 완료**`(마크다운 강조)도, 접두사도,
 * 괄호 한정도 받지 않는다. 관대한 파서는 `구현 완료(검색 제외)`를 통과시키고 그것이 F-2다.
 * 유일한 관용은 값 끝의 공백 제거이며, 그것은 **다른 내용을 받아들이는 것이 아니라 보이지
 * 않는 문자를 무시하는 것**이라 위 원칙과 다르다.
 *
 * **경로는 `import.meta.url` 기준이다**(`check-core-budget.mjs`와 같다). `process.cwd()`를
 * 읽으면 잘못된 디렉터리에서 실행됐을 때 "문서 0개 발견 → 전부 통과"라는 침묵 경로가 생긴다
 * (`ARCHITECTURE.md` §2.6 위반). 그 경로는 아래 fail-closed 그물 둘이 함께 막는다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const HEAD_LINE_LIMIT = 40;

/** 줄 시작에 고정한다 — 선행 공백도 `>` 인용도 받지 않는다(§3.3). */
const STATUS_LINE = /^- 상태: (.*)$/;
const ANCHOR_LINE = /^- 근거: (.*)$/;

function fieldValues(headLines, pattern) {
  const values = [];
  for (const line of headLines) {
    const match = pattern.exec(line);
    // 값 끝의 공백만 지운다. 앞쪽은 정규식이 이미 고정했다.
    if (match) values.push(match[1].replace(/\s+$/, ""));
  }
  return values;
}

/**
 * 문서 소스 텍스트 → 파싱 결과. **파일 I/O를 하지 않는다.**
 *
 * 판정을 순수하게 유지하는 것이 계약 테스트의 전제다 — 픽스처 파일도, 테스트용
 * 환경변수 손잡이도 없이 일곱 갈래를 전부 돌릴 수 있다.
 *
 * @param {string} source
 * @returns {{kind: string, anchor?: string} | {violation: string, detail: string}}
 */
export function parseDocStatus(source) {
  const headLines = source.split("\n").slice(0, HEAD_LINE_LIMIT);
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
  // [미규정] `- 근거:` 줄이 둘 이상인 경우를 `DOC-STATUS.md` §3.1의 일곱 위반이 규정하지
  // 않는다. 임의로 새 위반 종류를 만들지 않고 fail-closed 방향(거부)으로 `duplicate`에
  // 합쳐 둔다 — 모호한 선언을 통과시키는 것보다 낫다. 판정 필요.
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

/**
 * 파싱 결과 + 앵커 존재 여부 → 판정. **경로 판정을 주입받으므로 여기도 순수하다.**
 *
 * `not-yet`이 앵커를 들고 그 앵커가 **존재하면** 위반이라는 것이 이 게이트의 핵심이다 —
 * F-1 6건이 정확히 이 형태였고, 이 판정 덕에 구현이 착지하는 순간 게이트가 깨진다.
 *
 * @param {{kind: string, anchor?: string} | {violation: string, detail: string}} parsed
 * @param {boolean} anchorExists
 * @returns {{ok: true, kind: string, anchor?: string} | {ok: false, violation: string, detail: string}}
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
  return { ok: true, kind: parsed.kind, anchor: parsed.anchor };
}

// ---------------------------------------------------------------------------
// 여기부터 파일 I/O. 위의 두 함수는 이 아래를 모른다.
// ---------------------------------------------------------------------------

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

  if (verdict.ok) {
    passes.push(
      verdict.anchor
        ? `${name} — ${verdict.kind} ↔ ${verdict.anchor}`
        : `${name} — ${verdict.kind}`,
    );
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
