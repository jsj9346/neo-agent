/**
 * 독립 QA — `packages/cli/test/renderer.test.ts`가 이번 사이클에 새로 쓰거나 재는 방식을
 * 바꾼 단언이 `docs/CLI-INTERFACE.md` §7이 정한 것을 실제로 재는가.
 *
 * **기대값의 출처는 §7 하나다.** 대상 테스트나 `src/renderer.ts`를 읽어 기대값을 정하지
 * 않는다 — 그렇게 하면 구현이 옳았다는 것을 구현으로 증명하는 순환이 된다. 대상이 문서와
 * 다르면 문서 편에 서고 red를 그대로 남긴다.
 *
 * 이 파일이 재는 축 셋:
 *
 * 1. **§7 마지막 불릿(`K-010` · `K-148`)의 금지** — 짝이 없고 주입 데이터도 아닌 단독
 *    리터럴이 남아 있는가. 대상 파일이 그 자리 하나를 스스로 위반으로 인정하고 `K-151`의
 *    소급 큐에 남긴다고 적으므로, 이 축은 그 소급이 끝나는 날 서도록 `todo`로 둔다.
 * 2. **금지를 피할 길이 실재하는가** — 문면 없이 잘림 비침묵을 재는 대비쌍을 실제로 세워
 *    보인다. 세워지면 그 소급이 **못 잰다**에 막히지 않는다는 것이 실물로 확인된다(2026-08-17
 *    이전 대상 주석이 든 근거가 정확히 그것이었고, 이 축이 그것을 반증해 오늘 철회됐다).
 * 3. **다시 쓴 `aborted` 단언의 대비 상대** — §7은 비정상 넷을 갈라 적었는데 대상은 둘하고만
 *    비교한다.
 *
 * 이 주석은 인용부호를 쓰지 않는다 — `DOC-CITATION.md` §6 U-b의 2026-08-17 판정이 대조
 * 축(U-1 · D-1 · D-2)이 걸리는 자리를 각 패키지의 테스트 디렉터리까지 넓혔고 이 파일이 그
 * 안이다. 이 규율의 실효 범위 자체는 이번 QA의 판정 항목이라 리포트가 든다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AssistantMessage } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { createRenderer } from "../src/renderer.ts";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const TARGET_PATH = path("./renderer.test.ts");
const TARGET_SOURCE = readFileSync(TARGET_PATH, "utf8");

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
