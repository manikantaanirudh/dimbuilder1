import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createPostgresClient } from "../server/db/postgresClient";

const url = process.env.PG_TEST_URL;
const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "server",
  "db",
  "schema",
  "postgres.sql"
);

describe.skipIf(!url)("postgres schema", () => {
  it("applies postgres.sql without error", async () => {
    const client = await createPostgresClient(url!);
    const sql = readFileSync(schemaPath, "utf8");
    await client.exec(sql);
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    expect(tables.some((table) => table.tablename === "projects")).toBe(true);
    await client.close();
  });
});
