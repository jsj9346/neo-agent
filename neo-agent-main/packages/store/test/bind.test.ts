/**
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import { integerParam, textParam } from "../src/bind.ts";

/**
 * STRICT가 막지 못하는 것을 여기서 막는다. 이 테스트가 지키는 것은 함수의 동작이
 * 아니라 **DB가 잡아주리라 기대하지 않는다**는 전제다.
 */
describe("바인딩 파라미터 보장", () => {
  describe("integerParam", () => {
    it("안전 정수는 그대로 통과한다", () => {
      expect(integerParam(0, "x")).toBe(0);
      expect(integerParam(-1, "x")).toBe(-1);
      expect(integerParam(Number.MAX_SAFE_INTEGER, "x")).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("비정수를 막는다", () => {
      expect(() => integerParam(1.5, "seq")).toThrowError(/seq must be a safe integer/);
    });

    it("NaN·Infinity를 막는다", () => {
      expect(() => integerParam(Number.NaN, "seq")).toThrow();
      expect(() => integerParam(Number.POSITIVE_INFINITY, "seq")).toThrow();
    });

    it("안전 정수 범위를 넘는 값을 막는다 — DB는 조용히 정밀도를 잃는다", () => {
      expect(() => integerParam(Number.MAX_SAFE_INTEGER + 2, "timestamp")).toThrow();
    });
  });

  describe("textParam", () => {
    it("문자열은 그대로 통과한다", () => {
      expect(textParam("", "x")).toBe("");
      expect(textParam("hi", "x")).toBe("hi");
    });

    it('number가 새어 들어가는 것을 막는다 — TEXT 컬럼에서 `"42.0"`이 된다', () => {
      // biome-ignore lint/suspicious/noExplicitAny: 타입 밖에서 들어오는 값이 이 함수의 대상이다
      expect(() => textParam(42 as any, "role")).toThrowError(/role must be a string/);
    });
  });
});
