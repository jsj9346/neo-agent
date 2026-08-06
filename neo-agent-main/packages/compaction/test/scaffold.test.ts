import { expect, test } from "vitest";

test("공개 배럴이 로드된다 — 타입 스트리핑 경로 스모크", async () => {
  const barrel = await import("../src/index.ts");
  expect(barrel).toBeDefined();
});
