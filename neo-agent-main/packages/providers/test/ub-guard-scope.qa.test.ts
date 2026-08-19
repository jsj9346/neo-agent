/**
 * 독립 QA — `DOC-CITATION.md` §6 U-b의 2026-08-18 판정과 §3.4가 정한 것을, 그 판정이 넓힌
 * 자리가 실제로 재는가.
 *
 * **대조 축의 모집단은 손 목록이 아니라 자리의 기계 열거다** — `packages/<패키지>/test/` 아래의
 * 타입스크립트 파일 전부다(자리 문면의 별표 글롭을 그대로 적으면 블록 주석이 여기서 닫힌다).
 * 근거는 §6 U-b 2026-08-17 판정(대조 축이 걸리는 자리를 각 패키지의
 * 테스트 디렉터리까지 넓힌다)과 2026-08-18 후속 판정(대조 축의 단위는 파일이다)이다. 손으로
 * 유지하던 목록 넷은 그 판정을 착지시킨 세 파일만 들고 있었고, 그래서 나머지 형제들이 조용히
 * 모집단 밖이었다 — 근거는 `plans/20260818-ubqa-K-161.md`. 열거가 비면 통과가 아니라 실패다.
 *
 * 축 1(머리 절단 술어)만 대상을 손으로 든다 — 그 축이 재는 것은 대상의 절단 함수이지 자리의
 * 인용이 아니므로 모집단이 아니라 표본이다.
 *
 * ## 이 파일의 `it.todo`는 삭제 대기가 아니라 판정 대기다
 *
 * 넓힌 모집단이 축 셋을 열었고 그중 둘의 판정을 정본이 명시적으로 미뤄 두었다 — §6 U-b가
 * 대조 축 기계를 그 조건이 이 코퍼스에서 어떻게 걸리는지를 잰 뒤에 판정한다고 적고 소유를
 * `K-006`에 뒀다. 게다가 이 파일의 판별기가 쓰는 코퍼스는 `docs/` 아래 마크다운뿐이라 `S-4`가
 * 든 것보다 좁고, 좁힘의 방향은 오탐이다. 그 상태에서 계수를 위반 수로 강제하면 정본이 미뤄
 * 둔 판정을 이 게이트가 대신 내리게 된다. 그래서 그 둘은 `[K-006 대기]` `it.todo`로 내린다.
 *
 * **`it.todo`로 내린 자리의 측정 코드와 목록은 지우지 않는다.** 카드가 처분되면 `todo`를 떼는
 * 것만으로 단언이 다시 선다 — 본문을 지우면 그 자리가 판정 대기였다는 사실 자체가 사라지고,
 * 다음 사이클은 같은 발견을 처음부터 다시 한다. 축 3이 `K-150`에 대해 이미 그 형태다.
 *
 * **기대값의 출처는 `DOC-CITATION.md` §6 U-b(2026-08-17 · 2026-08-18)와 §3.4 하나다.** 세
 * 파일의 구현을 읽어 기대값을 정하지 않는다 — 그러면 대상이 옳았다는 것을 대상으로 증명하는
 * 순환이 된다. 대상이 문서와 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * ---
 *
 * ## 어떻게 대상을 부르는가
 *
 * 형제 파일들이 쓰는 방식과 같다 — **대상의 원문을 잘라 그 자리에서 transpile 해 부른다.**
 * 술어를 이 파일에 베끼면 대상이 옛 술어로 돌아가도 여기가 그린이므로, 검증되는 것은 언제나
 * 대상 파일의 현재 텍스트여야 한다. 잘라 내는 구간의 표지가 사라지면 던진다(fail-closed).
 *
 * **대조 판정만은 베끼지 않고 정본에서 새로 도출한다.** 아래 `guillemetMissesByUnit`은 대상의
 * 판별기를 부르지 않고 §6 U-b 2026-08-18의 단위 술어와 §3.4의 `S-5` 지목 부류에서 직접
 * 만든 것이다 — 대상의 판별기를 부르면 그 판별기가 옳다는 것을 그 판별기로 증명하게 된다.
 *
 * ## 처분 이력 — 이 파일이 무엇을 재는지가 2026-08-18에 바뀌었다
 *
 * 최초 판(같은 날)은 발견 셋을 red로 들고 있었다. 그중 둘이 같은 날 처분됐으므로 **이 파일은
 * 처분 후 상태를 재도록 고쳐졌다.** 무엇을 왜 뺐는지는 `plans/20260818-ub-qa.md`의 처분 후
 * 재판정 절이 든다. 여기 남는 축은 넷이다:
 *
 * 1. **머리 절단 술어** — 대상의 절단 함수를 원문에서 뽑아 부르고, 죽은 술어 둘(첫 닫기
 *    표기 · 줄 모양)과 답이 갈리는 배치를 심어 처분이 실물임을 매 런 고정한다. 대상이 어느
 *    쪽으로 돌아가도 red다.
 * 2. **겹화살괄호 갈래의 판별 단위** — 정본에서 새로 도출한 덩어리 단위 판별기로 대상을
 *    재고 목록이 비어 있을 것을 요구한다.
 * 3. **코드가 문서를 가리킨 줄번호 인용** — 처분되지 않은 발견이므로 `todo`로 남긴다.
 *    소유는 `K-150`.
 * 4. **파일 축 대조의 덮개와 머리 절단의 경계** — 인용부호 셋 전부에 대한 파일 축 대조와,
 *    한 블록 주석 안에서 소속이 갈리는 배치 둘의 실단언. 그 둘은 2026-08-18까지 등급 없이
 *    오늘 값만 고정했고, 같은 절의 후속 판정이 소속을 렉싱으로 못박아 승격됐다.
 *
 * 이 주석은 인용부호를 쓰지 않는다. 근거는 §6 U-b 2026-08-17 판정이 대조 축을 각 패키지의
 * 테스트 디렉터리까지 넓혔고 이 파일이 그 안이기 때문이다 — 대조받지 않는 인용부호는 원문이
 * 이렇다는 신호만 주고 그 신호가 참인지 아무도 묻지 않는다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 인용부호 구간 파서의 **정본**은 이 모듈이다(`DOC-CITATION.md` §6 U-e 2026-08-15 판정).
// 코드 표기 마스킹을 손으로 다시 짜면 복제는 원본과 같은 눈을 가지므로 이중화가 사는 값이 0이고,
// 실제로 이 파서의 알려진 한계가 복제본에 상속된 적이 있다. 형제 `docs-gate-parity.qa.test.ts`가
// 같은 근거로 이 모듈을 적재한다.
// 소속 술어의 **정본**은 이 모듈이다(`DOC-CITATION.md` §6 U-b의 2026-08-18 후속 판정과
// 2026-08-19 판정). 위와 같은 근거다 — 사본은 원본과 같은 눈을 가지므로 이중화가 사는 값이 0이고,
// 정본이 고쳐져도 사본이 남으면 이 파일만 옛 술어로 잰다.
import { commentTokenSpans } from "../../../scripts/comment-lexer.mjs";
import { maskCodeSpans } from "../../../scripts/doc-citation.mjs";

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript") as typeof import("typescript");

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const CITED_PATH = path("./cited-noncircular.qa.test.ts");
const SELF_HEAD_PATH = path("./self-head-scope.qa.test.ts");
const PARITY_PATH = path("./docs-gate-parity.qa.test.ts");
const RENDERER_PATH = path("../../cli/test/renderer-literal-policy.qa.test.ts");
const DOCS_DIR = path("../../../docs/");
const PACKAGES_DIR = path("../../");

const CITED = readFileSync(CITED_PATH, "utf8");
const SELF_HEAD = readFileSync(SELF_HEAD_PATH, "utf8");
const PARITY = readFileSync(PARITY_PATH, "utf8");
const RENDERER = readFileSync(RENDERER_PATH, "utf8");
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");

/**
 * 자리 술어 — `packages/<패키지>/test/` 아래의 타입스크립트 파일(별표 글롭을 그대로 적으면
 * 블록 주석이 닫힌다). 경로는 `packages/`에서의 상대다.
 *
 * [미규정] 정본(§6 U-b 2026-08-17)이 그은 자리는 디렉터리 하나이고 **깊이와 확장자를 안
 * 든다.** 여기서는 넓게 읽는다 — 하위 디렉터리(픽스처)까지 자리 안이고, 파일은 `.ts`만
 * 본다. 둘 다 오늘 실물이 갈리지 않는다(하위 디렉터리 파일 1건 · `.mts`/`.cts`/`.tsx` 0건).
 * 넓히는 쪽이 red 방향이라 침묵을 안 만드는 것이 근거이고, 정본이 정하면 그쪽을 따른다.
 */
