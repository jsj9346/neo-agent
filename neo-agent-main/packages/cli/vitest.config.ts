import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cli",
    environment: "node",
    // `*.live.ts`는 옵트인일 때만 **수집**된다 — `DISTRIBUTION.md` §3.5.
    // 수집한 뒤 건너뛰는 것과 애초에 안 들어오는 것은 다르고, 통과로 보이는 것은 전자뿐이다.
    include: [
      "src/**/*.test.ts",
      "test/**/*.test.ts",
      ...(process.env.NEO_DIST_LIVE === "1" ? ["test/**/*.live.ts"] : []),
    ],
  },
});
