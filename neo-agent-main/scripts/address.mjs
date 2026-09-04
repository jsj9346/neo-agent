/**
 * 공개 트리 주소의 **순수 판정**. 정본은 `docs/PUBLIC-TREE.md` §3이다.
 *
 * 이 모듈이 답하는 물음은 **주소의 존재**다 — 이 코드 스팬이 주소인가(§3.1), 어느 트리에
 * 착지하는가(§3.2), 착지하지 못했다면 그것이 위반인가 미판정인가(§3.2·§3.3). 형제
 * `scripts/doc-citation.mjs`가 답하는 물음은 주소의 **형식**이고, 둘을 한 유니온에 담지
 * 않는 근거를 §3.3이 든다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 게이트 실행부는 `check-address.mjs`에 있고 이 모듈을 임포트한다.
 * 두 파일로 가른 근거는 §3.5가 들고, 그 근거는 `scripts/doc-citation.mjs`·
 * `scripts/boundary-index.mjs` 머리와 같다 — 한 파일이면 계약 테스트가 순수 함수만 쓰는데도
 * 임포트 순간 게이트가 돌고, 실물이 레드인 날엔 `process.exit(1)`이 vitest 워커를 죽여
 * **계약 위반이 «테스트 파일이 사라짐»으로 나타난다.**
 *
 * **이 모듈은 임포트를 갖지 않는다.** 형제 둘과 같은 이유이며(그 파일들의 머리), 매
 * `pnpm check`마다 적재되는 자리에 `typescript`가 딸려 들어오는 것을 원리적으로 막는다.
 *
 * **트리를 읽는 일은 전부 실행부의 몫이다.** 추적 목록 조회·디스크 실재 확인·파일명 색인
 * 구성·문서 본문 읽기가 전부 그쪽에 있고, 이 모듈은 그 결과를 **인자로** 받는다. 그래서
 * 판정 함수들이 «오라클 둘»을 문맥으로 받는다 — §3.2가 *"공개 부류의 해결은 「추적되는가」로
 * 묻는다 — 디스크에 있는가가 아니다"*로 두 오라클을 갈라 놓았기 때문이고, 한 오라클로
 * 합치면 작업 폴더에서만 초록인 게이트가 된다.
 *
 * **부류 권위는 하나뿐이다**(§3.2). 모집단은 문자열이(§3.1), 부류는 **착지한 트리가**,
 * 미해결의 처분만 접두가 정한다. 이 갈래를 코드에서 섞으면 초판이 겪은 결함 — 접두로는
 * 비공개인데 공개 트리에 착지하는 자리 90개가 조용한 초록이 되는 것 — 이 되살아난다.
 *
 * **`[미규정]` 넷.** 정본이 안 정한 자리이고, 이 모듈은 임의로 정하지 않는다:
 * ① 공개 최상위 엔트리 목록의 파생이 디스크인가 추적인가 — 이 모듈은 목록을 **받기만**
 *    한다(`readAddress`의 둘째 인자). 파생은 실행부가 하고 정본이 한 줄로 정해야 한다.
 * ② 펜스 코드블록을 마스킹할 것인가 — 이 모듈은 마스킹한다(`codeSpans`). 펜스 안에서
 *    백틱은 스팬 구분자가 아니기 때문이고, 2026-09-03 실측에서 마스킹 여부가 위반 수를
 *    안 바꿨다(스팬 6,708↔6,760 · 위반 18 동일).
 * ③ `.md`가 아닌 자리에 붙은 `§<절번호>` 꼬리 — `dead-section`을 안 매긴다(`judgeAddress`).
 * ④ 마크다운 구간 술어의 자리 — 아래 문단.
 *
 * **`[미규정]` — 코드 스팬 추출이 여기 사는 것.** `DOC-CITATION.md` §6 U-e가 «마크다운 구간»
 * 파서의 정본을 `scripts/doc-citation.mjs`로 못박았고, 같은 항의 2026-08-23 상위 판정이
 * *"렉서는 공유하고 판정은 복제한다"*로 그 규칙을 일반화했다. 이 모듈의 `codeSpans`는 그
 * 렉서 층에 속하는데도 저쪽을 부르지 않는다 — 부르려면 임포트가 필요하고, 무임포트는 위
 * 문단이 든 계약이기 때문이다. 같은 판정이 *"단일 언어만 아는 파일-로컬 스캐너는 이 판정의
 * 모집단 밖"*이라는 한정을 스스로 달았으므로 이 자리가 그 한정 안인지 U-e 쪽인지는 **정본이
 * 안 정했다.** 임의로 정하지 않고 표시만 남긴다.
 */

/* ==========================================================================
 * §3.2 — 접두. **미해결의 처분만** 이 목록이 정한다(부류는 착지가 정한다).
 * ======================================================================= */

/** 제품 트리. §3.2의 해결 순서에서 둘째 자리다. */
export const PRODUCT_TREE = "neo-agent-main/";