const PLACE = /^[^/]+\/test\/(?:[^/]+\/)*[^/]+\.ts$/;

/** 자리를 기계로 연다. 손 목록을 두면 다음 파일이 늘 때 모집단이 조용히 낡는다 */
function placeFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".ts")) found.push(`${prefix}${entry.name}`);
    }
  };
  for (const pkg of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const dir = `${PACKAGES_DIR}${pkg.name}/test/`;
    if (existsSync(dir)) walk(dir, `${pkg.name}/test/`);
  }
  return found.sort();
}

/** 대조 축의 모집단. 이름은 `packages/` 상대 경로이고 원문은 그 자리에서 읽는다 */
const TARGETS: readonly (readonly [string, string])[] = placeFiles().map(
  (name) => [name, readFileSync(`${PACKAGES_DIR}${name}`, "utf8")] as const,
);

/** D-2 — 정규화는 공백만 */
const norm = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * S-4 코퍼스 중 우리 문서 트리. 동결 레퍼런스 트리와 지목된 기록·리비전은 빠져 있고, 그
 * 좁힘은 `plans/20260818-ub-qa.md`의 U-B가 판정으로 든다. 방향은 red다(정당한 인용이 오탐).
 */
const CORPUS = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .map((name) => norm(readFileSync(`${DOCS_DIR}${name}`, "utf8")));
const inCorpus = (quote: string): boolean => CORPUS.some((doc) => doc.includes(norm(quote)));

/* ------------------------------------------------------------------------ *
 * 계약 술어 — 대상에서 베끼지 않고 §6 U-b 2026-08-18 판정 문면에서 도출한다
 * ------------------------------------------------------------------------ */

type Run = {
  readonly text: string;
  /** 코드 표기를 덮은 같은 길이의 텍스트 — Q-1. **접기 전에** 걸린다(아래 `commentRuns`) */
  readonly masked: string;
  readonly startLine: number;
  lineAt(offset: number): number;
};

/**
 * 빈 줄 없이 이어지는 주석 줄의 덩어리 하나가 한 단위다. 주석 토큰 둘 사이에 줄바꿈이 둘
 * 이상이면 주석 없는 줄이 하나 이상 놓인 것이므로 거기서 끊는다 — 별표 없는 계속 줄도 블록
 * 주석 안의 완전 공백 줄도 토큰 안이라 안 끊는다.
 */
function commentRuns(source: string): Run[] {
  const raw: {
    text: string;
    masked: string;
    marks: { at: number; offset: number }[];
    startLine: number;
  }[] = [];
  let previousEnd = -1;
  for (const span of commentTokenSpans(source)) {
    const startLine = (source.slice(0, span.pos).match(/\n/g) ?? []).length + 1;
    const gap = previousEnd === -1 ? null : source.slice(previousEnd, span.pos);
    if (gap === null || (gap.match(/\n/g) ?? []).length > 1)
      raw.push({ text: "", masked: "", marks: [], startLine });
    previousEnd = span.end;
    const run = raw[raw.length - 1];
    if (run === undefined) continue;
    source
      .slice(span.pos, span.end)
      .split("\n")
      .forEach((line, index) => {
        run.marks.push({ at: startLine + index, offset: run.text.length });
        const stripped = line.replace(/^\s*(\/\/|\*\/?|\/\*\*?)\s?/, "");
        run.text += ` ${stripped}`;
        // **코드 표기 마스킹은 덩어리를 접기 전에 건다.** 정본 파서의 짝짓기는 줄 경계로만
        // 막혀 있는데(`scripts/doc-citation.mjs` — 줄을 넘는 스팬을 인정하면 짝이 안 맞는
        // 백틱 하나가 문서 절반을 삼킨다), 줄바꿈을 공백으로 접은 뒤에 걸면 그 경계가
        // 무효가 되어 짝 잃은 백틱 한 글자가 뒤의 대조를 통째로 끈다. 손 정규식이든 정본이든
        // 같은 값을 내므로 원인은 복제가 아니라 순서다. `maskCodeSpans`는 길이를 보존하니
        // 접힌 두 텍스트의 오프셋이 그대로 맞고, `lineAt`의 계약도 안 바뀐다.
        run.masked += ` ${maskCodeSpans(stripped)}`;
        // **접기 전으로 옮길 수 있는 것은 이 부류뿐이다** — 코드 스팬은 상한이 줄이라 줄이
        // 살아 있는 자리에서만 짝이 맞는다. 별표 형식·평문 큰따옴표의 마스킹을 여기로 끌어
        //내리지 마라: §6 U-b 2026-08-18이 그 부류의 단위를 덩어리로 뒀으므로 줄바꿈을 넘는
        // 인용이 정상값이고, 접기 전에 걸면 그 자리가 1건에서 0건이 된다(아래 축 4가 잰다).
      });
  }
  return raw.map((run) => ({
    text: run.text,
    masked: run.masked,
    startLine: run.startLine,
    lineAt(offset: number): number {
      let found = run.startLine;
      for (const mark of run.marks) {
        if (mark.offset <= offset) found = mark.at;
        else break;
      }
      return found;
    },
  }));
}

/**
 * 렉서가 이 원문을 읽었는가. 파싱 진단이 0이면 읽은 것이고, 렉싱 수단이 없는 대상(셸 등)은
 * 진단이 쌓인다 — 2026-08-18 실측: 셸 표본 진단 7·주석 스팬 0, 주석 없는 `.ts` 진단 0·스팬 0.
 */
function lexed(source: string): boolean {
  return (
    (
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      }).diagnostics ?? []
    ).length === 0
  );
}

