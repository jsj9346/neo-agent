/**
 * 독립 검증 (T-006) — `docs-gate-parity.qa.test.ts`가 `DOC-CITATION.md` §3.4의
 * S-4 · S-5 · S-6 · S-7 · N-1~N-4 · Q-1~Q-3 · Q-6을 옮긴 것이 맞는가.
 *
 * **Q축의 범위가 이 파일과 `packages/cli/test/doc-citation.contract.test.ts`로 갈린다** —
 * 부류가 미치는 범위(Q-4·Q-5)와 짝이 어긋난 입력(Q-7)은 그쪽 파일이 든다. 여기가 드는 Q-6은
 * 2026-08-16에 들어왔고, 그날까지 이 파일이 [미규정]으로 세워 둔 자리(여닫 펜스의 들여쓰기)를
 * 정본이 답한 것이다.
 *
 * **기대값의 출처는 `DOC-CITATION.md` §3.4 하나다.** 대상 파일의 구현을 읽어 기대값을
 * 정하지 않는다 — 그렇게 하면 대상이 옳았다는 것을 대상으로 증명하는 순환이 된다.
 * 대상이 문서와 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * ---
 *
 * ## 어떻게 대상을 부르는가
 *
 * 대상 파일은 파서를 내보내지 않는다(`describe` 안팎의 모듈 지역 선언이다). 그렇다고
 * 파서를 이 파일에 **복사하면 검증 대상이 사본이 되어** 대상이 바뀌어도 이 파일이 그린이다.
 * 그래서 대상의 **원문을 잘라 그 자리에서 transpile 해 부른다** — 검증되는 것은 언제나
 * 대상 파일의 현재 텍스트다. 잘라 내는 구간의 표지가 사라지면 던진다(fail-closed).
 *
 * ## 이 파일이 재지 않는 것
 *
 * - **게이트 ↔ 문서 파리티**(금지 모듈 · 타입 블록)는 대상 파일의 몫이고 여기서 다시 재지
 *   않는다. 이 파일의 범위는 §3.4 S-4 · S-5 · S-6 · N-1~N-4 · Q-1~Q-3 · Q-6과 대상 파일 머리
 *   주석의 주장뿐이다.
 * - **S-5의 `지목` 절반은 재지 않는다** — 무엇이 지목인가를 재는 코드가 대상에 없고, 따라서
 *   S-4가 지목으로 코퍼스를 넓히는 부분(기록·리비전)도 서지 않는다. 이 사실이 N-1의
 *   재도입 트리거(지목 범위가 넓어 근거 없는 그린이 관측되면 역할별로 가른다)를 오늘
 *   0건으로 만드는 근거다 — 판정은 리포트가 올린다.
 * - **`scripts/doc-citation.mjs`의 게이트 판정**은 대상이 아니다. §4가 그 게이트를 형식
 *   전용으로 좁혔고 여기서 재는 것은 대상 테스트 파일의 파서다.
 * - 회색지대는 판정하지 않는다. [미규정] 표시가 붙은 `it`은 그날의 읽기를 고정만 하며
 *   등급을 매기지 않는다 — 판정은 리포트가 올린다. **2026-08-14에 일곱이 전부 계약 참조로
 *   바뀌었고**(N-1~N-4 · Q-1~Q-3), **2026-08-15에 하나가 들어왔다가**(여는 펜스와 닫는 펜스의
 *   들여쓰기가 어긋난 쌍 — Q-2가 폭을 풀면서 생긴 자리) **2026-08-16에 Q-6이 그것을 답으로
 *   닫았다.** **마지막 하나였던 표 칸 경계의 코드 스팬 `|`은 2026-08-17에 §3.4가 맨 구분자
 *   쪽으로 추인해 닫았다**(`DOC-CITATION.md:306` · `K-101`) — 그 자리의 `it`은 이제 미규정을
 *   고정하는 것이 아니라 정본이 추인한 값을 고정한다. **오늘 회색지대를 고정만 하는 `it`은
 *   이 파일에 하나도 없다.** 그래도 아래 머리 ↔ 본문 가드는 그대로 산다 — 대상 파일 본문에
 *   표시가 다시 생겼는데 그 머리에 안 실리면 red다.
 *
 * 이 주석은 인용부호를 쓰지 않는다. **근거는 S-4의 코퍼스가 아니다** — 그 코퍼스는
 * `neo-agent-main/docs/*.md`와 동결 레퍼런스 트리와 지목된 기록이라 `.ts` 주석은 무엇을
 * 적든 그것을 넓히지 못한다. 근거는 `DOC-CITATION.md` §6 U-b의 2026-08-17 판정이다:
 * 대조 축(U-1 · D-1 · D-2)이 걸리는 자리가 `packages/` 밑 각 패키지의 `test/`까지 넓어졌고
 * 이 파일이 그 안이다(그 자리를 판정의 글로브 표기 그대로 적지 않는 것은 그 표기가 블록
 * 주석을 거기서 닫기 때문이다). 인용부호를 쓰면 그 문면은 문자 그대로 대조를 받아야 하는데
 * 이 자리를 재는 기계는 없다. 같은 판정은 **계약의 자리**를 각 파일 자신의 머리에 두되
 * **재는 기계를 둘 것인가는 열려 있다**고 적는다 — 아래 자기 축 가드는 이 머리만 잰다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript") as typeof import("typescript");

// 인용부호 구간 파서의 **정본**(`DOC-CITATION.md` §6 U-e 2026-08-15). 아래 적재 장치가
// 대상 파일에서 슬라이스하는 것은 단위 분해와 대조 판정뿐이고, 파서 몫은 여기서 주입한다.
const { FENCE_LINE, quoteSpans } = nodeRequire("../../../scripts/doc-citation.mjs") as {
  FENCE_LINE: RegExp;
  quoteSpans: (doc: string) => { start: number; end: number }[];
};

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const TARGET_PATH = path("./docs-gate-parity.qa.test.ts");
const TARGET_SOURCE = readFileSync(TARGET_PATH, "utf8");
/**
 * 이 파일 자신의 원문. 아래 머리 ↔ 실물 가드를 자기 머리에도 걸기 위한 것이다(`K-147`).
 * 파일 이름을 문자열로 적지 않는다 — 적으면 개명 때 낡는다.
 */
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");

/**
 * 머리 주석 — **빈 줄 없이 이어지는 주석 줄의 덩어리 하나**다. `DOC-CITATION.md` §6 U-b의
 * 2026-08-18 판정이 코드 파일의 단위를 그것으로 정하고 머리도 같은 술어로 끊는다고 적는다.
 *
 * **줄의 소속은 렉싱이 정한다 — 줄 모양(별표 접두)이 아니다**(같은 절의 2026-08-18 후속 판정).
 * 주석 토큰 안의 모든 줄이 그 덩어리에 든다: 별표로 시작하지 않는 계속 줄도, 블록 주석 안의
 * 완전 공백 줄도 덩어리를 안 끊는다. 끊는 것은 주석 토큰의 끝뿐이고, 그 끝 뒤로 주석 없는 줄이
 * 하나라도 놓이면 거기서 다음 덩어리다. 줄 모양으로 읽으면 그 두 형태가 머리를 조용히 짧게
 * 만든다(`ARCHITECTURE.md` §2.6 가시적 결과 · 근거는 `plans/20260818-checker-K-158.md`).
 *
 * **첫 닫기 표기까지로 자르지도 않는다.** 머리를 블록 주석 둘로 쪼갠 배치는 타입스크립트 문법상
 * 완전히 유효해서 파싱 에러도 안 나고, 짧아진 뒤의 주장은 안 재진 채 그린이 된다
 * (표본은 `plans/20260818-ub-K-152.md` §1의 B).
 *
 * **주석 밖 글자는 공백으로 덮어 돌려준다.** 같은 판정이 코드 파일에서 주석 안만 재라고 적으므로,
 * 덩어리가 꼬리 주석을 단 코드 줄까지 자라도 그 줄의 문자열 리터럴은 이 값에 안 실린다. 자리와
 * 길이는 보존하므로 부르는 쪽이 이 길이로 본문을 자르는 것은 그대로 선다.
 *
 * 덩어리가 파일 첫 줄에서 시작하지 않으면 빈 문자열이 나온다 — 부르는 쪽이 그것을 fail-closed로
 * 쓴다.
 */
