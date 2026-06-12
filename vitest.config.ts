import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/test/**/*.test.ts"],
    // Postgres integration tests share one DB; run via `npm run test:postgres`.
    exclude: [
      "src/test/postgresParity.test.ts",
      "src/test/postgresBulkInsert.test.ts",
      "src/test/postgresClient.test.ts",
      "src/test/postgresSchema.test.ts",
      "src/test/sqliteToPostgres.test.ts"
    ],
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

