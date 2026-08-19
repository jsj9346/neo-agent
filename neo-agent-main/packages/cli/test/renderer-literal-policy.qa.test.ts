/**
 * 독립 QA — `packages/cli/test/renderer.test.ts`가 이번 사이클에 새로 쓰거나 재는 방식을
 * 바꾼 단언이 `docs/CLI-INTERFACE.md` §7이 정한 것을 실제로 재는가.
 *
 * **기대값의 출처는 §7 하나다.** 대상 테스트나 `src/renderer.ts`를 읽어 기대값을 정하지
 * 않는다 — 그렇게 하면 구현이 옳았다는 것을 구현으로 증명하는 순환이 된다. 대상이 문서와
 * 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * 이 파일이 재는 축 넷:
 *
 * 1. **§7 마지막 불릿(`K-010` · `K-148`)의 금지** — 짝이 없고 주입 데이터도 아닌 단독
 *    리터럴이 남아 있는가. 대상 파일이 그 자리 하나를 스스로 위반으로 인정하고 `K-151`의
 *    소급 큐에 남긴다고 적으므로, 이 축은 그 소급이 끝나는 날 서도록 `todo`로 둔다.
 * 2. **금지를 피할 길이 실재하는가** — 문면 없이 잘림 비침묵을 재는 대비쌍을 실제로 세워
 *    보인다. 세워지면 그 소급이 **못 잰다**에 막히지 않는다는 것이 실물로 확인된다(2026-08-17
 *    이전 대상 주석이 든 근거가 정확히 그것이었고, 이 축이 그것을 반증해 오늘 철회됐다).
 * 3. **다시 쓴 `aborted` 단언의 대비 상대** — §7은 비정상 넷을 갈라 적었는데 대상은 둘하고만
 *    비교한다.
 * 4. **이 파일 자신의 머리** — 바로 아래 선언을 자기 축이 잰다.
 *
 * 이 주석은 인용부호를 쓰지 않는다 — `DOC-CITATION.md` §6 U-b의 2026-08-17 판정이 대조
 * 축(U-1 · D-1 · D-2)이 걸리는 자리를 각 패키지의 테스트 디렉터리까지 넓혔고 이 파일이 그
 * 안이다. **재는 범위는 이 주석 전체다** — 범위어가 그 폭이고, 무엇이 한 머리인가는 같은
 * 절의 2026-08-18 판정이 든다(빈 줄 없이 이어지는 주석 줄의 덩어리 하나이고, 무엇이 주석
 * 줄인가는 줄 모양이 아니라 렉싱이 정한다). 2026-08-18까지 이 선언을 재는 기계가 없었다 —
 * 자기 주장을 안 재는 감사기는 `ARCHITECTURE.md` §2.6이 최악으로 든 침묵 실패 쪽이다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AssistantMessage } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
// 소속 술어의 **정본**은 이 모듈이다(`DOC-CITATION.md` §6 U-b의 2026-08-18 후속 판정과
// 2026-08-19 판정 · 아래 `headByContract`의 판정 문단). 사본을 두면 정본이 고쳐져도 이 파일만
// 옛 술어로 잰다.
import { commentTokenSpans } from "../../../scripts/comment-lexer.mjs";
import { createRenderer } from "../src/renderer.ts";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const TARGET_PATH = path("./renderer.test.ts");
const TARGET_SOURCE = readFileSync(TARGET_PATH, "utf8");
/** 이 파일 자신의 원문 — 축 4가 쓴다. 파일 이름을 문자열로 적지 않는다(적으면 개명 때 낡는다) */
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");