/**
 * §3.2 — 비공개 기록 접두. **닫힌 목록이고 정본은 그 절의 표다.** 여기 없는 접두는
 * 비공개가 아니라 공개로 처분되므로, 목록이 낡으면 위반이 아니라 오탐으로 나타난다.
 *
 * **활성 마일스톤 슬롯 MILESTONE.md는 여기 없고, 그 부재가 결정이다**(§3.2 2026-09-04 확정).
 * 이름을 코드 스팬 없이 쓰는 것이 그 결정의 자기 적용이다 — 그것은 파일이 아니라 슬롯이라
 * 마일스톤이 열릴 때 생기고 닫힐 때 아카이브로 옮겨지므로, 같은 주소가 시점에 따라 풀리기도
 * 안 풀리기도 한다. **목록에서 빼는 것이 그 결정의 강제 수단이다** — 빠지면 그 이름의 코드
 * 스팬은 맨 이름 꼴(꼴 ④·공개)로 읽혀 환경과 무관하게 **항상** dead-public으로 붉는다.
 * 되돌려 넣으면 활성 여부에 따라 미판정과 dead-record가 갈려 게이트가 실행 시점에 따라 다른
 * 것을 재게 된다. 아카이브 디렉터리 milestones/는 항상 있으므로 목록에 남는다.
 */
export const PRIVATE_RECORD_PREFIXES = Object.freeze([
  ".claude/",
  "CLAUDE.md",
  "devlog.md",
  "devnotes/",
  "idea.md",
  "kanban.md",
  "backlog.md",
  "milestones/",
  "docs/",
  "plans/",
]);

/**
 * §3.2 — 동결 레퍼런스 트리. `DOC-CITATION.md` §3.1이 이미 든 값과 같고, **그 모듈을 안
 * 부르고 다시 적는 것이 판정 층의 기본값이다**(같은 문서 §6 U-b 2026-08-23).
 */
export const FROZEN_TREES = Object.freeze(["openclaw-main/", "hermes-agent-main/"]);

/**
 * §3.5 fail-closed 넷째 그물의 재료 — 접두 목록에 **디렉터리 꼴이 하나라도** 있는가.
 *
 * **정의역은 설정 목록이지 디스크가 아니다.** 이 함수를 부르는 자리(`check-address.mjs`)는
 * `PRIVATE_RECORD_PREFIXES`·`FROZEN_TREES` 자체를 넣지 실행 환경의 `presentTrees`를 안
 * 넣는다. `presentTrees`를 넣으면 재현본에는 디렉터리 접두가 원리적으로 하나도 없으므로
 * (`.gitignore`가 접두 전부를 뺀다) 이 그물이 **항상** 발화해 §3.2가 *"재현본은 안 바뀐다"*로
 * 건 불변(§9 U-e의 위반 0)을 깬다. 이 그물이 잡으려는 것은 «목록을 고치다 한 부류가 파일
 * 접두만 남았다»이지 «이 환경에 트리가 없다»가 아니다.
 *
 * @param {readonly string[]} prefixes 접두 목록(설정)
 * @returns {boolean}
 */
export function hasDirectoryPrefix(prefixes) {
  return [...(prefixes ?? [])].some((prefix) => String(prefix).endsWith("/"));
}

/**
 * §3.2(2026-09-04 확정) — 부류 → 그 부류의 **디렉터리 접두**. 파일 접두의 미판정이 이
 * 집합으로 답해지므로, 이 파생이 **순수 판정 쪽**에 있어야 단위가 계약 테스트의 사정거리에
 * 든다(§3.3 *"가르는 자리는 **오라클**이지 판정 규칙이 아니다"*). 실행부에 남는 것은 «이
 * 디렉터리 접두가 디스크에 있는가» 한 줄뿐이다.
 *
 * 공개 부류가 빈 것은 계약이다 — §3.2 표 첫 행이 그 부류의 「그 트리가 없으면」 칸을
 * *"— 재현본에도 있다"*로 닫았고, 판정도 공개를 미판정으로 안 보낸다(`judgeAddress`).
 */
const CLASS_TREE_PREFIXES = Object.freeze({
  public: Object.freeze([]),
  internal: Object.freeze(PRIVATE_RECORD_PREFIXES.filter((prefix) => prefix.endsWith("/"))),
  frozen: Object.freeze(FROZEN_TREES.filter((prefix) => prefix.endsWith("/"))),
});

/**
 * §3.3의 위반 여섯. **이 이름이 그대로 게이트 출력의 라벨이다** — 유니온을 열어 두면
 * 일곱째가 조용히 들어오고, 그것이 §3.3이 갈래를 닫아 둔 이유다.
 */
export const VIOLATIONS = Object.freeze({
  deadPublic: "dead-public",
  deadRecord: "dead-record",
  ambiguousBasename: "ambiguous-basename",
  shadowedAddress: "shadowed-address",
  deadSection: "dead-section",
  unmappedDoc: "unmapped-doc",
});

/* ==========================================================================
 * §3.1 — 모집단은 문자열이 닫는다
 * ======================================================================= */

/**
 * 문서 머리의 범위. `DOC-STATUS.md` §3이 정한 값이고 **여기 다시 적는 것이 판정 층의
 * 기본값이다**(`DOC-CITATION.md` §6 U-b 2026-08-23 — *"판정 층은 복제가 기본값"*).
 * §1이 모집단에서 뺀 것은 **머리의** `- 근거:` 줄 하나이므로, 이 상한이 없으면 본문의
 * 같은 꼴까지 빠져 §1이 *"예외 목록을 두지 않는다"*고 적은 줄이 그 순간 거짓이 된다.
 */
