import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "store",
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
