/**
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, test } from "vitest";
import { measureContextTokens, shouldCompact } from "../src/trigger.ts";
import { assistant, config, toolResult, user } from "./support.ts";

const usage = (input: number, output = 0, cacheRead = 0, cacheWrite = 0) => ({
  usage: { input, output, cacheRead, cacheWrite },
});

describe("measureContextTokens", () => {
  test("네 종류의 토큰을 전부 더한다 — cacheRead도 모델이 읽은 토큰이다", () => {
    const messages = [user("안녕"), assistant("응", usage(100, 20, 300, 40))];
    expect(measureContextTokens(messages)).toBe(460);
  });

  test("마지막 유효 어시스턴트를 쓴다 — 그 뒤의 사용자·도구 메시지는 미반영", () => {
    const messages = [
      user("첫 질문"),
      assistant("첫 응답", usage(100)),
      user("둘째 질문"),
      assistant("둘째 응답", usage(700)),
      toolResult(),
    ];
    expect(measureContextTokens(messages)).toBe(700);
  });

  test("error·aborted 응답의 usage는 건너뛴다", () => {
    const messages = [
      assistant("정상", usage(500)),
      assistant("", { ...usage(9999), stopReason: "error", errorMessage: "boom" }),
      assistant("", { ...usage(8888), stopReason: "aborted" }),
    ];
    expect(measureContextTokens(messages)).toBe(500);
  });

  test("유효 usage가 없으면 undefined", () => {
    expect(measureContextTokens([])).toBeUndefined();
    expect(measureContextTokens([user("안녕")])).toBeUndefined();
    expect(
      measureContextTokens([assistant("", { ...usage(9999), stopReason: "error" })]),
    ).toBeUndefined();
  });
});

describe("shouldCompact", () => {
  test("임계 초과에서만 참 — 같은 값은 거짓(엄격 초과)", () => {
    const cfg = config({ contextWindowTokens: 1000, threshold: 0.75 });
    expect(shouldCompact([assistant("x", usage(750))], cfg)).toBe(false);
    expect(shouldCompact([assistant("x", usage(751))], cfg)).toBe(true);
  });

  test("유효 usage가 없으면 거짓 — 문자 수 추정으로 대체하지 않는다", () => {
    const cfg = config({ contextWindowTokens: 10 });
    const long = "가".repeat(100_000);
    expect(shouldCompact([user(long)], cfg)).toBe(false);
  });
});
