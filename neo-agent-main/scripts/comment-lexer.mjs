/**
 * 소스 파일에서 **주석 토큰의 구간**을 뽑는 순수 술어. 정본은 `docs/DOC-CITATION.md`
 * §6 U-b의 2026-08-18 둘째 판정(소속 술어 · 덩어리 단위)과 2026-08-19 판정(셸 렉싱)이다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 입력은 대상의 자리와 원문뿐이다.
 *
 * **왜 `doc-citation.mjs`의 형제인가.** 그 모듈은 §6 U-e가 인용부호 구간 파서의 정본으로
 * 못박은 자리이고 소스 렉싱은 다른 관심사다. 게이트 사정도 걸린다 —
 * `check-doc-citation.mjs`가 매 `pnpm check`마다 그 모듈을 적재하는데, `typescript`
 * 임포트만으로 게이트 전체보다 몇 배 오래 걸린다(2026-08-19 실측). 형제로 갈라 두면
 * 게이트의 임포트 그래프가 그대로 남는다.
 *
 * **무엇이 여기 살고 무엇이 안 사는가.** 정본이 한 자리에 두라고 한 것은 렉싱 수단의
 * 분기와 그 소속 술어까지다. 덩어리 접기(`commentRuns`)·파싱 진단·빈 덩어리 실패
 * (`commentRunsOrFail`)·머리 절단은 이 모듈 밖이고 각 소비자가 든다(2026-08-19 판정 ·
 * `plans/20260819-ub-declaration-plan.md` §8.4 ③).
 */

import { extname } from "node:path";
import ts from "typescript";

/* ------------------------------------------------------------------------ *
 * 소속 술어 ① — TypeScript 파서 경로
 * ------------------------------------------------------------------------ */

/**
 * 주석 토큰의 구간들 — **소속은 렉싱이 정한다**(§6 U-b 2026-08-18 후속 판정). 주석 토큰
 * 안의 모든 줄이 그 덩어리에 들고, `끊는 것은 주석 토큰의 끝뿐이다`. 별표 없는 계속 줄도,
 * 블록 주석 안의 완전 공백 줄도, 꼬리 주석을 단 코드 줄도 여기서는 갈리지 않는다 — 그것들은
 * 전부 줄 모양의 사정이고 이 술어는 줄 모양을 안 본다.
 *
 * **파서를 세워 토큰마다 앞뒤 트리비아를 걷는다. 스캐너 단독을 쓰지 않는다** — 문맥이 없어
 * 정규식·문자열 리터럴 안의 표기가 주석으로 잡히고, 2026-08-18 실측에서 216파일 중
 * 26파일이 갈렸으며 갈린 자리는 전부 스캐너 쪽 오검출이었다.
 *
 * 반환은 `pos` 오름차순이고 구간은 겹치지 않는다. 같은 구간이 앞 토큰의 뒤 트리비아이자
 * 뒤 토큰의 앞 트리비아로 두 번 걷히므로 `pos`로 중복을 접는다.
 *
 * @param {string} source
 * @returns {{ pos: number, end: number }[]}
 */
export function commentTokenSpans(source) {
  const file = ts.createSourceFile("scan.ts", source, ts.ScriptTarget.Latest, true);
  const found = new Map();
  const walk = (node) => {
    const at = node.getFullStart();
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, at) ?? []),
      ...(ts.getTrailingCommentRanges(source, at) ?? []),
    ])
      found.set(range.pos, { pos: range.pos, end: range.end });
    for (const child of node.getChildren(file)) walk(child);
  };
  walk(file);
  return [...found.values()].sort((left, right) => left.pos - right.pos);
}

/* ------------------------------------------------------------------------ *
 * 소속 술어 ② — 셸 경로
 * ------------------------------------------------------------------------ */