export const HEAD_LINE_LIMIT = 40;

/**
 * §1 예외 — 문서 머리의 `- 근거:` 줄. `DOC-STATUS.md` §3.2가 `구현 전`의 앵커를 *아직
 * 없어야 하는 경로*로 정의하므로, 두 게이트가 같은 문자열에 반대 요구를 걸면 어느 쪽도
 * 지킬 수 없다.
 *
 * **오늘 이 줄은 코드 스팬을 하나도 안 낳는다**(2026-09-03 실측 — 열여덟 파일 전부 평문).
 * 그래도 빼는 것은 나중에 누가 그 값을 백틱으로 감싸는 날 이 충돌이 실물이 되기 때문이다.
 */
const EVIDENCE_LINE = /^\s*[-*]\s*근거\s*:/;

/**
 * 펜스 여는·닫는 줄. `DOC-CITATION.md` §3.4 Q-2·Q-6이 정한 형태와 같다 — 마커를 요구하고
 * (들여쓰기 코드 블록은 이 레포가 안 쓴다), 인용 블록 접두를 넘어 잡는다.
 */
const FENCE_LINE = /^\s*(?:>\s*)*(`{3,}|~{3,})/;

/** 절 제목 — `## 2. …` 꼴. `scripts/boundary-index.mjs`가 쓰는 술어와 같은 값이다. */
const SECTION_HEAD = /^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s/;

/**
 * §3.1 제외 ① — 꺾쇠 자리표나 줄임표. 규약이 **표기 틀**을 드는 자리이고 해결할 대상이
 * 애초에 없다. 줄임표는 문자 하나(`…`)와 마침표 셋 양쪽이 실물이다.
 */
const PLACEHOLDER = /[<>…]|\.\.\./;

/**
 * §3.1 제외 ③ — 줄번호 꼬리. **하나가 아니라 범위와 목록도 든다**(2026-09-03 명문화
 * 콜아웃). 좁게 `:\d+`로 읽으면 `:80-85`·`:115,167`·`:1674-1692` 꼴이 안 벗겨져 **동결
 * 트리의 실재 파일 열둘이 착지 첫날 `dead-record`로 거짓 적발된다.** 벗기는 이유가
 * «경로가 아니다»인 이상 하나든 범위든 목록이든 똑같이 경로가 아니다.
 *
 * **앞의 공백을 함께 먹는다** — 아래 `SECTION_TAIL`과 같은 근거다.
 */
const LINE_TAIL = /\s*:\d+(?:[-,]\d+)*$/;

/**
 * §3.1 제외 ③ — 절 번호 꼬리. `(구)`는 §3.4의 탈출 표기이고, **파서가 인식하는 탈출 표기는
 * 이것 하나뿐이다.** 나머지 둘(이름으로만 쓰기 · 트리 접두 붙이기)은 쓰는 쪽의 편집
 * 규칙이라 파서에게는 애초에 판정 대상 문자열이 안 남는다.
 *
 * **경로와 꼬리 사이의 공백을 함께 먹는다.** 구분자 표기는 §3.1이 안 정했으나 **결과 쪽은
 * 정했다** — *"벗기고 **경로만** 해결하며"*. 안 먹으면 공백이 `path`에 남아 ① 경로 꼴에서는
 * 그 경로가 어느 트리에서도 안 풀려 멀쩡한 주소가 `dead-public`으로 거짓 적발되고
 * ② 맨 이름 꼴에서는 스팬이 `.md`로 안 끝나 `BARE_DOC_NAME`을 못 만족해 **모집단에서 통째로
 * 빠진다.** 같은 절의 2026-09-03 콜아웃이 좁은 줄번호 읽기를 물리친 것과 같은 형태의
 * 결함이고(거짓 적발), 처방도 같다 — 이유가 «경로가 아니다»인 이상 구분자가 있든 없든
 * 똑같이 경로가 아니다.
 */
const SECTION_TAIL = /\s*§(\d+(?:\.\d+)*)(\(구\))?$/;

/**
 * §3.1 꼴 ④ — 맨 문서 이름. *"경로 구분자를 안 갖고 대문자로 시작해 `.md`로 끝나는 스팬
 * 전체"*. 이 꼴이 코퍼스의 지배적 형태이고(2026-09-03 실측 1,198자리), 넷째로 세우기
 * 전에는 §3의 게이트가 코퍼스의 3분의 2를 안 재고 있었다.
 */
const BARE_DOC_NAME = /^[A-Z][^/]*\.md$/;

/** 같은 길이의 공백으로 지운다 — 줄바꿈은 남겨 좌표계와 줄 구조를 보존한다. */
const blankOut = (chunk) => String(chunk).replace(/[^\n]/g, " ");

/** 꼬리 슬래시를 벗긴다. 접두 표기(`docs/`)와 착지 경로(`docs`)를 한 좌표계로 맞춘다. */
const trimSlash = (value) => String(value).replace(/\/+$/, "");

/**
 * 경로가 접두 아래인가. §3.1의 *"접두 뒤에는 경로 구분자가 오거나 문자열이 끝나야 한다"*
 * 그대로다 — `startsWith`만 쓰면 `CLAUDE.md`가 `CLAUDE.md.bak`을 삼킨다.
 *
 * @param {string} path 꼬리 슬래시 없는 경로
 * @param {string} prefix 꼬리 슬래시 없는 접두
 * @returns {boolean}
 */
function under(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * 코드 «펜스»를 지운다. 펜스 안에서 백틱은 스팬 구분자가 아니므로, 지우지 않으면 펜스 안의
 * 백틱이 인라인 쌍으로 잘못 짝지어져 마스크 경계가 원문 밖으로 번진다.
 *
 * 닫기는 **여는 마커와 같은 문자이고 런 길이가 여는 런 이상**이면 된다 — 들여쓰기 폭도
 * 인용 블록 접두도 닫기 판정에 안 든다(`DOC-CITATION.md` §3.4 Q-6과 같은 값).
 *
 * @param {string} doc
 * @returns {string} 길이와 줄 구조가 보존된 마스킹 결과
 */
function maskFences(doc) {
  const lines = String(doc ?? "").split("\n");
  let open = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = FENCE_LINE.exec(lines[index]);
    if (open === null) {
      if (match === null) continue;
      open = match[1];
      lines[index] = blankOut(lines[index]);
      continue;
    }
    const closes = match !== null && match[1][0] === open[0] && match[1].length >= open.length;
    lines[index] = blankOut(lines[index]);
    if (closes) open = null;
  }
  return lines.join("\n");
}

/**
 * CommonMark의 여백 규칙 — 내용이 공백으로 시작하고 공백으로 끝나며 공백만은 아닐 때,
 * 양끝에서 하나씩 벗긴다. 벗기지 않으면 `` ` docs/X.md ` ``가 접두 판정에서 조용히 떨어진다.
 *
 * @param {string} content
 * @returns {string}
 */
function stripOneSpace(content) {
  if (content.length < 2) return content;
  if (!content.startsWith(" ") || !content.endsWith(" ")) return content;
  if (content.trim() === "") return content;
  return content.slice(1, -1);
}

/**
 * 한 줄 안의 인라인 코드 스팬. **여는 백틱 런과 닫는 런의 길이가 같아야 한 스팬이다** —
 * 순진한 `` `[^`]*` ``는 스팬 **사이**를 매치해 거짓 주소를 만든다(2026-09-03 실증:
 * `neo-agent-main/README.md`의 링크 줄에서 `` `](docs/CLI-INTERFACE.md) §4, 보호 계약은 [` ``가
 * 하나의 «스팬»으로 잡힌다).
 *
 * 짝짓기는 CommonMark와 같다 — 왼쪽 런이 열고 같은 길이의 «첫» 런이 닫으며, 짝이 없는 런은
 * 내용이므로 다음 런을 여는 후보로 본다. 스팬은 줄 안에서 닫히는 것만 본다.
 *
 * @param {string} line
 * @returns {string[]}
 */
function spansInLine(line) {
  const runs = [];
  for (let at = 0; at < line.length; at += 1) {
    if (line[at] !== "`") continue;
    let end = at;
    while (end < line.length && line[end] === "`") end += 1;
    runs.push({ start: at, end });
    at = end - 1;
  }

  const found = [];
  let index = 0;
  while (index < runs.length) {
    const open = runs[index];
    const width = open.end - open.start;
    let close = -1;
    for (let scan = index + 1; scan < runs.length; scan += 1) {
      if (runs[scan].end - runs[scan].start === width) {
        close = scan;
        break;
      }
    }
    if (close < 0) {
      index += 1;
      continue;
    }
    found.push(stripOneSpace(line.slice(open.end, runs[close].start)));
    index = close + 1;
  }
  return found;
}

/**
 * 문서에서 코드 스팬을 전부 뽑는다. **주소인지는 여기서 안 묻는다** — 모집단 판별에는
 * 공개 최상위 엔트리 목록이 필요하고 그것은 실행부가 파생하기 때문이다(`readAddress`).
 *
 * **문서 이름을 돌려주지 않는다.** 순수 판정은 소스 텍스트만 받으므로 파일명을 원리적으로
 * 만들 수 없다 — 게이트 루프가 파일명과 짝지어 출력한다(§3.3의 `Address` 주석과 같은 값).
 *
 * @param {string} source 문서 원문
 * @returns {{ text: string, line: number }[]} 줄 번호는 1-기반. 판정에 쓰지 않고 출력에만 쓴다
 */
export function codeSpans(source) {
  const lines = maskFences(source).split("\n");
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    // §1 예외는 **머리의** 그 줄 하나다. 상한을 안 걸면 본문의 같은 꼴까지 빠진다.
    if (index < HEAD_LINE_LIMIT && EVIDENCE_LINE.test(lines[index])) continue;
    for (const text of spansInLine(lines[index])) found.push({ text, line: index + 1 });
  }
  return found;
}

