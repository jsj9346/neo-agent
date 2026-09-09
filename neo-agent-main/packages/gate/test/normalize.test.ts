/**
 * 난독화 정규화 — `docs/APPROVAL-GATE.md` §2의 정규화 순서와 글로브 방언.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import {
  compileGlob,
  displayInvisiblePattern,
  INVISIBLE_PATTERN,
  normalizeForMatching,
} from "../src/normalize.ts";
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

describe("§7 「정규화된 명령 전체」의 정의역 — 5단 순서", () => {
  // APPROVAL-GATE §7이 이 파일을 정본 위치로 지목한다: "NFKC → 비가시 문자 제거 →
  // 수평 공백 1칸 축약 → 개행 접기 → 양끝 트림, **이 순서**". 학습 키가 이 뷰로
  // 만들어지므로 순서가 바뀌면 키가 조용히 달라진다 — 지목이 참인지 재는 자리가
  // 여기 말고 없었다.
  it("다섯 단이 이 순서로 돈다", () => {
    const ideographicSpace = ch(0x3000);
    const raw = `${ideographicSpace}ｇｉｔ${ZERO_WIDTH_SPACE}${ideographicSpace}ｓｔａｔｕｓ\t  --short\r\n\n  .${ideographicSpace}`;

    expect(normalizeForMatching(raw).canonical).toBe("git status --short\n.");
  });

  it("순서를 뒤집으면 이 입력이 다른 키를 낸다 — 위 단언이 재는 것", () => {
    const ideographicSpace = ch(0x3000);

    // 1↔2를 뒤집으면(비가시 제거 → NFKC) 전각 공백이 **지워져** 단어가 붙는다.
    // 전각 공백은 비가시 집합의 원소이면서 NFKC로 ASCII 공백이 되는 문자다.
    const strippedFirst = `ｇｉｔ${ideographicSpace}ｓｔａｔｕｓ`
      .replace(INVISIBLE_PATTERN, "")
      .normalize("NFKC");
    expect(strippedFirst).toBe("gitstatus");
    expect(normalizeForMatching(`ｇｉｔ${ideographicSpace}ｓｔａｔｕｓ`).canonical).toBe(
      "git status",
    );

    // 3↔4를 뒤집으면(개행 접기 → 수평 공백 축약) CR가 개행 접기에 안 먹혀
    // 공백으로 남는다: `--short \n.`
    expect(normalizeForMatching("--short\r\n\n  .").canonical).toBe("--short\n.");
  });

  it("양끝 트림과 개행 접기가 실제로 걸린다", () => {
    // 트림의 **자리**(다섯째)는 이 함수 밖에서 관측되지 않는다 — 트림은 가장자리에
    // 멱등이라 앞뒤 어디에 두어도 같은 결과가 나온다. 그래서 이 단언이 재는 것은
    // 「트림이 걸린다」와 「연속 개행이 하나로 접힌다」까지다. 자리까지는 못 잰다.
    expect(normalizeForMatching("  npm test  ").canonical).toBe("npm test");
    expect(normalizeForMatching("ls\n\n\npwd").canonical).toBe("ls\npwd");
  });
});

describe("표시 축의 문자 집합 — 매칭 축에서 갈린다 (APPROVAL-GATE §4)", () => {
  /** 전역 정규식의 `lastIndex` 오염 없이 「이 집합이 이 문자를 잡는가」만 본다 */
  function hits(pattern: RegExp, text: string): boolean {
    return text.replace(pattern, "") !== text;
  }

  const CARRIAGE_RETURN = ch(0x000d);
  const LINE_FEED = ch(0x000a);
  const TAB = ch(0x0009);

  it("CR는 표시 집합이 잡고 매칭 집합은 안 잡는다 — 같은 입력에서", () => {
    const raw = `git${CARRIAGE_RETURN} status`;

    expect(hits(INVISIBLE_PATTERN, raw)).toBe(false);
    expect(hits(displayInvisiblePattern("single-line"), raw)).toBe(true);
    expect(hits(displayInvisiblePattern("multi-line"), raw)).toBe(true);
  });

  it("탭은 표시 집합에도 안 잡힌다 — §4가 넓히지 않기로 한 자리", () => {
    const raw = `ls${TAB}pwd`;

    expect(hits(INVISIBLE_PATTERN, raw)).toBe(false);
    expect(hits(displayInvisiblePattern("single-line"), raw)).toBe(false);
    expect(hits(displayInvisiblePattern("multi-line"), raw)).toBe(false);
  });

  it("LF는 슬롯이 정한다 — `single-line`만 잡는다", () => {
    const raw = `저장할 내용${LINE_FEED}둘째 줄`;

    expect(hits(INVISIBLE_PATTERN, raw)).toBe(false);
    expect(hits(displayInvisiblePattern("single-line"), raw)).toBe(true);
    expect(hits(displayInvisiblePattern("multi-line"), raw)).toBe(false);
  });

  it("관계가 계약이다 — 표시 = 매칭 ∪ {CR} ∪ ({LF} iff single-line)", () => {
    // 두 집합의 목록을 따로 적으면 언젠가 갈린다. 그 관계 자체를 코드포인트
    // 표본 전수로 재서, 표시 집합이 매칭 집합에서 파생된다는 사실을 고정한다.
    const sample = [
      0x0000, 0x0009, 0x000a, 0x000d, 0x001b, 0x0020, 0x0061, 0x007f, 0x0085, 0x00a0, 0x115f,
      0x1160, 0x1680, 0x2000, 0x200a, 0x200b, 0x2028, 0x2029, 0x202e, 0x202f, 0x205f, 0x2705,
      0x3000, 0x3164, 0xac00, 0xff52, 0xffa0,
    ];

    for (const codePoint of sample) {
      const char = ch(codePoint);
      const inMatching = hits(INVISIBLE_PATTERN, char);

      expect([codePoint, hits(displayInvisiblePattern("multi-line"), char)]).toEqual([
        codePoint,
        inMatching || codePoint === 0x000d,
      ]);
      expect([codePoint, hits(displayInvisiblePattern("single-line"), char)]).toEqual([
        codePoint,
        inMatching || codePoint === 0x000d || codePoint === 0x000a,
      ]);
    }
  });

  it("호출마다 새 인스턴스를 준다 — `lastIndex`가 판정 사이로 새지 않는다", () => {
    const first = displayInvisiblePattern("single-line");
    const second = displayInvisiblePattern("single-line");

    expect(first).not.toBe(second);
    expect(first.flags).toBe(INVISIBLE_PATTERN.flags);

    // 공유 인스턴스였다면 둘째 호출이 `lastIndex` 때문에 거짓을 낸다
    expect(first.test(CARRIAGE_RETURN)).toBe(true);
    expect(second.test(CARRIAGE_RETURN)).toBe(true);
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