/**
 * 덩어리가 비었을 때 **잴 대상이 없는 것**과 **잴 수단이 없는 것**을 가른다. 위반 목록형
 * 단언은 둘을 같은 값(빈 목록)으로 내므로 술어가 대신 가른다:
 *
 * - 덩어리 0 + 렉서가 읽음 = 주석이 정말 없는 파일. 정상이고 위반도 0이다.
 * - 덩어리 0 + 렉서가 못 읽음 = 수단 부재. §6 U-b 2026-08-18이 이 자리를 `Q-7`대로 실패로
 *   두었다(수단이 없는 대상에서 조용한 0을 내지 않는다) — 던진다.
 *
 * 가르지 않고 덩어리 0을 전부 실패로 읽으면 주석 없는 정상 파일 다섯이 위반으로 서고, 전부
 * 통과로 읽으면 셸처럼 렉서가 없는 대상이 조용한 0으로 들어온다(`ARCHITECTURE.md` §2.6).
 */
function commentRunsOrFail(source: string, label: string): Run[] {
  const runs = commentRuns(source);
  if (runs.length === 0 && !lexed(source))
    throw new Error(
      `${label}: 렉서가 원문을 못 읽었다 — 덩어리 0을 위반 0으로 읽지 않는다(§3.4 Q-7)`,
    );
  return runs;
}

/** 머리 — 첫 줄에서 시작하는 덩어리. 같은 술어로 끊는다(거터를 벗긴 텍스트) */
function contractHead(source: string): string {
  const runs = commentRuns(source);
  const first = runs[0];
  if (first === undefined || first.startLine !== 1) return "";
  return first.text;
}

/**
 * 같은 술어의 **원문 슬라이스** 판. 대상의 절단 함수가 원문 구간을 돌려주므로 값 대조는
 * 이 쪽과 한다 — 위 함수는 거터를 벗기므로 문자열이 다르다.
 *
 * 주석 밖 글자는 공백으로 덮는다. 자리와 길이는 보존하므로 부르는 쪽의 오프셋 계산이 그대로
 * 서고, 코드 파일에서 재는 것은 주석 안뿐이라는 같은 판정의 항이 이 값에도 걸린다.
 */
function contractHeadRaw(source: string): string {
  const spans = commentTokenSpans(source);
  const first = spans[0];
  if (first === undefined || !/^[ \t]*$/.test(source.slice(0, first.pos))) return "";
  let end = first.end;
  for (const span of spans.slice(1)) {
    if ((source.slice(end, span.pos).match(/\n/g) ?? []).length > 1) break;
    end = span.end;
  }
  return spans
    .filter((span) => span.pos < end)
    .reduce(
      (head, span) =>
        head +
        source.slice(head.length, span.pos).replace(/[^\n]/g, " ") +
        source.slice(span.pos, span.end),
      "",
    );
}

/** 2026-08-17까지 쓰이던 술어 — 첫 닫기 표기까지. 아래 대비쌍의 대조군이다 */
const firstCloserHead = (source: string): string => source.slice(0, source.indexOf("*/"));

/**
 * 2026-08-18 처분 직후까지 쓰이던 술어 — 소속을 줄 모양(별표 접두)으로 읽는다. 아래 대비쌍의
 * 둘째 대조군이고, 이 짝이 없으면 렉싱 술어를 요구하는 단언들이 줄 모양 술어에서도 그린이다.
 */
const lineShapeHead = (source: string): string => {
  let end = 0;
  for (const line of source.split("\n")) {
    if (!/^\s*(\/\/|\*|\/\*)/.test(line)) break;
    end += line.length + 1;
  }
  return source.slice(0, end);
};

/** S-5의 지목 부류를 표기로 근사한다. 넓히는 방향이라 틀려도 위반을 늘리지 않는다 */
const POINT = /[A-Za-z0-9-]+\.md|§\s?\d|K-\d{3}|\b[A-Z]-\d\b|plans\/|devnotes\//;

type Miss = { readonly line: number; readonly quote: string };

/**
 * 지목이 같은 **단위**(덩어리)에 있고 대조가 거짓인 겹화살괄호 자리.
 * 등급은 안 매긴다(S-2) — 목록이 비어야 할 뿐이다.
 */
function guillemetMissesByUnit(source: string, skipHead: boolean, label: string): Miss[] {
  const found: Miss[] = [];
  for (const run of commentRunsOrFail(source, label)) {
    if (skipHead && run.startLine === 1) continue;
    if (!POINT.test(run.text)) continue;
    for (const match of run.masked.matchAll(/«[^»]{2,}»/g)) {
      const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
      if (!inCorpus(quote)) found.push({ line: run.lineAt(match.index), quote: norm(quote) });
    }
  }
  return found;
}

/* ------------------------------------------------------------------------ *
 * 대상 적재 — 원문을 잘라 그 자리에서 부른다
 * ------------------------------------------------------------------------ */

/** `[from, to)` 구간을 뽑는다. 표지가 없으면 던진다(fail-closed) */
function region(source: string, from: string, to: string, label: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start === -1 ? 0 : start);
  if (start === -1 || end === -1 || end <= start)
    throw new Error(`${label}: 구간을 뽑지 못했다 — 대상이 개편됐으면 이 검증기를 먼저 고친다`);
  return source.slice(start, end);
}

const transpile = (source: string): string =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

/** 대상의 머리 절단 함수를 원문에서 뽑아 부른다 — 사본을 두면 대상이 돌아가도 여기가 그린이다 */
function loadTargetHeadCut(): (source: string) => string {
  const slice = region(
    CITED,
    "function leadingCommentBlock",
    "const PROVIDERS_PATH",
    "대상 머리 절단 함수",
  );
  const loaded: Record<string, unknown> = {};
  // 대상의 절단이 렉서를 부르므로 `ts`를 주입한다 — 사본을 두면 대상이 돌아가도 여기가 그린이다.
  //
  // **소속 술어도 주입한다**(2026-08-19). 대상이 들던 사본이 `scripts/comment-lexer.mjs`로
  // 옮겨 가면서 그 이름이 잘라 낸 구간 밖의 임포트가 됐다. 주입하지 않으면 적재가 아니라 **호출**
  // 시점에 `ReferenceError`가 나므로 이 파일이 6 failed로 선다. 다른 값을 넣으면 재현되는 것이
  // 대상의 오늘 배선이 아니므로 정본 모듈의 것을 그대로 넣는다 — 그 값이 계약과 갈리지 않는다는
  // 것은 형제 `ub-predicate-scope.qa.test.ts`의 축 1과 축 7이 고정한다.
  new Function(
    "exports",
    "ts",
    "commentTokenSpans",
    transpile(`${slice}\nexports.cut = leadingCommentBlock;`),
  )(loaded, ts, commentTokenSpans);
  const cut = loaded.cut;
  if (typeof cut !== "function") throw new Error("대상 머리 절단 함수 적재에 실패했다");
  return cut as (source: string) => string;
}

const targetHeadCut = loadTargetHeadCut();

/**
 * 대상의 한계 절 검사 **본문**을 원문에서 뽑아 임의의 머리에 대해 부른다. 그 검사가 표지 부재를
 * fail-closed로 다루는지는 이렇게만 잴 수 있다 — 대상은 자기 머리로만 그것을 부르기 때문이다.
 */
