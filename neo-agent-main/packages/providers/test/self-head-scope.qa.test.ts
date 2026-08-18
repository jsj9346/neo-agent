/**
 * 독립 QA — `packages/providers/test/cited-noncircular.qa.test.ts`가 세운 자기 축 가드와 그
 * 머리 문단이 `DOC-CITATION.md` §3.4(U-1 · D-1~D-6 · S-1~S-4)와 §6 U-b의 2026-08-17 ·
 * 2026-08-18 판정이 정한 것을 실제로 재는가.
 *
 * **기대값의 출처는 그 두 절이다.** 대상 파일의 술어를 옳다고 전제하지 않는다 — 대상이 쓴
 * 정규식과 머리 절단 함수는 대상 원문에서 뽑아 그 자리에서 평가하고, 무엇을 잡아야 하는지는
 * 정본이 든 인용부호 셋과 단위 판정에서만 나온다.
 *
 * 이 파일이 재는 축 다섯:
 *
 * 1. **가드의 술어가 인용부호 셋을 전부 잡는가** — 별표 형식 · 겹화살괄호 · 평문 큰따옴표.
 * 2. **가드가 자르는 머리가 실제 머리인가** — 단위는 빈 줄 없이 이어지는 주석 줄의 덩어리
 *    하나이고, 무엇이 주석 줄인가는 줄 모양이 아니라 렉싱이 정한다(§6 U-b 2026-08-18 판정과
 *    같은 절의 후속 판정). 옛 술어가 놓친 배치를 심어 함께 잰다.
 * 3. **U-b가 넓힌 자리는 파일인데 가드는 머리 한 덩어리만 든다** — 본문에 남은 인용의 대조.
 * 4. **2026-08-18 판정이 답한 셋** — 겹화살괄호의 처분 · 코드 줄 리터럴 · 인용의 단위.
 * 5. **이 파일 자신의 머리** — 축 5가 이 문단을 잰다.
 *
 * 이 주석은 인용부호를 쓰지 않는다. 근거는 대상 파일 머리와 같다(§6 U-b 2026-08-17). 그
 * 주장을 재는 기계가 축 5이고, 2026-08-18까지 이 파일에는 그것이 없었다 — 자기 주장을 안 재는
 * 감사기는 `ARCHITECTURE.md` §2.6이 최악으로 든 침묵 실패 쪽이다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 인용부호 구간 파서의 **정본**은 이 모듈이다(`DOC-CITATION.md` §6 U-e 2026-08-15 판정).
// 코드 표기 마스킹을 손으로 다시 짜면 복제는 원본과 같은 눈을 가지므로 이중화가 사는 값이 0이고,
// 실제로 이 파서의 알려진 한계가 복제본에 상속된 적이 있다. 형제 `docs-gate-parity.qa.test.ts`가
// 같은 근거로 이 모듈을 적재한다.
import { maskCodeSpans } from "../../../scripts/doc-citation.mjs";

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript") as typeof import("typescript");

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const TARGET_PATH = path("./cited-noncircular.qa.test.ts");
const TARGET_SOURCE = readFileSync(TARGET_PATH, "utf8");
/** 이 파일 자신의 원문 — 축 5가 쓴다. 파일 이름을 문자열로 적지 않는다(적으면 개명 때 낡는다) */
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");
const DOCS_DIR = path("../../../docs/");

/** 공백만 정규화한다 — D-2가 정한 대조 규칙 그대로다 */
const norm = (text: string): string => text.replace(/\s+/g, " ").trim();

/** S-4가 코퍼스로 든 것 중 이 검사에 필요한 부분(우리 문서 트리) */
const CORPUS = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .map((name) => norm(readFileSync(path(`../../../docs/${name}`), "utf8")));

const inCorpus = (quote: string): boolean => CORPUS.some((doc) => doc.includes(norm(quote)));

type CommentRun = {
  readonly text: string;
  /** 코드 표기를 덮은 같은 길이의 텍스트 — Q-1. **접기 전에** 걸린다(아래 `commentRuns`) */
  readonly masked: string;
  readonly startLine: number;
  lineAt(offset: number): number;
};

/**
 * 주석 토큰의 구간들 — **소속은 렉싱이 정한다**(§6 U-b 2026-08-18 후속 판정). 파서를 세워
 * 토큰마다 앞뒤 트리비아를 걷는다. 손으로 쓴 상태 기계나 문맥 없는 스캐너로 재면 문자열
 * 리터럴 안의 표기가 주석으로 잡혀 값이 조용히 틀린다(2026-08-18 실측).
 */
