/**
 * 독립 QA — `DOC-CITATION.md` §6 U-b의 2026-08-17·2026-08-18 판정 블록이 정한 **판별 술어**를
 * 그 판정을 착지시킨 다섯 파일이 실제로 만족하는가, 그리고 그 가드들이 술어의 위반을 실제로
 * 잡는가.
 *
 * 검증 대상 다섯:
 * - `packages/providers/test/cited-noncircular.qa.test.ts`
 * - `packages/providers/test/self-head-scope.qa.test.ts`
 * - `packages/providers/test/ub-guard-scope.qa.test.ts`
 * - `packages/providers/test/docs-gate-parity.qa.test.ts`
 * - `packages/cli/test/renderer-literal-policy.qa.test.ts`
 *
 * **기대값의 출처는 정본이다** — §6 U-b의 2026-08-17 판정과 2026-08-18 판정 셋(단위·소속 술어
 * 층위·꼬리 주석과 렉싱 수단), 그리고 §3.4의 `Q-1`~`Q-7`·`S-1`~`S-3`·`N-1`~`N-4`다. 다섯
 * 파일의 구현을 읽어 기대값을 정하지 않는다. 대상이 문서와 다르면 문서 편에 서고 red를 그대로
 * 남긴다.
 *
 * ## 어떻게 대상을 부르는가
 *
 * 대상의 **원문을 잘라 그 자리에서 transpile 해 부른다.** 술어를 여기 베끼면 대상이 옛 술어로
 * 돌아가도 그린이므로, 검증되는 것은 언제나 대상 파일의 현재 텍스트여야 한다. 구간 표지가
 * 사라지면 던진다(fail-closed). 판정 쪽은 반대로 **대상을 안 부르고 정본에서 새로 도출한다.**
 *
 * ## 처분 이력 — 2026-08-18에 이 파일이 재는 것이 바뀌었다
 *
 * 최초 판은 발견 넷을 `it.skip`으로 들고 각각 `K-159`·`K-160`·`K-161`·`K-162`에 넘겼다. 네
 * 카드의 처분이 같은 날 착지했으므로 **이 파일은 처분 후 상태를 재도록 다시 쓰였다.** `skip`은
 * 게이트를 인질로 잡으므로 쓰지 않는다 — 처분이 안 끝난 축은 `it.todo`와 소유 카드 표시로
 * 남긴다.
 *
 * 여기 남는 축 여덟:
 *
 * 1. **소속 술어가 렉싱인가** — 렉서와 문맥 없는 스캐너의 답이 갈리는 입력으로 대상의 술어를
 *    부른다. 술어를 정규식 스캐너로 되돌리면 red다.
 * 2. **꼬리 주석을 단 코드 줄이 덩어리를 안 끊는가** — 2026-08-18 셋째 판정의 첫 문단.
 * 3. **머리 배선이 마스킹을 되돌리지 않는가** — 같은 문단의 뒷절. `K-159`의 처분 자리다.
 * 4. **짝 잃은 코드 표기가 대조 덮개를 끄는가** — `Q-7`·`Q-1`. `K-160`의 처분 자리다.
 * 5. **겹화살괄호 갈래의 모집단이 자리 전체인가** — `K-161`의 처분 자리다.
 * 6. **수단 없는 대상에서 조용한 0을 내는가** — 2026-08-18 셋째 판정의 둘째 문단. `K-162`.
 * 7. **렉싱 수단의 분기가 한 자리인가** — 같은 문단. 소유는 `K-006`.
 * 8. **이 파일 자신의 머리** — 자기 축.
 *
 * 이 주석은 인용부호를 쓰지 않는다. 근거는 §6 U-b 2026-08-17 판정이 대조 축을 각 패키지의
 * 테스트 디렉터리까지 넓혔고 이 파일이 그 안이기 때문이다. 재는 범위는 이 주석 전체이고,
 * 무엇이 한 머리인가는 같은 절의 2026-08-18 판정이 든다. 축 8이 이 선언을 잰다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 인용부호 구간 파서의 **정본**은 이 모듈이다(§6 U-e 2026-08-15 판정). 코드 표기 마스킹을 손으로
// 다시 짜면 복제가 원본과 같은 눈을 갖는다 — 형제 둘이 같은 근거로 이 모듈을 적재한다.
import { maskCodeSpans } from "../../../scripts/doc-citation.mjs";

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript") as typeof import("typescript");

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const CITED = readFileSync(path("./cited-noncircular.qa.test.ts"), "utf8");
const SELF_HEAD = readFileSync(path("./self-head-scope.qa.test.ts"), "utf8");
const UB_GUARD = readFileSync(path("./ub-guard-scope.qa.test.ts"), "utf8");
const PARITY = readFileSync(path("./docs-gate-parity.qa.test.ts"), "utf8");
const RENDERER = readFileSync(path("../../cli/test/renderer-literal-policy.qa.test.ts"), "utf8");
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");
const DOCS_DIR = path("../../../docs/");
const PACKAGES_DIR = path("../../");

/* ------------------------------------------------------------------------ *
 * 계약 술어 — 대상에서 베끼지 않고 정본 문면에서 도출한다
 * ------------------------------------------------------------------------ */

/** `D-2` — 정규화는 공백만 */
const norm = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * `S-4` 코퍼스 중 우리 문서 트리. 동결 레퍼런스 트리와 지목된 기록·리비전은 빠져 있고 그
 * 좁힘의 방향은 red다(정당한 인용이 오탐). 소유는 `K-006`이 든다.
 */