/**
 * 꼬리를 벗긴다(§3.1 제외 ③). 줄번호 꼬리와 절 번호 꼬리는 **섞여서 하나 이상** 올 수
 * 있으므로 더 벗길 것이 없을 때까지 돈다.
 *
 * 절 번호는 벗기되 **버리지 않는다** — `dead-section`이 그 값을 쓴다(§3.3). 오른쪽에서
 * 처음 만난 절 번호를 든다(둘 이상 붙은 실물은 없다).
 *
 * @param {string} text
 * @returns {{ path: string, section: string | null, retired: boolean }}
 */
function stripTail(text) {
  let path = text;
  let section = null;
  let retired = false;
  for (;;) {
    const head = SECTION_TAIL.exec(path);
    if (head !== null) {
      if (section === null) {
        section = head[1];
        retired = head[2] !== undefined;
      }
      path = path.slice(0, head.index);
      continue;
    }
    const line = LINE_TAIL.exec(path);
    if (line !== null) {
      path = path.slice(0, line.index);
      continue;
    }
    return { path, section, retired };
  }
}

/**
 * 코드 스팬 하나를 §3.1의 꼴 넷에 맞춰 읽는다. **모집단 판별이 이 함수 안에서 끝난다** —
 * 트리를 열지 않고 문자열과 최상위 엔트리 목록만 본다.
 *
 * 순서가 계약이다:
 * 1. 제외 ①(자리표·줄임표) → 2. 제외 ②(글롭 절단) → 3. 제외 ③(꼬리 벗기기)
 * 4. 꼴 ①(공개 최상위 엔트리) → 5. 꼴 ②(비공개) → 6. 꼴 ③(동결) → 7. 꼴 ④(맨 이름)
 *
 * **꼴 ①이 꼴 ④를 이긴다**(2026-09-03 유저 결정). 둘 다 걸리는 실물은 한 종
 * (`THIRD_PARTY_NOTICES.md` 5자리)이고, 꼴 ④로 읽으면 맨 이름 색인이 `neo-agent-main/`
 * 한정이라 다섯 자리 전부가 `dead-public`이 된다. **꼴 ②·③이 꼴 ④보다 먼저인 것은 §3.1이
 * 직접 든다** — `CLAUDE.md`·`MILESTONE.md`가 두 자리에 동시에 걸린다.
 *
 * @param {string} text 코드 스팬 원문
 * @param {readonly string[]} topLevelEntries 공개 트리 최상위 엔트리. **[미규정]** 이 목록의
 *   파생이 디스크인가 추적인가를 정본이 안 정했다 — 이 모듈은 받기만 하고 정하지 않는다
 * @returns {{ ok: false, reason: "placeholder" | "glob-unanchored" | "no-form" }
 *          | { ok: true, form: 1 | 2 | 3 | 4, path: string, prefix: string | null,
 *              prefixClass: "public" | "internal" | "frozen",
 *              section: string | null, retired: boolean }}
 */
