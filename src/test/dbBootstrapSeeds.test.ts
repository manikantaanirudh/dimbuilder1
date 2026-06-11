import { describe, expect, it } from "vitest";
import { bootstrapPostgresSchema } from "../server/db/bootstrapPostgresSchema";
import { createPostgresClient } from "../server/db/postgresClient";
import { createSqliteClient } from "../server/db/sqliteClient";

const pgUrl = process.env.PG_TEST_URL;

async function expectBootstrapSeeds(client: Awaited<ReturnType<typeof createSqliteClient>>) {
  const catalog = await client.queryOne<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM property_default_catalog"
  );
  expect(Number(catalog?.count ?? 0)).toBeGreaterThan(0);

  const admin = await client.queryOne<{ id: string }>(
    "SELECT id FROM users WHERE id = ?",
    ["local-admin"]
  );
  expect(admin?.id).toBe("local-admin");

  const workflow = await client.queryOne<{ id: string }>(
    "SELECT id FROM workflow_definitions WHERE id = ?",
    ["standard-review"]
  );
  expect(workflow?.id).toBe("standard-review");
}

describe("bootstrap seeds", () => {
  it("seeds catalog, admin user, and default workflow on SQLite", async () => {
    const client = await createSqliteClient(":memory:");
    await expectBootstrapSeeds(client);
    await client.close();
  });

  it.skipIf(!pgUrl)("seeds catalog, admin user, and default workflow on Postgres", async () => {
    const client = await createPostgresClient(pgUrl!);
    await bootstrapPostgresSchema(client);
    await expectBootstrapSeeds(client);
    await client.close();
  });
});