/**
 * 머리 — 첫 줄에서 시작하는 주석 줄 덩어리. **빈 줄 없이 이어지는 주석 줄 전부가 한 단위**라는
 * `DOC-CITATION.md` §6 U-b 2026-08-18 판정의 술어다. 첫 닫기 표기까지로 자르면 머리를 두
 * 블록으로 쪼갠 배치에서 조용히 짧아진다.
 *
 * **줄의 소속은 줄 모양(별표 접두)이 아니라 렉싱이 정한다**(같은 절의 후속 판정). 그래서
 * 별표 없는 계속 줄과 블록 주석 안의 완전 공백 줄이 머리를 안 끊고, 끊는 것은 주석 토큰의
 * 끝 뒤로 주석 없는 줄이 놓이는 자리다. 주석 밖 글자는 공백으로 덮어 돌려준다 — 코드 파일에서
 * 재는 것은 주석 안뿐이다.
 *
 * **이 술어가 부르는 소속 술어의 구현 정본은 `scripts/comment-lexer.mjs`다**(2026-08-19 판정 ·
 * `plans/20260819-ub-declaration-plan.md` §8.4 ③). 2026-08-18까지 이 자리는 미규정이었고 같은
 * 값이 패키지마다 따로 있었다 — 그 사본 넷이 같은 날 정본 임포트로 바뀌었다.
 *
 * **한 자리에 두는 폭은 소속 술어까지다.** 정본(§6 U-b 2026-08-18 셋째 판정)이 한 자리에 두라고
 * 한 것은 렉싱 수단의 분기와 그 술어이고, 덩어리 접기·파싱 진단·빈 덩어리 실패·머리 절단은
 * 그 밖이라 각 소비자가 든다. **그래서 이 함수 자신은 여기 남는다** — 머리 절단은 소속 술어가
 * 아니다.
 *
 * **소유는 `K-006` 하나다.** 전에 함께 적힌 `K-112`는 이미 닫힌 카드였다. 이 폭 판정은 정본
 * 문면이 새로 든 것이 아니라 기존 문장의 폭을 읽은 것이므로, 근거지는 위 플랜 §8.4 ③과
 * 2026-08-19 devlog 둘뿐이다.
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

/* ------------------------------------------------------------------------ *
 * 렌더 하네스 — 대상 테스트의 것을 베끼지 않고 여기서 새로 세운다
 * ------------------------------------------------------------------------ */

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 이스케이프를 벗기는 것이 목적이다
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

function render(events: AgentEvent[]): string {
  const chunks: string[] = [];
  const renderer = createRenderer({
    write(text: string): void {
      chunks.push(text);
    },
  });
  const signal = new AbortController().signal;
  for (const event of events) void renderer(event, signal);
  return stripAnsi(chunks.join(""));
}

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: "a1",
    role: "assistant",
    content: [],
    stopReason: "end_turn",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    timestamp: 0,
    ...overrides,
  };
}

function renderStop(stopReason: AssistantMessage["stopReason"]): string {
  return render([
    { type: "message_start", message: assistant() },
    { type: "message_end", message: assistant({ stopReason }) },
  ]);
}

/** 줄 `count`개짜리 도구 결과 하나를 그린 출력 */
function renderToolResult(count: number): string {
  const body = Array.from({ length: count }, (_, index) => `행-${index}`).join("\n");
  return render([
    {
      type: "tool_end",
      toolCallId: "call-1",
      toolName: "shell",
      result: { content: [{ type: "text", text: body }], source: "local" },
      isError: false,
    },
  ]);
}

/* ------------------------------------------------------------------------ *
 * 축 1 — §7이 금지한 단독 리터럴
 * ------------------------------------------------------------------------ */

type LiteralAssertion = {
  readonly line: number;
  readonly literal: string;
  readonly negated: boolean;
  readonly blockTitleLine: number;
  readonly blockText: string;
};

/** 숫자·보간 자리를 지운다 — 주입 데이터가 템플릿으로 만들어졌을 때 대조하기 위한 것이다 */
const skeleton = (text: string): string => text.replace(/\d+/g, "#").replace(/\$\{[^}]*\}/g, "#");

/**
 * `toContain` 단언과 그 리터럴을 `it` 블록 단위로 모은다.
 *
 * `toContain`으로 좁히는 이유는 §7이 다루는 것이 **표시 문구**이기 때문이다. 정규식 단언
 * (`toMatch`)은 문면을 고정하지 않고 부류를 재므로 이 금지의 대상이 아니다 — 그 형태의
 * 선례가 `packages/cli/test/search.contract.test.ts`의 빈 결과 검사다.
 */
function literalAssertions(source: string): LiteralAssertion[] {
  const lines = source.split("\n");
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^\s{2}it\(/.test(line)) starts.push(index);
  });

  const found: LiteralAssertion[] = [];
  starts.forEach((start, order) => {
    const end = starts[order + 1] ?? lines.length;
    const blockLines = lines.slice(start, end);
    const blockText = blockLines.join("\n");
    const pattern = /expect\([\s\S]*?\)\s*(\.not)?\.toContain\("([^"]+)"\)/g;
    for (const match of blockText.matchAll(pattern)) {
      const literal = match[2];
      if (literal === undefined) continue;
      const before = blockText.slice(0, match.index).split("\n").length - 1;
      found.push({
        line: start + before + 1,
        literal,
        negated: match[1] !== undefined,
        blockTitleLine: start + 1,
        blockText,
      });
    }
  });
  return found;
}

/**
 * §7이 금지한 형태만 남긴다 — **짝도 없고 주입 데이터도 아닌** 단독 리터럴.
 *
 * - 허용 ①: 같은 문면을 서로 다른 상태에서 있음/없음으로 재는 대비쌍(파일 전체에서 찾는다 —
 *   §7은 대비쌍이 한 `it` 안에 있어야 한다고 적지 않았다).
 * - 허용 ②: 그 `it`이 스스로 주입한 데이터가 그대로 통과했는지를 확인하는 단언.
 */