export function readAddress(text, topLevelEntries) {
  const value = String(text ?? "");
  if (PLACEHOLDER.test(value)) return { ok: false, reason: "placeholder" };

  let body = value;
  if (body.includes("*")) {
    // §3.1 제외 ② — 첫 별표 앞의 마지막 경로 구분자까지로 자르고, 자를 것이 없으면 주소가
    // 아니다. 잘라 낸 나머지는 디렉터리 주소이므로 그 자리에서 해결된다.
    const cut = body.lastIndexOf("/", body.indexOf("*"));
    if (cut < 0) return { ok: false, reason: "glob-unanchored" };
    body = body.slice(0, cut + 1);
  }

  const tail = stripTail(body);
  const path = trimSlash(tail.path);
  if (path === "") return { ok: false, reason: "no-form" };

  const read = { path, section: tail.section, retired: tail.retired };

  for (const entry of topLevelEntries ?? []) {
    const prefix = trimSlash(entry);
    if (prefix !== "" && under(path, prefix)) {
      return { ok: true, form: 1, prefix, prefixClass: "public", ...read };
    }
  }
  for (const prefix of PRIVATE_RECORD_PREFIXES) {
    if (under(path, trimSlash(prefix))) {
      return { ok: true, form: 2, prefix, prefixClass: "internal", ...read };
    }
  }
  for (const prefix of FROZEN_TREES) {
    if (under(path, trimSlash(prefix))) {
      return { ok: true, form: 3, prefix, prefixClass: "frozen", ...read };
    }
  }
  if (BARE_DOC_NAME.test(path)) {
    return { ok: true, form: 4, prefix: null, prefixClass: "public", ...read };
  }
  return { ok: false, reason: "no-form" };
}

/* ==========================================================================
 * §3.2 — 부류는 해결이 착지한 트리가 정한다
 * ======================================================================= */

/**
 * **착지 경로**의 부류. 접두 목록을 쓰지만 인용 문자열이 아니라 **해결된 경로**에 건다 —
 * 그것이 §3.2가 부류 권위를 하나로 만든 방식이다. `neo-agent-main/docs/X.md`는 비공개
 * 접두 `docs/`에 안 걸리고 공개다.
 *
 * @param {string} path 레포 루트 기준 경로
 * @returns {"public" | "internal" | "frozen"}
 */
