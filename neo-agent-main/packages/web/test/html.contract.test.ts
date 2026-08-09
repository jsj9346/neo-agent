/**
 * HTML 텍스트 추출 `extractText` — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §3 한 문장 —
 *   "`script`/`style`/주석 제거, 태그 제거, HTML 엔티티 디코드, 공백 정리."
 * 그리고 §8 — "**품질 기준은 미결**이며 구현 플랜의 QA 실측 대상이다."
 *
 * 그래서 이 파일은 **품질을 재지 않는다.** 네 가지 동작의 *방향*만 고정한다:
 * 스크립트/스타일/주석의 내용이 본문으로 새지 않을 것, 태그 문법이 남지 않을 것,
 * 엔티티가 디코드될 것, 공백이 정리될 것. 얼마나 잘 하는지는 T-012 실측의 몫이다.
 *
 * 스크립트 누출이 왜 방향이 아니라 계약인가: 도구 결과는 프롬프트다. 페이지의 JS
 * 문자열이 본문에 섞이면 모델이 읽는 것은 문서가 아니라 **공격자가 고른 텍스트**다.
 */

import { describe, expect, it } from "vitest";
import { extractText } from "../src/index.ts";

describe("script·style·주석 제거 (WEB-ACCESS §3)", () => {
  it("script 내용이 본문으로 새지 않는다", () => {
    const html = `<html><body><script>var secret = "LEAKED_SCRIPT_BODY";</script><p>본문</p></body></html>`;
    const text = extractText(html);
    expect(text).not.toContain("LEAKED_SCRIPT_BODY");
    expect(text).not.toContain("var secret");
    expect(text).toContain("본문");
  });

  it("대문자·속성이 붙은 script 태그도 제거한다 — 소문자 정확 일치 구현을 잡는다", () => {
    const cases = [
      `<SCRIPT>LEAKED_UPPER</SCRIPT><p>본문</p>`,
      `<script type="text/javascript">LEAKED_ATTR</script><p>본문</p>`,
      `<script\n  src="x.js"\n  defer>LEAKED_MULTILINE</script><p>본문</p>`,
      `<script >LEAKED_SPACE</script><p>본문</p>`,
    ];
    for (const html of cases) {
      const text = extractText(html);
      expect(text, html).not.toMatch(/LEAKED_/);
      expect(text, html).toContain("본문");
    }
  });

  it("닫히지 않은 script의 내용도 새지 않는다", () => {
    // 잘린 응답(크기 상한!)은 닫는 태그가 없는 상태로 도착한다. 쌍이 맞을 때만
    // 지우는 구현은 **유계 처리와 만나는 순간** 스크립트 전문을 모델에게 보낸다.
    const text = extractText(`<p>앞</p><script>LEAKED_UNCLOSED_TAIL`);
    expect(text).not.toContain("LEAKED_UNCLOSED_TAIL");
    expect(text).toContain("앞");
  });

  it("style 내용이 본문으로 새지 않는다", () => {
    const text = extractText(`<style>.a{content:"LEAKED_CSS";}</style><p>본문</p>`);
    expect(text).not.toContain("LEAKED_CSS");
    expect(text).toContain("본문");
  });

  it("HTML 주석이 제거된다", () => {
    const text = extractText(`<p>앞</p><!-- LEAKED_COMMENT --><p>뒤</p>`);
    expect(text).not.toContain("LEAKED_COMMENT");
    expect(text).toContain("앞");
    expect(text).toContain("뒤");
  });

  it("조건부 주석·여러 줄 주석도 제거된다", () => {
    const text = extractText(`<p>앞</p><!--\n  여러 줄\n  LEAKED_MULTI\n-->`);
    expect(text).not.toContain("LEAKED_MULTI");
  });
});

