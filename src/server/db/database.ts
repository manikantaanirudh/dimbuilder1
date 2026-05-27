import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { schemaSql } from "./schema";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => AppDatabase;
};

export interface AppDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    all(...values: unknown[]): Record<string, unknown>[];
    get(...values: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

export function createDatabase(filename = "data/app.db"): AppDatabase {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  db.exec(schemaSql);
  evolveSchema(db);
  seedSecurity(db);
  seedDefaultWorkflow(db);
  return db;
}

function evolveSchema(db: AppDatabase): void {
  ensureColumn(db, "dimension_relationships", "operation", "TEXT");
  ensureColumn(db, "dimension_relationships", "operation_source", "TEXT");
  ensureColumn(db, "dimension_relationships", "operation_notes", "TEXT");
}

function ensureColumn(db: AppDatabase, tableName: string, columnName: string, definition: string): void {
  const existingColumns = db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map((row) => String(row.name));
  if (existingColumns.includes(columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function seedSecurity(db: AppDatabase): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("local-admin", "local-admin@example.local", "Local Admin", "admin", 1, now, now);
}

function seedDefaultWorkflow(db: AppDatabase): void {
  const existing = db.prepare("SELECT id FROM workflow_definitions WHERE id = ?").get("standard-review");
  if (existing) return;
  const now = new Date().toISOString();
  const steps = JSON.stringify([
    { name: "Peer Review", requiredRole: "reviewer", minApprovals: 1, slaHours: 48 }
  ]);
  db.prepare(
    "INSERT INTO workflow_definitions (id, name, description, dimension_types, steps_json, auto_advance_rules_json, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("standard-review", "Standard Review", "Default single-step peer review workflow", "*", steps, "{}", 1, "system", now, now);
}