export function classOf(path) {
  const value = trimSlash(String(path ?? ""));
  for (const tree of FROZEN_TREES) {
    if (under(value, trimSlash(tree))) return "frozen";
  }
  for (const prefix of PRIVATE_RECORD_PREFIXES) {
    if (under(value, trimSlash(prefix))) return "internal";
  }
  return "public";
}

/**
 * §3.2 — 경로 꼴의 해결 순서. **인용한 문서의 디렉터리 → `neo-agent-main/` → 레포 루트**이고
 * 첫 적중이 답이다. 이 순서가 계약인 근거는 그것이 마크다운 상대 링크의 뜻과 같다는 것이다.
 *
 * `.`·`..` 구간은 접어 주지 않는다 — 그런 스팬은 꼴 넷 어디에도 안 걸려 애초에 모집단 밖이고,
 * 접는 코드를 두면 이 모듈이 경로 정규화 규약을 하나 더 지게 된다.
 *
 * @param {string} path 꼬리·글롭을 벗긴 경로
 * @param {string} docPath 인용한 문서의 레포 루트 기준 경로
 * @returns {string[]} 중복을 걷은 후보. 순서가 곧 우선순위다
 */
export function candidatePaths(path, docPath) {
  const doc = String(docPath ?? "");
  const at = doc.lastIndexOf("/");
  const directory = at < 0 ? "" : doc.slice(0, at);

  const ordered = [
    directory === "" ? path : `${directory}/${path}`,
    `${PRODUCT_TREE}${path}`,
    path,
  ];
  const seen = [];
  for (const candidate of ordered) {
    if (!seen.includes(candidate)) seen.push(candidate);
  }
  return seen;
}

/**
 * 주소가 어디에 착지하는가. **첫 적중이 답이지만 목록은 전부 돌려준다** — `shadowed-address`가
 * 둘 이상의 착지를 보고 판정하기 때문이다(§3.2).
 *
 * 오라클이 둘인 것이 계약이다 — 공개 부류는 **추적되는가**로, 비공개·동결은 작업 폴더의
 * 실재로 묻는다(§3.2). 한 오라클로 합치면 §7의 재현본 — `git archive` 뒤에 추적 오라클을
 * 복원해 만든다 — 에서 죽는 주소가 작업 폴더에서만 초록이 된다. 복원이 주는 것은 `git`
 * 질의 능력이고, `git archive`가 안 실은 파일은 그 뒤에도 재현본에 없다.
 *
 * **맨 이름 꼴은 디렉터리를 안 걷는다**(§3.2) — 공개 트리 파일명 색인에서 찾는다. 걷기로
 * 하면 진입점이 문서를 맨 이름으로 드는 자리가 안 풀리고, 그 자리가 §6이 재는 집합 전부다.
 *
 * @param {{ form: 1 | 2 | 3 | 4, path: string }} read `readAddress`의 성공 갈래
 * @param {{ docPath: string,
 *           probePublic: (path: string) => "file" | "directory" | "absent",
 *           probeRecord: (path: string) => "file" | "directory" | "absent",
 *           basenameIndex: ReadonlyMap<string, readonly string[]> }} context
 * @returns {{ path: string, kind: "file" | "directory", cls: "public" | "internal" | "frozen" }[]}
 */
export function resolveAddress(read, context) {
  if (read.form === 4) {
    const hits = context.basenameIndex.get(read.path) ?? [];
    return hits.map((path) => ({ path, kind: "file", cls: "public" }));
  }

  const landings = [];
  for (const candidate of candidatePaths(read.path, context.docPath)) {
    const cls = classOf(candidate);
    const kind = cls === "public" ? context.probePublic(candidate) : context.probeRecord(candidate);
    if (kind === "absent") continue;
    landings.push({ path: candidate, kind, cls });
  }
  return landings;
}

/**
 * 절 제목의 번호 전부. `dead-section`의 재료이고, 실행부가 착지한 문서 본문을 이 함수에
 * 넣어 `sectionsOf`를 만든다.
 *
 * 펜스를 먼저 지운다 — 펜스 안의 `## 1. …`은 절 제목이 아니라 예시다.
 *
 * @param {string} source 문서 원문
 * @returns {string[]} `§` 없는 절 번호. 등장 순서이고 중복이 없다
 */
export function documentSections(source) {
  const found = [];
  for (const line of maskFences(source).split("\n")) {
    const head = SECTION_HEAD.exec(line);
    if (head !== null && !found.includes(head[2])) found.push(head[2]);
  }
  return found;
}

