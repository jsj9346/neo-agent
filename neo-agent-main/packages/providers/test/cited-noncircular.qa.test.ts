/**
 * 독립 검증 (T-006) — `docs-gate-parity.qa.test.ts`가 `DOC-CITATION.md` §3.4의
 * S-4 · S-5 · S-6을 옮긴 것이 맞는가.
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
 *   않는다. 이 파일의 범위는 §3.4 S-4 · S-5 · S-6과 대상 파일 머리 주석의 주장뿐이다.
 * - **`scripts/doc-citation.mjs`의 게이트 판정**은 대상이 아니다. §4가 그 게이트를 형식
 *   전용으로 좁혔고 여기서 재는 것은 대상 테스트 파일의 파서다.
 * - 회색지대는 판정하지 않는다. 아래 [미규정] 표시가 붙은 `it`은 오늘의 읽기를 고정만 하며
 *   등급을 매기지 않는다 — 판정은 리포트가 올린다.
 *
 * 이 주석은 인용부호를 쓰지 않는다. §1이 이 규약의 범위를 `neo-agent-main/docs/*.md`로
 * 그었으므로 `.ts` 파일은 원리적으로 밖이지만, S-4의 코퍼스를 넓히지 않는 쪽이 안전하다.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript") as typeof import("typescript");

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const TARGET_PATH = path("./docs-gate-parity.qa.test.ts");
const TARGET_SOURCE = readFileSync(TARGET_PATH, "utf8");
const PROVIDERS_PATH = path("../../../docs/PROVIDERS.md");
const PROVIDERS_DOC = readFileSync(PROVIDERS_PATH, "utf8");
const SESSION_STORE_DOC = readFileSync(path("../../../docs/SESSION-STORE.md"), "utf8");
const DOC_CITATION_DOC = readFileSync(path("../../../docs/DOC-CITATION.md"), "utf8");

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

function loadTargetParsers(): TargetParsers {
  const source = [
    `const PROVIDERS_DOC = require("node:fs").readFileSync(${JSON.stringify(PROVIDERS_PATH)}, "utf8");`,
    region("/** 원문 좌표계의 반열린 구간", 'describe("DOC-CITATION §3.4 S-5'),
    region("  type CitedVerdict =", "  /**\n   * 실패 메시지는 두 갈래다"),
    "exports.quoteSpans = quoteSpans;",
    "exports.documentUnits = documentUnits;",
    "exports.citedVerdict = citedVerdict;",
  ].join("\n");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: Record<string, unknown> = {};
  // 사본이 아니라 대상의 현재 원문을 실행한다 — 사본을 두면 대상이 바뀌어도 이 파일이 그린이다.
  new Function("exports", "require", compiled)(loaded, nodeRequire);
  const parsers = loaded as unknown as TargetParsers;
  if (typeof parsers.quoteSpans !== "function") throw new Error("대상 파서 적재에 실패했다");
  return parsers;
}

const target = loadTargetParsers();

const textOf = (doc: string, spans: TextSpan[]): string[] =>
  spans.map((span) => doc.slice(span.start, span.end));
const unitsOf = (doc: string): string[] => textOf(doc, target.documentUnits(doc));
const quotesOf = (doc: string): string[] => textOf(doc, target.quoteSpans(doc));

/* ------------------------------------------------------------------------ *
 * S-6 — 백틱 코드 스팬 안의 큰따옴표는 인용부호가 아니다
 * ------------------------------------------------------------------------ */

/** 한 줄 안에서 닫히는 이중 백틱 코드 스팬. CommonMark의 여는/닫는 런 규칙을 이 폭만 쓴다 */
const DOUBLE_BACKTICK_SPAN = /``[^\n]*?``/g;