const CORPUS = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .map((name) => norm(readFileSync(`${DOCS_DIR}${name}`, "utf8")));
const inCorpus = (quote: string): boolean => CORPUS.some((doc) => doc.includes(norm(quote)));

/** `S-5`의 지목 부류를 표기로 근사한다. 넓히는 방향이라 틀려도 위반을 안 늘린다 */
const POINT = /[A-Za-z0-9-]+\.md|§\s?\d|K-\d{3}|\b[A-Z]-\d\b|plans\/|devnotes\//;

type Spans = (source: string) => { pos: number; end: number }[];

/** 소속을 렉싱이 정하는 술어 — 2026-08-18 둘째 판정 그대로 */
const lexedSpans: Spans = (source) => {
  const file = ts.createSourceFile("scan.ts", source, ts.ScriptTarget.Latest, true);
  const found = new Map<number, { pos: number; end: number }>();
  const walk = (node: import("typescript").Node): void => {
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
};

/** 정본이 죽였다고 적은 술어 하나 — 문맥 없는 정규식 스캐너. 축 1의 대조군이다 */
const scannedSpans: Spans = (source) => {
  const out: { pos: number; end: number }[] = [];
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  let match = pattern.exec(source);
  while (match !== null) {
    out.push({ pos: match.index, end: match.index + match[0].length });
    match = pattern.exec(source);
  }
  return out;
};

/** 정본이 죽였다고 적은 술어 둘 — 줄 모양(별표 접두). 축 2의 대조군이다 */
const lineShapeHead = (source: string): string => {
  let end = 0;
  for (const line of source.split("\n")) {
    if (!/^\s*(\/\/|\*|\/\*)/.test(line)) break;
    end += line.length + 1;
  }
  return source.slice(0, end);
};

type Run = {
  readonly text: string;
  /** 코드 표기를 덮은 같은 길이의 텍스트 — `Q-1`. 접기 **전에** 걸린다 */
  readonly masked: string;
  readonly startLine: number;
  lineAt(offset: number): number;
};

/** 빈 줄 없이 이어지는 주석 줄의 덩어리 하나가 한 단위다 — 2026-08-18 첫 판정 */
function runsBy(spansOf: Spans, source: string): Run[] {
  const raw: {
    text: string;
    masked: string;
    marks: { at: number; offset: number }[];
    startLine: number;
  }[] = [];
  let previousEnd = -1;
  for (const span of spansOf(source)) {
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
        // `Q-1`의 코드 스팬은 상한이 줄이므로(정본 파서가 줄을 넘는 짝을 안 인정한다) 마스킹은
        // 줄이 살아 있는 자리에서 걸어야 한다. 접은 뒤에 걸면 짝 잃은 백틱 하나가 뒷줄의 정상
        // 스팬과 짝지어 그 사이를 덮는다 — 축 4가 그 자리를 잰다.
        run.masked += ` ${maskCodeSpans(stripped)}`;
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
 * 머리의 **원문 구간** 판. 첫 줄에서 시작하는 덩어리이고, 주석 밖 글자는 공백으로 덮는다 —
 * 코드 파일에서는 주석 안만 잰다(2026-08-18 첫 판정). 자리와 길이를 보존한다.
 */
function headRawBy(spansOf: Spans, source: string): string {
  const spans = spansOf(source);
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

const contractRuns = (source: string): Run[] => runsBy(lexedSpans, source);
const contractHeadRaw = (source: string): string => headRawBy(lexedSpans, source);

/** 렉서가 이 원문을 읽었는가. 파싱 진단이 0이면 읽은 것이다 */
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
 * 아래 판별기는 위반 목록형이라 덩어리 0을 빈 목록으로 낸다. **잴 대상이 없는 것**과 **잴
 * 수단이 없는 것**을 술어가 가른다 — 2026-08-18 셋째 판정이 뒤를 `Q-7`대로 실패로 두었다.
 * 이 검증기 자신이 그 조용한 0을 내면 자기가 재는 계약을 자기가 어긴다.
 */
function contractRunsOrFail(source: string, label: string): Run[] {
  const runs = contractRuns(source);
  if (runs.length === 0 && !lexed(source))
    throw new Error(`${label}: 렉서가 원문을 못 읽었다 — 덩어리 0을 위반 0으로 읽지 않는다`);
  return runs;
}

/** 거터를 벗겨 접은 값. 머리 술어와 덩어리 술어가 같은 자리를 끊는지를 이 값으로 대조한다 */
const gutterless = (raw: string): string =>
  norm(
    raw
      .split("\n")
      .map((line) => line.replace(/^\s*(\/\/|\*\/?|\/\*\*?)\s?/, ""))
      .join(" "),
  );

type Miss = { readonly line: number; readonly quote: string };

/**
 * 지목이 같은 덩어리에 있고 대조가 거짓인 겹화살괄호 자리. 등급은 안 매긴다(`S-2`) — 목록이
 * 비어야 할 뿐이다. 머리를 뺄 것인가는 부르는 쪽이 정한다.
 */
function guillemetMisses(source: string, skipHead: boolean, label = "표본"): Miss[] {
  const found: Miss[] = [];
  for (const run of contractRunsOrFail(source, label)) {
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
 * 자리 열거 — 손 목록을 두지 않는다
 * ------------------------------------------------------------------------ */

/** 2026-08-17 판정이 그은 자리. 별표 글롭을 그대로 적으면 이 블록 주석이 여기서 닫힌다 */
const PLACE = /^[^/]+\/test\/(?:[^/]+\/)*[^/]+\.ts$/;

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

const PLACE_FILES: readonly (readonly [string, string])[] = placeFiles().map(
  (name) => [name, readFileSync(`${PACKAGES_DIR}${name}`, "utf8")] as const,
);

/* ------------------------------------------------------------------------ *
 * 대상 적재 — 원문을 잘라 그 자리에서 부른다. 표지가 없으면 던진다(fail-closed)
 * ------------------------------------------------------------------------ */

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

/** 대상의 슬라이스를 그 자리에서 부른다. `ts`·`maskCodeSpans`는 주입한다(사본을 두지 않는다) */
function load<T>(slice: string, exportLine: string, label: string): T {
  const loaded: Record<string, unknown> = {};
  new Function("exports", "ts", "maskCodeSpans", transpile(`${slice}\n${exportLine}`))(
    loaded,
    ts,
    maskCodeSpans,
  );
  const value = loaded.value;
  if (value === undefined) throw new Error(`${label}: 적재에 실패했다`);
  return value as T;
}

/** 대상의 소속 술어 — 자리 안 네 파일이 각각 든 사본을 전부 뽑는다(축 7이 대조한다) */
const SPAN_COPIES: readonly (readonly [string, Spans])[] = (
  [
    ["cited-noncircular", CITED, "\nconst PROVIDERS_PATH"],
    ["self-head-scope", SELF_HEAD, "\n/**"],
    ["ub-guard-scope", UB_GUARD, "\n/**"],
    ["renderer-literal-policy", RENDERER, "\n/* ---"],
  ] as const
).map(
  ([name, source, to]) =>
    [
      name,
      load<Spans>(
        region(source, "function commentTokenSpans", to, `${name} 소속 술어`),
        "exports.value = commentTokenSpans;",
        `${name} 소속 술어`,
      ),
    ] as const,
);

const targetSpans = SPAN_COPIES[0]?.[1] as Spans;

/** 대상의 머리 절단 */
const targetHeadCut = load<(source: string) => string>(
  region(CITED, "function leadingCommentBlock", "\nconst PROVIDERS_PATH", "대상 머리 절단"),
  "exports.value = leadingCommentBlock;",
  "대상 머리 절단",
);

/**
 * 대상의 형제 머리 **배선**을 원문의 두 선언으로 재현한다. 절단 함수만 부르면 배선이 그 값을
 * 되돌리는 갈래가 안 재진다 — 2026-08-18에 실물로 관측된 형태가 그것이다.
 */
const wireHead = load<
  (source: string, cut: (source: string) => string) => { HEADER: string; BODY: string }
>(
  [
    "const wire = (TARGET_SOURCE: string, leadingCommentBlock: (s: string) => string) => {",
    region(CITED, "const HEADER = ", "\n", "대상 머리 배선"),
    region(CITED, "const BODY = ", "\n", "대상 본문 배선"),
    "return { HEADER, BODY };",
    "};",
  ].join("\n"),
  "exports.value = wire;",
  "대상 머리 배선",
);
/** 배선이 부르는 절단도 대상의 것이다 — 사본을 두면 대상이 돌아가도 여기가 그린이다 */
const targetHeadWiring = (source: string): { HEADER: string; BODY: string } =>
  wireHead(source, targetHeadCut);

/** 대상의 덩어리 술어와 그 fail-closed 판 — 마스킹이 접기 전에 걸리는지를 이 값이 든다 */
const UB_RUNS = region(
  UB_GUARD,
  "function commentTokenSpans",
  "/** 2026-08-17까지 쓰이던 술어",
  "대상 덩어리 술어",
);
const targetRuns = load<(source: string) => Run[]>(
  UB_RUNS,
  "exports.value = commentRuns;",
  "대상 덩어리 술어",
);
const targetRunsOrFail = load<(source: string, label: string) => Run[]>(
  UB_RUNS,
  "exports.value = commentRunsOrFail;",
  "대상 fail-closed 술어",
);

/* ------------------------------------------------------------------------ *
 * 축 1 — 소속 술어가 렉싱인가
 * ------------------------------------------------------------------------ */

/**
 * 렉서와 문맥 없는 스캐너의 답이 갈리는 입력. 세 줄짜리 리터럴이 주석 여닫 표기를 담고 있어
 * 스캐너는 그것을 한 블록 주석으로 읽고 덩어리를 이어 붙인다.
 */
const LEXING_DIVERGENT = [
  "/**",
  " * 머리 선언 — 이 주석은 인용부호를 쓰지 않는다",
  " */",
  'const opener = "/*";',
  'const closer = "*/";',
  "// 다음 덩어리 «심은 지목»",
].join("\n");

describe("DOC-CITATION §6 U-b 2026-08-18 — 주석 줄의 소속은 렉싱이 정한다", () => {
  it("적합 — 대상의 소속 술어가 렉서의 답을 내고 문맥 없는 스캐너의 답을 안 낸다", () => {
    // 근거: §6 U-b 2026-08-18 둘째 판정 — 소속은 렉싱이 정하고 줄 모양이 아니다. 주석 토큰
    // 안의 모든 줄이 그 덩어리에 들고 끊는 것은 토큰의 끝뿐이다. 셋째 판정이 그 수단을
    // 확장자가 고르되 `.ts`·`.mjs`는 타입스크립트 파서가 읽는 것으로 못박았다.
    const byLexer = headRawBy(lexedSpans, LEXING_DIVERGENT);
    const byScanner = headRawBy(scannedSpans, LEXING_DIVERGENT);

    // 전제 — 이 입력에서 두 술어가 실제로 갈린다. 안 갈리면 아래 단언이 공허하다.
    expect(byLexer, "표본이 두 술어를 못 가른다 — 이 검증기를 먼저 고친다").not.toBe(byScanner);
    expect(/[«»]/.test(byScanner), "스캐너 쪽은 리터럴을 넘어 이어 붙인다").toBe(true);
    expect(/[«»]/.test(byLexer), "렉서 쪽은 리터럴에서 끊는다").toBe(false);

    // 대상의 술어가 어느 쪽인가.
    expect(headRawBy(targetSpans, LEXING_DIVERGENT)).toBe(byLexer);
    expect(targetHeadCut(LEXING_DIVERGENT)).toBe(byLexer);
  });

  it("적합 — 대상의 소속 술어가 리터럴 안의 표기를 주석으로 세지 않는다", () => {
    // 같은 판정 — 이 레포에서 26파일이 그렇게 갈렸다는 것이 대상 파일들의 근거다. 술어를
    // 스팬 **수**로도 짚어 둔다: 머리 값이 우연히 같아지는 자리에서도 이 축은 갈린다.
    for (const [name, source] of [
      ["cited-noncircular", CITED],
      ["self-head-scope", SELF_HEAD],
      ["ub-guard-scope", UB_GUARD],
      ["docs-gate-parity", PARITY],
      ["renderer-literal-policy", RENDERER],
    ] as const) {
      expect(
        targetSpans(source).map((span) => span.pos),
        `${name}: 소속이 렉싱이 아니다`,
      ).toEqual(lexedSpans(source).map((span) => span.pos));
    }

    // 역검증 — 같은 대조가 스캐너 술어를 실제로 잡는다.
    expect(scannedSpans(SELF_HEAD).length).not.toBe(lexedSpans(SELF_HEAD).length);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 2 — 꼬리 주석을 단 코드 줄이 덩어리를 안 끊는가
 * ------------------------------------------------------------------------ */

/** 코드 줄에 꼬리 주석이 붙은 배치. 그 줄의 리터럴은 대조 모집단 밖이어야 한다 */
const TAIL_SENTINEL = "ZZ리터럴표본ZZ";
const TAIL_COMMENT = [
  "/**",
  " * 머리 선언 — 이 주석은 인용부호를 쓰지 않는다",
  " */",
  `const sample = "${TAIL_SENTINEL}"; // 꼬리 주석은 결백하다`,
  "// 꼬리 뒤의 다음 줄도 같은 덩어리다",
].join("\n");

describe("DOC-CITATION §6 U-b 2026-08-18 — 꼬리 주석을 단 코드 줄은 덩어리를 안 끊는다", () => {
  it("적합 — 대상의 절단이 꼬리 주석 줄을 넘어 이어진다", () => {
    // 근거: §6 U-b 2026-08-18 셋째 판정 — 코드 뒤에 붙은 주석도 주석 토큰이므로 소속을
    // 정하는 것은 렉싱이고, 그 줄이 코드를 함께 담았다는 것은 줄 모양의 사정이다. 반대로
    // 읽으면 둘째 판정이 죽인 줄 모양 술어가 이름만 바꿔 돌아온다.
    const head = targetHeadCut(TAIL_COMMENT);
    expect(head, "대상의 절단이 계약 술어와 갈린다").toBe(contractHeadRaw(TAIL_COMMENT));
    expect(head, "꼬리 주석 줄에서 덩어리가 끊겼다").toContain("꼬리 뒤의 다음 줄");

    // 대비쌍 — 죽은 줄 모양 술어에서는 같은 배치가 꼬리 주석 줄 앞에서 끊긴다. 이 짝이 없으면
    // 위 단언은 줄 모양으로 되돌린 술어에서도 그린일 수 있다.
    expect(lineShapeHead(TAIL_COMMENT)).not.toContain("꼬리 뒤의 다음 줄");
  });

  it("적합 — 그 줄의 주석 밖 글자는 절단 값에 안 실린다 (마스킹이 대조 앞에 선다)", () => {
    // 근거: 같은 문단 — 덩어리가 코드 줄까지 자라면 그 줄의 주석 밖 글자가 함께 실리므로,
    // 그것을 덮는 마스킹이 대조 앞에 서지 않으면 코드 텍스트가 인용 주장을 만족시켜 미열거가
    // 조용히 덮인다. 자리와 길이는 보존되어야 부르는 쪽의 길이 계산이 그대로 선다.
    const head = targetHeadCut(TAIL_COMMENT);
    expect(head, "리터럴이 절단 값에 실렸다").not.toContain(TAIL_SENTINEL);
    expect(head).toContain("꼬리 주석은 결백하다");
    expect(head.length, "마스킹이 자리와 길이를 안 보존한다").toBe(
      TAIL_COMMENT.indexOf("// 꼬리 뒤의 다음 줄도 같은 덩어리다") +
        "// 꼬리 뒤의 다음 줄도 같은 덩어리다".length,
    );

    // 덩어리 술어 쪽도 같다 — 담기는 문면은 주석 안뿐이다.
    const runs = targetRuns(TAIL_COMMENT);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.text).not.toContain(TAIL_SENTINEL);
    expect(runs[0]?.text).toContain("꼬리 뒤의 다음 줄");
  });

  it("적합 — 머리를 끊는 술어와 인용 단위를 끊는 술어가 같은 자리를 끊는다", () => {
    // 근거: §6 U-b 2026-08-18 첫 판정 — 코드 파일에서 인용 한 건의 경계도, 각 파일 자신의
    // 머리도 같은 술어로 끊는다. 두 술어를 두면 머리를 자르는 파서와 인용을 끊는 파서가
    // 갈리므로 하나로 둔다고 그 문단이 근거를 든다.
    //
    // 대상 둘은 자리마다 따로 구현돼 있으므로 값이 같은지를 밖에서 잰다. 갈리면 어느 쪽이
    // 옳은지가 문서로 안 갈린다.
    for (const [name, source] of [
      ["cited-noncircular", CITED],
      ["self-head-scope", SELF_HEAD],
      ["ub-guard-scope", UB_GUARD],
      ["docs-gate-parity", PARITY],
      ["renderer-literal-policy", RENDERER],
      ["tail", TAIL_COMMENT],
    ] as const) {
      const first = contractRunsOrFail(source, name)[0];
      expect(first?.startLine, `${name}: 첫 덩어리가 첫 줄에서 시작하지 않는다`).toBe(1);
      expect(gutterless(targetHeadCut(source)), `${name}: 두 술어가 갈린다`).toBe(
        norm(first?.text ?? ""),
      );
    }
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — 머리 배선이 마스킹을 되돌리지 않는가 (K-159 처분 자리)
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b 2026-08-18 — 코드 파일에서는 주석 안만 잰다", () => {
  /** 형제 원문에 없는 표지. 리터럴 안에만 심으므로 대조 모집단 밖이다 */
  const SENTINEL = "ZZ리터럴표본ZZ";

  /** 머리 블록 바로 뒤에 리터럴을 담은 코드 줄과 결백한 꼬리 주석을 심는다 */
  function plantLiteralAfterHead(source: string): string {
    const headEnd = source.indexOf("*/") + 2;
    const planted = `${source.slice(0, headEnd)}\nconst sample = ${JSON.stringify(
      SENTINEL,
    )}; // 꼬리 주석은 결백하다${source.slice(headEnd)}`;
    if (planted === source) throw new Error("표지가 사라졌다 — 이 검증기를 먼저 고친다");
    return planted;
  }

  it("적합 — 형제 머리 배선이 재는 값에 주석 밖 글자가 안 섞인다", () => {
    // 근거: §6 U-b 2026-08-18 셋째 판정 — 마스킹한 값의 길이만 취해 원문을 다시 자르면 그
    // 마스킹이 통째로 되돌려진다. 그 되돌림이 2026-08-18에 실물로 관측됐고 `K-159`가 들었다.
    //
    // 재는 것은 절단 함수가 아니라 **배선**이다. 대상 원문의 두 선언을 그대로 뽑아 부른다.
    const planted = plantLiteralAfterHead(PARITY);

    // 전제 — 심은 리터럴이 덩어리 안이고 계약 술어는 그것을 덮는다. 안 그러면 아래가 공허하다.
    expect(targetHeadCut(planted), "심은 자리가 덩어리 밖이면 아래가 공허하다").toContain(
      "꼬리 주석은 결백하다",
    );
    expect(contractHeadRaw(planted), "계약 술어는 주석 밖을 덮는다").not.toContain(SENTINEL);

    const wired = targetHeadWiring(planted);
    expect(wired.HEADER, "형제 머리 배선이 주석 밖 글자를 잰다").not.toContain(SENTINEL);
    expect(wired.HEADER, "배선이 계약 술어와 갈린다").toBe(contractHeadRaw(planted));

    // 역검증 — 같은 대조가 되돌린 배선을 실제로 잡는다. 이 짝이 없으면 위 단언은 길이만 취해
    // 다시 자르는 배선에서도 그린일 수 있다.
    expect(planted.slice(0, wired.HEADER.length)).toContain(SENTINEL);
  });

  it("적합 — 본문 분할이 머리 길이로 그대로 서고 머리와 안 겹친다", () => {
    // 마스킹이 자리와 길이를 보존하므로 본문은 머리 뒤에서 시작해야 한다. 길이가 흔들리면
    // 미열거 대조의 모집단이 머리를 다시 삼키거나 앞이 잘린다.
    const planted = plantLiteralAfterHead(PARITY);
    const wired = targetHeadWiring(planted);
    expect(wired.HEADER.length + wired.BODY.length).toBe(planted.length);
    expect(wired.BODY).not.toContain(SENTINEL);
    expect(wired.BODY.startsWith("\n") || wired.BODY.startsWith("\r\n")).toBe(true);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 짝 잃은 코드 표기가 대조 덮개를 끄는가 (K-160 처분 자리)
 * ------------------------------------------------------------------------ */

/** 대상의 덩어리 술어를 그대로 써서 겹화살괄호 갈래를 잰다 — 마스킹만 대상 것이다 */
function missesWithTargetRuns(source: string): string[] {
  const hits: string[] = [];
  for (const run of targetRuns(source)) {
    if (run.startLine === 1) continue;
    if (!POINT.test(run.text)) continue;
    for (const match of run.masked.matchAll(/«[^»]{2,}»/g)) {
      const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
      if (!inCorpus(quote)) hits.push(norm(quote));
    }
  }
  return hits;
}

describe("DOC-CITATION §3.4 Q-7 — 짝이 어긋난 입력에서 조용한 0이 아니라 실패를 낸다", () => {
  const HEAD = "/** 머리 */\n\n";
  const VIOLATION = "¬코퍼스에 없는 조어¬".replace("¬", "«").replace("¬", "»");

  it("적합 — 짝 잃은 코드 표기가 뒤의 대조 거짓을 삼키지 않는다", () => {
    // 근거: §3.4 `Q-1` — 인라인 코드 스팬은 여는 백틱 런과 닫는 백틱 런의 길이가 같은 쌍이다.
    // 짝이 없으면 스팬이 아니므로 아무것도 안 덮는다. §3.4 `Q-7` — 가정이 깨지면 조용한 0이
    // 아니라 실패다. §6 U-e가 인용부호 구간 파서의 정본을 `scripts/doc-citation.mjs`로 못박았고
    // 그 파서의 짝짓기 상한이 줄이다.
    //
    // 고장 형태는 순서였다 — 덩어리를 접은 뒤에 마스킹을 걸면 줄 경계가 무효가 되어 앞줄의 짝
    // 없는 백틱이 뒷줄의 정상 스팬과 짝지어 그 사이를 통째로 덮는다. `K-160`이 그것을 들었다.
    const baseline = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — ${VIOLATION}가 있다`;
    expect(missesWithTargetRuns(baseline), "대조군이 비면 아래가 공허하다").toHaveLength(1);

    const silenced = [
      HEAD,
      "// 근거는 DOC-CITATION.md §3.4다 — 짝 없는 백틱 하나 ` 가 앞에 있어도",
      `// ${VIOLATION}가 잡히고 뒤에 \`정상 스팬\` 하나가 더 온다`,
    ].join("\n");
    expect(missesWithTargetRuns(silenced), "짝 잃은 백틱이 덮개를 껐다").toHaveLength(1);

    // 역검증 — 접은 뒤에 거는 옛 순서에서는 같은 입력이 0건이다. 이 짝이 없으면 위 단언은
    // 순서를 되돌린 구현에서도 그린일 수 있다.
    const folded = targetRuns(silenced)
      .filter((run) => run.startLine !== 1)
      .map((run) => maskCodeSpans(run.text));
    expect(folded.flatMap((text) => [...text.matchAll(/«[^»]{2,}»/g)])).toHaveLength(0);
  });

  it("역검증 — 짝이 맞는 코드 표기 안은 그대로 인용부호가 아니다 (Q-1)", () => {
    // 마스킹 자체를 없애라는 것이 아니다. `Q-1`은 그대로 서야 한다.
    const masked = `${HEAD}// DOC-CITATION.md §3.4의 \`${VIOLATION}\` 표기`;
    expect(missesWithTargetRuns(masked)).toEqual([]);

    // 런 길이가 술어의 일부다 — 이중 백틱 스팬이 홑 백틱을 담아도 통째로 덮인다. 안 맞추면
    // 마스킹이 중간에서 끊겨 유령 구간이 생긴다(`Q-1`의 근거).
    const doubled = `${HEAD}// DOC-CITATION.md §3.4의 \`\` \`${VIOLATION}\` \`\` 표기`;
    expect(missesWithTargetRuns(doubled)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 5 — 겹화살괄호 갈래의 모집단이 자리 전체인가 (K-161 처분 자리)
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b — 대조 축의 단위는 파일이고 자리는 테스트 디렉터리 전체다", () => {
  it("적합 — 자리 열거가 손 목록보다 넓고 형제들을 전부 든다", () => {
    // 근거: §6 U-b 2026-08-17 판정이 자리를 각 패키지의 테스트 디렉터리로 긋고, 2026-08-18
    // 판정이 대조 축의 단위를 파일로 못박았다. 손으로 유지되는 목록은 다음 파일이 늘 때
    // 조용히 낡는다 — `K-161`이 그 형태였다.
    expect(PLACE_FILES.length, "자리 열거가 비었다").toBeGreaterThan(0);
    const names = PLACE_FILES.map(([name]) => name);
    expect(names.filter((name) => !PLACE.test(name))).toEqual([]);
    for (const name of [
      "providers/test/cited-noncircular.qa.test.ts",
      "providers/test/self-head-scope.qa.test.ts",
      "providers/test/ub-guard-scope.qa.test.ts",
      "providers/test/docs-gate-parity.qa.test.ts",
      "providers/test/ub-predicate-scope.qa.test.ts",
      "cli/test/renderer-literal-policy.qa.test.ts",
    ])
      expect(names, `${name}: 자리 안인데 열거에 없다`).toContain(name);
  });

  it("적합 — 자리 안 어디에도 머리 밖 겹화살괄호 대조 거짓이 없다", () => {
    // 근거: §6 U-b 2026-08-18 — `S-1`~`S-3`은 `U-1`의 운용 규칙이므로 자리가 넓어지면 함께
    // 온다. 갈리면 벗기고 감사는 등급을 안 매긴다(`S-2`) — 목록이 비어야 할 뿐이다.
    //
    // 판별기는 대상의 것을 안 부르고 정본에서 새로 도출한 것이다.
    const misses: string[] = [];
    for (const [name, source] of PLACE_FILES)
      for (const miss of guillemetMisses(source, true, name))
        misses.push(`${name}:${miss.line} ${miss.quote.slice(0, 60)}`);
    expect(misses, `머리 밖 처분 대상 ${misses.length}건`).toEqual([]);
  });

  it.todo("[K-006 대기] 자리 안 파일의 **머리**도 같은 갈래의 모집단이다", () => {
    // **술어와 목록은 그대로 두고 실행만 미룬다.** 근거: §6 U-b 2026-08-18 — 대조 축의 단위는
    // 파일이고, 머리로 좁힌 대조 기계를 두지 않는 것과 같은 이유로 머리를 뺀 기계도 자리를 다
    // 안 덮는다. 오늘 자리를 재는 형제는 머리를 건너뛰고(`skipHead`), 머리 쪽은 강제 선언을
    // 든 파일에서만 심기 축으로 재진다 — 선언이 없는 파일의 머리는 어느 기계도 안 잰다.
    //
    // [미규정] 정본은 대조 축의 단위를 파일이라고만 적고 머리를 뺄 근거를 안 든다. 그러나 그
    // 처분(머리를 모집단에 넣는 것)의 소유는 대조 축 기계를 든 `K-006`이고, 여기 코퍼스가
    // `S-4`보다 좁아(오탐 방향) 지금 계수를 위반 수로 강제하면 그 카드가 미뤄 둔 판정을 이
    // 게이트가 대신 내린다. 등급은 안 매긴다(`S-2`).
    const misses: string[] = [];
    for (const [name, source] of PLACE_FILES)
      for (const miss of guillemetMisses(source, false, name))
        misses.push(`${name}:${miss.line} ${miss.quote.slice(0, 60)}`);
    expect(misses, `머리 포함 처분 대상 ${misses.length}건`).toEqual([]);
  });

  it("역검증 — 같은 판별기가 심은 자리를 잡고 코퍼스에 있는 문면은 안 잡는다", () => {
    const HEAD = "/** 머리 */\n\n";
    const drifted = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — «코퍼스에 없는 조어»`;
    expect(guillemetMisses(drifted, true)).toHaveLength(1);

    const exact = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — «갈리면 판정하지 말고 벗긴다»`;
    expect(guillemetMisses(exact, true)).toEqual([]);

    // 지목이 없는 덩어리는 모집단 밖이다(`S-3`).
    expect(guillemetMisses(`${HEAD}// 그냥 «코퍼스에 없는 조어»다`, true)).toEqual([]);

    // 덩어리를 넘겨 잇지 않는다 — 빈 줄을 사이에 둔 두 조각은 한 인용이 아니다(`N-1`의 단위).
    const broken = [HEAD, "// DOC-CITATION.md §3.4의 «코퍼스에 없는", "", "// 조어»다"].join("\n");
    expect(guillemetMisses(broken, true)).toEqual([]);

    // 형식 축을 안 넓힌 것은 대조를 면제하지 않는다(§6 U-b 2026-08-18 첫 판정). 경계 부호를
    // 붙이거나 생략 기호를 넣으면 `U-1`의 부분 문자열 성질이 깨지므로 넓힌 자리에서도 걸린다.
    const bordered = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — «갈리면 판정하지 말고 벗긴다!»`;
    expect(guillemetMisses(bordered, true)).toHaveLength(1);
    const elided = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — «갈리면 판정하지 … 벗긴다»`;
    expect(guillemetMisses(elided, true)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 6 — 수단 없는 대상에서 조용한 0을 내는가 (K-162 처분 자리)
 * ------------------------------------------------------------------------ */

/** 렉싱 수단이 없는 대상의 표본. 주석 표기가 `#`이라 타입스크립트 렉서로는 덩어리가 0이다 */
const SHELL = [
  "#!/usr/bin/env bash",
  "# 머리 선언 — 두 줄이 한 덩어리다",
  "# 이어지는 줄이 DOC-CITATION.md 6절을 든다",
  "set -euo pipefail",
  "",
].join("\n");

describe("DOC-CITATION §6 U-b 2026-08-18 — 수단이 없는 대상에서 조용한 0을 안 낸다", () => {
  it("적합 — 덩어리 0을 위반 0으로 안 읽는다 (렉서가 못 읽은 자리는 던진다)", () => {
    // 근거: §6 U-b 2026-08-18 셋째 판정 — 수단이 없는 대상에서 조용한 0을 내지 않는다.
    // 덩어리가 비면 `Q-7`대로 실패다. 2026-08-18 실측에서 셸 대상의 주석 스팬이 0이었고
    // 위반 목록형 단언이 그 0을 통과로 읽었다. `K-162`가 그것을 들었다.
    expect(targetRuns(SHELL), "표본이 렉서를 실제로 막지 못한다").toHaveLength(0);
    expect(() => targetRunsOrFail(SHELL, "표본")).toThrow();

    // 반대 방향 둘 — 주석이 있으면 안 던지고, 주석이 정말 없는 `.ts`도 안 던진다. 뒤가 없으면
    // 술어가 대상 부재와 수단 부재를 다시 뭉뚱그린 형태로 퇴화해도 그린이다.
    expect(() => targetRunsOrFail("// 주석\nconst bare = 1;\n", "표본")).not.toThrow();
    expect(targetRuns("const bare = 1;\n")).toHaveLength(0);
    expect(() => targetRunsOrFail("const bare = 1;\n", "표본")).not.toThrow();
  });

  it.todo("[K-006 대기] 셸 대상도 `#` 줄 주석으로 읽혀 덩어리가 나온다", () => {
    // **술어는 그대로 두고 실행만 미룬다.** 근거: §6 U-b 2026-08-18 셋째 판정 — 렉싱 수단은
    // 확장자가 고르고, 셸 스크립트는 `#`로 시작하는 줄 주석으로 읽되 인용부호 안의 `#`는
    // 주석이 아니므로 그 판별에 `Q-1`~`Q-3`의 부류가 먼저 걸린다. 같은 절이 그 구현의 착지를
    // `K-006`에 두었다.
    //
    // 오늘 다섯 파일의 술어는 타입스크립트 파서 하나에 고정돼 있다. `.mjs`는 그 파서가 읽으므로
    // 성립하고, 셸은 덩어리가 0으로 나온다 — 위 축이 그 0을 실패로 내는 것까지만 재고, 실제로
    // 읽는 것은 이 자리다. 자리 안(`packages/*/test/`)에 셸 실물이 없어 오늘 살아 있는 오판정은
    // 없으나, 같은 판정이 넓힌 `.claude/scripts/`에는 실물이 있고 소유는 `K-157`이 든다.
    expect(contractRuns(SHELL).length, "셸 주석이 덩어리로 안 나온다").toBeGreaterThan(0);
  });

  it("적합 — `.mjs`에서는 같은 술어가 성립한다 (확장자 축의 반대쪽)", () => {
    // 방향을 함께 고정한다 — 술어가 아무 입력에나 0을 내는 형태로 퇴화하지 않았다.
    const mjs = readFileSync(path("../../../scripts/doc-citation.mjs"), "utf8");
    expect(contractRuns(mjs).length).toBeGreaterThan(0);
    expect(targetSpans(mjs).map((span) => span.pos)).toEqual(lexedSpans(mjs).map((s) => s.pos));
  });
});

/* ------------------------------------------------------------------------ *
 * 축 7 — 렉싱 수단의 분기가 한 자리인가
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b 2026-08-18 — 렉싱 수단의 분기를 대상마다 복제하지 않는다", () => {
  it("적합 — 자리 안의 소속 술어 사본들이 한 답을 낸다", () => {
    // 근거: §6 U-b 2026-08-18 셋째 판정 — 소속 술어는 하나이고 수단만 확장자가 고른다. 사본이
    // 갈리면 같은 계약이 자리마다 다른 값을 내므로 어느 쪽이 옳은지 문서로 안 갈린다.
    expect(SPAN_COPIES.length, "사본 열거가 비었다").toBeGreaterThan(1);
    for (const [name, spans] of SPAN_COPIES)
      for (const [label, source] of [
        ["divergent", LEXING_DIVERGENT],
        ["tail", TAIL_COMMENT],
        ["ub-guard", UB_GUARD],
        ["parity", PARITY],
      ] as const)
        expect(
          spans(source).map((span) => span.pos),
          `${name} / ${label}: 사본이 계약 술어와 갈린다`,
        ).toEqual(lexedSpans(source).map((span) => span.pos));
  });

  it.todo("[K-006 대기] 소속 술어의 정본이 한 자리다 (사본이 자리마다 있지 않다)", () => {
    // **술어와 목록은 그대로 두고 실행만 미룬다.** 근거: §6 U-b 2026-08-18 셋째 판정 —
    // 분기를 대상마다 복제하지 않는다. 근거로 든 것은 §6 U-e가 인용부호 구간 파서에서 든
    // 것이고(복제는 원본과 같은 눈을 가지므로 이중화가 사는 값이 0이다), 같은 문단이 구현의
    // 착지를 `K-006`에 두었다.
    //
    // [미규정] 오늘 확장자 분기는 실물이 없다 — 수단이 하나뿐이라 갈래가 없기 때문이다. 정본이
    // 금지한 것이 분기의 복제인지 수단 자체의 복제인지는 문면이 안 가른다. 대상 하나가 그 자리를
    // 스스로 미규정으로 세우고 소유를 `K-006`·`K-112`에 두었으므로 여기서 판정하지 않는다.
    //
    // 2026-08-18 관측: 같은 술어가 다섯 파일 중 넷에 사본으로 있다.
    const copies = PLACE_FILES.filter(([, source]) =>
      source.includes("function commentTokenSpans"),
    ).map(([name]) => name);
    expect(copies, `소속 술어 사본 ${copies.length}건 (소유 K-006)`).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 8 — 이 파일 자신의 머리
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b — 이 파일 머리가 인용부호를 쓰지 않는다는 주장은 참이다 (자기 축)", () => {
  it("적합 — 머리에 인용부호 셋이 하나도 없다", () => {
    // 주장이 실재해야 이 검사가 산다 — 선언 문장을 지우면 아래 셋은 잴 것이 없는 채로
    // 그린이 되므로 그 문장 자신을 먼저 짚는다(`ARCHITECTURE.md` §2.6 가시적 결과).
    const header = contractHeadRaw(SELF_SOURCE);
    expect(header.length).toBeGreaterThan(0);
    expect(header).toContain("이 주석은 인용부호를 쓰지 않는다");
    expect(header).not.toMatch(/[«»]/);
    expect(header).not.toMatch(/["“”]/);
  });

  it("역검증 — 같은 술어가 합성 위반을 잡고, 머리를 쪼개거나 굽혀도 안 놓친다", () => {
    const anchor = " * 이 주석은 인용부호를 쓰지 않는다";
    const plant = ` * 표본 «심은 지목»과 "심은 인용"`;
    for (const bent of [
      [" */", "/**", plant, anchor],
      [anchor, `   표본 «심은 지목»`],
      [anchor, "", plant],
      [anchor, ` */`, `const planted = "심은 리터럴"; // 꼬리`, plant.replace(" * ", "// ")],
    ]) {
      const planted = SELF_SOURCE.replace(anchor, bent.join("\n"));
      expect(planted).not.toBe(SELF_SOURCE);
      expect(contractHeadRaw(planted)).toMatch(/[«»]/);
    }
  });
});
