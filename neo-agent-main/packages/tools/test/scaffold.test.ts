import { validateToolArgs } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * 스캐폴딩 스모크 — 워크스페이스 의존 해석·타입 스트리핑·Vitest 조합이 성립하는지.
 * 도구 계약 자체의 검증은 각 도구 테스트가 한다.
 */
describe("scaffold", () => {
  it("워크스페이스 의존(@neo-agent/core)을 임포트한다", () => {
    const tool = {
      name: "probe",
      label: "Probe",
      description: "scaffold probe",
      paramsSchema: z.strictObject({ value: z.string() }),
      execute: async () => ({ content: [], source: "local" as const }),
    };

    expect(validateToolArgs(tool, { value: "ok" }).ok).toBe(true);
    expect(validateToolArgs(tool, { unexpected: 1 }).ok).toBe(false);
  });
});
