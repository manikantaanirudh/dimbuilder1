import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/shared/**/*.ts", "src/server/**/*.ts"],
      exclude: ["src/server/index.ts"],
      thresholds: {
        lines: 60,
        branches: 50
      }
    }
  }
});

