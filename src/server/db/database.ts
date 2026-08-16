import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { runMigrationsSync } from "./migrations";
import { seedPropertyDefaultCatalog } from "./seedPropertyDefaultCatalog";
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

export function isAppDatabase(value: AppDatabase | unknown): value is AppDatabase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as AppDatabase;
  return typeof candidate.prepare === "function" && typeof candidate.exec === "function";
}

export function bootstrapSqliteSchema(db: AppDatabase): void {
  db.exec(schemaSql);
  evolveSchema(db);
  runMigrationsSync(db);
  seedPropertyDefaultCatalog(db);
  seedSecurity(db);
  seedDefaultWorkflow(db);
}

export function createDatabase(filename = "data/app.db"): AppDatabase {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  bootstrapSqliteSchema(db);
  return db;
}

function evolveSchema(db: AppDatabase): void {
  ensureColumn(db, "dimension_relationships", "operation", "TEXT");
  ensureColumn(db, "dimension_relationships", "operation_source", "TEXT");
  ensureColumn(db, "dimension_relationships", "operation_notes", "TEXT");
  ensureColumn(db, "projects", "version_number", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "projects", "version_label", "TEXT NOT NULL DEFAULT 'v1'");
  ensureColumn(db, "projects", "seeded_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "project_versions", "description", "TEXT NOT NULL DEFAULT ''");
  dedupeProjectVersions(db);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_project_versions_project_version ON project_versions(project_id, version_number)");
}

function ensureColumn(db: AppDatabase, tableName: string, columnName: string, definition: string): void {
  const existingColumns = db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map((row) => String(row.name));
  if (existingColumns.includes(columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

// One-time, idempotent repair for a historical bug where duplicate (project_id, version_number)
// rows could be created. Keeps the earliest-seeded row for each number and renumbers any later
// duplicates to the next free number for that project, preserving all history without data loss.
function dedupeProjectVersions(db: AppDatabase): void {
  const rows = db
    .prepare(
      "SELECT id, project_id, version_number FROM project_versions ORDER BY project_id, version_number ASC, seeded_at ASC"
    )
    .all();
  const usedByProject = new Map<string, Set<number>>();
  const maxByProject = new Map<string, number>();
  for (const row of rows) {
    const projectId = String(row.project_id);
    const versionNumber = Number(row.version_number);
    maxByProject.set(projectId, Math.max(maxByProject.get(projectId) ?? 0, versionNumber));
  }
  for (const row of rows) {
    const projectId = String(row.project_id);
    const versionNumber = Number(row.version_number);
    const used = usedByProject.get(projectId) ?? new Set<number>();
    usedByProject.set(projectId, used);
    if (used.has(versionNumber)) {
      const nextFree = (maxByProject.get(projectId) ?? versionNumber) + 1;
      maxByProject.set(projectId, nextFree);
      db.prepare("UPDATE project_versions SET version_number = ?, version_label = ? WHERE id = ?").run(
        nextFree,
        `v${nextFree}`,
        String(row.id)
      );
      used.add(nextFree);
    } else {
      used.add(versionNumber);
    }
  }
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