/**
 * 착지가 정해진 뒤의 절 번호 판정(§3.3 `dead-section`).
 *
 * **범위는 좁다 — 문서 이름과 `§<절번호>`가 같은 백틱 스팬 안에 있을 때만이다.** 스팬
 * 바깥의 평문 `§N`을 읽으면 판별이 문자열 밖으로 새고, 그것이 §3.1의 불변(*"모집단 판별이
 * 문자열 안에서 끝난다"*)과 정면으로 부딪친다. 이 좁힘의 대가는 §3.5가 자백한 것과 같은
 * 종류다 — 2026-09-03 코퍼스에 이 꼴이 **0건**이라 오늘은 발화하지 않는다.
 *
 * `(구)`가 붙은 절은 §3.4의 탈출 표기이므로 묻지 않는다.
 *
 * **[미규정]** `.md`가 아닌 자리에 붙은 절 꼬리는 안 잰다. §3.3이 이 위반을 *"문서 이름 뒤의
 * `§<절번호>`"*로 정의했고, 문서가 아닌 대상의 절이 무엇인지는 정본이 안 정했다.
 *
 * @param {{ section: string | null, retired: boolean }} read
 * @param {{ path: string, kind: "file" | "directory" }} landing
 * @param {{ sectionsOf: (path: string) => readonly string[] }} context
 * @returns {boolean} 절 번호가 살아 있으면 참
 */
function sectionAlive(read, landing, context) {
  if (read.section === null || read.retired) return true;
  if (landing.kind !== "file" || !landing.path.endsWith(".md")) return true;
  return context.sectionsOf(landing.path).includes(read.section);
}

/**
 * §3.2 — **이 실행 환경이 그 부류의 기록을 쥐는가.** 미판정 갈래의 유일한 술어다.
 *
 * 두 꼴을 갈라 답한다(§3.2 2026-09-04 확정):
 * - **디렉터리 접두**는 자기 실재로 답한다 — *"디렉터리 접두의 판정은 하나도 안 바뀐다"*
 * - **파일 접두**는 자기 실재로 답할 수 없으므로(그것을 묻는 것은 «그 주소가 풀리는가»와
 *   글자 그대로 같은 물음이다) **자기 부류의 디렉터리 접두 중 하나라도** 있는지로 답한다.
 *   「하나라도」인 근거는 이 술어가 답할 물음이 «이 환경이 그 부류의 기록을 쥐는 종류의
 *   환경인가»이지 «그 부류가 온전한가»가 아니라는 것이다 — 「전부」로 읽으면 접두 하나만
 *   지워도 부류 전체가 미판정으로 새고, 그것이 이 개정이 고친 침묵과 같은 종이다.
 *
 * **[미규정]** 접두 표기의 끝 슬래시를 정본이 안 정했다 — 조회를 그 양쪽에 관대하게 둔다
 * (`address.d.mts`의 `TreeProbe` 주변과 계약 테스트가 같은 자리를 이미 미규정으로 든다).
 *
 * @param {{ prefix: string | null, prefixClass: "public" | "internal" | "frozen" }} read
 * @param {{ presentTrees: ReadonlySet<string> }} context
 * @returns {boolean}
 */
function treeHeld(read, context) {
  const present = context.presentTrees;
  const holds = (prefix) => {
    const bare = trimSlash(prefix);
    if (bare === "") return false;
    for (const one of present) {
      if (trimSlash(one) === bare) return true;
    }
    return false;
  };
  if (read.prefix === null) return true;
  if (read.prefix.endsWith("/")) return holds(read.prefix);
  return (CLASS_TREE_PREFIXES[read.prefixClass] ?? []).some(holds);
}

/**
 * 주소 하나를 판정한다(§3.2·§3.3).
 *
 * 갈래의 순서가 계약이다:
 * 1. **맨 이름 꼴** — 색인 0건이면 `dead-public`, 둘 이상이면 `ambiguous-basename`(§3.2)
 * 2. **`shadowed-address`** — 파일 착지가 둘 이상이고 그 부류가 갈리면 실패다. §3.5가
 *    fail-closed 그물 셋 중 하나로 든 갈래라 다른 판정보다 먼저 선다
 * 3. **미해결** — 공개면 `dead-public`, 트리가 없으면 **미판정**, 있는데도 안 풀리면
 *    `dead-record`. *"해결할 트리가 없으면 통과가 아니라 미판정"*이고, **그 자리에서만
 *    접두가 부류를 대신 말한다**(§3.2)
 * 4. **`dead-section`** — 착지한 문서에 그 절이 없다
 *
 * **그림자를 파일에 한해 실패로 올린다.** 디렉터리 주소는 부류가 갈려도 실패가 아니다 —
 * 디렉터리 주소가 뜻하는 것은 **자리이지 대상이 아니고**, 첫 적중이 쓰는 사람이 뜻한
 * 자리다(§3.2, 실물 70). 부류가 같은 파일 둘도 술어가 「부류가 갈리는가」 하나라 그대로
 * 통과한다(실물 5) — **예외 목록이 아니라 판정이다.**
 *
 * @param {{ form: 1 | 2 | 3 | 4, path: string, prefix: string | null,
 *           prefixClass: "public" | "internal" | "frozen",
 *           section: string | null, retired: boolean }} read `readAddress`의 성공 갈래
 * @param {{ docPath: string,
 *           probePublic: (path: string) => "file" | "directory" | "absent",
 *           probeRecord: (path: string) => "file" | "directory" | "absent",
 *           presentTrees: ReadonlySet<string>,
 *           basenameIndex: ReadonlyMap<string, readonly string[]>,
 *           sectionsOf: (path: string) => readonly string[] }} context
 * @returns {{ ok: true, cls: "public" | "internal" | "frozen", unjudged?: true }
 *          | { ok: false, violation: string, detail: string }}
 */
