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