function leadingCommentBlock(source: string): string {
  const spans = commentTokenSpans(source);
  const first = spans[0];
  if (first === undefined || !/^[ \t]*$/.test(source.slice(0, first.pos))) return "";

  let end = first.end;
  for (const span of spans.slice(1)) {
    // 사이에 낀 줄바꿈이 둘 이상이면 주석 없는 줄이 하나 이상 놓인 것이다 — 거기서 끊는다.
    if ((source.slice(end, span.pos).match(/\n/g) ?? []).length > 1) break;
    end = span.end;
  }

  let masked = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.pos >= end) break;
    masked += source.slice(cursor, span.pos).replace(/[^\n]/g, " ");
    masked += source.slice(span.pos, span.end);
    cursor = span.end;
  }
  return masked;
}

/**
 * 주석 토큰의 구간들. **렉서가 정한 소속을 그대로 쓴다** — 손으로 쓴 상태 기계는 문자열 안의
 * 글로브 표기를 주석 시작으로 읽어 값이 조용히 틀린다(2026-08-18 실측).
 *
 * 파서를 세워 토큰마다 앞뒤 트리비아를 걷는다. 스캐너를 단독으로 돌리면 정규식·문자열 문맥이
 * 없어 리터럴 안의 표기가 주석으로 잡힌다(같은 실측 — 이 레포에서 26파일).
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

const PROVIDERS_PATH = path("../../../docs/PROVIDERS.md");
const PROVIDERS_DOC = readFileSync(PROVIDERS_PATH, "utf8");
const SESSION_STORE_DOC = readFileSync(path("../../../docs/SESSION-STORE.md"), "utf8");
const DOC_CITATION_DOC = readFileSync(path("../../../docs/DOC-CITATION.md"), "utf8");
/** Q-2의 실측이 든 범위. §1이 이 규약의 대상 트리로 그은 자리와 같다 */
const DOCS_DIR = path("../../../docs/");

/* ------------------------------------------------------------------------ *
 * 대상 파서 적재
 * ------------------------------------------------------------------------ */

type TextSpan = { readonly start: number; readonly end: number };

type CitedVerdict =
  | { readonly kind: "ok"; readonly outside: number }
  | { readonly kind: "absent" }
  | { readonly kind: "citing-only"; readonly occurrences: number };

interface TargetParsers {
  quoteSpans(doc: string): TextSpan[];
  documentUnits(doc: string): TextSpan[];
  citedVerdict(quote: string, doc?: string): CitedVerdict;
}

/** 대상 원문에서 `[from, to)` 구간을 뽑는다. 표지가 없으면 던진다 */
function region(from: string, to: string): string {
  const start = TARGET_SOURCE.indexOf(from);
  const end = TARGET_SOURCE.indexOf(to);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `대상 파일에서 구간을 뽑지 못했다 (표지: ${from.slice(0, 24)} … ${to.slice(0, 24)}) — 대상이 개편됐으면 이 검증기를 먼저 고친다`,
    );
  }
  return TARGET_SOURCE.slice(start, end);
}

/**
 * **2026-08-15 — 인용부호 구간 파서가 대상 파일에서 나갔다.**
 *
 * 그 전에는 마스킹·구간 추출도 이 슬라이스가 담았다. 정본이 `scripts/doc-citation.mjs`로
 * 옮겨졌으므로(`DOC-CITATION.md` §6 U-e 2026-08-15 판정) 그 몫은 **임포트해서 주입**한다.
 *
 * **적재 장치를 없애지 않는 이유는 그 근거가 그대로이기 때문이다** — 단위 분해와 대조 판정은
 * 여전히 대상 파일에 살고, 그것을 사본으로 두면 대상이 바뀌어도 이 파일이 그린이다. 파서 쪽은
 * 반대다: 정본이 하나가 된 뒤로는 **임포트가 슬라이스보다 강한 검증**이다. 슬라이스는 대상
 * 파일의 텍스트를 재현하지만 임포트는 실제로 게이트가 쓰는 코드를 부른다.
 */
function loadTargetParsers(): TargetParsers {
  const source = [
    `const PROVIDERS_DOC = require("node:fs").readFileSync(${JSON.stringify(PROVIDERS_PATH)}, "utf8");`,
    // 정본 파서를 슬라이스 스코프에 묶는다. 슬라이스가 이 이름들을 자유 변수로 쓴다.
    "const { FENCE_LINE, quoteSpans } = canon;",
    region("function documentQuoteSpans", 'describe("DOC-CITATION §3.4 S-5'),
    region("  type CitedVerdict =", "  /**\n   * 실패 메시지는 두 갈래다"),
    "exports.documentUnits = documentUnits;",
    "exports.citedVerdict = citedVerdict;",
  ].join("\n");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: Record<string, unknown> = {};
  // 사본이 아니라 대상의 현재 원문을 실행한다 — 사본을 두면 대상이 바뀌어도 이 파일이 그린이다.
  new Function("exports", "require", "canon", compiled)(loaded, nodeRequire, {
    FENCE_LINE,
    quoteSpans,
  });
  // **가드가 `documentUnits`를 본다.** 파서는 이제 임포트라 존재가 자명하므로 그것을 재면
  // 적재가 실패해도 통과한다 — 대상에서 오는 것 중 하나를 짚어야 이 가드가 산다.
  const parsers = { ...loaded, quoteSpans } as unknown as TargetParsers;
  if (typeof parsers.documentUnits !== "function") throw new Error("대상 파서 적재에 실패했다");
  return parsers;
}

const target = loadTargetParsers();

const textOf = (doc: string, spans: TextSpan[]): string[] =>
  spans.map((span) => doc.slice(span.start, span.end));
const unitsOf = (doc: string): string[] => textOf(doc, target.documentUnits(doc));
const quotesOf = (doc: string): string[] => textOf(doc, target.quoteSpans(doc));

/* ------------------------------------------------------------------------ *
 * S-6 · Q-1~Q-3 · Q-6 — 무엇이 코드이고 무엇이 인용부호인가 · 펜스의 닫기
 * ------------------------------------------------------------------------ */

/** 한 줄 안에서 닫히는 이중 백틱 코드 스팬. CommonMark의 여는/닫는 런 규칙을 이 폭만 쓴다 */
const DOUBLE_BACKTICK_SPAN = /``[^\n]*?``/g;