function commentTokenSpans(source: string): { pos: number; end: number }[] {
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

/**
 * 주석 줄의 덩어리들. **빈 줄 없이 이어지는 주석 줄 하나가 한 단위다**(§6 U-b 2026-08-18
 * 판정). 덩어리 안에서는 줄을 이어 붙이고 덩어리 사이는 잇지 않는다.
 *
 * 인용이 줄바꿈을 넘는 것은 이 레포 주석의 상례이므로 줄 단위로만 보면 그런 인용이 통째로
 * 안 보인다. 반대로 덩어리를 넘겨 이으면 코드 줄을 사이에 둔 두 조각이 한 인용으로 붙는다.
 *
 * **무엇이 주석 줄인가는 줄 모양(별표 접두)이 아니라 렉싱이 정한다**(같은 절의 2026-08-18
 * 후속 판정). 그래서 별표 없는 계속 줄과 블록 주석 안의 완전 공백 줄은 덩어리를 안 끊고,
 * 두 주석 토큰 사이에 주석 없는 줄이 하나라도 놓이면 거기서 끊긴다. 담기는 문면은 주석
 * 안뿐이다 — 꼬리 주석을 단 코드 줄이 덩어리에 들어도 그 줄의 리터럴은 안 담긴다.
 */
function commentRuns(source: string): CommentRun[] {
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
        // 내리지 마라: §6 U-b 2026-08-18이 그 부류의 단위를 덩어리로 뒀으므로 줄바꿈을 넘는
        // 인용이 정상값이고(축 4가 그 자리를 잰다), 접기 전에 걸면 1건이 0건이 된다.
      });
  }
  return raw.map((run) => ({
    text: run.text,
    masked: run.masked,
    startLine: run.startLine,
    lineAt(offset: number): number {
      let found = 0;
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
 * 덩어리가 비었을 때 **잴 대상이 없는 것**과 **잴 수단이 없는 것**을 가른다. 아래 판별기들은
 * 전부 위반 목록형이라 둘을 같은 값(빈 목록)으로 내므로 술어가 대신 가른다:
 *
 * - 덩어리 0 + 렉서가 읽음 = 주석이 정말 없는 파일. 정상이고 위반도 0이다.
 * - 덩어리 0 + 렉서가 못 읽음 = 수단 부재. §6 U-b 2026-08-18이 이 자리를 `Q-7`대로 실패로
 *   두었다(수단이 없는 대상에서 조용한 0을 내지 않는다) — 던진다.
 *
 * 가르지 않으면 주석 없는 정상 파일이 위반으로 서거나, 셸처럼 렉서가 없는 대상이 조용한 0으로
 * 들어온다(`ARCHITECTURE.md` §2.6).
 */
function commentRunsOrFail(source: string, label: string): CommentRun[] {
  const runs = commentRuns(source);
  if (runs.length === 0 && !lexed(source))
    throw new Error(
      `${label}: 렉서가 원문을 못 읽었다 — 덩어리 0을 위반 0으로 읽지 않는다(§3.4 Q-7)`,
    );
  return runs;
}

/**
 * 머리 — 첫 줄에서 시작하는 주석 줄 덩어리의 원문 구간. **대상 가드가 쓰는 것과 같은 코드가
 * 아니라 여기서 독립 계산한다**(축 2가 두 값을 대조한다). 주석 밖 글자는 공백으로 덮어
 * 자리와 길이만 남긴다 — 코드 파일에서는 주석 안만 잰다(§6 U-b 2026-08-18).
 */
function headByContract(source: string): string {
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

/** 주석을 공백으로 덮은 원문 — 코드 자리만 남는다. 축 4가 리터럴을 뽑는 데 쓴다 */
function codeOnly(source: string): string {
  return commentTokenSpans(source).reduce(
    (text, span) =>
      text.slice(0, span.pos) +
      source.slice(span.pos, span.end).replace(/[^\n]/g, " ") +
      text.slice(span.end),
    source,
  );
}

/* ------------------------------------------------------------------------ *
 * 축 1 — 가드의 술어가 인용부호 셋을 덮는가
 * ------------------------------------------------------------------------ */

/** 대상의 자기 축 `it` 블록에서 부정 정규식을 뽑는다. 표지가 없으면 던진다(fail-closed) */
function selfAxisPredicates(): RegExp[] {
  // 머리 문단도 같은 낱말을 쓰므로 검사 제목의 괄호 표기로 끊는다.
  const marker = "(자기 축)";
  const start = TARGET_SOURCE.indexOf(marker);
  if (start === -1)
    throw new Error("대상에서 자기 축 검사를 찾지 못했다 — 개편됐으면 이 QA를 먼저 고친다");
  const block = TARGET_SOURCE.slice(start, TARGET_SOURCE.indexOf("\n  });", start));
  const found = [...block.matchAll(/expect\(header\)\.not\.toMatch\(\/([^/]+)\/\)/g)]
    .map((match) => match[1])
    .filter((source): source is string => source !== undefined)
    .map((source) => new RegExp(source));
  if (found.length === 0) throw new Error("자기 축 검사에서 부정 정규식을 하나도 뽑지 못했다");
  return found;
}

describe("DOC-CITATION §3.4 U-1 — 자기 축 가드의 술어가 인용부호 셋을 덮는가", () => {
  it("적합 — 별표 형식 · 겹화살괄호 · 평문 큰따옴표가 전부 걸린다", () => {
    // 근거: §3.4 U-1 규칙 블록 — 인용부호는 셋이고 셋 다 같은 규칙을 받는다. 곡선
    // 큰따옴표는 Q-3이 부류로 걸고, 여는 글자와 닫는 글자에 각각 걸린다.
    const predicates = selfAxisPredicates();
    const caught = (sample: string): boolean => predicates.some((regexp) => regexp.test(sample));

    expect(caught(`머리 * 표본 *"별표 형식"* 끝`)).toBe(true);
    expect(caught("머리 * 표본 «겹화살괄호» 끝")).toBe(true);
    expect(caught(`머리 * 표본 "평문 큰따옴표" 끝`)).toBe(true);
    expect(caught("머리 * 표본 “여는 곡선만 끝")).toBe(true);
    expect(caught("머리 * 표본 닫는 곡선만” 끝")).toBe(true);
    expect(caught("머리 * 표본 «여는 겹화살괄호만 끝")).toBe(true);

    // 인용부호가 아닌 것은 안 걸린다 — 술어가 아무거나 잡는 형태로 퇴화하지 않았다.
    expect(caught("머리 * 표본 「직각 인용」과 `코드 스팬` 끝")).toBe(false);
    expect(caught("머리 * 표본 **굵게**와 ~~취소선~~ 끝")).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 2 — 가드가 자르는 머리가 실제 머리인가
 * ------------------------------------------------------------------------ */

/**
 * 대상의 머리 절단 함수를 **원문에서 잘라 그 자리에서 부른다.** 사본을 두면 대상이 옛 술어로
 * 돌아가도 이 QA가 그린이다 — 형제 파일이 파서를 적재하는 것과 같은 이유다. 표지가 사라지면
 * 던진다(fail-closed).
 */
function loadTargetHeadCut(): (source: string) => string {
  const start = TARGET_SOURCE.indexOf("function leadingCommentBlock");
  const end = TARGET_SOURCE.indexOf("const PROVIDERS_PATH", start);
  if (start === -1 || end === -1)
    throw new Error("대상에서 머리 절단 함수를 뽑지 못했다 — 개편됐으면 이 QA를 먼저 고친다");
  const compiled = ts.transpileModule(
    `${TARGET_SOURCE.slice(start, end)}\nexports.cut = leadingCommentBlock;`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const loaded: Record<string, unknown> = {};
  // 대상의 절단은 렉서를 부르므로 `ts`를 주입한다 — 사본을 두면 대상이 돌아가도 여기가 그린이다.
  new Function("exports", "ts", compiled)(loaded, ts);
  const cut = loaded.cut;
  if (typeof cut !== "function") throw new Error("대상 머리 절단 함수 적재에 실패했다");
  return cut as (source: string) => string;
}

const targetHeadCut = loadTargetHeadCut();

/** 2026-08-17까지 대상이 쓰던 술어 — 첫 닫기 표기까지. 아래 역검증의 대조군이다 */
const headByFirstCloser = (source: string): string => source.slice(0, source.indexOf("*/"));

/** 머리 뒤쪽에 심는 위반. 문자열 리터럴이므로 이 파일의 주석 대조 모집단 밖이다 */
const PLANTED = ` * 표본 «지목»과 "인용"`;
const ANCHOR = " * 이 주석은 인용부호를 쓰지 않는다";

describe("자기 축 가드의 fail-closed — 대상이 자르는 구간이 실제 머리와 같은가", () => {
  it("적합 — 대상의 절단이 연속된 주석 줄 전부와 같은 자리다", () => {
    // 근거: §6 U-b 2026-08-18 판정 — 코드 파일의 단위는 빈 줄 없이 이어지는 주석 줄의 덩어리
    // 하나이고 머리도 같은 술어로 끊는다. 대상의 함수와 여기 독립 계산이 같은 값을 내는
    // 것을 매 런 고정한다.
    const byContract = headByContract(TARGET_SOURCE);
    expect(byContract.length).toBeGreaterThan(0);
    expect(targetHeadCut(TARGET_SOURCE)).toBe(byContract);

    // 오늘 대상 머리는 한 블록이라 옛 술어와도 거의 같은 자리다 — 아래 역검증이 갈리는
    // 배치를 심어 두 술어가 실제로 다른 함수임을 고정한다.
    expect(byContract.startsWith(headByFirstCloser(TARGET_SOURCE))).toBe(true);
  });

  it("적합 — 닫기 표기가 주석을 실제로 닫으면 그 뒤 줄은 머리가 아니다 (표본 A)", () => {
    // 표본 A: 앵커 문장 앞에 닫기 표기를 담은 줄을 끼우고 그 뒤에 인용부호를 심는다.
    //
    // **이 표본의 답은 2026-08-18 후속 판정이 뒤집었다.** 소속을 렉싱이 정하므로 그 표기는
    // 블록 주석을 거기서 진짜로 닫고, 뒤에 심은 줄은 주석이 아니라 코드다. 머리가 거기서
    // 끝나는 것이 계약이 요구하는 값이고, 심은 문면은 대조 모집단 밖이다 — 같은 판정이 코드
    // 파일에서 주석 안만 재라고 적는다. 그 전 문단이 이 배치를 첫 닫기 술어의 반례로 든 것은
    // 소속을 줄 모양으로 읽던 때의 판정이다(근거: `plans/20260818-checker-K-158.md`).
    //
    // **그리고 이 배치는 침묵이 아니다** — 닫은 뒤의 줄이 코드가 되어 파싱이 깨지고
    // 타입체크가 먼저 red다. 조용히 짧아지는 배치는 아래 표본 B와 C·D뿐이고, 그 셋이 이
    // 술어의 실물 방어선이다(`ARCHITECTURE.md` §2.6 가시적 결과).
    const planted = TARGET_SOURCE.replace(
      ANCHOR,
      [
        " * 표기를 그대로 적으면 블록 주석이 여기서 닫힌다: `packages/*/test/`",
        PLANTED,
        ANCHOR,
      ].join("\n"),
    );
    expect(planted).not.toBe(TARGET_SOURCE);

    expect(targetHeadCut(planted)).not.toMatch(/[«»]/);
    expect(targetHeadCut(planted)).toBe(headByContract(planted));

    // 심은 것이 어느 주석 덩어리에도 안 담긴다 — 머리 밖으로 밀린 것이 아니라 주석이 아니다.
    expect(commentRuns(planted).some((run) => run.text.includes("표본 «지목»"))).toBe(false);

    // 침묵이 아니라는 것을 여기서 짚는다. 원본은 진단 0, 심은 배치는 0보다 크다.
    const diagnose = (source: string): number =>
      (
        ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
          reportDiagnostics: true,
        }).diagnostics ?? []
      ).length;
    expect(diagnose(TARGET_SOURCE)).toBe(0);
    expect(diagnose(planted)).toBeGreaterThan(0);
  });

  it("역검증 — 머리를 블록 주석 둘로 쪼개도 둘째 블록이 머리에 남는다 (표본 B)", () => {
    // 표본 B가 결정적이다 — 두 블록으로 쪼갠 머리는 타입스크립트 문법상 완전히 유효해서
    // 파싱 에러가 안 나고, 옛 술어에서는 줄 모양 계산까지 같은 값을 내어 fail-closed가
    // 함께 뚫렸다. 덩어리 술어에서는 빈 줄이 없으므로 둘이 한 단위다.
    const planted = TARGET_SOURCE.replace(ANCHOR, [" */", "/**", PLANTED, ANCHOR].join("\n"));
    expect(planted).not.toBe(TARGET_SOURCE);

    expect(targetHeadCut(planted)).toMatch(/[«»]/);
    expect(targetHeadCut(planted)).toMatch(/["“”]/);
    expect(headByFirstCloser(planted)).not.toMatch(/[«»]/);
  });

  it("역검증 — 빈 줄이 덩어리를 끊는다 (단위의 반대쪽 경계)", () => {
    // 단위가 무한정 자라지 않는다는 것도 함께 고정한다 — 빈 줄 뒤의 주석은 다른 덩어리이고
    // 머리 주장의 범위 밖이다.
    const planted = TARGET_SOURCE.replace(ANCHOR, [" */", "", "/**", PLANTED, ANCHOR].join("\n"));
    expect(planted).not.toBe(TARGET_SOURCE);
    expect(targetHeadCut(planted)).not.toMatch(/[«»]/);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — U-b가 넓힌 자리는 파일인데 가드는 머리만 든다
 * ------------------------------------------------------------------------ */

/** 주석에 쓰인 별표 형식 인용 — 조어로 읽힐 여지가 없는 형태만 모은다 */
function starQuotes(source: string, label = "표본"): { line: number; quote: string }[] {
  const found: { line: number; quote: string }[] = [];
  for (const run of commentRunsOrFail(source, label)) {
    for (const match of run.text.matchAll(/\*"([^"]+)"\*/g)) {
      const quote = match[1];
      if (quote === undefined) continue;
      found.push({ line: run.lineAt(match.index), quote });
    }
  }
  return found;
}

describe("DOC-CITATION §6 U-b 2026-08-17 — 넓어진 자리에서 대조가 참인가", () => {
  it("대조 — 머리 밖 주석의 별표 형식 인용이 전부 코퍼스의 부분 문자열이다", () => {
    // 근거: §6 U-b 2026-08-17 판정 — 대조 축(U-1 · D-1 · D-2)이 걸리는 자리가 각 패키지의
    // 테스트 디렉터리까지 넓어졌다. 대상 파일은 그 안이고, 머리 문단이 스스로 그렇게 적는다.
    // U-1은 인용부호로 감싼 문면이 대상 문서에 문자 그대로 존재하는 부분 문자열일 것을
    // 요구한다. 별표 형식만 보는 이유는 S-1·S-2다 — 겹화살괄호 자리는 조어인지 실패한
    // 인용인지 갈리므로 감사가 등급을 매기지 않는다(아래 축 4가 그 처분만 잰다).
    //
    // **자기 축 가드는 이 자리를 못 잡는다.** 가드가 재는 것은 머리 한 덩어리이고, 머리의
    // 주장 자체가 그 범위로 한정돼 있다. U-b가 넓힌 자리는 파일이다.
    const misses = starQuotes(TARGET_SOURCE, TARGET_PATH)
      .filter((entry) => !inCorpus(entry.quote))
      .map((entry) => `L${entry.line} ${JSON.stringify(norm(entry.quote)).slice(0, 60)}`);
    expect(misses).toEqual([]);
  });

  it("역검증 — 같은 대조가 심은 어긋남을 잡고 원문 일치는 안 잡는다", () => {
    // 표본은 실제 주석이어야 한다 — 소속을 렉싱이 정하므로 별표로 시작하는 맨 줄은 주석이
    // 아니고, 그렇게 쓰면 모집단이 0인 채로 통과한다(§6 U-b 2026-08-18 후속 판정).
    const exact = `// 표본 *"닫는 마커는 여는 마커와 **같은 문자**이고"* 끝`;
    expect(starQuotes(exact)).toHaveLength(1);
    expect(starQuotes(exact).filter((entry) => !inCorpus(entry.quote))).toEqual([]);

    const drifted = `// 표본 *"닫는 마커는 여는 마커와 같은 문자이고"* 끝`;
    expect(starQuotes(drifted).filter((entry) => !inCorpus(entry.quote))).toHaveLength(1);

    const suffixed = `// 표본 *"닫는 마커는 여는 마커와 **같은 문자**이고."* 끝`;
    expect(starQuotes(suffixed).filter((entry) => !inCorpus(entry.quote))).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 2026-08-18 판정이 답한 셋. 그날까지 [미규정]으로 고정만 하던 자리다
 * ------------------------------------------------------------------------ */

/**
 * 지목이 같은 **단위**에 있는데 대조가 거짓인 겹화살괄호 자리 — 머리 밖 덩어리만 본다.
 *
 * **단위는 줄이 아니라 덩어리다**(§6 U-b 2026-08-18 판정 — 빈 줄 없이 이어지는 주석 줄의
 * 덩어리 하나가 한 단위이고 줄 단위는 죽었다). 줄로 재면 두 가지를 구조적으로 못 본다:
 * 줄바꿈을 넘는 인용과, 지목이 같은 덩어리의 다른 줄에 있는 인용이다. 앞의 것이 이 파일의
 * 대상에 실물로 있었고 옛 술어에서 그 자리가 0으로 세어졌다(침묵 — `ARCHITECTURE.md` §2.6).
 */
function guillemetMisses(source: string, label = "표본"): string[] {
  const point = /[A-Za-z0-9-]+\.md|§\s?\d|K-\d{3}|\b[A-Z]-\d\b|plans\/|devnotes\//;
  const hits: string[] = [];
  for (const run of commentRunsOrFail(source, label)) {
    // 머리 덩어리는 안 센다 — 그 자리는 자기 축 가드의 몫이고 술어가 더 세다(대조가 아니라 부재).
    if (run.startLine === 1) continue;
    if (!point.test(run.text)) continue;
    for (const match of run.masked.matchAll(/«[^»]{2,}»/g)) {
      const quote = run.text.slice(match.index + 1, match.index + match[0].length - 1);
      if (!inCorpus(quote)) hits.push(`L${run.lineAt(match.index)} ${JSON.stringify(norm(quote))}`);
    }
  }
  return hits;
}

describe("DOC-CITATION §3.4 S-1 · §6 U-b 2026-08-18 — 겹화살괄호는 벗긴 채로 남는다", () => {
  it("적합 — 지목이 같은 덩어리에 있고 대조가 거짓인 겹화살괄호가 없다", () => {
    // 근거: S-1 — 인용부호 안 문면이 코퍼스에 없고 조어인지 실패한 인용인지 갈리면 어느
    // 쪽인지 묻지 않고 벗긴다. §6 U-b 2026-08-18 판정이 그 운용 규칙(S-1~S-3)도 넓어진
    // 자리에 함께 온다고 적으므로 여기서 실단언으로 선다. **등급은 안 매긴다**(S-2) —
    // 목록이 비어야 할 뿐이고 그 자리가 조어였는지 실패한 인용이었는지는 묻지 않는다.
    //
    // **모집단은 지목이 같은 덩어리에 있는 자리다.** S-5가 지목의 유효 범위를 렌더링 한
    // 덩어리로 정했고 §6 U-b 2026-08-18이 `.ts`에서 그 덩어리를 연속된 주석 줄로 정한다.
    // 이 밖으로 넓히면 조어와 인용의 표기가 같아 오탐이 신호를 덮는다 — §3.4가 209 대 112로
    // 잰 자리다. 파일 전체의 겹화살괄호를 재는 기계를 둘 것인가는 `K-006`이 든다.
    expect(guillemetMisses(TARGET_SOURCE, TARGET_PATH)).toEqual([]);
  });

  it("역검증 — 같은 판별기가 심은 자리를 잡고 코퍼스에 있는 문면은 안 잡는다", () => {
    const drifted = ["const code = 1;", `// 근거는 DOC-CITATION.md §3.4다 — «코퍼스에 없는 조어»`];
    expect(guillemetMisses(drifted.join("\n"))).toHaveLength(1);

    const exact = [
      "const code = 1;",
      `// 근거는 DOC-CITATION.md §3.4다 — «갈리면 판정하지 말고 벗긴다»`,
    ];
    expect(guillemetMisses(exact.join("\n"))).toEqual([]);

    // 머리 안은 안 센다 — 그 자리는 자기 축 가드의 몫이고 술어가 더 세다(대조가 아니라 부재).
    expect(guillemetMisses(`// 근거는 DOC-CITATION.md §3.4다 — «코퍼스에 없는 조어»`)).toEqual([]);

    // **줄바꿈을 넘는 인용** — 옛 줄 단위 술어가 구조적으로 못 보던 형태다. 지목도 인용도 한
    // 덩어리 안이므로 덩어리 술어에서는 한 자리로 선다. 이 짝이 없으면 위 단언들은 줄 단위로
    // 되돌린 술어에서도 그대로 그린이다.
    const spanning = [
      "const code = 1;",
      `// Q-1: 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 길이가 같은`,
      `// 쌍»이다.`,
    ];
    expect(guillemetMisses(spanning.join("\n"))).toHaveLength(1);
    expect(spanning.filter((line) => /«[^»]{2,}»/.test(line))).toEqual([]);

    // 같은 자리에 원문의 강조 마커를 되돌리면 대조가 참이라 안 걸린다 — D-2는 공백만 정규화한다.
    const restored = [
      "const code = 1;",
      `// Q-1: 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 **길이가 같은**`,
      `// 쌍»이다.`,
    ];
    expect(guillemetMisses(restored.join("\n"))).toEqual([]);

    // 코드 표기 안은 인용부호가 아니다(Q-1). 마스킹이 빠지면 이 자리가 오탐이 된다.
    const masked = ["const code = 1;", `// DOC-CITATION.md §3.4의 \`«코퍼스에 없는 조어»\` 표기`];
    expect(guillemetMisses(masked.join("\n"))).toEqual([]);

    // **대비쌍 — 짝 잃은 코드 표기 한 글자가 뒤의 대조를 끄지 않는다.** 마스킹을 덩어리를
    // 접기 전에 걸었으므로 정본 파서의 줄 경계가 살아 있다. 접은 뒤에 걸면 앞줄의 짝 없는
    // 백틱이 뒷줄의 정상 스팬과 짝지어 그 사이를 통째로 덮어 이 자리가 0건이 된다 — 1건
    // 잡히던 자리가 조용히 0이 되는 형태다(`ARCHITECTURE.md` §2.6).
    const strayTick = [
      "const code = 1;",
      `// 근거는 DOC-CITATION.md §3.4다 — 짝 없는 백틱 하나 \` 가 앞에 있어도`,
      `// «코퍼스에 없는 조어»가 잡히고 뒤에 \`정상 스팬\` 하나가 더 온다.`,
    ];
    expect(guillemetMisses(strayTick.join("\n"))).toHaveLength(1);

    // 덩어리를 넘겨 잇지는 않는다 — 코드 줄을 사이에 둔 두 조각은 한 인용이 아니다.
    const broken = [
      "const code = 1;",
      `// Q-1: 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 길이가 같은`,
      "const between = 2;",
      `// 쌍»이다.`,
    ];
    expect(guillemetMisses(broken.join("\n"))).toEqual([]);

    // **잴 수단이 없으면 통과가 아니라 실패다** — §6 U-b 2026-08-18(수단이 없는 대상에서
    // 조용한 0을 내지 않는다)과 §3.4 `Q-7`. 위 단언들이 전부 위반 목록형이라 모집단 0에서 빈
    // 목록을 내고 통과하므로, 그 갈래를 여기서 가른다. **잴 대상이 없는 것은 그 갈래가
    // 아니다** — 주석이 정말 없는 파일은 정상이고, 둘을 뭉뚱그리면 정상 파일이 위반으로 선다.
    const shellLike = "#!/usr/bin/env bash\n# 근거는 DOC-CITATION.md 6절이다\nset -euo pipefail\n";
    expect(lexed(shellLike), "표본이 렉서를 실제로 막지 못한다").toBe(false);
    expect(() => guillemetMisses(shellLike)).toThrow();
    expect(() => starQuotes(shellLike)).toThrow();

    // 반대 방향 둘 — 주석이 있으면 안 던지고, 주석이 정말 없는 원문도 안 던진다.
    expect(() => guillemetMisses("// 주석\nconst code = 1;\n")).not.toThrow();
    expect(lexed("const code = 1;\n")).toBe(true);
    expect(() => guillemetMisses("const code = 1;\n")).not.toThrow();
    expect(guillemetMisses("const code = 1;\n")).toEqual([]);
  });
});

describe("DOC-CITATION §6 U-b 2026-08-18 — 코드 파일에서는 주석 안만 잰다", () => {
  it("적합 — 코드 줄의 문자열 리터럴은 인용부호로 안 걸린다", () => {
    // 근거: 2026-08-18 판정 — 문자열 리터럴을 감싼 큰따옴표는 인용부호가 아니다. S-6의
    // 근거(그 큰따옴표는 표기된 값의 문법이 요구한 것이지 인용 행위가 아니다)가 리터럴에
    // 문자 그대로 걸리고 Q-1이 그것을 부류로 올렸다. 반대로 읽으면 픽스처와 합성 입력이
    // 전부 위반이 된다.
    const sample = [
      `const fixture = '*"코퍼스에 없는 합성 문면"*';`,
      `// 주석 자리다 — *"닫는 마커는 여는 마커와 **같은 문자**이고"* 끝`,
    ].join("\n");
    expect(starQuotes(sample).map((entry) => entry.quote)).toEqual([
      "닫는 마커는 여는 마커와 **같은 문자**이고",
    ]);

    // 실물에서도 같은 값이다 — 대상 파일의 코드 줄에 코퍼스에 없는 한글 리터럴이 실재하는데
    // 축 3의 대조가 0건이다. 두 사실이 함께 서야 이 항이 재는 것이 있다.
    //
    // 코드 자리를 가르는 것도 렉싱이다 — 줄 모양으로 가르면 꼬리 주석을 단 코드 줄의 주석
    // 문면이 리터럴로 세어져 이 하한이 엉뚱한 근거로 선다(§6 U-b 2026-08-18 후속 판정).
    const codeLiterals = codeOnly(TARGET_SOURCE)
      .split("\n")
      .flatMap((line) => [...line.matchAll(/"([^"\\\n]{4,})"/g)])
      .map((match) => match[1] ?? "")
      .filter((literal) => /[가-힣]/.test(literal));
    expect(codeLiterals.filter((literal) => !inCorpus(literal)).length).toBeGreaterThan(0);
    expect(
      starQuotes(TARGET_SOURCE, TARGET_PATH).filter((entry) => !inCorpus(entry.quote)),
    ).toEqual([]);
  });

  it("적합 — 인용의 단위가 연속된 주석 줄 덩어리 하나다", () => {
    // 근거: 2026-08-18 판정 — 코드 파일의 단위는 빈 줄 없이 이어지는 주석 줄 전부다. 줄
    // 단위는 죽었다(S-5가 줄을 단위에서 뺀 근거가 `.ts` 주석에 그대로 선다). 덩어리를
    // 넘겨 잇는 읽기도 아니다 — 그러면 코드 줄을 사이에 둔 두 조각이 한 인용으로 붙는다.
    const spanning = [`// 앞줄 *"닫는 마커는 여는 마커와`, `// **같은 문자**이고"* 뒷줄`];
    expect(starQuotes(spanning.join("\n"))).toHaveLength(1);

    const perLine = spanning.filter((line) => /\*"[^"]+"\*/.test(line)).length;
    expect(perLine).toBe(0);

    const broken = [
      `// 앞줄 *"닫는 마커는 여는 마커와`,
      "const code = 1;",
      `// **같은 문자**이고"* 뒷줄`,
    ];
    expect(starQuotes(broken.join("\n"))).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 5 — 이 파일 자신의 머리
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b — 이 파일 머리가 인용부호를 쓰지 않는다는 주장은 참이다 (자기 축)", () => {
  it("적합 — 머리에 인용부호 셋이 하나도 없다", () => {
    // 근거: §6 U-b가 계약의 자리를 각 파일 자신의 머리에 두었고 이 파일 머리도 그 선언을
    // 든다. 재는 범위가 머리 전체인 것은 주장 자신의 범위어가 그 폭이기 때문이다 — 형제
    // (`docs-gate-parity.qa.test.ts`)가 한 절만 선언하고 그 절만 재는 것과 갈리는 자리다.
    //
    // **주장이 실재해야 이 검사가 산다.** 선언 문장을 지우면 아래 둘은 잴 것이 없는 채로
    // 그린이 되므로 그 문장 자신을 먼저 짚는다(`ARCHITECTURE.md` §2.6 가시적 결과).
    const header = headByContract(SELF_SOURCE);
    expect(header.length).toBeGreaterThan(0);
    expect(header).toContain("이 주석은 인용부호를 쓰지 않는다");
    expect(header).not.toMatch(/[«»]/);
    expect(header).not.toMatch(/["“”]/);
  });

  it("역검증 — 같은 술어가 합성 위반을 잡고, 머리를 쪼개도 안 놓친다", () => {
    const header = headByContract(SELF_SOURCE);
    expect(`${header} * 표본 «지목»`).toMatch(/[«»]/);
    expect(`${header} * 표본 "인용"`).toMatch(/["“”]/);

    // 이 파일 머리에도 표본 B를 건다 — 옛 술어에서는 둘째 블록이 머리 밖이었다.
    const split = SELF_SOURCE.replace(ANCHOR, [" */", "/**", PLANTED, ANCHOR].join("\n"));
    expect(split).not.toBe(SELF_SOURCE);
    expect(headByContract(split)).toMatch(/[«»]/);
    expect(headByFirstCloser(split)).not.toMatch(/[«»]/);

    // 별표 없는 계속 줄과 블록 주석 안의 완전 공백 줄도 머리를 안 끊는다 — 소속을 렉싱이
    // 정하기 때문이고, 줄 모양으로 읽으면 둘 다 여기서 조용히 잘린다(§6 U-b 2026-08-18 후속).
    for (const plant of [
      [ANCHOR, `   표본 «지목»`],
      [ANCHOR, "", PLANTED],
    ]) {
      const bent = SELF_SOURCE.replace(ANCHOR, plant.join("\n"));
      expect(bent).not.toBe(SELF_SOURCE);
      expect(headByContract(bent)).toMatch(/[«»]/);
    }
  });
});
