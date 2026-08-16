import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppDatabase } from "./database";
import type { DbClient } from "./dbClient";
import { ensureColumn, ensureColumnSync } from "./migrationUtils";
import {
  seedPropertyDefaultCatalog,
  seedPropertyDefaultCatalogAsync
} from "./seedPropertyDefaultCatalog";
import type { SqlDialect } from "./sql";

/**
 * Lightweight, idempotent migration runner.
 *
 * The base schema (see schema.ts / postgres.sql) is applied on every startup.
 * Named migrations run exactly once and are recorded in `schema_migrations`.
 *
 * Migration 001 represents the baseline schema. Add new migrations to the `migrations`
 * array; each `up` runs inside the shared connection when its id is not yet recorded.
 */
export interface Migration {
  id: string;
  description: string;
  up: (client: DbClient) => Promise<void>;
  down?: string;
}

const postgresMigrationsDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "migrations",
  "postgres"
);

const VALIDATION_WAIVERS_SQL = `
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
`;

const PROPERTY_DEFAULT_PROFILES_SQL = `
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
`;

const PROPERTY_DEFAULT_OVERRIDES_SQL = `
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
`;

const PROPERTY_DEFAULT_CATALOG_SQL = `
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
`;

const PROJECT_QUERY_SQL = `
  CREATE TABLE IF NOT EXISTS project_query_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    legacy_id TEXT,
    title TEXT NOT NULL DEFAULT 'New Query Session',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_query_entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES project_query_sessions(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    result_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_project_query_session_legacy ON project_query_sessions(project_id, user_id, legacy_id);
  CREATE INDEX IF NOT EXISTS idx_project_query_sessions_owner ON project_query_sessions(project_id, user_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_project_query_sessions_expiry ON project_query_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_project_query_entries_session ON project_query_entries(session_id, created_at);
`;

const PROJECT_QUERY_WORKBENCH_SQL = `
  CREATE TABLE IF NOT EXISTS validation_snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_updated_at TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    issue_count INTEGER NOT NULL DEFAULT 0,
    blocking_count INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_validation_snapshots_project ON validation_snapshots(project_id, captured_at);
  CREATE TABLE IF NOT EXISTS project_query_entry_rows (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES project_query_entries(id) ON DELETE CASCADE,
    row_order INTEGER NOT NULL,
    row_json TEXT NOT NULL DEFAULT '{}',
    search_text TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_project_query_entry_rows_entry ON project_query_entry_rows(entry_id, row_order);
  CREATE TABLE IF NOT EXISTS project_query_playbook_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    session_id TEXT REFERENCES project_query_sessions(id) ON DELETE SET NULL,
    playbook_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    scope_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_project_query_playbook_runs_owner ON project_query_playbook_runs(project_id, user_id, updated_at);
  CREATE TABLE IF NOT EXISTS project_query_playbook_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES project_query_playbook_runs(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(run_id, step_id)
  );
  CREATE INDEX IF NOT EXISTS idx_project_query_playbook_steps_run ON project_query_playbook_steps(run_id, step_order);
  CREATE TABLE IF NOT EXISTS project_query_templates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    question TEXT NOT NULL,
    parameters_json TEXT NOT NULL DEFAULT '[]',
    scope_json TEXT NOT NULL DEFAULT '[]',
    last_run_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_project_query_templates_owner ON project_query_templates(project_id, user_id, updated_at);
`;