describe("DOC-CITATION §3.4 S-6 — 코드 스팬 안은 인용부호가 아니다", () => {
  it("S-6 적합 — 홑 백틱 스팬 안의 큰따옴표는 구간이 아니고, 산문의 큰따옴표는 구간이다", () => {
    const sample = '설정은 `stopReason: "max_tokens"` 이고 본문은 "진짜 인용"이다.';
    expect(quotesOf(sample)).toEqual(['"진짜 인용"']);

    // 역검증 — 스팬 마스킹을 지우면 같은 표본에서 코드 스팬 안 큰따옴표가 걸린다.
    // 이 검사가 «통과만 확인하는» 형태로 퇴화하지 않았음을 한 자리에서 고정한다.
    const unmasked = [...sample.matchAll(/"[^"\n]*"/g)].map((m) => m[0]);
    expect(unmasked).toContain('"max_tokens"');
    expect(unmasked.length).toBeGreaterThan(quotesOf(sample).length);
  });

  it("S-6 — 이중 백틱 코드 스팬 안의 큰따옴표도 인용부호가 아니다", () => {
    // S-6의 술어는 «백틱 코드 스팬 안인가»이고 백틱의 «개수»를 가르지 않는다. 근거는 S-6이
    // 든 이유다 — 판정이 문자열 안에서 끝난다(백틱 쌍 안인가). 이중 백틱 쌍도 백틱 쌍이다.
    const sample = '금지 표기는 `` `**"표본 문면"**` ``이다.';
    expect(
      target.quoteSpans(sample).length,
      `구간으로 잡힌 것: ${quotesOf(sample).join(" · ")}`,
    ).toBe(0);
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

  it("[미규정] 코드 «펜스»는 S-6의 문면에 없다 — 오늘의 읽기를 고정한다", () => {
    // S-6이 든 것은 백틱 코드 스팬 하나다. 펜스에도 걸리는가는 §3.4가 정하지 않는다.
    // 대상은 백틱 펜스와 물결 펜스 양쪽을 지운다 — 물결 펜스에는 백틱이 한 글자도 없으므로
    // S-6의 문면보다 넓은 읽기다. 방향은 보수적이지만(위반을 늘리지 않는다) 미규정이다.
    const backtick = ["```ts", 'const a = "펜스 안";', "```", "", '본문 "진짜 인용".'].join("\n");
    const tilde = ["~~~ts", 'const a = "물결 펜스 안";', "~~~", "", '본문 "진짜 인용".'].join("\n");
    expect(quotesOf(backtick)).toEqual(['"진짜 인용"']);
    expect(quotesOf(tilde)).toEqual(['"진짜 인용"']);
  });

  it("[미규정] 4칸 이상 들여쓴 코드 블록은 지워지지 않는다 — 실물 0건", () => {
    // CommonMark의 들여쓰기 코드 블록은 펜스가 아니라 마커가 없어 판정이 문자열 안에서
    // 끝나지 않는다. §3.4는 이 형태를 들지 않는다. 오늘 `docs/*.md`에 4칸 이상 들여쓴
    // 펜스·코드 블록이 0건이라 소급 비용이 없다는 것만 고정한다.
    const deep = ["    ```ts", '    const a = "깊은 곳";', "    ```"].join("\n");
    expect(quotesOf(deep)).toEqual(['"깊은 곳"']);
    for (const doc of [PROVIDERS_DOC, SESSION_STORE_DOC, DOC_CITATION_DOC]) {
      expect(doc.match(/^\s{4,}(`{3,}|~{3,})/gm)).toBeNull();
    }
  });

  it("[미규정] 곡선 큰따옴표는 인용부호로 잡히지 않는다 — 실물 0건", () => {
    // §3.4가 든 셋째 형식은 평문 큰따옴표다. 활자 곡선 따옴표가 같은 부류인지는 미규정이다.
    expect(quotesOf('본문이 “곡선”과 "평문"을 든다.')).toEqual(['"평문"']);
    for (const doc of [PROVIDERS_DOC, SESSION_STORE_DOC, DOC_CITATION_DOC]) {
      expect(doc.match(/[“”]/g)).toBeNull();
    }
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

describe("DOC-CITATION §3.4 S-5 — 다섯 형태가 전부 단위인가", () => {
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

  it("[미규정] 제목 줄과 빈 줄은 다섯 형태에 없다 — 대상은 각각 자기 단위로 둔다", () => {
    expect(unitsOf("# 제목\n\n문단\n")).toEqual(["# 제목\n", "\n", "문단\n"]);
  });

  it("[미규정] 형태가 겹칠 때 무엇이 이기는가 — §3.4가 정하지 않는다", () => {
    // ① 목록 항목 안의 코드 펜스: 펜스가 이겨 «목록 항목 하나»가 셋으로 쪼개진다.
    //    쪼개는 방향은 S-4가 빼는 범위를 «좁히므로» 자기 증거가 설 수 있다(아래 S-4 절).
    const listWithFence = ["- 항목", "  ```ts", "  code", "  ```", "- 다음"].join("\n");
    expect(unitsOf(listWithFence).length).toBe(3);

    // ② 인용 블록 안의 표·목록: 인용 블록이 이겨 칸·항목으로 갈리지 않는다.
    //    합치는 방향은 S-4가 빼는 범위를 «넓히므로» 근거 없는 red 쪽이다(반대 방향).
    expect(unitsOf("> | a | b |\n> | c | d |\n").length).toBe(1);
    expect(unitsOf("> - 하나\n> - 둘\n").length).toBe(1);
  });
});

/* ------------------------------------------------------------------------ *
 * S-4 — 인용하는 «단위»를 뺀다 (구간이 아니다)
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §3.4 S-4 — 코퍼스에서 빼는 것은 단위다", () => {
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

  it("[미규정] 목록 항목 안의 펜스가 그 항목의 자기 증거가 된다", () => {
    // 인용은 항목 텍스트에 있고 원문은 **같은 항목 안에 중첩된 펜스**에만 있다.
    // 항목을 한 덩어리로 읽으면 citing-only여야 하고, 펜스를 자기 단위로 읽으면 ok다.
    // §3.4는 둘 중 무엇이 이기는지 정하지 않는다. 대상은 후자이고, 그 결과가 S-4가 닫으려는
    // 자기 증거와 표기상 구별되지 않는다 — 판정은 리포트가 올린다.
    const doc = [
      "- `대상.md` §1이 «표본 문면»이라 적었다",
      "  ```ts",
      "  // 표본 문면",
      "  ```",
      "- 다른 항목",
      "",
    ].join("\n");
    expect(target.citedVerdict("표본 문면", doc)).toEqual({ kind: "ok", outside: 1 });
  });

  it("[미규정] 백틱 표기만으로 지목한 서술 단위는 코퍼스로 남는다 (S-7 축)", () => {
    // S-7은 서술이 문면의 조각을 **백틱 코드 스팬**으로 들면 그 문면을 가리킨다고 정했다.
    // 그런 단위가 S-4의 «인용하는 단위»인지는 정해지지 않았다. 대상은 아니라고 읽는다 —
    // 그 결과 문면이 그 한 자리에만 있어도 원문이 따로 있다는 판정이 난다.
    const doc =
      "`대상.md` §1이 원래 `표본 문면`이라고 적혀 있었다.\n\n본문이 «다른 인용»을 든다.\n";
    expect(target.citedVerdict("표본 문면", doc)).toEqual({ kind: "ok", outside: 1 });
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

describe("대상 파일 머리 주석의 주장 ↔ 실물", () => {
  const HEADER = TARGET_SOURCE.slice(0, TARGET_SOURCE.indexOf("*/"));
  const BODY = TARGET_SOURCE.slice(TARGET_SOURCE.indexOf("*/"));

  it("머리가 «인라인 코드 스팬을 지운 뒤»라고 주장하면 이중 백틱 스팬도 지워져야 한다", () => {
    // 머리 한계 3의 문면이 코드 스팬을 지운다고 단언한다. 지워지지 않는 부류가 있으면
    // 그 주장은 실물보다 넓다 — 이 파일이 스스로 막겠다고 적은 결함의 형태다.
    expect(HEADER).toContain("인라인 코드 스팬을 지운 뒤");
    const sample = '금지 표기는 `` `**"표본 문면"**` ``이다.';
    expect(target.quoteSpans(sample).length, "머리의 주장대로면 0이어야 한다").toBe(0);
  });

  it("머리가 한계 목록을 정본이라 부르면 본문의 [미규정] 판단도 거기 있어야 한다", () => {
    // 머리는 한계가 넷이고 그 목록이 이 파일이 무엇을 증명하지 않는지의 정본이라 적는다.
    // 본문은 그 밖에 판정을 바꾸는 [미규정] 선택을 더 들고 있다. 수가 어긋나면 머리가
    // 실물보다 강하게 읽힌다.
    const markers = [...BODY.matchAll(/\[미규정\][^\n]*/g)].map((match) => match[0].trim());
    expect(markers.length).toBeGreaterThan(0);
    const unlisted = markers.filter((marker) => {
      const key = marker.replace("[미규정]", "").trim().slice(0, 12);
      return !HEADER.includes(key);
    });
    expect(
      unlisted,
      `머리의 한계 목록이 본문의 [미규정] 판단 ${unlisted.length}건을 들지 않는다:\n  ${unlisted.join("\n  ")}`,
    ).toEqual([]);
  });

  it("적합 — 한계 문단이 인용부호를 쓰지 않는다는 주장은 참이다", () => {
    const limits = HEADER.slice(HEADER.indexOf("## 문면 인용 대조가 재지 못하는 것"));
    expect(limits.length).toBeGreaterThan(0);
    expect(limits).not.toMatch(/[«»]/);
    expect(limits).not.toMatch(/"/);
  });

  it("적합 — 머리가 코퍼스 한 파일 한계를 들고, 실물도 그 한 파일만 먹인다", () => {
    expect(HEADER).toContain("코퍼스가 `PROVIDERS.md` 한 파일이다");
    // `cited(...)`는 두 번째 인자를 받지 않는다 — 기본값 `PROVIDERS_DOC`으로만 걸린다.
    for (const call of BODY.matchAll(/\n\s*cited\(([^)]*)\)/g)) {
      expect(call[1], `cited 호출이 코퍼스를 바꾼다: ${call[0].trim()}`).not.toContain(",");
    }
  });
});
