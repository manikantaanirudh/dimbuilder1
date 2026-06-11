import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { migrations, runMigrationsSync } from "../server/db/migrations";
import type { AppDatabase } from "../server/db/database";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => AppDatabase;
};

describe("migration 002 upgrade", () => {
  it("adds relationship operation columns to a legacy database", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE dimension_relationships (
        id TEXT PRIMARY KEY,
        dimension_id TEXT NOT NULL,
        parent_key TEXT NOT NULL DEFAULT '',
        child_key TEXT NOT NULL DEFAULT '',
        aggregation_weight REAL,
        percent_consol REAL,
        percent_ownership REAL,
        ownership_type TEXT NOT NULL DEFAULT '',
        properties_json TEXT NOT NULL DEFAULT '{}',
        row_order INTEGER NOT NULL,
        source_row_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const migration002 = migrations.filter((m) => m.id === "002_relationship_operation_columns");
    const applied = runMigrationsSync(db, migration002);

    expect(applied).toContain("002_relationship_operation_columns");
    const columns = db.prepare("PRAGMA table_info(dimension_relationships)").all()
      .map((row) => String(row.name));
    expect(columns).toEqual(expect.arrayContaining(["operation", "operation_source", "operation_notes"]));
    db.close();
  });
});