function loadTargetLimitsCheck(): (header: string) => void {
  const block = region(
    CITED,
    'it("적합 — 한계 문단이 인용부호를 쓰지 않는다는 주장은 참이다"',
    "\n  });",
    "대상 한계 절 검사",
  );
  const at = block.indexOf("=> {");
  if (at === -1) throw new Error("대상 한계 절 검사의 본문을 찾지 못했다");
  const body = block.slice(at + 4);
  const loaded: Record<string, unknown> = {};
  new Function(
    "exports",
    "expect",
    transpile(`exports.run = (HEADER: string): void => {${body}};`),
  )(loaded, expect);
  return loaded.run as (header: string) => void;
}

const targetLimitsCheck = loadTargetLimitsCheck();

/**
 * 대상의 형제 머리 가드 셋을 **대상이 오늘 쓰는 절단 술어로** 재현한다. 절단만 갈아 끼우면
 * 옛 술어와의 대비쌍이 서고, 어느 쪽도 이 파일이 하드코딩한 답이 아니다.
 */
function siblingGuardPasses(parity: string, cut: (source: string) => string): boolean {
  const header = cut(parity);
  const at = header.indexOf("## 문면 인용 대조가 재지 못하는 것");
  if (at === -1) return false; // 표지 부재는 통과가 아니다
  const limits = header.slice(at);
  return header.includes("인라인 코드 스팬을 지운 뒤") && !/[«»]/.test(limits) && !/"/.test(limits);
}

/**
 * 형제 가드가 머리를 **계약 술어로** 자르는가 — 배선 문면이 아니라 부르는 함수를 잰다.
 * 대상 원문을 함께 요구하는 것은 술어만 부르고 다른 값을 먹이는 형태를 배제하기 위해서다.
 */
function usesCutPredicate(source: string): boolean {
  const declaration = /const HEADER = [^\n]*/.exec(source)?.[0] ?? "";
  return declaration.includes("leadingCommentBlock") && declaration.includes("TARGET_SOURCE");
}

/** 머리를 블록 주석 둘로 쪼갠 배치. 빈 줄이 없으므로 계약 술어에서는 여전히 한 머리다 */
function plantSplitHead(source: string, anchor: string): string {
  const planted = source.replace(
    anchor,
    [" */", "/**", ' * 한계 5. 표본 «심은 지목»과 "심은 인용"을 든다', anchor].join("\n"),
  );
  if (planted === source) throw new Error("표지가 사라졌다 — 이 검증기를 먼저 고친다");
  return planted;
}

/**
 * 덩어리가 나오는 자리와 안 나오는 자리를 가른다. **`MUTE`는 위반이 없는 자리가 아니라 잴
 * 수단이 없는 자리다** — 대조 축이 전부 위반 목록형이라 그 둘이 같은 값(빈 목록)을 낸다.
 * 아래 축 0이 `MUTE`를 실단언으로 들고, 각 축은 `AUDIBLE`만 돈다. 축마다 던지면 첫 자리에서
 * 런이 끊겨 나머지 발견이 안 보이므로, 가르는 자리를 모집단 층에 한 번만 둔다.
 */
const AUDIBLE: readonly (readonly [string, string])[] = TARGETS.filter(
  ([, source]) => commentRuns(source).length > 0,
);
/** 덩어리 0이지만 렉서는 읽은 자리 — 주석이 정말 없는 파일이다. 정상이므로 단언 대상이 아니다 */
const BARE: readonly string[] = TARGETS.filter(
  ([, source]) => commentRuns(source).length === 0 && lexed(source),
).map(([name]) => name);
/** 덩어리 0이고 렉서도 못 읽은 자리 — 수단 부재다. 이쪽만 실패로 낸다 */
const MUTE: readonly string[] = TARGETS.filter(
  ([, source]) => commentRuns(source).length === 0 && !lexed(source),
).map(([name]) => name);

/* ------------------------------------------------------------------------ *
 * 축 0 — 모집단이 자리 그 자체인가
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b — 대조 축의 모집단은 자리의 기계 열거다", () => {
  it("적합 — 모집단 = 자리. 손 목록으로 좁아져 있지 않다", () => {
    // 근거: §6 U-b 2026-08-17 판정이 대조 축이 걸리는 자리를 `packages/*/test/`로 긋고,
    // 2026-08-18 후속 판정이 그 축의 단위를 파일로 못박았다. 모집단을 손으로 유지하면
    // 다음 파일이 늘 때 가드는 그린인데 자리는 red인 상태가 설계로 굳는다 — 그 미탐이
    // 2026-08-18에 실물로 관측됐고(`plans/20260818-ubqa-K-161.md`), 이 단언이 그 재발을 막는다.
    //
    // 열거가 비면 통과가 아니다. 아래 대조 축들이 전부 위반 목록형이라, 모집단이 0이면
    // 목록이 비어 조용히 그린이 된다(`ARCHITECTURE.md` §2.6 가시적 결과).
    expect(TARGETS.length, "자리 열거가 비었다").toBeGreaterThan(0);

    const names = TARGETS.map(([name]) => name);
    expect(
      names.filter((name) => !PLACE.test(name)),
      "자리 술어를 안 만족하는 항",
    ).toEqual([]);

    // 한 패키지로 좁으면 열거가 손 목록으로 퇴화한 것이다.
    expect(new Set(names.map((name) => name.split("/")[0])).size).toBeGreaterThan(1);

    // 옛 손 목록 셋과, 그 목록이 빠뜨렸던 형제들과, 이 파일 자신이 전부 모집단 안이다.
    for (const name of [
      "providers/test/cited-noncircular.qa.test.ts",
      "providers/test/self-head-scope.qa.test.ts",
      "cli/test/renderer-literal-policy.qa.test.ts",
      "providers/test/docs-gate-parity.qa.test.ts",
      "providers/test/ub-predicate-scope.qa.test.ts",
      "cli/test/doc-citation.contract.test.ts",
      "providers/test/package-boundary.contract.test.ts",
      "cli/test/doc-status.contract.test.ts",
      "cli/test/renderer.contract.test.ts",
    ])
      expect(names, `${name}: 자리 안인데 모집단에 없다`).toContain(name);
    expect(names.some((name) => name.endsWith("/ub-guard-scope.qa.test.ts"))).toBe(true);

    // 역검증 — 자리 술어가 아무 경로나 받지 않는다. 안 그러면 위 단언들이 공허하다.
    expect(names.some((name) => name.includes("/src/"))).toBe(false);
    expect(PLACE.test("providers/src/anthropic/client.ts")).toBe(false);
    expect(PLACE.test("providers/test/fixture.md")).toBe(false);
    expect(PLACE.test("providers/test/ub-guard-scope.qa.test.ts")).toBe(true);
    expect(PLACE.test("web/test/fixtures/https-server.ts")).toBe(true);
  });

  it("적합 — 자리 안의 모든 파일에서 덩어리가 나온다 (조용한 0이 없다)", () => {
    // 근거: §6 U-b 2026-08-18 — 수단이 없는 대상에서 조용한 0을 내지 않는다. 덩어리가 비면
    // `Q-7`대로 실패다. §3.4 `Q-7` — 게이트는 조용한 0이 아니라 실패를 낸다.
    //
    // 아래 대조 축은 전부 위반 목록형이라 덩어리가 0인 자리에서 빈 목록을 내고 통과한다.
    // 그 통과가 **잴 대상이 없어서**인지 **잴 수단이 없어서**인지를 술어가 가른다 — 앞은
    // 정상(`BARE`)이고 뒤만 실패(`MUTE`)다.
    expect(AUDIBLE.length, "덩어리가 나오는 자리가 0이다").toBeGreaterThan(0);
    expect(
      MUTE,
      `렉서가 못 읽은 자리 ${MUTE.length}건 — 덩어리 0을 위반 0으로 읽지 않는다`,
    ).toEqual([]);

    // 두 갈래가 모집단을 남김없이 덮는다 — 셋의 합이 자리 전체가 아니면 어딘가로 새고 있다.
    expect(AUDIBLE.length + BARE.length + MUTE.length).toBe(TARGETS.length);
  });

  it("역검증 — 덩어리 0을 통과가 아니라 실패로 낸다", () => {
    // 위 단언과 갈라 둔다 — 한 `it`에 두면 오늘 red인 목록이 먼저 터져 이 짝이 안 돌고,
    // 그러면 `commentRunsOrFail`에서 던짐을 떼도 런의 결과가 안 바뀐다(가드의 가드).
    // 렉서가 없는 대상의 표본. 주석 표기가 `#`이라 이 렉서로는 덩어리가 0으로 나온다.
    const shellLike = "#!/usr/bin/env bash\n# 근거는 DOC-CITATION.md 6절이다\nset -euo pipefail\n";
    expect(commentRuns(shellLike)).toHaveLength(0);
    expect(lexed(shellLike), "표본이 렉서를 실제로 막지 못한다").toBe(false);
    expect(() => commentRunsOrFail(shellLike, "표본")).toThrow();
    expect(() => guillemetMissesByUnit(shellLike, true, "표본")).toThrow();

    // 반대 방향 둘 — 주석이 있으면 안 던지고, **주석이 정말 없는 `.ts`도 안 던진다**. 뒤가
    // 없으면 술어가 대상 부재와 수단 부재를 다시 뭉뚱그린 형태로 퇴화해도 그린이다.
    expect(commentRuns("// 주석\nconst bare = 1;\n").length).toBeGreaterThan(0);
    expect(() => commentRunsOrFail("// 주석\nconst bare = 1;\n", "표본")).not.toThrow();
    expect(commentRuns("const bare = 1;\n")).toHaveLength(0);
    expect(lexed("const bare = 1;\n")).toBe(true);
    expect(() => commentRunsOrFail("const bare = 1;\n", "표본")).not.toThrow();
  });
});

