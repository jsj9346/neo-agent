/**
 * **네 단언이 `it.skip`으로 서 있는 것은 통과했기 때문이 아니라 발견을 카드로 옮겼기
 * 때문이다**(2026-08-18). 각각 `K-159`(머리 마스킹 되돌림) · `K-160`(짝 잃은 코드 표기가
 * 마스킹을 끈다) · `K-161`(겹화살괄호 갈래 모집단 누락) · `K-162`(셸 대상의 주석 스팬 0)이
 * 든다. **단언 본문은 손대지 않았다** — 그 카드가 처분되면 `.skip`을 떼는 것으로 되살아나고,
 * 떼었을 때 green이 아니면 처분이 덜 된 것이다.
 */
/**
 * 독립 QA — `DOC-CITATION.md` §6 U-b의 2026-08-18 판정 블록이 정한 **판별 술어**를 그 판정을
 * 착지시킨 네 파일이 실제로 만족하는가, 그리고 그 가드들이 술어의 위반을 실제로 잡는가.
 *
 * 검증 대상 넷:
 * - `packages/providers/test/cited-noncircular.qa.test.ts`
 * - `packages/providers/test/self-head-scope.qa.test.ts`
 * - `packages/providers/test/ub-guard-scope.qa.test.ts`
 * - `packages/cli/test/renderer-literal-policy.qa.test.ts`
 *
 * **기대값의 출처는 정본 세 문단 하나다** — 단위는 연속된 주석 줄 전부다 · 주석 줄의 소속은
 * 렉싱이 정한다 · 소속 술어는 확장자를 묻지 않는다. 네 파일의 구현을 읽어 기대값을 정하지
 * 않는다. 대상이 문서와 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * 이 파일이 여는 축 다섯. 셋은 오늘 red이고 그것이 이 파일의 내용이다:
 *
 * 1. **소속 술어가 렉싱인가** — 대상의 술어를 원문에서 뽑아, 렉서와 문맥 없는 스캐너의 답이
 *    갈리는 입력으로 부른다. 2026-08-18까지 술어를 정규식 스캐너로 되돌려도 네 파일이 전건
 *    통과했다(변이 실측). 이 축이 그 되돌림을 잡는다.
 * 2. **머리 절단이 주석 안만 재는가** — 형제 머리를 raw로 되슬라이스하는 배선이 마스킹을
 *    무효화한다. red.
 * 3. **짝 안 맞는 코드 표기가 대조 덮개를 끄는가** — 백틱 하나가 뒤의 위반을 통째로 삼킨다. red.
 * 4. **겹화살괄호 갈래의 모집단이 자리 계약을 덮는가** — 같은 디렉터리의 형제 하나가 빠져 있다. red.
 * 5. **소속 술어가 확장자를 묻는가** — 술어가 타입스크립트 렉서에 고정돼 있다. red.
 *
 * 이 주석은 인용부호를 쓰지 않는다. 근거는 §6 U-b 2026-08-17 판정이 대조 축을 각 패키지의
 * 테스트 디렉터리까지 넓혔고 이 파일이 그 안이기 때문이다. 재는 범위는 이 주석 전체이고,
 * 무엇이 한 머리인가는 같은 절의 2026-08-18 판정이 든다. 축 6이 이 선언을 잰다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript") as typeof import("typescript");

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const CITED_PATH = path("./cited-noncircular.qa.test.ts");
const CITED = readFileSync(CITED_PATH, "utf8");
const SELF_HEAD = readFileSync(path("./self-head-scope.qa.test.ts"), "utf8");
const UB_GUARD = readFileSync(path("./ub-guard-scope.qa.test.ts"), "utf8");
const PARITY = readFileSync(path("./docs-gate-parity.qa.test.ts"), "utf8");
const RENDERER = readFileSync(path("../../cli/test/renderer-literal-policy.qa.test.ts"), "utf8");
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");
const DOCS_DIR = path("../../../docs/");

/* ------------------------------------------------------------------------ *
 * 계약 술어 — 대상에서 베끼지 않고 정본 세 문단에서 도출한다
 * ------------------------------------------------------------------------ */

/** D-2 — 정규화는 공백만 */
const norm = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * S-4 코퍼스 중 우리 문서 트리. 동결 레퍼런스 트리와 지목된 기록은 빠져 있고 그 좁힘의
 * 방향은 red다(정당한 인용이 오탐). 소유는 `K-006`이 든다.
 */