/**
 * 셸 소스의 주석 토큰 구간들. 술어의 정본은 §6 U-b 2026-08-19 판정이 닫힌 형태로 든다:
 * `줄을 왼쪽에서 오른쪽으로 읽는다`. 구간 밖에서 `백슬래시는 다음 한 글자를 글자 그대로
 * 만든다`. 홑따옴표는 구간을 열고 다음 홑따옴표에서 닫으며 `그 안에서는 어떤 글자도 특별하지
 * 않다`. 큰따옴표는 구간을 열고 이스케이프되지 않은 다음 큰따옴표에서 닫는다. 두 구간 어디에도
 * 안 들고 이스케이프되지도 않은 `#`가 주석 토큰을 열고, `그 토큰은 줄 끝에서 끝난다`.
 *
 * **`셸에서 홑따옴표는 인용부호 부류 안이다`**(같은 판정). `Q-3`이 홑따옴표를 부류 밖에 둔
 * 근거(아포스트로피와 표기가 같아 판정이 문자열 안에서 안 끝난다)가 셸에서는 서지 않는다 —
 * 셸의 홑따옴표는 이스케이프가 없는 리터럴 구획자다. 부류 밖에 두면 렉서가 홑따옴표로 감싼
 * `#`를 주석의 시작으로 읽는다.
 *
 * **`셸에서도 꼬리 주석은 주석 토큰이고 덩어리에 든다`**(같은 판정). 그래서 이 함수는 그 줄이
 * `#`로 시작하는가를 묻지 않는다 — **`주석 토큰의 시작을 줄 모양이 정하지 않는다`**. 반대로
 * 읽으면 2026-08-18 판정이 죽인 줄 모양 술어가 셸에서만 되살아난다.
 *
 * **`이 술어는 셸의 낱말 경계 규칙보다 넓다`**(같은 판정). 셸은 `#`가 낱말의 첫 글자일 때만
 * 주석을 여는데 이 술어는 앞 글자에 붙은 `#`도 주석으로 읽는다. **좁히지 않는다** — 넓게
 * 읽으면 덩어리가 커져 벗기기 쪽으로 기울고 그것이 `S-1`이 정한 방향이다. 재도입 트리거는
 * 정본이 든다(낱말 안의 `#`가 오탐으로 한 건이라도 관측될 때).
 *
 * **[미규정] 인용부호 구간이 줄을 넘는가.** 정본은 스캔을 줄 단위로 들고(`줄을 왼쪽에서
 * 오른쪽으로 읽는다`) 주석 토큰의 끝을 줄 끝으로 두었으나, 열린 채 줄이 끝난 인용부호 구간이
 * 다음 줄로 이어지는지는 안 적었다. 여기서는 **줄마다 구간 상태를 새로 연다** — ① 위 문면의
 * 문자 그대로의 읽기이고, ② 이어 읽는 쪽이 좁은 읽기(여러 줄 문자열 뒤의 `#`가 전부 미탐)라
 * 같은 판정이 낱말 경계에서 고른 방향과 반대다. 여러 줄에 걸친 셸 문자열이 실물로 나면 이
 * 선택이 오탐을 낸다. 오늘 넓힌 자리의 셸 실물 둘에서 어긋날 입력이 0건이다(정본 2026-08-19
 * 실측). 소유는 `K-157`(실물 대조)이다.
 *
 * @param {string} source
 * @returns {{ pos: number, end: number }[]}
 */