function forbiddenLiterals(source: string): string[] {
  const all = literalAssertions(source);
  return all
    .filter((assertion) => {
      const fixture = assertion.blockText
        .split("\n")
        .filter((line) => !line.includes("expect(") && !line.includes(".toContain("))
        .join("\n");
      const injected = skeleton(fixture).includes(skeleton(assertion.literal));
      const paired = all.some(
        (other) => other.literal === assertion.literal && other.negated !== assertion.negated,
      );
      return !injected && !paired;
    })
    .map((assertion) => `L${assertion.line} ${JSON.stringify(assertion.literal)}`);
}

describe("CLI-INTERFACE §7 — 표시 문구를 리터럴로 고정하지 않는다 (K-010 · K-148)", () => {
  it.todo("금지 — 짝 없고 주입 데이터도 아닌 단독 리터럴이 남아 있지 않다 (`K-151` 소급 후)", () => {
    // 근거: §7 마지막 불릿의 금지 항 — 리터럴이 문면 자체를 고정할 때. 짝이 없고 주입
    // 데이터도 아닌 단독 리터럴이 그것이다.
    //
    // **술어는 그대로 두고 실행만 미룬다.** 오늘 이것을 재면 §7이 `K-151`에 명시적으로 넘긴
    // 소급 큐를 오늘 비어 있어야 할 것처럼 재게 된다 — §7은 소급 처분과 검사기를 그 카드가
    // 든다고 적고, 대상 파일도 그 자리를 위반으로 인정한 채 큐에 남긴다. 큐가 비면
    // `.todo`를 떼는 것만으로 이 단언이 다시 선다. **조건을 느슨하게 고쳐 green을 만드는
    // 길은 열지 않는다** — 그러면 소급이 끝났는지 아무도 못 가른다.
    //
    // 이 판별기가 실제로 도는지는 아래 역검증이 계속 잰다(그쪽은 `todo`가 아니다).
    expect(forbiddenLiterals(TARGET_SOURCE)).toEqual([]);
  });

  it("역검증 — 같은 판별기가 심은 위반을 잡고 허용 둘은 안 잡는다", () => {
    const planted = [
      `  it("심은 위반", () => {`,
      `    const text = run();`,
      `    expect(text).toContain("고정된 문구");`,
      `  });`,
    ].join("\n");
    expect(forbiddenLiterals(planted)).toEqual([`L3 "고정된 문구"`]);

    const pair = [
      `  it("있음", () => {`,
      `    expect(a).toContain("문구");`,
      `  });`,
      `  it("없음", () => {`,
      `    expect(b).not.toContain("문구");`,
      `  });`,
    ].join("\n");
    expect(forbiddenLiterals(pair)).toEqual([]);

    const injected = [
      `  it("주입", () => {`,
      `    const text = run({ note: "주입한 값" });`,
      `    expect(text).toContain("주입한 값");`,
      `  });`,
    ].join("\n");
    expect(forbiddenLiterals(injected)).toEqual([]);
  });
});

describe("CLI-INTERFACE §7 — 잘림 고지는 문면 없이도 재진다 (금지의 반증)", () => {
  /**
   * 잘림이 화면에 닿는가를 **문면 없이** 재는 술어.
   *
   * 상한을 모르는 채로도 선다 — 상한보다 확실히 큰 두 입력을 먹여 **앞부분이 같고 감춘 줄
   * 수만 다른** 두 출력이 갈리는지를 본다. 갈린다면 감춘 줄에 대한 무언가가 출력에 실려
   * 있다는 뜻이고, 그것이 §7이 요구하는 유계 요약의 비침묵이다. 문면을 한 글자도 안 든다.
   */
  const announcesTruncation = (renderCount: (count: number) => string): boolean => {
    const few = renderCount(40);
    const more = renderCount(41);
    return few.trim() !== "" && few !== more;
  };

  it("적합 — 대비쌍만으로 잘림 비침묵이 재진다 (소급의 갈아탈 자리가 실재한다)", () => {
    // 근거: §7 마지막 불릿 — 테스트가 재는 것은 구별과 비침묵이다. 아래 술어는 그 둘만
    // 쓰고 표시 문구를 고정하지 않는다. 이것이 서므로 `K-151`의 소급은 **못 잰다**에
    // 막히지 않는다 — 갈아탈 형태가 여기 실물로 있다.
    expect(announcesTruncation(renderToolResult)).toBe(true);

    // 유계 자체도 문면 없이 선다 — 긴 입력의 출력이 입력보다 짧다.
    const long = Array.from({ length: 40 }, (_, index) => `행-${index}`).join("\n");
    expect(renderToolResult(40).length).toBeLessThan(long.length);
  });

  it("역검증 — 잘림을 고지하지 않는 렌더러는 그 술어에 걸린다", () => {
    const silent = (count: number): string =>
      Array.from({ length: count }, (_, index) => `행-${index}`)
        .slice(0, 6)
        .join("\n");
    expect(announcesTruncation(silent)).toBe(false);

    const mute = (): string => "";
    expect(announcesTruncation(mute)).toBe(false);
  });
});