describe("DOC-CITATION §3.4 S-6 · Q-1~Q-3 · Q-6 — 코드 표기와 인용부호의 부류", () => {
  it("S-6 적합 — 홑 백틱 스팬 안의 큰따옴표는 구간이 아니고, 산문의 큰따옴표는 구간이다", () => {
    const sample = '설정은 `stopReason: "max_tokens"` 이고 본문은 "진짜 인용"이다.';
    expect(quotesOf(sample)).toEqual(['"진짜 인용"']);

    // 역검증 — 스팬 마스킹을 지우면 같은 표본에서 코드 스팬 안 큰따옴표가 걸린다.
    // 이 검사가 «통과만 확인하는» 형태로 퇴화하지 않았음을 한 자리에서 고정한다.
    const unmasked = [...sample.matchAll(/"[^"\n]*"/g)].map((m) => m[0]);
    expect(unmasked).toContain('"max_tokens"');
    expect(unmasked.length).toBeGreaterThan(quotesOf(sample).length);
  });

  it("S-6 · Q-1 — 이중 백틱 코드 스팬 안의 큰따옴표도 인용부호가 아니다 (런 길이가 같은 쌍)", () => {
    // Q-1: 코드 표기는 부류이고, 인라인 스팬은 «여는 백틱 런과 닫는 백틱 런의 **길이가 같은**
    // 쌍»이다. 이중 백틱 쌍도 그 부류이므로 통째로 마스킹된다 — 중간에서 끊기면 유령 구간이
    // 남아 단위를 인용하는 단위로 오분류하고 근거 없는 red가 난다.
    const sample = '금지 표기는 `` `**"표본 문면"**` ``이다.';
    expect(
      target.quoteSpans(sample).length,
      `구간으로 잡힌 것: ${quotesOf(sample).join(" · ")}`,
    ).toBe(0);

    // 같은 길이의 런끼리만 짝짓는다 — 세 런 쌍도 스팬이고, 그 뒤 산문의 인용은 살아 있다.
    expect(quotesOf('표기는 ```세 런```이고 `한 런`이며 본문은 "진짜 인용"이다.')).toEqual([
      '"진짜 인용"',
    ]);

    // 짝 없는 런은 스팬을 열지 않는다 — 열면 줄 나머지를 삼켜 인용이 조용히 사라진다.
    expect(quotesOf('`짝 없는 런과 "진짜 인용"이 한 줄에 있다.')).toEqual(['"진짜 인용"']);
  });

  it("S-6 — 실물 코퍼스에 이중 백틱 스팬 안이 인용부호로 잡히는 자리가 없다", () => {
    // S-4가 정한 코퍼스는 `docs/*.md` 전체다. 대상 파일이 오늘 먹이는 것은 그중 둘뿐이지만,
    // 파서가 S-6을 옮긴 것이라면 코퍼스 전량에서 성립해야 한다.
    const wrong: string[] = [];
    for (const [name, doc] of [
      ["PROVIDERS.md", PROVIDERS_DOC],
      ["SESSION-STORE.md", SESSION_STORE_DOC],
      ["DOC-CITATION.md", DOC_CITATION_DOC],
    ] as const) {
      const codeSpans = [...doc.matchAll(DOUBLE_BACKTICK_SPAN)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
      }));
      for (const span of target.quoteSpans(doc)) {
        if (codeSpans.some((code) => code.start <= span.start && span.end <= code.end)) {
          wrong.push(`${name}: ${doc.slice(span.start, span.end)}`);
        }
      }
    }
    expect(
      wrong,
      `이중 백틱 스팬 안인데 인용부호 구간으로 잡혔다:\n  ${wrong.join("\n  ")}`,
    ).toEqual([]);
  });

  it("Q-1 — 코드 «펜스»도 코드 표기다 (백틱·물결 둘 다 · 몇 칸을 들여썼든)", () => {
    // Q-1이 S-6의 백틱 코드 스팬 하나를 부류로 넓혔다 — 인라인 스팬과 코드 펜스(백틱·물결)
    // 전부가 코드 표기이고 그 안의 큰따옴표는 인용부호가 아니다. 물결 펜스에 백틱이 한 글자도
    // 없는 것은 걸리지 않는다: 부류의 근거가 **백틱이 있는가**가 아니라 S-6이 든 이유 셋이다.
    const backtick = ["```ts", 'const a = "펜스 안";', "```", "", '본문 "진짜 인용".'].join("\n");
    const tilde = ["~~~ts", 'const a = "물결 펜스 안";', "~~~", "", '본문 "진짜 인용".'].join("\n");
    expect(quotesOf(backtick)).toEqual(['"진짜 인용"']);
    expect(quotesOf(tilde)).toEqual(['"진짜 인용"']);

    // **들여쓴 펜스가 이 부류다 — 아래 Q-2가 아니다.** 그 배정을 하는 것은 Q-2 자신의 술어이고
    // (2026-08-15 명문화), 문면이 폭까지 함께 푼다: *"들여쓴 **펜스**는 마커가 있으므로 이
    // 항이 아니라 Q-1의 부류이고, 몇 칸을 들여썼든 코드 표기다"*. 따라서 들여쓰기 폭은 술어에
    // 안 들고, 4칸·8칸을 갈라 재는 것은 그 «몇 칸을 들여썼든»의 확인이다.
    for (const indent of ["    ", "        "]) {
      const nested = [
        `${indent}\`\`\`ts`,
        `${indent}const a = "들여쓴 펜스 안";`,
        `${indent}\`\`\``,
        "",
        '본문 "진짜 인용".',
      ].join("\n");
      expect(quotesOf(nested), `${indent.length}칸 들여쓴 백틱 펜스`).toEqual(['"진짜 인용"']);
    }
    // 부류는 마커 종류도 안 가린다 — 들여쓴 물결 펜스도 같은 자리다.
    expect(
      quotesOf(
        [
          "        ~~~ts",
          '        const a = "들여쓴 물결 안";',
          "        ~~~",
          "",
          '본문 "진짜 인용".',
        ].join("\n"),
      ),
    ).toEqual(['"진짜 인용"']);
  });

  it("Q-2 — 마커 «없는» 들여쓰기 블록은 코드 표기가 아니므로 그 안의 큰따옴표는 인용부호다", () => {
    // Q-2: `docs/*.md`는 들여쓰기 코드 블록을 쓰지 않고, 그래도 쓰이면 그것은 코드 표기가
    // 아니다. 4칸 들여쓰기는 **마커가 없고** 무엇인지 알려면 앞 블록을 읽어야 하고, 그러면
    // S-6의 근거(판정이 문자열 안에서 끝난다)가 무너지기 때문이다. **안 지우는 것이 계약
    // 준수다.**
    //
    // **2026-08-15 명문화가 이 검사의 기대값을 뒤집었다.** 옛 표본은 4칸 들여쓴 **펜스**를
    // 먹이고 그 안의 큰따옴표를 구간으로 기대했는데, 개정 문면이 그 자리를 이 항에서 빼
    // Q-1로 보낸다 — *"«들여쓰기 코드 블록»은 마커가 없는 것을 말한다"*이고, *"들여쓴 **펜스**는
    // 마커가 있으므로 이 항이 아니라 Q-1의 부류이고, 몇 칸을 들여썼든 코드 표기다"*. 그 표본은
    // 위 Q-1 검사로 옮겼고 여기 남는 것은 **마커가 없는** 형태뿐이다.
    expect(
      quotesOf(["앞 문단이다.", "", '    const a = "깊은 곳";', "", "뒤 문단."].join("\n")),
    ).toEqual(['"깊은 곳"']);
    // 폭은 여기서도 술어에 안 든다 — 마커가 없으면 8칸도 코드 표기가 아니다.
    expect(
      quotesOf(["앞 문단이다.", "", '        const a = "더 깊은 곳";', ""].join("\n")),
    ).toEqual(['"더 깊은 곳"']);
    // **목록 연속도 같은 답을 받는다.** Q-2의 «왜»가 든 애매함(*"같은 표기가 목록 연속이기도
    // 하다 — 무엇인지 알려면 앞의 블록을 읽어야 하므로"*)이 술어에서는 사라진다: 두 읽기 어느
    // 쪽도 코드 표기가 아니므로 앞을 안 읽고 답이 같다. 그것이 *"형태를 금지하면 술어가 다시
    // 문자열 안에서 끝난다"*의 실물이다.
    expect(quotesOf(["- 항목", "", '    const a = "목록 연속";'].join("\n"))).toEqual([
      '"목록 연속"',
    ]);

    // 역검증 — **마커 한 줄이 답을 가른다.** 같은 표본에 펜스 마커를 씌우면 구간이 사라지고
    // 벗기면 돌아온다. 이 짝이 없으면 위 단언들은 «아무것도 안 세는 파서»에서도 그린이다.
    const stripped = ["앞 문단이다.", "", '    const a = "깊은 곳";', ""].join("\n");
    const marked = [
      "앞 문단이다.",
      "",
      "    ```ts",
      '    const a = "깊은 곳";',
      "    ```",
      "",
    ].join("\n");
    expect(quotesOf(stripped)).toEqual(['"깊은 곳"']);
    expect(quotesOf(marked), "마커를 씌웠는데도 구간이 남는다").toEqual([]);

    // Q-2가 근거로 든 실측을 다시 잰다 — *"4칸 이상 들여쓴 줄은 전부 펜스 안이거나 목록
    // 연속이다"*(2026-08-14). **옛 검사는 이것을 4칸 이상 들여쓴 펜스가 0건으로 근사했는데
    // 개정 문면이 바로 그 형태를 허용으로 돌렸으므로**(몇 칸을 들여썼든 코드 표기다) 그대로
    // 두면 계약을 지킨 문서에서 red가 난다. 실측 자신의 술어로 바꿔 단다. Q-2는 이 금지에
    // 게이트를 붙이지 않기로 했으므로 이것은 게이트가 아니라 그 실측의 재확인이다.
    //
    // 펜스 추적에 대상의 `FENCE_LINE`을 쓰지 않는다 — 쓰면 실측이 구현으로 도로 순환한다.
    // 범위도 세 문서가 아니라 `docs/*.md` 전량이다: 4칸 들여쓴 줄이 실제로 사는 문서가 셋
    // 밖에 있어(`APPROVAL-GATE.md` · `CLI-INTERFACE.md` · `CORE-INTERFACE.md`) 셋만 재면
    // 이 실측은 아무것도 안 재는 것이 된다.
    const stray: string[] = [];
    let indented = 0;
    for (const name of readdirSync(DOCS_DIR).filter((file) => file.endsWith(".md"))) {
      let fence: string | null = null;
      let inList = false;
      readFileSync(`${DOCS_DIR}${name}`, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (/^ {4,}\S/.test(line)) indented++;
          const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0] ?? null;
          if (fence !== null) {
            if (marker === fence) fence = null;
            return;
          }
          if (marker !== null) {
            fence = marker;
            return;
          }
          if (/^\s*([-*+]|\d+[.)])\s/.test(line)) inList = true;
          else if (line.trim() !== "" && !/^\s+\S/.test(line)) inList = false;
          if (/^ {4,}\S/.test(line) && !inList) stray.push(`${name}:${index + 1}`);
        });
    }
    // **비어 있지 않음을 먼저 잰다.** 이 실측은 0이 통과 방향이라 «아무 줄도 못 본 분류기»가
    // 그대로 그린이다 — 실물에 4칸 들여쓴 줄이 서른 있고, 그 수가 0이 되면 재는 것이 없다.
    expect(
      indented,
      "4칸 들여쓴 줄을 한 줄도 못 봤다 — 이 실측이 아무것도 안 재고 있다",
    ).toBeGreaterThan(0);
    expect(stray, `펜스 밖·목록 밖의 4칸 들여쓴 줄: ${stray.join(" · ")}`).toEqual([]);
  });

  it("Q-6 — 여닫 펜스의 들여쓰기가 어긋나도 닫힌다 (자리는 닫기 판정에 안 든다)", () => {
    // **이 자리는 2026-08-15까지 [미규정]이었다.** 그때 §3.4는 여는 줄과 닫는 줄의 들여쓰기가
    // 어떤 관계여야 하는지를 한 글자도 말하지 않았고, 구현이 들여쓰기를 안 보고 닫는 것은
    // 계약이 아니라 구현의 선택이었다. Q-6이 그 선택을 계약으로 올렸다 — *"닫는 마커는 여는
    // 마커와 **같은 문자**이고 **런 길이가 여는 런 이상**이어야 한다. 들여쓰기 폭과 인용 블록
    // 접두는 닫기 판정에 들지 않는다"*. 기대값의 출처는 그 한 문장이다.
    //
    // **방향이 침묵 쪽이라 중요하다** — 어긋난 닫는 줄이 펜스를 안 닫으면 마스킹이 문서 뒤를
    // 삼켜 인용부호 구간이 조용히 사라진다(아래 **근거 없는 그린 후보** 검사가 든 형태).
    const doc = (open: string, close: string): string =>
      [open, 'const a = "펜스 안";', close, "", '본문 "진짜 인용".'].join("\n");

    expect(quotesOf(doc("    ```ts", "```")), "여는 쪽만 4칸").toEqual(['"진짜 인용"']);
    expect(quotesOf(doc("```ts", "        ```")), "닫는 쪽만 8칸").toEqual(['"진짜 인용"']);
    expect(quotesOf(doc("    ~~~ts", "  ~~~")), "물결 · 4칸과 2칸").toEqual(['"진짜 인용"']);

    // 역검증 — **가르는 것은 자리가 아니라 마커다.** 같은 표본에서 마커 문자를 어긋내거나 닫는
    // 런을 여는 런보다 짧게 하면 안 닫히고 뒤 인용이 사라진다. 이 짝이 없으면 위 단언들은
    // «펜스를 아예 안 보는 파서»에서도 그린이다.
    expect(quotesOf(doc("```ts", "~~~")), "마커 문자가 다른데 닫혔다").toEqual([]);
    expect(quotesOf(doc("````ts", "```")), "닫는 런이 짧은데 닫혔다").toEqual([]);
  });

  it("Q-3 — 평문 큰따옴표는 부류다: 곡선도 혼합 쌍도 인용부호 구간이다", () => {
    // Q-3: 곧은 것과 곡선 것을 가리지 않고, **부류는 여는 글자와 닫는 글자에 각각 걸린다** —
    // 한쪽만 곡선인 혼합 쌍도 구간이다. 쌍으로 읽으면 한쪽만 곡선으로 쓰는 도피처가 열린다.
    expect(quotesOf('본문이 “곡선”과 "평문"을 든다.')).toEqual(["“곡선”", '"평문"']);
    expect(quotesOf('혼합 쌍은 "여기서 닫힌다”.')).toEqual(['"여기서 닫힌다”']);
    expect(quotesOf('혼합 쌍은 “여기서 닫힌다".')).toEqual(['“여기서 닫힌다"']);

    // 홑따옴표는 밖이다 — 아포스트로피와 표기가 같아 판정이 문자열 안에서 안 끝난다.
    expect(quotesOf("홑따옴표는 '밖이다'.")).toEqual([]);

    // Q-3이 «실물 0건»으로 든 자리를 다시 잰다. 곡선이 실물에 들어오면 그 자리는 이제 U-1의
    // 대조 대상이므로, 0이 아니게 되는 순간이 관측돼야 한다.
    for (const doc of [PROVIDERS_DOC, SESSION_STORE_DOC, DOC_CITATION_DOC]) {
      expect(doc.match(/[“”]/g)).toBeNull();
    }
  });

  it("근거 없는 그린 후보 — 닫히지 않은 펜스가 문서 뒤를 통째로 마스킹하지 않는다", () => {
    // 마스킹이 넓어지는 방향은 **조용한 그린**이다 — 인용부호 구간이 사라지면 그 단위는
    // 인용하는 단위가 아니게 되고 코퍼스가 소리 없이 넓어진다. §3.4가 N-1에서 침묵 쪽을
    // 거부한 방향 그대로이므로 실물에서 0건임을 잰다. 대상의 마스킹을 베끼지 않고 **말미에
    // 인용을 하나 더 붙이면 구간도 하나 느는가**로 밖에서 잰다.
    const probe = (doc: string): number =>
      target.quoteSpans(`${doc}\n«말미 표본»\n`).length - target.quoteSpans(doc).length;
    for (const [name, doc] of [
      ["PROVIDERS.md", PROVIDERS_DOC],
      ["SESSION-STORE.md", SESSION_STORE_DOC],
      ["DOC-CITATION.md", DOC_CITATION_DOC],
    ] as const) {
      expect(probe(doc), `${name}: 말미가 마스킹돼 인용이 조용히 사라진다`).toBe(1);
    }

    // 역검증 — 닫히지 않은 펜스를 일부러 넣으면 이 탐지기가 0을 낸다.
    expect(probe("```ts\ncode\n")).toBe(0);
  });

  it("Q-3 — 직각 인용부호는 넷째 형식이 아니다 (인용부호는 셋 그대로)", () => {
    // §3.4는 직각 인용부호를 실물로 알면서도 인용부호로 승격시키지 않았다 — 그것이 S-1이 벗긴
    // 자리의 대체 표기로 이미 쓰이고 있어 승격시키면 옮겨 갈 자리가 없어지기 때문이다.
    // 승격 여부는 §6 U-j이고, 그날 이 검사가 red로 뒤집히는 것이 그 판정의 신호다.
    expect(quotesOf("본문이 「직각 인용」을 들고 «셋째 형식»도 든다.")).toEqual(["«셋째 형식»"]);
  });
});

