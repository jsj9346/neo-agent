import { describe, expect, it } from "vitest";

/**
 * T-001 스모크 — 툴체인이 `erasableSyntaxOnly` + 네이티브 타입 스트리핑 전제와
 * 충돌하지 않는지 확인하는 최소 테스트 (플랜 R-6).
 */
describe("스캐폴딩", () => {
  it("타입 표기가 있는 .ts 모듈을 vitest가 실행한다", () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });

  it("공개 배럴을 임포트할 수 있다", async () => {
    const barrel = await import("../src/index.ts");
    expect(barrel).toBeTypeOf("object");
  });
});
