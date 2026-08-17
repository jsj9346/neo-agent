/**
 * 독립 QA — `packages/providers/test/cited-noncircular.qa.test.ts`가 이번 사이클에 새로
 * 세운 자기 축 가드와 다시 쓴 머리 문단이 `DOC-CITATION.md` §3.4(U-1 · D-1~D-6)와 §6 U-b의
 * 2026-08-17 판정이 정한 것을 실제로 재는가.
 *
 * **기대값의 출처는 그 두 절이다.** 대상 파일의 술어를 옳다고 전제하지 않는다 — 대상이 쓴
 * 정규식은 대상 원문에서 뽑아 그 자리에서 평가하고, 무엇을 잡아야 하는지는 정본이 든
 * 인용부호 셋에서만 나온다.
 *
 * 이 파일이 재는 축 넷:
 *
 * 1. **가드의 술어가 인용부호 셋을 전부 잡는가** — 별표 형식 · 겹화살괄호 · 평문 큰따옴표.
 * 2. **가드가 자르는 머리가 실제 머리인가** — 가드 자신의 fail-closed.
 * 3. **U-b가 넓힌 자리는 파일인데 가드는 머리 한 덩어리만 든다** — 본문에 남은 인용의 대조.
 * 4. **넓힘이 답을 안 든 자리** — 등급을 매기지 않고 그날의 읽기만 고정한다.
 *
 * 이 주석은 인용부호를 쓰지 않는다. 근거는 대상 파일 머리와 같다(§6 U-b 2026-08-17).
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const TARGET_PATH = path("./cited-noncircular.qa.test.ts");
const TARGET_SOURCE = readFileSync(TARGET_PATH, "utf8");
const DOCS_DIR = path("../../../docs/");

/** 공백만 정규화한다 — D-2가 정한 대조 규칙 그대로다 */
const norm = (text: string): string => text.replace(/\s+/g, " ").trim();

/** S-4가 코퍼스로 든 것 중 이 검사에 필요한 부분(우리 문서 트리) */
const CORPUS = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .map((name) => norm(readFileSync(path(`../../../docs/${name}`), "utf8")));

const inCorpus = (quote: string): boolean => CORPUS.some((doc) => doc.includes(norm(quote)));

/**
 * 주석 줄만 남겨 이어 붙인다. 줄 번호는 표지로 함께 들고 다닌다.
 *
 * 인용이 줄바꿈을 넘는 것은 이 레포 주석의 상례이므로 줄 단위로만 보면 그런 인용이 통째로
 * 안 보인다. 그 읽기가 정본에 있는지는 아래 미규정 항목이 든다.
 */
function commentStream(source: string): { text: string; lineAt(offset: number): number } {
  const lines = source.split("\n");
  const marks: { at: number; offset: number }[] = [];
  let text = "";
  lines.forEach((line, index) => {
    if (!/^\s*(\/\/|\*|\/\*)/.test(line)) {
      text += "\n";
      return;
    }
    marks.push({ at: index + 1, offset: text.length });
    text += ` ${line.replace(/^\s*(\/\/|\*\/?|\/\*\*?)\s?/, "")}`;
  });
  return {
    text,
    lineAt(offset: number): number {
      let found = 0;
      for (const mark of marks) {
        if (mark.offset <= offset) found = mark.at;
        else break;
      }
      return found;
    },
  };
}

/** 머리 주석 끝 — 대상 가드가 쓰는 것과 **같은 방법**이 아니라 줄 모양으로 독립 계산한다 */
function headEndByLineShape(source: string): number {
  const lines = source.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (line.trim() === "*/") return offset + line.indexOf("*/");
    offset += line.length + 1;
  }
  return -1;
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