const syncMigrationAppliers: Record<string, (db: AppDatabase) => void> = {
  "001_initial_schema": () => {},
  "002_relationship_operation_columns": (db) => {
    ensureColumnSync(db, "dimension_relationships", "operation", "TEXT");
    ensureColumnSync(db, "dimension_relationships", "operation_source", "TEXT");
    ensureColumnSync(db, "dimension_relationships", "operation_notes", "TEXT");
  },
  "003_validation_waivers": (db) => {
    db.exec(VALIDATION_WAIVERS_SQL);
  },
  "004_property_default_profiles": (db) => {
    db.exec(PROPERTY_DEFAULT_PROFILES_SQL);
  },
  "005_property_default_overrides": (db) => {
    db.exec(PROPERTY_DEFAULT_OVERRIDES_SQL);
  },
  "006_property_default_catalog": (db) => {
    db.exec(PROPERTY_DEFAULT_CATALOG_SQL);
    seedPropertyDefaultCatalog(db);
  },
  "007_project_query_sessions": (db) => {
    db.exec(PROJECT_QUERY_SQL);
  },
  "008_project_query_workbench": (db) => {
    db.exec(PROJECT_QUERY_WORKBENCH_SQL);
  }
};

export const migrations: Migration[] = [
  {
    id: "001_initial_schema",
    description: "Baseline schema applied by schema.ts (recorded, not re-applied).",
    up: async () => {
      // No-op: the baseline schema is created idempotently by schemaSql in database.ts.
    }
  },
  {
    id: "002_relationship_operation_columns",
    description: "Add operation, operation_source, operation_notes to dimension_relationships.",
    up: async (client) => {
      await ensureColumn(client, "dimension_relationships", "operation", "TEXT");
      await ensureColumn(client, "dimension_relationships", "operation_source", "TEXT");
      await ensureColumn(client, "dimension_relationships", "operation_notes", "TEXT");
    },
    down: "-- Cannot drop columns in SQLite without table rebuild"
  },
  {
    id: "003_validation_waivers",
    description: "Add validation_waivers table for auditable issue waivers.",
    up: async (client) => {
      await client.exec(VALIDATION_WAIVERS_SQL);
    }
  },
  {
    id: "004_property_default_profiles",
    description: "Add property_default_profiles and property_default_values for XML-derived dynamic defaults.",
    up: async (client) => {
      await client.exec(PROPERTY_DEFAULT_PROFILES_SQL);
    }
  },
  {
    id: "005_property_default_overrides",
    description: "Per-project overrides for built-in property defaults.",
    up: async (client) => {
      await client.exec(PROPERTY_DEFAULT_OVERRIDES_SQL);
    }
  },
  {
    id: "006_property_default_catalog",
    description: "Global property default catalog seeded for all projects and dimension types.",
    up: async (client) => {
      await client.exec(PROPERTY_DEFAULT_CATALOG_SQL);
      await seedPropertyDefaultCatalogAsync(client);
    }
  },
  {
    id: "007_project_query_sessions",
    description: "Persist deterministic project query sessions and result entries.",
    up: async (client) => {
      await client.exec(PROJECT_QUERY_SQL);
    }
  }
  ,{
    id: "008_project_query_workbench",
    description: "Add validation snapshots, typed query rows, playbook runs, and pinned templates.",
    up: async (client) => {
      await client.exec(PROJECT_QUERY_WORKBENCH_SQL);
    }
  }
];

function recordMigrationSql(dialect: SqlDialect): string {
  if (dialect === "sqlite") {
    return "INSERT OR IGNORE INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)";
  }
  return `INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)
    ON CONFLICT (id) DO NOTHING`;
}

function listPostgresMigrationFiles(): string[] {
  if (!existsSync(postgresMigrationsDir)) return [];
  return readdirSync(postgresMigrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(postgresMigrationsDir, name));
}

function migrationIdFromFilename(filePath: string): string {
  return basename(filePath, ".sql");
}