export function judgeAddress(read, context) {
  if (read.form === 4) {
    const hits = context.basenameIndex.get(read.path) ?? [];
    if (hits.length === 0) {
      return {
        ok: false,
        violation: VIOLATIONS.deadPublic,
        detail: `맨 문서 이름이 공개 트리의 파일명 색인에 없다 — ${read.path}. 세 트리 어디에서도 안 풀리는 이름이면 코드 스팬을 걷고, 다른 트리의 것이면 그 접두를 붙인다(§3.4).`,
      };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        violation: VIOLATIONS.ambiguousBasename,
        detail: `맨 문서 이름이 파일명 색인에서 ${hits.length}개에 걸린다 — ${read.path} → ${hits.join(" | ")}. 경로를 붙여 첫째 꼴로 쓴다(§3.4).`,
      };
    }
    const landing = { path: hits[0], kind: "file", cls: "public" };
    if (!sectionAlive(read, landing, context)) {
      return {
        ok: false,
        violation: VIOLATIONS.deadSection,
        detail: `§${read.section}이 ${landing.path}에 없는 절이다. 없어진 절을 가리키면 §${read.section}(구)로 쓴다(§3.4).`,
      };
    }
    return { ok: true, cls: landing.cls };
  }

  const landings = resolveAddress(read, context);
  const files = landings.filter((one) => one.kind === "file");
  if (files.length > 1 && new Set(files.map((one) => one.cls)).size > 1) {
    return {
      ok: false,
      violation: VIOLATIONS.shadowedAddress,
      detail: `착지 후보가 둘 이상인데 부류가 갈린다 — ${files.map((one) => `${one.path}(${one.cls})`).join(" | ")}. 순서가 부류를 대신 정하게 두지 않는다(§3.2).`,
    };
  }

  if (landings.length === 0) {
    if (read.prefixClass === "public") {
      return {
        ok: false,
        violation: VIOLATIONS.deadPublic,
        detail: `공개 부류인데 공개 트리에서 해결되지 않는다 — ${read.path}. 해결은 「추적되는가」로 묻는다(§3.2).`,
      };
    }
    // 트리가 없으면 통과가 아니라 **미판정**이다(§3.2). 조용히 통과시키면 게이트가 실행
    // 환경에 따라 다른 것을 재면서 같은 초록을 낸다 — `ARCHITECTURE.md` §2.6의 침묵 경로다.
    // 착지가 없으므로 **이 갈래에서만** 접두가 부류를 대신 말한다.
    // 「트리가 있는가」의 단위는 접두가 아니라 **부류**다(§3.2 2026-09-04) — `treeHeld`가 든다.
    if (!treeHeld(read, context)) {
      return { ok: true, cls: read.prefixClass, unjudged: true };
    }
    return {
      ok: false,
      violation: VIOLATIONS.deadRecord,
      detail: `${read.prefixClass === "frozen" ? "동결 레퍼런스" : "비공개 기록"} 부류인데 그 트리가 있는데도 해결되지 않는다 — ${read.path}.`,
    };
  }

  const landing = landings[0];
  if (!sectionAlive(read, landing, context)) {
    return {
      ok: false,
      violation: VIOLATIONS.deadSection,
      detail: `§${read.section}이 ${landing.path}에 없는 절이다. 없어진 절을 가리키면 §${read.section}(구)로 쓴다(§3.4).`,
    };
  }
  return { ok: true, cls: landing.cls };
}

/* ==========================================================================
 * §6 — 기여자 진입점의 완전성
 * ======================================================================= */

/**
 * 최상위 진입점이 들지 않는 문서(§3.3 `unmapped-doc` · §6).
 *
 * **원문을 다시 안 훑는다 — 그것이 이 시그니처의 요점이다.** §6이 *"재료가 §3의 게이트가
 * 이미 모으는 주소 집합이라 새 순회를 만들지 않는다"*고 못박았으므로, 이 함수는 문서
 * **본문 문자열을 인자로 받지 않는다.** 받는 순간 그 금지가 코드에서 거짓이 된다.
 *
 * **진입점은 둘이고 어느 쪽이 무엇을 드는지는 정하지 않는다** — 합집합이 전부이면 된다(§6).
 * 그래서 둘째 인자는 진입점별로 갈리지 않은 하나의 착지 집합이다.
 *
 * **사각 하나를 보고만 한다**(2026-09-03 실측, 오늘 영향 0): 진입점이 문서를 **코드 스팬
 * 없이** 순수 마크다운 링크로만 들면 그 문서는 이 재료에 안 잡힌다. 재도입 트리거는 진입점이
 * 그 형태를 쓰기 시작할 때다.
 *
 * @param {readonly string[]} docs 공개 트리 문서 디렉터리의 `.md` 경로 전부
 * @param {Iterable<string>} entryLandings 진입점 문서들의 주소가 **착지한** 경로
 * @returns {string[]} `docs`의 순서를 지킨다
 */
export function unmappedDocs(docs, entryLandings) {
  const held = new Set(entryLandings);
  const unmapped = [];
  for (const doc of docs ?? []) {
    if (!held.has(doc)) unmapped.push(doc);
  }
  return unmapped;
}