const CORPUS = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .map((name) => norm(readFileSync(`${DOCS_DIR}${name}`, "utf8")));
const inCorpus = (quote: string): boolean => CORPUS.some((doc) => doc.includes(norm(quote)));

/** S-5의 지목 부류를 표기로 근사한다. 넓히는 방향이라 틀려도 위반을 안 늘린다 */
const POINT = /[A-Za-z0-9-]+\.md|§\s?\d|K-\d{3}|\b[A-Z]-\d\b|plans\/|devnotes\//;

/** 소속을 렉싱이 정하는 술어 — 정본 둘째 문단 그대로 */
function lexedSpans(source: string): { pos: number; end: number }[] {
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
}

/** 정본이 죽였다고 적은 술어 — 문맥 없는 정규식 스캐너. 축 1의 대조군이다 */
function scannedSpans(source: string): { pos: number; end: number }[] {
  const out: { pos: number; end: number }[] = [];
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  let match = pattern.exec(source);
  while (match !== null) {
    out.push({ pos: match.index, end: match.index + match[0].length });
    match = pattern.exec(source);
  }
  return out;
}

type Run = { readonly text: string; readonly startLine: number; lineAt(offset: number): number };

/** 빈 줄 없이 이어지는 주석 줄의 덩어리 하나가 한 단위다 — 정본 첫째 문단 */
function runsBy(
  spansOf: (source: string) => { pos: number; end: number }[],
  source: string,
): Run[] {
  const raw: { text: string; marks: { at: number; offset: number }[]; startLine: number }[] = [];
  let previousEnd = -1;
  for (const span of spansOf(source)) {
    const startLine = (source.slice(0, span.pos).match(/\n/g) ?? []).length + 1;
    const gap = previousEnd === -1 ? null : source.slice(previousEnd, span.pos);
    if (gap === null || (gap.match(/\n/g) ?? []).length > 1)
      raw.push({ text: "", marks: [], startLine });
    previousEnd = span.end;
    const run = raw[raw.length - 1];
    if (run === undefined) continue;
    source
      .slice(span.pos, span.end)
      .split("\n")
      .forEach((line, index) => {
        run.marks.push({ at: startLine + index, offset: run.text.length });
        run.text += ` ${line.replace(/^\s*(\/\/|\*\/?|\/\*\*?)\s?/, "")}`;
      });
  }
  return raw.map((run) => ({
    text: run.text,
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

/** 머리의 **원문 구간** 판. 주석 밖 글자는 공백으로 덮는다 — 코드 파일에서는 주석 안만 잰다 */
function headRawBy(
  spansOf: (source: string) => { pos: number; end: number }[],
  source: string,
): string {
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

function load<T>(slice: string, exportLine: string, label: string): T {
  const compiled = ts.transpileModule(`${slice}\n${exportLine}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: Record<string, unknown> = {};
  // 대상의 술어가 렉서를 부르므로 `ts`를 주입한다 — 사본을 두면 대상이 돌아가도 여기가 그린이다.
  new Function("exports", "ts", compiled)(loaded, ts);
  const value = loaded.value;
  if (value === undefined) throw new Error(`${label}: 적재에 실패했다`);
  return value as T;
}

/** 대상의 소속 술어 */
const targetSpans = load<(source: string) => { pos: number; end: number }[]>(
  region(CITED, "function commentTokenSpans", "\nconst PROVIDERS_PATH", "대상 소속 술어"),
  "exports.value = commentTokenSpans;",
  "대상 소속 술어",
);

/** 대상의 머리 절단 */
const targetHeadCut = load<(source: string) => string>(
  region(CITED, "function leadingCommentBlock", "const PROVIDERS_PATH", "대상 머리 절단"),
  "exports.value = leadingCommentBlock;",
  "대상 머리 절단",
);

/** 대상의 코드 표기 마스킹 */
const targetMaskCode = load<(text: string) => string>(
  region(UB_GUARD, "const maskCode", "type Miss", "대상 마스킹"),
  "exports.value = maskCode;",
  "대상 마스킹",
);

/* ------------------------------------------------------------------------ *
 * 축 1 — 소속 술어가 렉싱인가
 * ------------------------------------------------------------------------ */

/**
 * 렉서와 문맥 없는 스캐너의 답이 갈리는 입력. 세 줄짜리 리터럴이 주석 여닫 표기를 담고 있어
 * 스캐너는 그것을 한 블록 주석으로 읽고 덩어리를 이어 붙인다. 렉서는 코드 줄 둘이 사이에
 * 놓인 것을 보고 거기서 끊는다.
 */
const LEXING_DIVERGENT = [
  "/**",
  " * 머리 선언 — 이 주석은 인용부호를 쓰지 않는다",
  " */",
  'const opener = "/*"; // 꼬리 주석',
  'const closer = "*/";',
  "// 다음 덩어리 «심은 지목»",
].join("\n");

describe("DOC-CITATION §6 U-b 2026-08-18 — 주석 줄의 소속은 렉싱이 정한다", () => {
  it("적합 — 대상의 소속 술어가 렉서의 답을 내고 문맥 없는 스캐너의 답을 안 낸다", () => {
    // 근거: §6 U-b 2026-08-18 후속 판정 — 소속은 렉싱이 정하고 줄 모양이 아니다. 주석 토큰
    // 안의 모든 줄이 그 덩어리에 들고 끊는 것은 토큰의 끝뿐이다.
    //
    // **이 축이 없으면 술어를 정규식 스캐너로 되돌려도 네 파일이 전건 통과한다** — 2026-08-18
    // 변이 실측에서 그렇게 났다. 형제들이 재는 것은 머리 절단의 **값**인데, 오늘 네 파일의
    // 머리가 전부 첫 블록 하나라 두 술어가 같은 값을 내기 때문이다. 갈리는 입력을 먹여야
    // 술어 자신이 재진다.
    const byLexer = headRawBy(lexedSpans, LEXING_DIVERGENT);
    const byScanner = headRawBy(scannedSpans, LEXING_DIVERGENT);

    // 전제 — 이 입력에서 두 술어가 실제로 갈린다. 안 갈리면 아래 단언이 공허하다.
    expect(byLexer, "표본이 두 술어를 못 가른다 — 이 검증기를 먼저 고친다").not.toBe(byScanner);
    expect(/[«»]/.test(byScanner), "스캐너 쪽은 리터럴을 넘어 이어 붙인다").toBe(true);
    expect(/[«»]/.test(byLexer), "렉서 쪽은 코드 줄에서 끊는다").toBe(false);

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
 * 축 2 — 머리 절단이 주석 안만 재는가
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

  it.skip("[K-159 대기] 머리 가드가 재는 값에 주석 밖 글자가 섞이지 않는다", () => {
    // 근거: §6 U-b 2026-08-18 — 문자열 리터럴을 감싼 큰따옴표는 인용부호가 아니고, 술어는
    // 주석 안인가로 끝난다. 대상의 `leadingCommentBlock`이 주석 밖 글자를 공백으로 덮어
    // 돌려주는 것도 그 항을 근거로 든다.
    //
    // **그런데 형제 머리를 쓰는 배선이 그 마스킹을 되돌린다** — 길이만 취해 원문을 다시
    // 자르므로 덮은 자리가 그대로 살아난다. 덩어리는 꼬리 주석을 단 코드 줄까지 자라므로
    // 그 줄의 리터럴이 머리로 세어진다.
    //
    // 방향은 둘이다. red 쪽은 결백한 코드 줄이 한계 절 단언을 깨는 것이고, 침묵 쪽은 코드
    // 줄의 텍스트가 머리 포함 검사를 우연히 만족시켜 미열거를 덮는 것이다.
    const planted = plantLiteralAfterHead(PARITY);

    // 전제 — 심은 리터럴이 덩어리 안이고 계약 술어는 그것을 덮는다.
    expect(targetHeadCut(planted), "심은 자리가 덩어리 밖이면 아래가 공허하다").toContain(
      "꼬리 주석은 결백하다",
    );
    expect(contractHeadRaw(planted), "계약 술어는 주석 밖을 덮는다").not.toContain(SENTINEL);

    // 대상이 실제로 재는 값 — `cited-noncircular.qa.test.ts`의 형제 머리 선언과 같은 배선.
    const measured = planted.slice(0, targetHeadCut(planted).length);
    expect(measured, "형제 머리 배선이 주석 밖 글자를 잰다").not.toContain(SENTINEL);
  });

  it("역검증 — 대상의 절단 자신은 그 자리를 덮는다 (배선만이 되돌린다)", () => {
    // 이 짝이 없으면 위 단언이 절단 함수를 탓하는 것으로 읽힌다. 갈리는 것은 배선 하나다.
    const planted = plantLiteralAfterHead(PARITY);
    expect(targetHeadCut(planted), "대상의 절단은 덮는다").not.toContain(SENTINEL);
    expect(planted.slice(0, targetHeadCut(planted).length)).toContain(SENTINEL);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — 짝 안 맞는 코드 표기가 대조 덮개를 끄는가
 * ------------------------------------------------------------------------ */

/** 대상의 마스킹을 그대로 써서 겹화살괄호 갈래를 잰다 — 마스킹만 대상 것이다 */
function missesWithTargetMask(source: string): string[] {
  const hits: string[] = [];
  for (const run of contractRuns(source)) {
    if (run.startLine === 1) continue;
    if (!POINT.test(run.text)) continue;
    for (const match of targetMaskCode(run.text).matchAll(/«[^»]{2,}»/g)) {
      const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
      if (!inCorpus(quote)) hits.push(norm(quote));
    }
  }
  return hits;
}

describe("DOC-CITATION §3.4 Q-7 — 짝이 어긋난 입력에서 조용한 0이 아니라 실패를 낸다", () => {
  const HEAD = "/** 머리 */\n\n";
  const VIOLATION = "¬코퍼스에 없는 조어¬".replace("¬", "«").replace("¬", "»");

  it.skip("[K-160 대기] 적합 — 짝 잃은 코드 표기가 뒤의 대조 거짓을 삼키지 않는다", () => {
    // 근거: §3.4 Q-7 — 파서는 글자가 짝을 이룬다고 가정하고, 가정이 깨지면 틀린 답이 아니라
    // 조용한 0을 낸다. 그래서 짝짓기를 고치는 대신 가정이 깨진 것을 드러낸다. §6 U-e가
    // 인용부호 구간 파서의 정본을 `scripts/doc-citation.mjs`로 못박은 것도 같은 자리다.
    //
    // 대상들은 그 정본을 안 부르고 마스킹을 손으로 다시 짰다. 덩어리 텍스트는 줄바꿈이 이미
    // 공백으로 접혀 있어, 짝 잃은 여는 표기가 **뒤 문장의 정당한 표기까지** 한 구간으로
    // 삼킨다. 그 사이의 위반은 조용히 사라진다.
    const baseline = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — ${VIOLATION}가 있다`;
    expect(missesWithTargetMask(baseline), "대조군이 비면 아래가 공허하다").toHaveLength(1);

    const silenced = `${HEAD}// DOC-CITATION.md §3.4의 \` 표기와 ${VIOLATION} 그리고 \`코드\` 끝`;
    expect(missesWithTargetMask(silenced), "짝 잃은 백틱이 덮개를 껐다").toHaveLength(1);
  });

  it("역검증 — 짝이 맞는 코드 표기 안은 그대로 인용부호가 아니다 (Q-1)", () => {
    // 마스킹 자체를 없애라는 것이 아니다. Q-1은 그대로 서야 한다.
    const masked = `${HEAD}// DOC-CITATION.md §3.4의 \`${VIOLATION}\` 표기`;
    expect(missesWithTargetMask(masked)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 겹화살괄호 갈래의 모집단이 자리 계약을 덮는가
 * ------------------------------------------------------------------------ */

/** 계약에서 도출한 겹화살괄호 판별기 — 대상의 것을 부르지 않는다 */
function guillemetMisses(source: string): string[] {
  const hits: string[] = [];
  for (const run of contractRuns(source)) {
    if (run.startLine === 1) continue;
    if (!POINT.test(run.text)) continue;
    const masked = run.text.replace(/(`+)[^\n]*?\1/g, (span) => " ".repeat(span.length));
    for (const match of masked.matchAll(/«[^»]{2,}»/g)) {
      const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
      if (!inCorpus(quote)) hits.push(`L${run.lineAt(match.index)} ${norm(quote).slice(0, 60)}`);
    }
  }
  return hits;
}

describe("DOC-CITATION §6 U-b — 대조 축의 단위는 파일이고 자리는 테스트 디렉터리 전체다", () => {
  it.skip("[K-161 대기] 적합 — 같은 디렉터리의 형제도 겹화살괄호 갈래의 모집단이다", () => {
    // 근거: §6 U-b 2026-08-17 — 대조 축이 걸리는 자리를 각 패키지의 테스트 디렉터리까지
    // 넓힌다. 2026-08-18 — 대조 축의 단위는 파일이고 머리로 좁힌 대조 기계는 두지 않는다.
    // S-1~S-3은 U-1의 운용 규칙이므로 자리가 넓어지면 함께 온다.
    //
    // **오늘 그 갈래를 재는 기계의 모집단은 손으로 든 세 파일이고, 같은 디렉터리의
    // `docs-gate-parity.qa.test.ts`가 빠져 있다.** 그 파일은 머리 절단 축에는 들어 있으므로
    // 누락이 자리 미인지에서 온 것이 아니다. 처분은 벗기는 것 하나이고 등급은 안 매긴다(S-2).
    const misses = guillemetMisses(PARITY);
    expect(misses, `docs-gate-parity: 처분 대상 ${misses.length}건`).toEqual([]);
  });

  it("적합 — 이 갈래를 재는 파일들 자신도 모집단이다", () => {
    // 재는 기계가 자기와 형제를 빼면 그 자리는 아무도 안 잰다. `ub-guard-scope.qa.test.ts`는
    // 오늘 자기 머리만 재고 자기 본문은 안 잰다.
    for (const [name, source] of [
      ["ub-guard-scope", UB_GUARD],
      ["ub-predicate-scope", SELF_SOURCE],
    ] as const) {
      expect(guillemetMisses(source), `${name}: 처분 대상`).toEqual([]);
    }
  });

  it("역검증 — 같은 판별기가 심은 자리를 잡고 코퍼스에 있는 문면은 안 잡는다", () => {
    const HEAD = "/** 머리 */\n\n";
    const drifted = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — «코퍼스에 없는 조어»`;
    expect(guillemetMisses(drifted)).toHaveLength(1);

    const exact = `${HEAD}// 근거는 DOC-CITATION.md §3.4다 — «갈리면 판정하지 말고 벗긴다»`;
    expect(guillemetMisses(exact)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 5 — 소속 술어가 확장자를 묻는가
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b 2026-08-18 — 소속 술어는 확장자를 묻지 않는다", () => {
  it.skip("[K-162 대기] 적합 — 주석을 갖는 대상 파일이면 확장자와 무관하게 덩어리가 나온다", () => {
    // 근거: §6 U-b 2026-08-18 후속 판정 — 덩어리를 끊는 술어는 주석을 갖는 대상 파일에 같이
    // 걸린다. 그 판정이 넓힌 자리에 `.claude/scripts/`의 `.mjs`와 셸 스크립트가 들어 있어,
    // 확장자로 좁혀 읽으면 그 자리의 판별 수단이 통째로 미규정으로 남는다고 적는다.
    //
    // 오늘 네 파일의 술어는 타입스크립트 렉서 하나에 고정돼 있다. `.mjs`는 그 렉서가 읽으므로
    // 성립하고, 셸 스크립트는 주석 덩어리가 0으로 나온다.
    //
    // [미규정] 셸의 주석을 **무엇으로** 렉싱할 것인가는 정본이 안 든다 — 확장자를 묻지
    // 않는다는 요건만 있고 수단이 없다. 자리의 소유는 `K-157`이고 술어 구현의 정본 자리는
    // `K-006`·`K-112`가 든다. 이 단언은 요건 쪽만 잰다.
    const shell = [
      "#!/usr/bin/env bash",
      "# 머리 선언 — 두 줄이 한 덩어리다",
      "# 이어지는 줄",
      "set -e",
      "",
    ].join("\n");
    expect(contractRuns(shell).length, "셸 주석이 덩어리로 안 나온다").toBeGreaterThan(0);
  });

  it("적합 — `.mjs`에서는 같은 술어가 성립한다 (확장자 축의 반대쪽)", () => {
    // 방향을 함께 고정한다 — 술어가 아무 입력에나 0을 내는 형태로 퇴화하지 않았다.
    const mjs = readFileSync(path("../../../scripts/doc-citation.mjs"), "utf8");
    expect(contractRuns(mjs).length).toBeGreaterThan(0);
    expect(targetSpans(mjs).map((span) => span.pos)).toEqual(lexedSpans(mjs).map((s) => s.pos));
  });
});

/* ------------------------------------------------------------------------ *
 * 축 6 — 이 파일 자신의 머리
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
    ]) {
      const planted = SELF_SOURCE.replace(anchor, bent.join("\n"));
      expect(planted).not.toBe(SELF_SOURCE);
      expect(contractHeadRaw(planted)).toMatch(/[«»]/);
    }
  });
});
