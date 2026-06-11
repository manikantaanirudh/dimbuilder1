import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import type { AppDatabase } from "../server/db/database";
import {
  appDatabaseAsDbClient,
  migrations,
  runMigrations,
  runMigrationsSync
} from "../server/db/migrations";
import { ensureColumn, normalizeBoolean } from "../server/db/migrationUtils";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => AppDatabase;
};

describe("migration runner", () => {
  it("ensureColumn adds a missing column on sqlite", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE sample_table (
        id TEXT PRIMARY KEY
      );
    `);

    const client = appDatabaseAsDbClient(db);
    await ensureColumn(client, "sample_table", "extra_col", "TEXT NOT NULL DEFAULT ''");

    const columns = db.prepare("PRAGMA table_info(sample_table)").all()
      .map((row) => String(row.name));
    expect(columns).toContain("extra_col");
    db.close();
  });

  it("runMigrationsSync records pending migrations", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        description TEXT,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = runMigrationsSync(db, [migrations[0]]);
    expect(applied).toEqual(["001_initial_schema"]);

    const rows = db.prepare("SELECT id FROM schema_migrations").all()
      .map((row) => String(row.id));
    expect(rows).toContain("001_initial_schema");
    db.close();
  });

  it("runMigrations async records pending migrations", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        description TEXT,
        applied_at TEXT NOT NULL
      );
    `);

    const client = appDatabaseAsDbClient(db);
    const applied = await runMigrations(client, [migrations[0]]);
    expect(applied).toEqual(["001_initial_schema"]);
    await client.close();
  });
});

describe("migrationUtils", () => {
  it("normalizeBoolean handles sqlite-style values", () => {
    expect(normalizeBoolean(1)).toBe(true);
    expect(normalizeBoolean(0)).toBe(false);
    expect(normalizeBoolean("1")).toBe(true);
    expect(normalizeBoolean("0")).toBe(false);
    expect(normalizeBoolean(true)).toBe(true);
    expect(normalizeBoolean(false)).toBe(false);
  });
});
