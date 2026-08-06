import type { ToolCallDecision } from "@neo-agent/core";
import { describe, expect, it } from "vitest";

/**
 * 스캐폴딩 스모크 — 워크스페이스 의존 해석·타입 스트리핑·Vitest 조합이 성립하는지.
 * 게이트는 코어의 훅 계약 타입만 소비한다(값 임포트 없음).
 */
describe("scaffold", () => {
  it("코어 훅 계약 타입을 소비한다", () => {
    const decision: ToolCallDecision = { decision: "block", reason: "scaffold" };
    expect(decision.decision).toBe("block");
  });
});