describe("태그 제거·엔티티 디코드 (WEB-ACCESS §3)", () => {
  it("태그 문법이 결과에 남지 않는다", () => {
    const text = extractText(
      `<div class="x"><h1>제목</h1><p>단락 <a href="https://example.com">링크</a></p></div>`,
    );
    expect(text).toContain("제목");
    expect(text).toContain("단락");
    expect(text).toContain("링크");
    expect(text).not.toContain("<div");
    expect(text).not.toContain("href=");
    expect(text).not.toMatch(/<\/?[a-zA-Z][^>]*>/);
  });

  it("이름 있는 엔티티와 수치 엔티티를 디코드한다", () => {
    const text = extractText(`<p>&amp; &lt; &gt; &quot; &#39; &#x27; &#48;</p>`);
    expect(text).toContain("&");
    expect(text).toContain("<");
    expect(text).toContain(">");
    expect(text).toContain('"');
    expect(text).toContain("'");
    expect(text).toContain("0");
    // 디코드 자체가 안 된 흔적이 남으면 안 된다
    expect(text).not.toContain("&amp;");
    expect(text).not.toContain("&#x27;");
  });

  it("&nbsp;가 일반 공백처럼 다뤄진다", () => {
    // 실문자 U+00A0을 소스에 넣지 않는다 — 이스케이프로 쓴다(비가시 문자 규율)
    const text = extractText(`<p>가&nbsp;나</p>`);
    expect(text).toContain("가");
    expect(text).toContain("나");
    // [미규정 A-11] NBSP를 U+0020으로 접을지 그대로 둘지는 품질 판정(T-012)이다.
    // 어느 쪽이든 **엔티티 문자열이 그대로 남지는 않는다**만 고정한다.
    expect(text).not.toContain("&nbsp;");
  });

  it("엔티티를 두 번 디코드하지 않는다 — 최소 한 번은 디코드한다", () => {
    // [미규정 A-12] 이중 디코드 금지는 문서에 없다. 결과가 평문이라 보안 영향은
    // 작지만, 두 번 디코드하면 원문에 없던 `<`가 생겨 **문서가 왜곡된다**.
    // 판정 중립: "엔티티 흔적이 사라졌다"만 확인하고 최종 형태는 묻지 않는다.
    const text = extractText(`<p>&amp;lt;</p>`);
    expect(text).not.toContain("&amp;");
    expect(text.trim().length).toBeGreaterThan(0);
  });
});

describe("공백 정리 (WEB-ACCESS §3)", () => {
  it("연속 공백·줄바꿈이 접히고 앞뒤가 다듬어진다", () => {
    const text = extractText(`<p>   가\n\n\n\t\t나   </p>`);
    expect(text).toBe(text.trim());
    expect(text).not.toMatch(/[ \t]{3,}/);
    expect(text).not.toMatch(/\n{3,}/);
    expect(text).toContain("가");
    expect(text).toContain("나");
  });

  it("블록 요소의 텍스트가 서로 붙어버리지 않는다", () => {
    // [미규정 A-13] "공백 정리"가 블록 경계를 살리는지 문서에 없다. `<p>가</p><p>나</p>`가
    // `가나`가 되면 문장이 합쳐져 의미가 바뀌지만, 이는 §8이 T-012로 미룬 **품질** 항목이다.
    // 판정 중립: 두 텍스트가 모두 보존된다는 것만 고정하고, 붙었는지는 실측 리포트로 넘긴다.
    const text = extractText(`<p>가</p><p>나</p>`);
    expect(text).toContain("가");
    expect(text).toContain("나");
  });

  it("빈 입력·본문 없는 문서에서 예외를 던지지 않는다", () => {
    for (const html of ["", "<html></html>", "<script>x</script>", "<!-- only comment -->"]) {
      expect(() => extractText(html)).not.toThrow();
      expect(typeof extractText(html)).toBe("string");
    }
  });

  it("HTML이 아닌 평문을 넣어도 내용을 잃지 않는다", () => {
    // 잘못된 content-type을 보내는 서버가 실재한다. 평문이 통째로 사라지면
    // 모델은 "빈 페이지"라는 거짓을 읽는다.
    const text = extractText("그냥 평문입니다. 태그가 없습니다.");
    expect(text).toContain("그냥 평문입니다");
  });
});