/* ------------------------------------------------------------------------ *
 * S-5 — 유효 범위는 렌더링 한 덩어리: 문단 · 목록 항목 하나 · 표 한 칸 · 인용 블록 · 코드 펜스
 * ------------------------------------------------------------------------ */

/** 다섯 형태 각각이 «자기 단위»로 나오는가. 어긋나면 던진다 — 역검증이 이 던짐을 쓴다 */
function assertOwnUnit(units: string[], parts: readonly string[], label: string): void {
  for (const part of parts) {
    const holders = units.filter((unit) => unit.includes(part));
    if (holders.length !== 1)
      throw new Error(`${label}: ${part}을 담은 단위가 ${holders.length}개다`);
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const left = parts[i] as string;
      const right = parts[j] as string;
      if (units.some((unit) => unit.includes(left) && unit.includes(right))) {
        throw new Error(`${label}: 한 단위가 ${left}과 ${right}을 함께 담는다`);
      }
    }
  }
}

describe("DOC-CITATION §3.4 S-5 · N-1 · N-2 — 단위 분해", () => {
  const forms = [
    {
      name: "문단 (손 줄바꿈 3줄이 한 단위)",
      doc: "첫 줄이고\n둘째 줄이며\n셋째 줄이다.\n",
      parts: ["첫 줄이고"],
    },
    {
      name: "목록 항목 하나",
      doc: "- 항목 하나\n  이어지는 줄\n- 항목 둘\n",
      parts: ["항목 하나", "항목 둘"],
    },
    {
      name: "표 한 칸",
      doc: "| 첫 칸 | 둘째 칸 |\n| --- | --- |\n| 셋째 칸 | 넷째 칸 |\n",
      parts: ["첫 칸", "둘째 칸", "셋째 칸", "넷째 칸"],
    },
    { name: "인용 블록", doc: "> 첫 줄\n> 둘째 줄\n\n바깥 문단\n", parts: ["첫 줄", "바깥 문단"] },
    { name: "코드 펜스", doc: "```ts\ncode\n```\n\n바깥 문단\n", parts: ["code", "바깥 문단"] },
  ] as const;

  for (const form of forms) {
    it(`S-5 — ${form.name}`, () => {
      assertOwnUnit(unitsOf(form.doc), form.parts, form.name);
    });
  }

  it("S-5 — 단위는 «줄»이 아니다 (문단이 줄 경계를 넘어 한 단위다)", () => {
    // S-5가 단위를 줄로 하지 않는 근거를 그대로 잰다 — 이 레포 문서는 손으로 줄바꿈한다.
    const doc = "첫 줄이고\n둘째 줄이며\n셋째 줄이다.\n";
    expect(unitsOf(doc)).toEqual([doc]);
  });

  it("S-5 — 분해가 문서를 빈틈없이, 겹치지 않게 덮는다 (`DOC-CITATION.md` 포함)", () => {
    // 대상 파일이 먹이지 않는 문서 하나를 더 넣는다. 덮개가 깨지면 S-4의 배제 단위가
    // 어느 자리에서 «없음»이 되고, 그 자리는 조용히 코퍼스로 남는다.
    for (const doc of [PROVIDERS_DOC, SESSION_STORE_DOC, DOC_CITATION_DOC]) {
      const units = target.documentUnits(doc);
      expect(units.length).toBeGreaterThan(0);
      expect((units[0] as TextSpan).start).toBe(0);
      expect((units[units.length - 1] as TextSpan).end).toBe(doc.length);
      for (let i = 0; i + 1 < units.length; i++) {
        expect((units[i] as TextSpan).end).toBe((units[i + 1] as TextSpan).start);
      }
    }
  });

  it("검사기가 «한 단위가 둘을 삼킨 상태»를 실제로 잡는다 (역검증)", () => {
    // 일부러 위반을 넣는다 — 문서 전체를 한 단위로 준 분해.
    const doc = "| 첫 칸 | 둘째 칸 |\n";
    expect(() => assertOwnUnit([doc], ["첫 칸", "둘째 칸"], "역검증")).toThrow(/함께 담는다/);
    // 반대로 참 분해는 통과한다.
    expect(() => assertOwnUnit(unitsOf(doc), ["첫 칸", "둘째 칸"], "역검증")).not.toThrow();
  });

  it("N-2 — 다섯 형태에 안 드는 줄은 그 줄 하나가 단위다", () => {
    // N-2의 잔여는 넷이다 — 제목 줄 · 빈 줄 · 수평선 · 표 구분자 행. 덮개에 틈이 있으면
    // 그 자리의 히트가 어느 단위에도 안 담겨 조용히 코퍼스에 남는다.
    expect(unitsOf("# 제목\n\n문단\n")).toEqual(["# 제목\n", "\n", "문단\n"]);
    expect(unitsOf("문단\n\n---\n\n다음 문단\n")).toEqual([
      "문단\n",
      "\n",
      "---\n",
      "\n",
      "다음 문단\n",
    ]);
    // 표 구분자 행은 «칸»으로 갈리지 않고 그 줄 하나가 단위다.
    expect(unitsOf("| 첫 칸 | 둘째 칸 |\n| --- | --- |\n")).toContain("| --- | --- |\n");
  });

  it("N-1 — 형태가 겹치면 가장 «바깥» 형태가 단위다", () => {
    // ① 목록 항목 안의 코드 펜스 → 단위는 «항목»이다. 안쪽(펜스)을 고르면 인용이 항목
    //    텍스트에 있고 원문이 같은 항목 안 펜스에만 있을 때 판정이 통과하는데, 그것이 S-4가
    //    닫는 순환 자신이다. S-5의 «렌더링 한 덩어리»도 항목 하나를 말하지 그 안의 조각을
    //    말하지 않는다.
    const listWithFence = ["- 항목", "  ```ts", "  code", "  ```", "- 다음"].join("\n");
    expect(unitsOf(listWithFence)).toEqual(["- 항목\n  ```ts\n  code\n  ```\n", "- 다음"]);

    // ② 목록 항목 안의 하위 항목 → 단위는 «바깥 항목»이다.
    expect(unitsOf("- 바깥 항목\n  - 안쪽 항목\n- 다음 항목\n")).toEqual([
      "- 바깥 항목\n  - 안쪽 항목\n",
      "- 다음 항목\n",
    ]);

    // ③ 인용 블록 안의 표·목록·펜스 → 단위는 «인용 블록»이다.
    expect(unitsOf("> | a | b |\n> | c | d |\n").length).toBe(1);
    expect(unitsOf("> - 하나\n> - 둘\n").length).toBe(1);
    expect(unitsOf("> ```ts\n> code\n> ```\n").length).toBe(1);

    // ③' 목록 항목 안의 표·인용 블록도 같은 자리다 — N-1이 든 겹침은 목록이 부류다.
    expect(unitsOf("- 항목\n  | a | b |\n- 다음\n")).toEqual(["- 항목\n  | a | b |\n", "- 다음\n"]);
    expect(unitsOf("- 항목\n  > 인용\n- 다음\n")).toEqual(["- 항목\n  > 인용\n", "- 다음\n"]);

    // ④ 바깥은 다섯 형태 «안에서만» 찾는다 — 문서 전체는 형태가 아니므로 형제 문단은 합쳐지지
    //    않는다. 이 자리가 깨지면 바깥 고르기가 문서 전체로 번져 코퍼스가 통째로 빈다.
    expect(unitsOf("첫 문단\n\n둘째 문단\n").length).toBeGreaterThan(1);
  });

  it("검사기가 «항목이 쪼개진 상태»를 실제로 잡는다 (N-1 역검증)", () => {
    // 일부러 N-1 위반을 넣는다 — 항목 안의 펜스를 자기 단위로 읽은 분해. 이 분해에서는
    // 항목 텍스트와 펜스 내용이 다른 단위에 담긴다.
    const listWithFence = ["- 항목", "  ```ts", "  code", "  ```", "- 다음"].join("\n");
    const split = ["- 항목\n", "  ```ts\n  code\n  ```\n", "- 다음"];
    expect(() => assertOwnUnit(split, ["항목", "code"], "역검증")).not.toThrow();
    // 계약대로면 둘이 «한 단위»에 함께 담기므로 같은 검사가 던진다.
    expect(() => assertOwnUnit(unitsOf(listWithFence), ["항목", "code"], "역검증")).toThrow(
      /함께 담는다/,
    );
  });

  it("표 칸을 가르는 것은 맨 구분자다 — §3.4가 추인한 값(`K-101`)", () => {
    // **2026-08-17에 닫혔다.** 그날까지 §3.4에는 표 칸 경계를 정하는 문면이 없었고 — S-5는
    // «표 한 칸»을 형태로만 들고, N-1은 다섯 형태끼리의 겹침만 처분하며, Q-1은 코드 표기
    // 안의 큰따옴표만 말한다 — 이 자리는 대상 파일이 임의로 고른 읽기를 고정만 했다.
    // §3.4가 그 값을 추인해(`DOC-CITATION.md:306`) 칸을 가르는 것은 맨 구분자이고 코드 표기
    // 안인지 묻지 않으며 이스케이프한 `\|`만 내용이 됐다 — 아래 둘은 이제 정본의 값이다.
    const cell = "| `a | b` 를 담은 칸 | 둘째 칸 |\n";
    expect(unitsOf(cell).length).toBe(4);
    expect(unitsOf("| 이스케이프한 \\| 는 내용이다 | 둘째 칸 |\n").length).toBe(3);
  });
});

