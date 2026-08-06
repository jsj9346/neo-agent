/**
 * 난독화 정규화 — `docs/APPROVAL-GATE.md` §2의 정규화 순서와 글로브 방언.
 */

import { describe, expect, it } from "vitest";
import { compileGlob, normalizeForMatching } from "../src/normalize.ts";
import { ch, HANGUL_FILLER, RIGHT_TO_LEFT_OVERRIDE, ZERO_WIDTH_SPACE } from "./helpers.ts";

describe("비가시 유니코드 검사 → NFKC 순서", () => {
  it("원문에 있던 코드포인트를 보고한다 — NFKC가 접기 전 값이다", () => {
    // U+3164(한글 채움 문자)는 NFKC를 거치면 U+1160이 된다. 순서를 뒤집으면
    // 사용자에게 "U+1160이 있었다"고 잘못 알리게 된다 — 원문 증거의 손실이다
    const result = normalizeForMatching(`npm${HANGUL_FILLER} test`);
    expect(result.invisible).toContain("U+3164");
    expect(result.invisible).not.toContain("U+1160");
  });

  it("제로폭 공백을 잡아내고 canonical에서는 지운다", () => {
    const result = normalizeForMatching(`np${ZERO_WIDTH_SPACE}m test`);
    expect(result.invisible).toEqual(["U+200B"]);
    expect(result.canonical).toBe("npm test");
  });

  it("방향 재정의 문자를 잡아낸다", () => {
    const result = normalizeForMatching(`echo ${RIGHT_TO_LEFT_OVERRIDE}txt.exe`);
    expect(result.invisible).toContain("U+202E");
  });

  it("전각 변형을 접고 접었다는 사실을 남긴다", () => {
    const result = normalizeForMatching("ｒｍ　－ｒｆ　／");
    expect(result.canonical).toBe("rm -rf /");
    expect(result.nfkcChanged).toBe(true);
  });

  it("평범한 명령에는 아무 흔적도 남기지 않는다", () => {
    const result = normalizeForMatching("npm run build");
    expect(result.invisible).toEqual([]);
    expect(result.nfkcChanged).toBe(false);
    expect(result.confusables).toEqual([]);
    expect(result.canonical).toBe("npm run build");
  });
});

describe("공백 정규화", () => {
  it("수평 공백은 한 칸으로 접는다", () => {
    expect(normalizeForMatching("  npm \t  test  ").canonical).toBe("npm test");
  });

  it("줄바꿈은 보존한다 — 셸에서 줄바꿈은 연산자다", () => {
    expect(normalizeForMatching("ls\nrm -rf /tmp").canonical).toBe("ls\nrm -rf /tmp");
  });
});

describe("동형이의 접기", () => {
  it("키릴 문자를 라틴으로 접은 후보를 함께 만든다", () => {
    const result = normalizeForMatching(`${ch(0x0441)}url https://x.test`);
    expect(result.confusables[0]).toEqual({ codePoint: "U+0441", folded: "c" });
    expect(result.variants).toContain("curl https://x.test");
  });
});

describe("매칭 후보", () => {
  it("인용부호를 편 후보를 포함한다", () => {
    expect(normalizeForMatching('git st""atus').variants).toContain("git status");
  });

  it("백슬래시를 편 후보를 포함한다", () => {
    expect(normalizeForMatching("r\\m -rf /tmp").variants).toContain("rm -rf /tmp");
  });

  it("원문 형태도 후보에 남는다 — 변형만 보면 정직한 입력을 놓친다", () => {
    expect(normalizeForMatching("git status").variants).toContain("git status");
  });

  it("후보는 중복되지 않는다", () => {
    const variants = normalizeForMatching("npm test").variants;
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe("입력 상한", () => {
  it("상한을 넘으면 잘라 분석하고 그 사실을 남긴다", () => {
    const result = normalizeForMatching("a".repeat(70_000));
    expect(result.truncated).toBe(true);
    expect(result.canonical.length).toBe(64 * 1024);
  });
});

describe("deny 규칙 글로브 방언", () => {
  it("`*`는 경로 구분자를 넘지 않는다", () => {
    expect(compileGlob("src/*.ts")("src/a.ts")).toBe(true);
    expect(compileGlob("src/*.ts")("src/lib/a.ts")).toBe(false);
  });

  it("`**`는 경로 구분자를 넘는다", () => {
    expect(compileGlob("src/**.ts")("src/lib/a.ts")).toBe(true);
  });

  it("`?`는 구분자 아닌 한 글자다", () => {
    expect(compileGlob("a?c")("abc")).toBe(true);
    expect(compileGlob("a?c")("a/c")).toBe(false);
    expect(compileGlob("a?c")("abbc")).toBe(false);
  });

  it("전체 일치다 — 부분 일치를 원하면 `**`를 명시한다", () => {
    expect(compileGlob("npm")("npm publish")).toBe(false);
    expect(compileGlob("npm**")("npm publish")).toBe(true);
  });

  it("정규식 메타문자는 리터럴로 다룬다", () => {
    expect(compileGlob("a.c")("abc")).toBe(false);
    expect(compileGlob("a.c")("a.c")).toBe(true);
    expect(compileGlob("a+b")("a+b")).toBe(true);
  });

  it("`*`가 여러 개 이어져도 구분자를 넘는 단일 와일드카드로 접힌다", () => {
    const matches = compileGlob("****x");
    expect(matches("aaaax")).toBe(true);
    expect(matches("a/b/x")).toBe(true);
    expect(matches("aaaay")).toBe(false);
  });

  it("와일드카드가 리터럴로 갈려 있어도 판정이 선형 시간에 끝난다", () => {
    // 정규식 번역판이 세제곱 백트래킹으로 멈추던 형태다(QA 검증에서 발견).
    const matches = compileGlob("**a**b**c**");
    const started = performance.now();
    expect(matches("ab".repeat(20_000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
