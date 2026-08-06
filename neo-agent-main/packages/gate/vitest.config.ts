import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "gate",
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