describe("자기 축 가드의 fail-closed — 자르는 구간이 실제 머리 주석과 같은가", () => {
  it("적합 — 첫 닫기 표기가 머리 주석의 닫는 줄과 같은 자리다", () => {
    // 가드는 첫 닫기 표기까지를 머리로 본다. 그 표기가 머리 **안에** 먼저 나오면 머리가
    // 조용히 짧아지고 그 뒤의 인용부호가 안 재진다. 줄 모양으로 독립 계산한 값과 대조해
    // 그 갈림이 오늘 없다는 것을 고정한다.
    const byIndexOf = TARGET_SOURCE.indexOf("*/");
    const byLineShape = headEndByLineShape(TARGET_SOURCE);
    expect(byLineShape).toBeGreaterThan(0);
    expect(byIndexOf).toBe(byLineShape);
  });

  it("역검증 — 머리 안에 닫기 표기가 끼면 두 계산이 갈린다", () => {
    const planted = TARGET_SOURCE.replace(
      "이 주석은 인용부호를 쓰지 않는다",
      "이 주석은 `packages/*/test/`를 든다. 이 주석은 인용부호를 쓰지 않는다",
    );
    expect(planted.indexOf("*/")).not.toBe(headEndByLineShape(planted));
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — U-b가 넓힌 자리는 파일인데 가드는 머리만 든다
 * ------------------------------------------------------------------------ */

/** 주석에 쓰인 별표 형식 인용 — 조어로 읽힐 여지가 없는 형태만 모은다 */
function starQuotes(source: string): { line: number; quote: string }[] {
  const stream = commentStream(source);
  const found: { line: number; quote: string }[] = [];
  for (const match of stream.text.matchAll(/\*"([^"]+)"\*/g)) {
    const quote = match[1];
    if (quote === undefined) continue;
    found.push({ line: stream.lineAt(match.index), quote });
  }
  return found;
}

describe("DOC-CITATION §6 U-b 2026-08-17 — 넓어진 자리에서 대조가 참인가", () => {
  it("대조 — 머리 밖 주석의 별표 형식 인용이 전부 코퍼스의 부분 문자열이다", () => {
    // 근거: §6 U-b 2026-08-17 판정 — 대조 축(U-1 · D-1 · D-2)이 걸리는 자리가 각 패키지의
    // 테스트 디렉터리까지 넓어졌다. 대상 파일은 그 안이고, 머리 문단이 스스로 그렇게 적는다.
    // U-1은 인용부호로 감싼 문면이 대상 문서에 문자 그대로 존재하는 부분 문자열일 것을
    // 요구한다. 별표 형식만 보는 이유는 S-1·S-2다 — 겹화살괄호 자리는 조어인지 실패한
    // 인용인지 갈리므로 감사가 등급을 매기지 않는다(아래 미규정 항목이 목록만 든다).
    //
    // **자기 축 가드는 이 자리를 못 잡는다.** 가드가 재는 것은 머리 한 덩어리이고, 머리의
    // 주장 자체가 그 범위로 한정돼 있다. U-b가 넓힌 자리는 파일이다.
    const misses = starQuotes(TARGET_SOURCE)
      .filter((entry) => !inCorpus(entry.quote))
      .map((entry) => `L${entry.line} ${JSON.stringify(norm(entry.quote)).slice(0, 60)}`);
    expect(misses).toEqual([]);
  });

  it("역검증 — 같은 대조가 심은 어긋남을 잡고 원문 일치는 안 잡는다", () => {
    const exact = ` * 표본 *"닫는 마커는 여는 마커와 **같은 문자**이고"* 끝`;
    expect(starQuotes(exact).filter((entry) => !inCorpus(entry.quote))).toEqual([]);

    const drifted = ` * 표본 *"닫는 마커는 여는 마커와 같은 문자이고"* 끝`;
    expect(starQuotes(drifted).filter((entry) => !inCorpus(entry.quote))).toHaveLength(1);

    const suffixed = ` * 표본 *"닫는 마커는 여는 마커와 **같은 문자**이고."* 끝`;
    expect(starQuotes(suffixed).filter((entry) => !inCorpus(entry.quote))).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 넓힘이 답을 안 든 자리. 등급을 매기지 않고 그날의 읽기만 고정한다
 * ------------------------------------------------------------------------ */

describe("[미규정] §6 U-b 넓힘이 정하지 않은 것 — 판정은 리포트가 올린다", () => {
  it("[미규정] 겹화살괄호 자리는 세지 않는다 (S-2) — 목록만 고정한다", () => {
    // §3.4 S-1·S-2: 조어인지 실패한 인용인지 갈리면 판정하지 말고 벗기며, 감사는 그 갈래를
    // 판정 필요로 세우지 않는다. 여기서는 **지목이 같은 줄에 있는데 대조가 거짓인** 자리만
    // 세어 그날의 값을 고정한다 — 늘면 red가 되어 다음 사이클이 본다.
    const point = /[A-Za-z0-9-]+\.md|§\s?\d|K-\d{3}|\b[A-Z]-\d\b|plans\/|devnotes\//;
    const headLines = TARGET_SOURCE.slice(0, TARGET_SOURCE.indexOf("*/")).split("\n").length;
    const hits: string[] = [];
    TARGET_SOURCE.split("\n").forEach((line, index) => {
      if (index + 1 <= headLines) return;
      if (!/^\s*(\/\/|\*)/.test(line)) return;
      if (!point.test(line)) return;
      for (const match of line.matchAll(/«([^»]{2,})»/g)) {
        const quote = match[1];
        if (quote === undefined) continue;
        if (!inCorpus(quote)) hits.push(`L${index + 1} ${JSON.stringify(quote)}`);
      }
    });
    expect(hits).toEqual([
      `L224 "백틱이 있는가"`,
      `L808 "본문에 마커가 없다"`,
      `L808 "추출기가 못 뽑는다"`,
    ]);
  });

  it("[미규정] 타입스크립트 문자열 리터럴이 평문 큰따옴표 인용부호인가", () => {
    // §3.4는 평문 큰따옴표를 인용부호로 확정하고(2026-08-13), Q-1은 코드 표기가 그것을
    // 마스킹한다고 정한다. 그 마스킹의 정의는 백틱 코드 스팬이라 마크다운 밖에는 대응물이
    // 없다. U-b는 자리만 넓히고 이 물음을 안 들었다 — 문자열 리터럴이 인용부호로 읽히면
    // 이 파일의 단언 대부분이 대조 대상이 된다. 오늘은 실재만 고정한다.
    const literals = [...TARGET_SOURCE.matchAll(/"([^"\\\n]{4,})"/g)].filter((match) =>
      /[가-힣]/.test(match[1] ?? ""),
    );
    expect(literals.length).toBeGreaterThan(0);
  });

  it("[미규정] 인용이 줄바꿈을 넘을 때의 단위", () => {
    // D-1은 대조 단위를 **대상의** 논리 단위로 정하고 코드 주석을 한 줄로 든다. 인용을
    // **쓰는** 쪽이 코드 주석이고 그 인용이 여러 줄에 걸칠 때 무엇이 한 단위인지는 U-b가
    // 넓히면서도 안 들었다. 위 축 3의 대조는 주석을 이어 붙여 읽었고, 줄 단위로만 읽으면
    // 같은 자리가 아예 안 보인다. 두 읽기가 실제로 갈린다는 사실만 고정한다.
    const joined = starQuotes(TARGET_SOURCE).length;
    const perLine = TARGET_SOURCE.split("\n").filter((line) => /\*"[^"]+"\*/.test(line)).length;
    expect(joined).toBeGreaterThan(perLine);
  });
});
