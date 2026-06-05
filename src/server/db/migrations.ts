import type { AppDatabase } from "./database";
import { seedPropertyDefaultCatalog } from "./seedPropertyDefaultCatalog";

/**
 * Lightweight, idempotent migration runner.
 *
 * The base schema (see schema.ts) is applied with CREATE TABLE IF NOT EXISTS on every
 * startup. Named migrations run exactly once and are recorded in `schema_migrations`.
 *
 * Migration 001 represents the baseline schema. Add new migrations to the `migrations`
 * array; each `up` runs inside the shared connection when its id is not yet recorded.
 */
export interface Migration {
  id: string;
  description: string;
  up: (db: AppDatabase) => void;
  down?: string;
}

function ensureColumn(db: AppDatabase, tableName: string, columnName: string, definition: string): void {
  const existingColumns = db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map((row) => String(row.name));
  if (existingColumns.includes(columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export const migrations: Migration[] = [
  {
    id: "001_initial_schema",
    description: "Baseline schema applied by schema.ts (recorded, not re-applied).",
    up: () => {
      // No-op: the baseline schema is created idempotently by schemaSql in database.ts.
    }
  },
  {
    id: "002_relationship_operation_columns",
    description: "Add operation, operation_source, operation_notes to dimension_relationships.",
    up: (db) => {
      ensureColumn(db, "dimension_relationships", "operation", "TEXT");
      ensureColumn(db, "dimension_relationships", "operation_source", "TEXT");
      ensureColumn(db, "dimension_relationships", "operation_notes", "TEXT");
    },
    down: "-- Cannot drop columns in SQLite without table rebuild"
  },
  {
    id: "003_validation_waivers",
    description: "Add validation_waivers table for auditable issue waivers.",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS validation_waivers (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          issue_id TEXT NOT NULL,
          rule_code TEXT NOT NULL,
          dimension_id TEXT NOT NULL DEFAULT '',
          member_key TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'local-admin',
          created_at TEXT NOT NULL,
          revoked_at TEXT
        )
      `);
    }
  },
  {
    id: "004_property_default_profiles",
    description: "Add property_default_profiles and property_default_values for XML-derived dynamic defaults.",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS property_default_profiles (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          source_file_name TEXT NOT NULL DEFAULT '',
          source_xml_hash TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 0,
          created_by TEXT NOT NULL DEFAULT 'local-admin',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS property_default_values (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES property_default_profiles(id) ON DELETE CASCADE,
          dimension_type TEXT NOT NULL,
          target_level TEXT NOT NULL CHECK (target_level IN ('dimension', 'member', 'relationship')),
          property_name TEXT NOT NULL,
          xml_name TEXT NOT NULL,
          default_value TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          confidence REAL NOT NULL DEFAULT 0,
          sample_count INTEGER NOT NULL DEFAULT 0,
          non_blank_count INTEGER NOT NULL DEFAULT 0,
          distinct_count INTEGER NOT NULL DEFAULT 0,
          source_dimension_names_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL,
          UNIQUE(profile_id, dimension_type, target_level, property_name)
        );

        CREATE INDEX IF NOT EXISTS idx_property_default_profiles_project ON property_default_profiles(project_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_property_default_values_profile ON property_default_values(profile_id, dimension_type);
      `);
    }
  },
  {
    id: "005_property_default_overrides",
    description: "Per-project overrides for built-in property defaults.",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS property_default_overrides (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          dimension_type TEXT NOT NULL,
          target_level TEXT NOT NULL CHECK (target_level IN ('dimension', 'member', 'relationship')),
          property_name TEXT NOT NULL,
          xml_name TEXT NOT NULL,
          default_value TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL,
          UNIQUE(project_id, dimension_type, target_level, property_name)
        );
        CREATE INDEX IF NOT EXISTS idx_property_default_overrides_project ON property_default_overrides(project_id, dimension_type);
      `);
    }
  },
  {
    id: "006_property_default_catalog",
    description: "Global property default catalog seeded for all projects and dimension types.",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS property_default_catalog (
          id TEXT PRIMARY KEY,
          dimension_type TEXT NOT NULL,
          target_level TEXT NOT NULL CHECK (target_level IN ('dimension', 'member', 'relationship')),
          property_name TEXT NOT NULL,
          xml_name TEXT NOT NULL,
          default_value TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL,
          UNIQUE(dimension_type, target_level, property_name)
        );
        CREATE INDEX IF NOT EXISTS idx_property_default_catalog_type ON property_default_catalog(dimension_type, target_level);
      `);
      seedPropertyDefaultCatalog(db);
    }
  }
];

export function runMigrations(db: AppDatabase, registry: Migration[] = migrations): string[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at TEXT NOT NULL
    )`
  );

  const appliedRows = db.prepare("SELECT id FROM schema_migrations").all();
  const applied = new Set(appliedRows.map((row) => String(row.id)));
  const insert = db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)"
  );

  const newlyApplied: string[] = [];
  for (const migration of registry) {
    if (applied.has(migration.id)) continue;
    migration.up(db);
    insert.run(migration.id, migration.description, new Date().toISOString());
    newlyApplied.push(migration.id);
  }
  return newlyApplied;
}

export function listAppliedMigrations(db: AppDatabase): Array<{ id: string; appliedAt: string }> {
  try {
    return db
      .prepare("SELECT id, applied_at FROM schema_migrations ORDER BY applied_at, id")
      .all()
      .map((row) => ({ id: String(row.id), appliedAt: String(row.applied_at) }));
  } catch {
    return [];
  }
}