/* ------------------------------------------------------------------------ *
 * 축 1 — 머리 절단 술어
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b 2026-08-18 — 머리는 연속된 주석 줄 전부로 끊는다", () => {
  const PARITY_ANCHOR = " * 이 절은 인용부호를 쓰지 않는다";

  it("적합 — 대상의 절단이 계약 술어와 같은 값이다", () => {
    // 근거: §6 U-b 2026-08-18 — 코드 파일의 단위는 빈 줄 없이 이어지는 주석 줄의 덩어리
    // 하나이고, 인용 한 건의 경계도 각 파일 자신의 머리도 그 술어로 끊는다.
    //
    // 대상의 함수를 원문에서 뽑아 부르고, 여기 계약 술어와 값이 같은지를 잰다. 두 구현이
    // 독립이므로 대상이 술어를 되돌리면 이 자리가 red다.
    for (const [name, source] of [
      ["cited-noncircular", CITED],
      ["self-head-scope", SELF_HEAD],
      ["docs-gate-parity", PARITY],
      ["renderer-literal-policy", RENDERER],
    ] as const) {
      const head = targetHeadCut(source);
      expect(head.length, `${name}: 머리를 못 잘랐다`).toBeGreaterThan(0);
      expect(head, `${name}: 절단 자리가 계약 술어와 다르다`).toBe(contractHeadRaw(source));
    }

    // **역검증 — 두 술어가 갈리는 입력에서 실제로 갈린다.** 위 대조는 오늘 네 파일의 머리가
    // 전부 한 블록이라 옛 술어로도 거의 같은 값을 낸다. 이 짝이 없으면 위 단언은 첫 닫기
    // 표기로 되돌린 술어에서도 그대로 그린이다.
    const planted = plantSplitHead(CITED, " * 이 주석은 인용부호를 쓰지 않는다");
    expect(targetHeadCut(planted)).toBe(contractHeadRaw(planted));
    expect(targetHeadCut(planted)).not.toBe(firstCloserHead(planted));
    expect(targetHeadCut(planted).length).toBeGreaterThan(firstCloserHead(planted).length);
  });

  it("적합 — 형제 머리 가드가 머리를 블록 주석 둘로 쪼갠 배치를 잡는다", () => {
    // 근거: 같은 판정 — 머리를 두 블록으로 쪼갠 표본이 그린으로 통과하는 것이 2026-08-18에
    // 실증됐고, 그래서 첫 닫기 표기 절단이 죽었다. 심은 배치는 타입스크립트 문법상 유효하고
    // 파싱 에러가 나지 않는다.
    // 가드가 그 술어를 실제로 **쓰는지**를 먼저 짚는다. 위 축이 절단 함수만 뽑아 부르므로,
    // 대상이 함수는 남긴 채 가드에서만 옛 절단으로 돌아가면 이 파일이 그린이다.
    //
    // **재는 것은 우변의 특정 텍스트가 아니라 술어를 부르는가다.** 배선 문면에 못박으면 대상이
    // 계약대로 절단 함수를 부르도록 고친 날 이 가드가 red가 되고, 그것은 되돌림이 아니라
    // 개편이다(2026-08-18 실측 — 옛 정규식이 오늘 대상에서 0글자를 뽑아 fail-closed로 물었다).
    const declaration = /const HEADER = [^\n]*/.exec(CITED)?.[0] ?? "";
    expect(declaration, "형제 머리 절단 선언을 대상에서 찾지 못했다").not.toBe("");
    expect(usesCutPredicate(CITED), `형제 머리를 계약 술어로 안 자른다: ${declaration}`).toBe(true);

    // 역검증 — 넓힌 술어가 아무거나 받지 않는다. 옛 절단으로 되돌린 배선도, 다른 이름에 묶인
    // 배선도 거부한다. 이 짝이 없으면 위 단언은 술어를 안 부르는 대상에서도 그린이다.
    expect(usesCutPredicate("const HEADER = firstCloserHead(TARGET_SOURCE);")).toBe(false);
    expect(usesCutPredicate("const OTHER = leadingCommentBlock(TARGET_SOURCE);")).toBe(false);
    expect(usesCutPredicate("const HEADER = leadingCommentBlock(OTHER_SOURCE);")).toBe(false);
    expect(usesCutPredicate("const HEADER = leadingCommentBlock(TARGET_SOURCE);")).toBe(true);

    const planted = plantSplitHead(PARITY, PARITY_ANCHOR);

    // 심은 것이 계약 술어의 머리 안에 실재한다 — 이 전제가 깨지면 아래 단언이 공허하다.
    expect(contractHead(planted)).toMatch(/[«»]/);

    // 대상이 오늘 쓰는 절단으로는 가드가 그 배치를 잡는다.
    expect(
      siblingGuardPasses(planted, targetHeadCut),
      "쪼갠 머리에 인용부호를 심었는데 형제 가드가 통과한다",
    ).toBe(false);
  });

  it("대비쌍 — 옛 절단 술어에서는 같은 배치가 통과한다 (처분이 답을 갈랐다)", () => {
    // 이 짝이 없으면 위 검사는 **아무 배치나 거부하는 가드**에서도 그린이다. 절단만 갈아
    // 끼웠고 나머지는 같은 코드이므로, 갈리는 것은 술어 하나뿐이라는 것이 여기서 선다.
    const planted = plantSplitHead(PARITY, PARITY_ANCHOR);
    expect(siblingGuardPasses(planted, firstCloserHead), "옛 술어").toBe(true);
    expect(siblingGuardPasses(planted, targetHeadCut), "오늘 술어").toBe(false);

    // 심지 않은 원본은 두 술어 어느 쪽에서도 통과한다 — 가드가 정당한 상태를 red로 만들지
    // 않는다는 반대 방향.
    expect(siblingGuardPasses(PARITY, targetHeadCut), "원본 · 오늘 술어").toBe(true);
    expect(siblingGuardPasses(PARITY, firstCloserHead), "원본 · 옛 술어").toBe(true);
  });

  it("적합 — 한계 절 표지가 사라지면 대상의 검사가 fail-closed로 던진다", () => {
    // 근거: §4 — 판정되지 않은 문서는 통과가 아니다. `indexOf`가 -1을 내면 `slice(-1)`이
    // 마지막 한 글자를 돌려주고 그 뒤 단언 셋이 그 한 글자로 전부 통과한다.
    //
    // 대상은 자기 머리로만 이 검사를 부르므로 표지 부재 갈래는 밖에서만 잴 수 있다. 대상의
    // **검사 본문**을 원문에서 뽑아 표지 없는 머리로 부른다.
    expect(() => targetLimitsCheck('머리에 표지가 없고 «지목»과 "인용"이 있다')).toThrow();

    // 반대 방향 — 표지가 있는 실제 머리로는 던지지 않는다(가드가 아무거나 거부하지 않는다).
    expect(() => targetLimitsCheck(targetHeadCut(PARITY))).not.toThrow();

    // 옛 술어(그 자리에 던짐이 없던 형태)가 같은 입력을 통과시켰다는 것을 대비쌍으로 든다.
    const header = '머리에 표지가 없고 «지목»과 "인용"이 있다';
    const limits = header.slice(header.indexOf("## 문면 인용 대조가 재지 못하는 것"));
    expect(limits.length, "모집단이 한 글자로 줄어든다").toBe(1);
    expect(limits.length > 0 && !/[«»]/.test(limits) && !/"/.test(limits)).toBe(true);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 2 — 겹화살괄호 갈래의 판별 단위
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b 2026-08-18 — 겹화살괄호 갈래도 덩어리 단위로 잰다", () => {
  it("적합 — 계약 단위로 재도 대상 파일에 처분 대상이 남아 있지 않다", () => {
    // 근거: §6 U-b 2026-08-18 — S-1~S-3은 U-1의 운용 규칙이므로 자리가 넓어지면 함께 온다.
    // 갈리면 벗기고 감사는 등급을 매기지 않는다(S-2) — 목록이 비어야 할 뿐이다.
    //
    // 판별기는 대상의 것을 부르지 않고 정본에서 새로 도출한 것이다. 대상이 자기 판별기를
    // 좁히면 대상은 그린인데 여기가 red다.
    //
    // 모집단은 자리 전체다(축 0). 손 목록이 아니므로 파일이 늘면 자동으로 든다.
    const misses: string[] = [];
    for (const [name, source] of AUDIBLE)
      for (const miss of guillemetMissesByUnit(source, true, name))
        misses.push(`${name}:${miss.line} ${JSON.stringify(miss.quote).slice(0, 70)}`);
    expect(misses, `덩어리 단위 처분 대상 ${misses.length}건`).toEqual([]);
  });

  it("대비쌍 — 줄 단위 술어는 덩어리 술어가 잡는 형태를 구조적으로 못 본다", () => {
    // 위 검사가 오늘 0을 내므로 **실물로는 두 술어를 못 가른다.** 합성 표본으로 가른다 —
    // 안 그러면 위 검사는 줄 단위로 되돌린 술어에서도 그대로 그린이다.
    //
    // 줄바꿈을 넘는 인용은 옛 술어가 구조적으로 못 보던 형태이고, 대상에 실물로 있었다.
    const head = "/** 머리 */\n\n";
    const spanning = [
      head,
      "// Q-1: 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 길이가 같은",
      "// 쌍»이다.",
    ].join("\n");
    expect(guillemetMissesByUnit(spanning, true, "표본")).toHaveLength(1);
    expect(spanning.split("\n").filter((line) => /«[^»]{2,}»/.test(line))).toEqual([]);

    // 지목이 같은 덩어리의 **다른 줄**에 있는 형태도 줄 술어가 못 본다.
    const apartPoint = [
      head,
      "// 근거는 DOC-CITATION.md §3.4다.",
      "// 그래서 «코퍼스에 없는 조어»다.",
    ].join("\n");
    expect(guillemetMissesByUnit(apartPoint, true, "표본")).toHaveLength(1);
    expect(
      apartPoint.split("\n").filter((line) => POINT.test(line) && /«[^»]{2,}»/.test(line)),
    ).toEqual([]);
  });

  it("역검증 — 같은 판별기가 원문 일치·코드 표기·덩어리 경계를 안 잡는다", () => {
    const head = "/** 머리 */\n\n";
    // 원문의 강조 마커를 그대로 든 인용은 대조가 참이라 안 걸린다 — D-2는 공백만 정규화한다.
    const restored = [
      head,
      "// Q-1: 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 **길이가 같은**",
      "// 쌍»이다.",
    ].join("\n");
    expect(guillemetMissesByUnit(restored, true, "표본")).toEqual([]);

    // 코드 표기 안은 인용부호가 아니다(Q-1).
    expect(
      guillemetMissesByUnit(
        `${head}// DOC-CITATION.md §3.4의 \`«코퍼스에 없는 조어»\` 표기`,
        true,
        "표본",
      ),
    ).toEqual([]);

    // 덩어리를 넘겨 잇지 않는다 — 코드 줄을 사이에 둔 두 조각은 한 인용이 아니다.
    const broken = [
      head,
      "// Q-1: 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 길이가 같은",
      "const between = 2;",
      "// 쌍»이다.",
    ].join("\n");
    expect(guillemetMissesByUnit(broken, true, "표본")).toEqual([]);

    // 지목이 없는 덩어리는 모집단 밖이다(S-3).
    expect(guillemetMissesByUnit(`${head}// 그냥 «코퍼스에 없는 조어»다.`, true, "표본")).toEqual(
      [],
    );

    // **대비쌍 — 짝 잃은 코드 표기 한 글자가 뒤의 대조를 끄지 않는다.** 마스킹을 덩어리를
    // 접기 전에 걸었으므로 정본 파서의 줄 경계가 살아 있다. 접은 뒤에 걸면 앞줄의 짝 없는
    // 백틱이 뒷줄의 정상 스팬과 짝지어 그 사이를 통째로 덮고 이 자리가 0건이 된다 — 1건
    // 잡히던 자리가 조용히 0이 되는 형태다(`ARCHITECTURE.md` §2.6). 이 짝이 없으면 위
    // 단언들은 마스킹을 접은 뒤로 되돌린 구현에서도 그대로 그린이다.
    const strayTick = [
      head,
      "// 근거는 DOC-CITATION.md §3.4다 — 짝 없는 백틱 하나 ` 가 앞에 있어도",
      "// «코퍼스에 없는 조어»가 잡히고 뒤에 `정상 스팬` 하나가 더 온다.",
    ].join("\n");
    expect(guillemetMissesByUnit(strayTick, true, "표본")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — 코드가 문서를 가리킨 줄번호 인용. 처분되지 않은 발견이다
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §3.1 · §6 U-b 2026-08-18 — 코드가 문서를 가리킨 줄번호 인용", () => {
  it.todo("V-3 — 대상 파일이 든 문서 줄번호가 오늘도 그 자리를 가리킨다 (`K-150` 처분 후)", () => {
    // **술어는 그대로 두고 실행만 미룬다.** §6 U-b 2026-08-18이 이 축의 재도입 트리거가
    // 발동했다고 적으면서도 자리는 안 넓혔다 — 코드가 문서를 가리킨 자리는 이 규약이 안 재고
    // 각 파일 머리의 선언에 남는다. 착지는 별도 사이클이고 소유는 `K-150`이다.
    //
    // 오늘 이것을 재면 그 카드가 명시적으로 넘겨받은 소급을 오늘 비어 있어야 할 것처럼 재게
    // 된다. **조건을 느슨하게 고쳐 green을 만드는 길은 열지 않는다** — 그러면 소급이 끝났는지
    // 아무도 못 가른다. 카드가 닫히면 `todo`를 떼는 것만으로 이 단언이 다시 선다.
    //
    // 2026-08-18 관측: `cited-noncircular.qa.test.ts`의 세 자리가 전부 `DOC-CITATION.md`의
    // 306줄을 드는데 그 줄은 다른 항이고, 가리킨다고 적은 표 칸 경계의 맨 구분자 추인은 두 줄
    // 아래에 있다. 근거는 `plans/20260818-ub-qa.md` V-3.
    const dead: string[] = [];
    for (const [name, source] of TARGETS) {
      for (const match of source.matchAll(/([A-Za-z-]+\.md):(\d+)/g)) {
        const doc = match[1];
        const at = Number(match[2]);
        const line = readFileSync(`${DOCS_DIR}${doc}`, "utf8").split("\n")[at - 1] ?? "";
        if (!line.includes("맨 구분자")) dead.push(`${name}: ${doc}:${at}`);
      }
    }
    expect(dead).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 파일 축 대조의 덮개 · 머리 절단 술어의 경계
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b — 대조 축의 단위는 파일이다", () => {
  it.todo("[K-006 대기] 자리 안 파일의 주석에 별표 형식·평문 대조 거짓이 없다", () => {
    // **술어와 목록은 그대로 두고 실행만 미룬다** — 축 3이 `K-150`에 대해 쓰는 것과 같은 형태다.
    // 근거: §6 U-b가 대조 축 기계의 판정을 미뤄 두고(그 조건이 이 코퍼스에서 어떻게 걸리는지를
    // 잰 뒤에 판정한다) 소유를 `K-006`에 뒀다. 여기 코퍼스는 `docs/` 아래 마크다운뿐이라 `S-4`
    // 보다 좁고 방향이 오탐이므로, 지금 계수를 위반 수로 강제하면 미뤄 둔 판정을 이 게이트가
    // 대신 내린다. **조건을 느슨하게 고쳐 green을 만드는 길은 열지 않는다** — 그러면 처분이
    // 끝났는지 아무도 못 가른다. 카드가 닫히면 `todo`를 떼는 것만으로 이 단언이 다시 선다.
    //
    // 2026-08-18 관측: 자리 전량에서 769건(별표·평문 합). 파일별 상위는
    // `cli/test/doc-citation.contract.test.ts` 68 · `cli/test/doc-status.contract.test.ts` 67 ·
    // `cli/test/compaction-integration.test.ts` 42.
    //
    // 근거: §3.4 — 인용부호는 셋이다. §6 U-b 2026-08-18 — 대조 축의 단위는 파일이고 머리로
    // 좁힌 대조 기계는 두지 않는다.
    //
    // 모집단은 자리 전체다(축 0). 오늘 이 덮개를 드는 다른 기계는 형제 하나뿐이고 그것도
    // 별표 형식만, 대상 한 파일만 본다.
    // **평문 큰따옴표를 파일 축으로 재는 자리는 여기가 유일하다** — 소유는 `K-006`이고
    // 규모는 `plans/20260818-ub-qa.md` U-C가 든다.
    const misses: string[] = [];
    for (const [name, source] of AUDIBLE) {
      for (const run of commentRunsOrFail(source, name)) {
        const masked = run.masked;
        for (const match of masked.matchAll(/\*"[^"]+"\*/g)) {
          const quote = run.text.slice(match.index + 2, match.index + match[0].length - 2);
          if (!inCorpus(quote))
            misses.push(`${name}:${run.lineAt(match.index)} [별표] ${norm(quote).slice(0, 60)}`);
        }
        const plain = masked.replace(/\*"[^"]+"\*/g, (span) => " ".repeat(span.length));
        for (const match of plain.matchAll(/["“][^"”\n]{3,}["”]/g)) {
          const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
          if (/[가-힣]/.test(quote) && !inCorpus(quote))
            misses.push(`${name}:${run.lineAt(match.index)} [평문] ${norm(quote).slice(0, 60)}`);
        }
      }
    }
    expect(misses, `파일 축 대조 거짓 ${misses.length}건`).toEqual([]);
  });

  it("역검증 — 같은 덮개가 심은 별표·평문 어긋남을 잡고 코드 줄 리터럴은 안 잡는다", () => {
    // 표본 앞뒤에 짝 잃은 백틱과 정상 스팬을 둔다 — 마스킹을 덩어리를 접은 뒤에 걸면 둘이
    // 짝지어 그 사이를 통째로 덮고 아래 두 자리가 함께 0건이 된다(K-160의 고장 형태).
    const planted = [
      "/** 머리 */",
      "",
      "// 짝 없는 백틱 하나 ` 가 앞에 있어도",
      '// 표본 *"코퍼스에 없는 합성 문면"* 끝',
      '// 표본 "또 다른 합성 문면" 끝',
      "// 그리고 뒤에 `정상 스팬` 하나가 온다.",
      'const literal = "코드 줄의 리터럴은 인용부호가 아니다";',
    ].join("\n");
    const hits: string[] = [];
    for (const run of commentRunsOrFail(planted, "표본")) {
      const masked = run.masked;
      for (const match of masked.matchAll(/\*"[^"]+"\*/g)) {
        const quote = run.text.slice(match.index + 2, match.index + match[0].length - 2);
        if (!inCorpus(quote)) hits.push(quote);
      }
      const plain = masked.replace(/\*"[^"]+"\*/g, (span) => " ".repeat(span.length));
      for (const match of plain.matchAll(/["“][^"”\n]{3,}["”]/g)) {
        const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
        if (/[가-힣]/.test(quote) && !inCorpus(quote)) hits.push(quote);
      }
    }
    expect(hits).toEqual(["코퍼스에 없는 합성 문면", "또 다른 합성 문면"]);
  });

  const ANCHOR = " * 이 주석은 인용부호를 쓰지 않는다";
  const PLANT = ' * 표본 «심은 지목»과 "심은 인용"';
  /**
   * 심기 표본은 **자리 안에서 앵커 선언을 든 파일**이다. 모집단이 자리 전체이므로 선언이 없는
   * 파일은 아래 `UNDECLARED`로 남아 red가 된다 — §6 U-b가 계약의 자리를 각 파일 자신의 머리에
   * 두고 강제 선언 축을 먼저 두라고 적는다. 그 축의 **처분**(선언을 넣는 것)은 이 파일이
   * 아니라 `K-006`의 자리이므로 여기서는 목록으로만 든다.
   */
  const DECLARED = TARGETS.filter(([, source]) => source.includes(ANCHOR));
  const UNDECLARED = TARGETS.filter(([, source]) => !source.includes(ANCHOR)).map(([name]) => name);

  it("적합 — 한 블록 주석 안의 별표 없는 계속 줄은 머리를 안 끊는다", () => {
    // 근거: §6 U-b 2026-08-18 후속 판정 — «주석 줄»의 소속은 렉싱이 정하고 줄 모양(별표
    // 접두)이 아니다. 주석 토큰 안의 모든 줄이 그 덩어리에 들고, 별표로 시작하지 않는 계속
    // 줄은 덩어리를 안 끊는다. 끊는 것은 주석 토큰의 끝뿐이다.
    //
    // 아래 배치는 블록 주석 안이라 렉싱으로는 주석 줄이고 줄 모양으로는 아니다. 줄 모양으로
    // 읽으면 **머리가 조용히 짧아지고** 뒤쪽 주장이 안 재진 채 그린이 된다(`ARCHITECTURE.md`
    // §2.6 가시적 결과). 자리 안에서 선언을 든 파일 전부에 건다.
    expect(
      DECLARED.length,
      "앵커 선언을 든 파일이 0이다 — 심을 자리가 없으면 통과가 아니다",
    ).toBeGreaterThan(0);
    for (const [name, source] of DECLARED) {
      const planted = source.replace(
        ANCHOR,
        [ANCHOR, '   표본 «심은 지목»과 "심은 인용"'].join("\n"),
      );
      expect(planted).not.toBe(source);
      expect(targetHeadCut(planted), `${name}: 대상의 절단`).toMatch(/[«»]/);
      expect(targetHeadCut(planted), `${name}: 대상의 절단`).toMatch(/["“”]/);
      expect(targetHeadCut(planted), `${name}: 계약 술어와 갈린다`).toBe(contractHeadRaw(planted));

      // 대비쌍 — 죽은 줄 모양 술어에서는 같은 배치가 머리 밖으로 밀린다. 첫 닫기 술어는
      // 여기서 갈리지 않는다(심은 자리가 머리 블록의 닫기보다 앞이다) — 그쪽 대비쌍은 축 1이 든다.
      expect(lineShapeHead(planted), `${name}: 줄 모양 술어`).not.toMatch(/[«»]/);
    }
  });

  it.todo("[K-006 대기] 자리 안 파일의 머리가 이 계약의 선언을 든다 (강제 선언 축)", () => {
    // **목록은 그대로 두고 실행만 미룬다.** §6 U-b가 계약의 자리를 각 파일 자신의 머리에 두고
    // 먼저 두는 것은 강제 선언 축이라 적었으나, 그 축을 세우는 것(선언을 넣는 것)의 소유는
    // `K-006`이다. 위 심기 축은 선언을 든 파일에서만 술어를 재므로 이 목록이 비어야 그 축의
    // 모집단도 자리 전체가 된다 — 즉 이 `todo`가 위 축의 모집단 상한을 함께 든다.
    //
    // 2026-08-18 관측: 자리 135파일 중 130파일에 선언이 없다.
    expect(UNDECLARED, `머리 선언이 없는 자리 안 파일 ${UNDECLARED.length}건 (소유 K-006)`).toEqual(
      [],
    );
  });

  it("적합 — 블록 주석 안의 완전 공백 줄은 머리를 안 끊는다", () => {
    // 근거: 같은 판정 — 블록 주석 안의 완전 공백 줄도 덩어리를 안 끊는다. 빈 주석 줄을 안
    // 끊기로 한 앞 판정과 같은 방향이다: 렌더링상 구분되지 않는 두 형태를 반대로 가르지 않는다.
    //
    // **바깥 경계는 그대로다** — 주석 밖의 빈 줄은 여전히 끊는다. 그 반대쪽은
    // `self-head-scope.qa.test.ts`의 역검증이 든다.
    expect(
      DECLARED.length,
      "앵커 선언을 든 파일이 0이다 — 심을 자리가 없으면 통과가 아니다",
    ).toBeGreaterThan(0);
    for (const [name, source] of DECLARED) {
      const planted = source.replace(ANCHOR, [ANCHOR, "", PLANT].join("\n"));
      expect(planted).not.toBe(source);
      expect(targetHeadCut(planted), `${name}: 대상의 절단`).toMatch(/[«»]/);
      expect(targetHeadCut(planted), `${name}: 대상의 절단`).toMatch(/["“”]/);
      expect(targetHeadCut(planted), `${name}: 계약 술어와 갈린다`).toBe(contractHeadRaw(planted));

      expect(lineShapeHead(planted), `${name}: 줄 모양 술어`).not.toMatch(/[«»]/);

      // 주석을 먼저 닫고 밖에 빈 줄을 두면 그대로 끊긴다 — 안쪽과 바깥쪽을 함께 고정한다.
      const outside = source.replace(ANCHOR, [" */", "", "/**", PLANT, ANCHOR].join("\n"));
      expect(outside).not.toBe(source);
      expect(targetHeadCut(outside), `${name}: 주석 밖 빈 줄`).not.toMatch(/[«»]/);
    }
  });

  it("적합 — 이 파일 머리가 인용부호를 쓰지 않는다는 주장은 참이다 (자기 축)", () => {
    // 주장이 실재해야 이 검사가 산다 — 선언 문장을 지우면 아래 둘은 잴 것이 없는 채로
    // 그린이 되므로 그 문장 자신을 먼저 짚는다(`ARCHITECTURE.md` §2.6 가시적 결과).
    const header = contractHead(SELF_SOURCE);
    expect(header.length).toBeGreaterThan(0);
    expect(header).toContain("이 주석은 인용부호를 쓰지 않는다");
    expect(header).not.toMatch(/[«»]/);
    expect(header).not.toMatch(/["“”]/);

    // 역검증 — 같은 술어가 합성 위반을 잡는다.
    expect(`${header} 표본 «지목»`).toMatch(/[«»]/);
    expect(`${header} 표본 "인용"`).toMatch(/["“”]/);
  });
});