function descriptionFromSql(sql: string, fallback: string): string {
  const match = sql.match(/^--\s*(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

async function loadAppliedMigrationIds(client: DbClient): Promise<Set<string>> {
  const rows = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
  return new Set(rows.map((row) => String(row.id)));
}

async function recordMigration(
  client: DbClient,
  id: string,
  description: string
): Promise<void> {
  await client.exec(recordMigrationSql(client.dialect), [
    id,
    description,
    new Date().toISOString()
  ]);
}

async function applyPostgresSqlMigrations(
  client: DbClient,
  applied: Set<string>
): Promise<string[]> {
  const newlyApplied: string[] = [];

  for (const filePath of listPostgresMigrationFiles()) {
    const id = migrationIdFromFilename(filePath);
    if (applied.has(id)) continue;

    const sql = readFileSync(filePath, "utf8").trim();
    if (sql) {
      await client.exec(sql);
    }

    const description = descriptionFromSql(sql, `PostgreSQL migration ${id}`);
    await recordMigration(client, id, description);
    applied.add(id);
    newlyApplied.push(id);
  }

  return newlyApplied;
}

export async function runMigrations(
  client: DbClient,
  registry: Migration[] = migrations
): Promise<string[]> {
  await client.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at TEXT NOT NULL
    )`
  );

  const applied = await loadAppliedMigrationIds(client);
  const newlyApplied: string[] = [];

  for (const migration of registry) {
    if (applied.has(migration.id)) continue;
    await migration.up(client);
    await recordMigration(client, migration.id, migration.description);
    applied.add(migration.id);
    newlyApplied.push(migration.id);
  }

  if (client.dialect === "postgres") {
    const sqlApplied = await applyPostgresSqlMigrations(client, applied);
    newlyApplied.push(...sqlApplied);
  }

  return newlyApplied;
}

export function appDatabaseAsDbClient(db: AppDatabase): DbClient {
  let depth = 0;

  const client: DbClient = {
    dialect: "sqlite",

    exec(sql: string, params: unknown[] = []): Promise<void> {
      if (params.length === 0) {
        db.exec(sql);
      } else {
        db.prepare(sql).run(...params);
      }
      return Promise.resolve();
    },

    run(sql: string, params: unknown[] = []): Promise<unknown> {
      if (params.length === 0) {
        db.exec(sql);
        return Promise.resolve({ changes: 0 });
      }
      return Promise.resolve(db.prepare(sql).run(...params));
    },

    query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      return Promise.resolve(db.prepare(sql).all(...params) as T[]);
    },

    queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      return Promise.resolve((db.prepare(sql).get(...params) ?? null) as T | null);
    },

    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const isOuter = depth === 0;
      const savepointName = `sp_${depth}`;

      if (isOuter) {
        await client.exec("BEGIN");
      } else {
        await client.exec(`SAVEPOINT ${savepointName}`);
      }

      depth++;
      try {
        const result = await fn(client);
        depth--;
        if (isOuter) {
          await client.exec("COMMIT");
        } else {
          await client.exec(`RELEASE ${savepointName}`);
        }
        return result;
      } catch (error) {
        depth--;
        if (isOuter) {
          await client.exec("ROLLBACK");
        } else {
          try {
            await client.exec(`ROLLBACK TO ${savepointName}`);
            await client.exec(`RELEASE ${savepointName}`);
          } catch {
            // Preserve the original action error if savepoint cleanup fails.
          }
        }
        throw error;
      }
    },

    close(): Promise<void> {
      return Promise.resolve().then(() => db.close());
    }
  };

  return client;
}

export function runMigrationsSync(db: AppDatabase, registry: Migration[] = migrations): string[] {
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

    const apply = syncMigrationAppliers[migration.id];
    if (!apply) {
      throw new Error(`No sync applier registered for migration ${migration.id}`);
    }

    apply(db);
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

export async function listAppliedMigrationsAsync(
  client: DbClient
): Promise<Array<{ id: string; appliedAt: string }>> {
  try {
    const rows = await client.query<{ id: string; applied_at: string }>(
      "SELECT id, applied_at FROM schema_migrations ORDER BY applied_at, id"
    );
    return rows.map((row) => ({ id: String(row.id), appliedAt: String(row.applied_at) }));
  } catch {
    return [];
  }
}