/* ------------------------------------------------------------------------ *
 * S-4 — 인용하는 «단위»를 뺀다 (구간이 아니다)
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §3.4 S-4 · N-3 · N-4 — 코퍼스에서 빼는 것", () => {
  /**
   * 다섯 형태 각각에서 두 표본을 잰다.
   * - `same`: 인용과 원문이 **같은 단위** 안에 있다 → 그 단위는 코퍼스가 아니므로 원문이 없다.
   * - `apart`: 원문이 **옆 단위**에 있다 → 옆 단위는 코퍼스이므로 원문이 있다.
   *
   * `same`이 통과(ok)하면 빼는 것이 단위가 아니라 인용부호 구간이라는 뜻이고, 그것이
   * S-4가 닫는 순환이다.
   */
  const cases = [
    {
      form: "문단",
      same: "`대상.md` §1이 «표본 문면»이라 적었고 이 문단은 표본 문면을 그대로 다시 쓴다.\n",
      apart: "표본 문면은 이 문단이 원문으로 든다.\n\n`대상.md` §1이 «표본 문면»이라 적었다.\n",
    },
    {
      form: "문단 (손 줄바꿈으로 갈린 같은 문단)",
      same: "`대상.md` §1이 «표본 문면»이라\n적었고 이 문단의 셋째 줄이\n표본 문면을 그대로 다시 쓴다.\n",
      apart: "표본 문면은 이 문단이\n원문으로 든다.\n\n`대상.md` §1이 «표본 문면»이라 적었다.\n",
    },
    {
      form: "목록 항목 하나",
      same: "- `대상.md` §1이 «표본 문면»이라 적었고 표본 문면을 다시 쓴다\n- 다른 항목\n",
      apart: "- `대상.md` §1이 «표본 문면»이라 적었다\n- 다른 항목이 표본 문면을 원문으로 든다\n",
    },
    {
      form: "표 한 칸",
      same: "| `대상.md` §1이 «표본 문면»이라 적고 표본 문면을 다시 씀 | 빈 칸 |\n",
      apart: "| `대상.md` §1이 «표본 문면»이라 적음 | 표본 문면 |\n",
    },
    {
      form: "인용 블록",
      same: "> `대상.md` §1이 «표본 문면»이라 적었다\n> 표본 문면을 이 블록이 다시 쓴다\n",
      apart: "> `대상.md` §1이 «표본 문면»이라 적었다\n\n표본 문면을 이 문단이 원문으로 든다.\n",
    },
  ] as const;

  for (const sample of cases) {
    it(`S-4 — ${sample.form}: 같은 단위 안의 원문은 코퍼스가 아니다`, () => {
      expect(target.citedVerdict("표본 문면", sample.same).kind).toBe("citing-only");
    });
    it(`S-4 — ${sample.form}: 옆 단위의 원문은 코퍼스다`, () => {
      expect(target.citedVerdict("표본 문면", sample.apart)).toEqual({ kind: "ok", outside: 1 });
    });
  }

  it("빼는 것이 «구간»이면 같은 표본이 통과한다는 것을 보인다 (역검증)", () => {
    // 일부러 틀린 읽기를 만들어 둔다 — 인용부호 구간만 빼는 판정.
    // 이 읽기가 위 `same` 표본 전부에서 ok를 내면, 위 검사들이 실제로 «단위인가 구간인가»를
    // 가르고 있다는 뜻이다. 가르지 못하면 이 역검증이 먼저 깨진다.
    const spanOnlyVerdict = (quote: string, doc: string): CitedVerdict => {
      const spans = target.quoteSpans(doc);
      const hits: TextSpan[] = [];
      let at = doc.indexOf(quote);
      while (at !== -1) {
        hits.push({ start: at, end: at + quote.length });
        at = doc.indexOf(quote, at + quote.length);
      }
      const outside = hits.filter(
        (hit) => !spans.some((span) => span.start <= hit.start && hit.end <= span.end),
      );
      return outside.length > 0
        ? { kind: "ok", outside: outside.length }
        : { kind: "citing-only", occurrences: hits.length };
    };

    for (const sample of cases) {
      expect(
        spanOnlyVerdict("표본 문면", sample.same).kind,
        `${sample.form}: 구간만 빼는 읽기`,
      ).toBe("ok");
      expect(target.citedVerdict("표본 문면", sample.same).kind).toBe("citing-only");
    }
  });

  it("S-4 — 같은 단위에 «다른» 인용부호가 있어도 그 단위는 코퍼스다", () => {
    // 빼는 기준은 «이 문면이 인용부호 안에 들었는가»이지 «단위가 인용부호를 품었는가»가
    // 아니다. 후자로 읽으면 코퍼스가 근거 없이 좁아진다.
    const doc =
      "이 문단은 «다른 조어»를 쓰면서 표본 문면을 원문으로 든다.\n\n`대상.md` §1이 «표본 문면»이라 적었다.\n";
    expect(target.citedVerdict("표본 문면", doc)).toEqual({ kind: "ok", outside: 1 });
  });

  it("S-6의 어긋남이 S-4의 판정을 뒤집는다 — 이중 백틱 스팬이 유령 인용 단위를 만든다", () => {
    // 원문이 이중 백틱 코드 스팬 안에 있는 문서. S-6대로면 그 스팬은 인용부호가 아니므로
    // 그 단위는 «인용하는 단위»가 아니고, 따라서 코퍼스로 남아 원문이 있다(ok).
    const doc = [
      "`대상.md` §1이 «표본 문면»이라 적었다.",
      "",
      '금지 표기는 `` `**"표본 문면"**` ``이다.',
      "",
    ].join("\n");
    expect(target.citedVerdict("표본 문면", doc)).toEqual({ kind: "ok", outside: 1 });
  });

  it("N-1 · S-4 — 목록 항목 안의 펜스는 그 항목의 자기 증거가 되지 못한다", () => {
    // 인용은 항목 텍스트에 있고 원문은 **같은 항목 안에 중첩된 펜스**에만 있다. N-1이 겹침에서
    // 바깥(항목)을 단위로 정했으므로 둘은 한 단위 안이고, 그 단위는 코퍼스가 아니다 —
    // citing-only다. 안쪽(펜스)을 단위로 읽으면 ok가 나고 그것이 S-4가 닫는 순환 자신이다.
    const doc = [
      "- `대상.md` §1이 «표본 문면»이라 적었다",
      "  ```ts",
      "  // 표본 문면",
      "  ```",
      "- 다른 항목",
      "",
    ].join("\n");
    expect(target.citedVerdict("표본 문면", doc)).toEqual({
      kind: "citing-only",
      occurrences: 2,
    });

    // 원문이 «다른» 항목 안 펜스에 있으면 그 항목은 코퍼스이므로 ok다 — N-1이 코퍼스를
    // 근거 없이 좁히지 않는다는 반대 방향을 함께 고정한다.
    const apart = [
      "- `대상.md` §1이 «표본 문면»이라 적었다",
      "- 다른 항목",
      "  ```ts",
      "  // 표본 문면",
      "  ```",
      "",
    ].join("\n");
    expect(target.citedVerdict("표본 문면", apart)).toEqual({ kind: "ok", outside: 1 });
  });

  it("N-3 — 그 문면을 인용부호로 담은 단위는 «전부» 뺀다", () => {
    // 어느 자리가 인용의 주인인지 묻지 않는다 — 판정 대상은 문면이지 자리가 아니다.
    // 하나만 빼면 인용 자리가 둘이 되고 원문이 사라진 문서가 통과한다.
    const twoCiting = [
      "`대상.md` §1이 «표본 문면»이라 적었다.",
      "",
      "`대상.md` §2도 «표본 문면»을 인용한다.",
      "",
    ].join("\n");
    expect(target.citedVerdict("표본 문면", twoCiting)).toEqual({
      kind: "citing-only",
      occurrences: 2,
    });

    // 역검증 — 첫 단위 하나만 빼는 읽기는 같은 표본을 통과시킨다. 즉 위 검사가 실제로
    // «전부인가 하나인가»를 가르고 있다.
    const firstCitingOnly = (quote: string, doc: string): CitedVerdict => {
      const spans = target.quoteSpans(doc);
      const units = target.documentUnits(doc);
      const hits: TextSpan[] = [];
      let at = doc.indexOf(quote);
      while (at !== -1) {
        hits.push({ start: at, end: at + quote.length });
        at = doc.indexOf(quote, at + quote.length);
      }
      const covers = (span: TextSpan, hit: TextSpan): boolean =>
        span.start <= hit.start && hit.end <= span.end;
      const citing = units.find((unit) =>
        hits.some((hit) => covers(unit, hit) && spans.some((span) => covers(span, hit))),
      );
      const outside = hits.filter((hit) => citing === undefined || !covers(citing, hit));
      return outside.length > 0
        ? { kind: "ok", outside: outside.length }
        : { kind: "citing-only", occurrences: hits.length };
    };
    expect(firstCitingOnly("표본 문면", twoCiting).kind).toBe("ok");

    // 인용 자리가 둘이어도 인용하는 단위 «밖»에 원문이 있으면 ok다 — N-3이 코퍼스를 과도하게
    // 좁히지 않는다.
    const twoCitingWithSource = [
      "표본 문면은 이 문단이 원문으로 든다.",
      "",
      "`대상.md` §1이 «표본 문면»이라 적었다.",
      "",
      "`대상.md` §2도 «표본 문면»을 인용한다.",
      "",
    ].join("\n");
    expect(target.citedVerdict("표본 문면", twoCitingWithSource)).toEqual({
      kind: "ok",
      outside: 1,
    });
  });

  it("N-4 — 배제 사유는 인용부호뿐이다 (백틱 스팬·머리 필드 값 단위는 코퍼스에 남는다)", () => {
    // S-7이 든 세 표기 중 인용부호만 배제 사유다. 나머지 둘은 **원문 자신이 쓰는 표기**이므로
    // 배제하면 필드 값 인용이 원리적으로 대조 불가능해진다.
    const backtick =
      "`대상.md` §1이 원래 `표본 문면`이라고 적혀 있었다.\n\n본문이 «다른 인용»을 든다.\n";
    expect(target.citedVerdict("표본 문면", backtick)).toEqual({ kind: "ok", outside: 1 });

    const headField = "- **상태:** 표본 문면\n\n`대상.md` §1이 «표본 문면»이라 적었다.\n";
    expect(target.citedVerdict("표본 문면", headField)).toEqual({ kind: "ok", outside: 1 });

    // N-4가 스스로 적은 «남는 구멍» — 유일한 히트가 재타이핑된 코드 스팬이면 대조는 그것을
    // 원문으로 읽는다. 닫으면 원문을 잃으므로 계약이 열어 둔 자리이고, 여기서는 그 형태가
    // 실제로 통과한다는 것을 고정한다(위 `backtick` 표본이 정확히 그 형태다).
  });

  it("N-2 · S-4 — 제목 줄의 인용은 그 제목 줄만 코퍼스에서 뺀다", () => {
    // N-2가 잔여 줄을 «그 줄 하나»로 두므로, 제목에 든 인용은 제목 줄만 빼고 본문은 남긴다.
    const withSource = "# «표본 문면»을 든 제목\n\n표본 문면을 이 문단이 원문으로 든다.\n";
    expect(target.citedVerdict("표본 문면", withSource)).toEqual({ kind: "ok", outside: 1 });

    const headingOnly = "# «표본 문면»을 든 제목\n\n본문이 «다른 인용»을 든다.\n";
    expect(target.citedVerdict("표본 문면", headingOnly)).toEqual({
      kind: "citing-only",
      occurrences: 1,
    });
  });

  it("S-4 — 오늘 실물의 두 인용은 인용하는 단위 밖에 원문이 있다", () => {
    // 대상 파일이 오늘 거는 두 자리. 이 검증기가 대상과 같은 결론에 이르는지 고정한다.
    expect(target.citedVerdict("스스로 크리덴셜을 읽지 않는다").kind).toBe("ok");
    expect(target.citedVerdict("유일한 입구").kind).toBe("ok");
  });
});