export function shellCommentTokenSpans(source) {
  const found = [];
  let lineStart = 0;

  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? source.length : newline;

    /** 열려 있는 인용부호 구간의 여는 글자. 줄마다 새로 연다 — 위 `[미규정]` 항. */
    let open = null;
    let at = lineStart;
    while (at < lineEnd) {
      const glyph = source[at];

      if (open === "'") {
        // 홑따옴표 구간 안에서는 어떤 글자도 특별하지 않다 — 백슬래시도 글자다.
        if (glyph === "'") open = null;
        at += 1;
        continue;
      }
      if (open === '"') {
        if (glyph === "\\") {
          at += 2;
          continue;
        }
        if (glyph === '"') open = null;
        at += 1;
        continue;
      }

      // 구간 밖
      if (glyph === "\\") {
        at += 2;
        continue;
      }
      if (glyph === "'" || glyph === '"') {
        open = glyph;
        at += 1;
        continue;
      }
      if (glyph === "#") {
        found.push({ pos: at, end: lineEnd });
        break;
      }
      at += 1;
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  return found;
}

/* ------------------------------------------------------------------------ *
 * 확장자 분기 — 수단을 고르는 한 자리
 * ------------------------------------------------------------------------ */

/**
 * 렉싱 수단의 이름. **닫힌 유니온이고 «기타»가 없다** — 이름이 하나 늘면 아래 표와
 * `LEXERS`가 함께 늘어야 하고, 그 셋이 어긋나면 `lexerKindFor`가 던진다.
 */
export const LEXER_KINDS = Object.freeze(["typescript", "shell"]);

/**
 * 확장자 → 수단. **`렉싱 수단은 확장자가 고르고, 그 분기는 한 자리에 둔다`**(§6 U-b
 * 2026-08-18 후속 판정) — 그 «한 자리»가 이 표다. 소비자가 자기 쪽에서 확장자를 다시
 * 가르면 분기가 대상마다 복제되고, 정본이 그것을 금지한다.
 *
 * **이 표가 판정의 정본은 아니다.** 확장자 갈래만 담으므로, 확장자가 없는 대상까지 포함한
 * 판정은 `lexerKindFor`가 낸다. 표를 직접 읽는 소비자는 셔뱅 갈래를 잃는다.
 *
 * 비교는 소문자로 한다 — `extname`은 원문 대소문자를 그대로 돌려준다.
 *
 * @type {Readonly<Record<string, (typeof LEXER_KINDS)[number]>>}
 */
export const EXTENSION_LEXERS = Object.freeze({
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "typescript",
  ".mjs": "typescript",
  ".cjs": "typescript",
  ".sh": "shell",
  ".bash": "shell",
});

/**
 * 셸 셔뱅이 드는 인터프리터 이름. **위 표의 셸 확장자 둘에서 그대로 나온 집합이고 넓히지
 * 않았다** — 정본이 셸을 든 자리에서 이름을 열거하지 않았으므로, 확장자가 이미 말한 것 밖의
 * 이름을 여기서 발명하면 그 판정의 근거가 이 파일에만 남는다.
 */
const SHELL_INTERPRETERS = Object.freeze(["sh", "bash"]);

/**
 * 첫 줄의 셔뱅이 셸을 가리키는가. `#!` 뒤의 첫 낱말이 인터프리터이고, 그것이 `env`이면 다음
 * 낱말이 인터프리터다. 판정은 경로의 마지막 조각으로 한다.
 *
 * @param {string} source
 * @returns {boolean}
 */
function hasShellShebang(source) {
  const newline = source.indexOf("\n");
  const line = newline === -1 ? source : source.slice(0, newline);
  if (!line.startsWith("#!")) return false;

  const words = line.slice(2).trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return false;
  const basename = (word) => word.slice(word.lastIndexOf("/") + 1);

  const named = basename(first) === "env" ? words[1] : first;
  if (named === undefined) return false;
  return SHELL_INTERPRETERS.includes(basename(named));
}

/**
 * 대상 하나 — 수단을 고르는 **자리**와, 그 수단이 재는 **원문**.
 *
 * 둘을 한 값으로 묶는 것은 확장자가 없는 대상 때문이다: 그런 대상에서는 자리만으로 수단이
 * 안 갈리고 원문의 첫 줄(셔뱅)까지 봐야 한다. 자리와 원문이 갈린 인자였다면 그 갈래를
 * 소비자마다 다시 배선하게 된다.
 *
 * @typedef {{ readonly path: string, readonly source: string }} LexTarget
 */

/**
 * 이 대상을 어떤 수단으로 읽는가. **`수단이 없는 대상에서 조용한 0을 내지 않는다`**(§6 U-b
 * 2026-08-18 후속 판정) — 그래서 모르는 대상에서 빈 배열이 아니라 예외를 낸다. 빈 배열은
 * «주석이 없다»와 «읽을 줄 모른다»를 같은 값으로 만들고, 2026-08-18 실측에서 위반 목록형
 * 단언이 정확히 그 0을 통과로 읽었다.
 *
 * **셔뱅은 확장자가 없을 때만 본다.** 확장자가 답한 자리에서 첫 줄이 그 답을 뒤집으면 같은
 * 대상의 수단이 원문 편집으로 바뀌고, 확장자가 고른다는 판정이 무너진다.
 *
 * @param {LexTarget} target
 * @returns {(typeof LEXER_KINDS)[number]}
 * @throws {Error} 이 자리에 수단이 없을 때
 */
export function lexerKindFor(target) {
  const extension = extname(target.path).toLowerCase();
  const byExtension = EXTENSION_LEXERS[extension];
  if (byExtension !== undefined) return byExtension;
  if (extension === "" && hasShellShebang(target.source)) return "shell";

  throw new Error(
    `렉싱 수단이 없는 대상이다 — ${target.path}` +
      `${extension === "" ? " (확장자 없음 · 셸 셔뱅 아님)" : ` (확장자 ${extension})`}. ` +
      `아는 확장자: ${Object.keys(EXTENSION_LEXERS).join(" ")}. ` +
      `아는 셔뱅: ${SHELL_INTERPRETERS.join(" ")}. ` +
      `DOC-CITATION.md §6 U-b — 수단이 없는 대상에서 조용한 0을 내지 않는다.`,
  );
}

/** 수단 이름 → 소속 술어. `LEXER_KINDS`와 키가 정확히 같아야 한다. */
const LEXERS = Object.freeze({
  typescript: commentTokenSpans,
  shell: shellCommentTokenSpans,
});

/**
 * 대상의 주석 토큰 구간들. 수단을 고르고 그 수단으로 잰다.
 *
 * **`소속 술어는 확장자를 묻지 않는다`**(§6 U-b 2026-08-18 후속 판정). 확장자가 고르는 것은
 * 수단이지 «어느 파일이 재기는가»가 아니므로, 이 함수는 수단만 갈아 끼우고 끊는 규칙은
 * 대상마다 같다.
 *
 * @param {LexTarget} target
 * @returns {{ pos: number, end: number }[]}
 * @throws {Error} 이 자리에 수단이 없을 때
 */
export function commentTokenSpansFor(target) {
  return LEXERS[lexerKindFor(target)](target.source);
}
