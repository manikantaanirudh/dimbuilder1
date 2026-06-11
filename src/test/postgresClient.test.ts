import { describe, expect, it } from "vitest";
import { createPostgresClient } from "../server/db/postgresClient";

const url = process.env.PG_TEST_URL;

describe.skipIf(!url)("postgres client", () => {
  it("connects and runs a query", async () => {
    const client = await createPostgresClient(url!);
    const row = await client.queryOne<{ one: number }>("SELECT 1 AS one");
    expect(row?.one).toBe(1);
    await client.close();
  });

  it("commits transaction", async () => {
    const client = await createPostgresClient(url!);
    await client.exec("CREATE TEMP TABLE pg_client_tx (id TEXT PRIMARY KEY)");
    await client.transaction(async (tx) => {
      await tx.exec("INSERT INTO pg_client_tx (id) VALUES (?)", ["row1"]);
    });
    const row = await client.queryOne<{ id: string }>("SELECT id FROM pg_client_tx WHERE id = ?", ["row1"]);
    expect(row?.id).toBe("row1");
    await client.close();
  });

  it("rolls back transaction on error", async () => {
    const client = await createPostgresClient(url!);
    await client.exec("CREATE TEMP TABLE pg_client_tx_rb (id TEXT PRIMARY KEY)");
    await expect(
      client.transaction(async (tx) => {
        await tx.exec("INSERT INTO pg_client_tx_rb (id) VALUES (?)", ["gone"]);
        throw new Error("fail");
      })
    ).rejects.toThrow("fail");
    const row = await client.queryOne<{ id: string }>("SELECT id FROM pg_client_tx_rb WHERE id = ?", ["gone"]);
    expect(row).toBeNull();
    await client.close();
  });

  it("rolls back nested transaction without affecting outer transaction", async () => {
    const client = await createPostgresClient(url!);
    await client.exec("CREATE TEMP TABLE pg_client_nested (id TEXT PRIMARY KEY)");
    await client.transaction(async (outer) => {
      await outer.exec("INSERT INTO pg_client_nested (id) VALUES (?)", ["A"]);
      try {
        await outer.transaction(async (inner) => {
          await inner.exec("INSERT INTO pg_client_nested (id) VALUES (?)", ["B"]);
          throw new Error("inner failure");
        });
      } catch {
        // expected inner rollback
      }
    });
    const rows = await client.query<{ id: string }>("SELECT id FROM pg_client_nested ORDER BY id");
    expect(rows.map((row) => row.id)).toEqual(["A"]);
    await client.close();
  });
});
