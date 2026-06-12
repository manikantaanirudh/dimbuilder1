import { defineConfig } from "vitest/config";

/** Config for `npm run test:postgres` — no exclude filter on PG integration tests. */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/test/**/*.test.ts"],
    fileParallelism: false
  }
});