describe("CLI-INTERFACE §7 — stopReason 비정상 셋의 구별", () => {
  it("적합 — aborted는 error와도 갈린다 (대상이 재지 않는 대비 상대)", () => {
    // 근거: §7 stopReason 불릿은 max_tokens · error · aborted를 **각각** 다른 처리로 적는다.
    // 대상 파일의 다시 쓴 단언은 end_turn · max_tokens 둘하고만 비교하므로, aborted가
    // error와 똑같이 그려져도 그린이다. 그 구멍을 여기서 닫는다.
    const aborted = renderStop("aborted");
    expect(aborted.trim()).not.toBe("");
    expect(aborted).not.toBe(renderStop("error"));
    expect(aborted).not.toBe(renderStop("max_tokens"));
    expect(aborted).not.toBe(renderStop("end_turn"));
  });

  it("역검증 — 비침묵 단언이 메시지 프레임 출력으로 통과하지 않는다", () => {
    // 대상의 비침묵 단언은 message_start와 message_end를 함께 먹인 출력 전체를 본다.
    // 프레임이 스스로 무언가를 그린다면 그 단언은 stopReason에 대해 아무것도 안 재는
    // 술어로 퇴화한다. 기준선이 빈 문자열임을 여기서 고정한다.
    expect(renderStop("end_turn").trim()).toBe("");
    expect(renderStop("tool_use").trim()).toBe("");
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 이 파일 자신의 머리
 * ------------------------------------------------------------------------ */

describe("DOC-CITATION §6 U-b — 이 파일 머리가 인용부호를 쓰지 않는다는 주장은 참이다 (자기 축)", () => {
  it("적합 — 머리에 인용부호 셋이 하나도 없다", () => {
    // 근거: §6 U-b가 계약의 자리를 각 파일 자신의 머리에 두었고 이 파일 머리도 그 선언을
    // 든다. 대조 축이 넓어진 자리에서 인용부호를 쓰면 그 문면은 문자 그대로 대조를 받아야
    // 하는데, 이 패키지에는 그 대조를 재는 기계가 없다 — 그래서 선언이 부재 쪽이다.
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

    // 머리를 블록 주석 둘로 쪼갠 배치. 첫 닫기 표기로 자르는 옛 술어는 둘째 블록을 머리
    // 밖으로 보내 심은 것을 안 쟀다(`plans/20260818-ub-K-152.md` §1 표본 B).
    const anchor = " * 이 주석은 인용부호를 쓰지 않는다";
    const plant = ` * 표본 «지목»과 "인용"`;
    const split = SELF_SOURCE.replace(anchor, [" */", "/**", plant, anchor].join("\n"));
    expect(split).not.toBe(SELF_SOURCE);
    expect(headByContract(split)).toMatch(/[«»]/);
    expect(split.slice(0, split.indexOf("*/"))).not.toMatch(/[«»]/);

    // 별표 없는 계속 줄과 블록 주석 안의 완전 공백 줄도 한 덩어리 안이다 — 소속을 렉싱이
    // 정하기 때문이고, 줄 모양으로 읽으면 둘 다 여기서 조용히 잘린다(§6 U-b 2026-08-18 후속).
    // 2026-08-18까지 쓰던 줄 모양 술어 — 대조군. 이 짝이 없으면 아래 둘은 그 술어에서도 그린이다.
    const byLineShape = (source: string): string => {
      const head: string[] = [];
      for (const line of source.split("\n")) {
        if (!/^\s*(\/\/|\*|\/\*)/.test(line)) break;
        head.push(line);
      }
      return head.join("\n");
    };
    for (const bentPlant of [
      [anchor, `   표본 «지목»`],
      [anchor, "", plant],
    ]) {
      const bent = SELF_SOURCE.replace(anchor, bentPlant.join("\n"));
      expect(bent).not.toBe(SELF_SOURCE);
      expect(headByContract(bent)).toMatch(/[«»]/);
      expect(byLineShape(bent)).not.toMatch(/[«»]/);
    }
  });
});
