import { describe, expect, it } from "vitest";
import { createSqliteClient } from "../server/db/sqliteClient";

describe("sqlite client", () => {
  it("runs async query against memory database", async () => {
    const client = await createSqliteClient(":memory:");
    await client.exec("CREATE TABLE scratch_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
    await client.exec("INSERT INTO scratch_projects (id, name) VALUES (?, ?)", ["p1", "Demo"]);
    const rows = await client.query<{ id: string; name: string }>("SELECT * FROM scratch_projects WHERE id = ?", ["p1"]);
    expect(rows[0]?.name).toBe("Demo");
    await client.close();
  });

  it("rolls back nested transaction without affecting outer transaction", async () => {
    const client = await createSqliteClient(":memory:");
    await client.exec("CREATE TABLE tx_scratch (id TEXT PRIMARY KEY)");

    await client.transaction(async (outer) => {
      await outer.exec("INSERT INTO tx_scratch (id) VALUES (?)", ["A"]);
      try {
        await outer.transaction(async (inner) => {
          await inner.exec("INSERT INTO tx_scratch (id) VALUES (?)", ["B"]);
          throw new Error("inner failure");
        });
      } catch {
        // expected inner rollback
      }
    });

    const rows = await client.query<{ id: string }>("SELECT id FROM tx_scratch ORDER BY id");
    expect(rows.map((row) => row.id)).toEqual(["A"]);
    await client.close();
  });
});