/* ------------------------------------------------------------------------ *
 * 파일 머리 주석 — 실물보다 넓게 주장하는가
 * ------------------------------------------------------------------------ */

describe("머리 주석의 주장 ↔ 실물 — 대상 파일과 이 파일", () => {
  // **형제 머리도 자기 머리와 같은 술어로 끊는다**(§6 U-b 2026-08-18 판정 — 빈 줄 없이
  // 이어지는 주석 줄의 덩어리 하나가 한 단위이고, 코드 파일에서 인용 한 건의 경계도 각 파일
  // 자신의 머리도 그 술어로 끊는다). 2026-08-17까지 여기가 첫 닫기 표기로 잘랐고, 그 술어에서는
  // 머리를 블록 주석 둘로 쪼갠 배치가 조용히 짧아진 채 아래 셋을 전부 통과했다.
  //
  // **절단 값을 그대로 쓴다 — 길이만 취해 원문을 다시 자르지 않는다**(같은 판정의 꼬리 주석 항).
  // 덩어리가 꼬리 주석을 단 코드 줄까지 자라면 그 줄의 주석 밖 글자가 함께 실리고, 재슬라이스는
  // `leadingCommentBlock`이 그것을 공백으로 덮은 것을 통째로 되돌린다. 그러면 아래 미열거 대조의
  // 포함 검사가 코드 줄 텍스트로 만족되어 미열거가 조용히 덮인다(`ARCHITECTURE.md` §2.6 가시적
  // 결과). 자기 축이 이미 절단 값을 쓰고 있고 그 자리가 선례다.
  const HEADER = leadingCommentBlock(TARGET_SOURCE);
  // 마스킹은 자리와 길이를 보존하므로 본문 분할은 이 길이로 그대로 선다.
  const BODY = TARGET_SOURCE.slice(HEADER.length);

  /** 본문에서 미규정 표시를 줄 단위로 뽑는다. `matchAll`은 원본의 `lastIndex`를 안 건드린다 */
  const MARKER_PATTERN = /\[미규정\][^\n]*/g;
  /** 머리 한계 목록과 대조할 열쇠 — 표시 뒤 첫 낱말들. 근거 문장까지 같기를 요구하지 않는다 */
  const headKeyOf = (marker: string): string => marker.replace("[미규정]", "").trim().slice(0, 12);

  it("머리가 «인라인 코드 스팬을 지운 뒤»라고 주장하면 이중 백틱 스팬도 지워져야 한다", () => {
    // 머리 한계 3의 문면이 코드 스팬을 지운다고 단언한다. 지워지지 않는 부류가 있으면
    // 그 주장은 실물보다 넓다 — 이 파일이 스스로 막겠다고 적은 결함의 형태다.
    expect(HEADER).toContain("인라인 코드 스팬을 지운 뒤");
    const sample = '금지 표기는 `` `**"표본 문면"**` ``이다.';
    expect(target.quoteSpans(sample).length, "머리의 주장대로면 0이어야 한다").toBe(0);
  });

  it("머리가 한계 목록을 정본이라 부르면 본문의 [미규정] 판단도 거기 있어야 한다", () => {
    // 머리는 한계 목록이 **이 파일이 무엇을 증명하지 않는지**의 정본이라 적는다. 본문이 그
    // 목록 밖에서 판정을 바꾸는 [미규정] 선택을 들면 머리가 실물보다 강하게 읽힌다.
    //
    // **재는 것은 포함 관계다 — 머리 한계 목록 ⊇ 본문 마커 집합.** 차집합(본문에는 있는데
    // 머리에 없는 것)이 비어 있어야 한다.
    //
    // **마커 0건도 정상 상태다**(2026-08-17). 그 전에는 마커가 1건 이상일 것을 함께
    // 요구했으나, 그 하한은 이 검사가 겨누는 결함(머리가 실물보다 넓다)과 무관한 별개
    // 주장이었고, §3.4가 마지막 미규정을 추인으로 닫는 순간 정당한 상태를 red로 만든다
    // — 표 칸 경계의 코드 스팬 파이프가 그 자리였다(`K-101` · `DOC-CITATION.md:306`).
    // 방향은 하나뿐이므로 그 방향만 잰다.
    const markers = [...BODY.matchAll(MARKER_PATTERN)].map((match) => match[0].trim());
    const unlisted = markers.filter((marker) => !HEADER.includes(headKeyOf(marker)));
    expect(
      unlisted,
      `머리의 한계 목록이 본문의 [미규정] 판단 ${unlisted.length}건을 들지 않는다:\n  ${unlisted.join("\n  ")}`,
    ).toEqual([]);

    // **모집단이 0일 때 이 검사가 공허하게 통과하는 것을 여기서 가른다**(`ARCHITECTURE.md`
    // §2.6 가시적 결과). 위 0이 **본문에 마커가 없다**인지 **추출기가 못 뽑는다**인지는
    // 결과가 같아 구분되지 않으므로, 합성 입력으로 추출기가 도는 것을 따로 고정한다.
    const probe = "  * [미규정] 표본 자리다 — 근거가 뒤에 붙는다\n  * 다음 줄";
    const probed = [...probe.matchAll(MARKER_PATTERN)].map((match) => match[0].trim());
    expect(probed).toEqual(["[미규정] 표본 자리다 — 근거가 뒤에 붙는다"]);
    expect(headKeyOf(probed[0] as string)).toBe("표본 자리다 — 근거가");
  });

  it("적합 — 한계 문단이 인용부호를 쓰지 않는다는 주장은 참이다", () => {
    // **표지 부재는 fail-closed다.** `indexOf`가 -1을 내면 `slice(-1)`이 마지막 한 글자를
    // 돌려주고 아래 셋이 그 한 글자로 전부 통과한다 — 잴 것이 사라진 채로 그린이다.
    // §4가 판정되지 않은 문서를 통과로 두지 않는 것과 같은 자리이고, 이 레포의 게이트가
    // 전부 그 방향이다(`ARCHITECTURE.md` §2.6 가시적 결과).
    const at = HEADER.indexOf("## 문면 인용 대조가 재지 못하는 것");
    if (at === -1)
      throw new Error(
        "형제 머리에서 한계 절 표지를 찾지 못했다 — 개편됐으면 이 검사를 먼저 고친다",
      );
    const limits = HEADER.slice(at);
    expect(limits.length).toBeGreaterThan(0);
    expect(limits).not.toMatch(/[«»]/);
    expect(limits).not.toMatch(/"/);
  });

  it("적합 — 이 파일 머리가 인용부호를 쓰지 않는다는 주장은 참이다 (자기 축)", () => {
    // **바로 위 축을 자기 머리에도 건다.** 이 `describe`는 **머리가 실물보다 넓게 주장하는가**를
    // 이 파일의 본업으로 세우고 형제에게 넷을 집행하면서, 정작 자기 머리는 한 줄도 안 쟀다 —
    // `K-147`이 그 비대칭을 든다. 자기 텍스트를 자기가 재는 것은 순환이 아니다: 이 파일이
    // 사본을 금한 대상은 **파서**이고(머리의 **어떻게 대상을 부르는가** 절), 자기 머리 측정은
    // 형제가 이미 하는 것이다(`docs-gate-parity.qa.test.ts`의 한계 열거 대조).
    //
    // 재는 범위가 **머리 전체**인 이유는 주장 자신의 범위어가 «이 주석»이기 때문이다. 위
    // 검사가 형제의 한 절만 자르는 것과 갈리는 자리이고, 그쪽 주장이 «이 절»이라 그렇다.
    //
    // **무엇이 한 머리인가는 `leadingCommentBlock`이 든다**(§6 U-b 2026-08-18 판정 — 빈 줄
    // 없이 이어지는 주석 줄의 덩어리). 2026-08-17까지 여기가 첫 닫기 표기로 잘랐고, 그
    // 술어에서는 머리가 조용히 짧아진 채 뒤쪽 주장이 안 재졌다.
    const header = leadingCommentBlock(SELF_SOURCE);
    if (header.length === 0) throw new Error("이 파일의 머리 주석을 찾지 못했다");

    // **주장이 실재해야 이 검사가 산다.** 주장 문장을 지우면 아래 둘은 잴 것이 없는 채로
    // 그린이 되므로, 그 문장 자신을 먼저 짚는다 — 지우는 편집은 여기서 red가 되어 판정을
    // 부른다(`ARCHITECTURE.md` §2.6 가시적 결과).
    expect(header).toContain("이 주석은 인용부호를 쓰지 않는다");
    expect(header).not.toMatch(/[«»]/);
    expect(header).not.toMatch(/["“”]/);

    // 역검증 — 같은 술어가 합성 위반을 실제로 잡는다. 이 짝이 없으면 위 둘은 «아무것도 안
    // 재는 술어»로 퇴화해도 그린이다.
    expect(`${header}\n * 표본 «지목»`).toMatch(/[«»]/);
    expect(`${header}\n * 표본 "인용"`).toMatch(/["“”]/);
  });

  it("적합 — 머리가 코퍼스 한 파일 한계를 들고, 실물도 그 한 파일만 먹인다", () => {
    expect(HEADER).toContain("코퍼스가 `PROVIDERS.md` 한 파일이다");
    // `cited(...)`는 두 번째 인자를 받지 않는다 — 기본값 `PROVIDERS_DOC`으로만 걸린다.
    for (const call of BODY.matchAll(/\n\s*cited\(([^)]*)\)/g)) {
      expect(call[1], `cited 호출이 코퍼스를 바꾼다: ${call[0].trim()}`).not.toContain(",");
    }
  });
});
