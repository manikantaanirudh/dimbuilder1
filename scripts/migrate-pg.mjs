#!/usr/bin/env node
/**
 * PostgreSQL migration helper CLI.
 *
 * Usage:
 *   node scripts/migrate-pg.mjs <connection-string>
 *   DATABASE_URL=postgresql://... node scripts/migrate-pg.mjs
 *   node scripts/migrate-pg.mjs --list
 *   node scripts/migrate-pg.mjs --pending
 */
import pg from "pg";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const schemaPath = join(rootDir, "src/server/db/schema/postgres.sql");
const migrationsDir = join(rootDir, "src/server/db/migrations/postgres");
const args = process.argv.slice(2);

function connectionStringFromArgs() {
  const positional = args.find((arg) => !arg.startsWith("--"));
  return process.env.DATABASE_URL || positional || null;
}

function migrationIdFromFilename(filename) {
  return basename(filename, ".sql");
}

function listMigrationFiles() {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(migrationsDir, name));
}

function descriptionFromSql(sql, fallback) {
  const match = sql.match(/^--\s*(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );
  return result.rowCount > 0;
}

async function isDatabaseFresh(pool) {
  const projectsExists = await tableExists(pool, "projects");
  if (!projectsExists) return true;

  const migrationsExists = await tableExists(pool, "schema_migrations");
  if (!migrationsExists) return true;

  const result = await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations");
  return Number(result.rows[0]?.count ?? 0) === 0;
}

async function ensureSchemaMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at TEXT NOT NULL
    )
  `);
}

async function listAppliedMigrations(pool) {
  await ensureSchemaMigrationsTable(pool);
  const result = await pool.query(
    "SELECT id, description, applied_at FROM schema_migrations ORDER BY applied_at, id"
  );
  return result.rows;
}

async function appliedMigrationIds(pool) {
  await ensureSchemaMigrationsTable(pool);
  const result = await pool.query("SELECT id FROM schema_migrations");
  return new Set(result.rows.map((row) => String(row.id)));
}

async function recordMigration(pool, id, description) {
  await pool.query(
    `INSERT INTO schema_migrations (id, description, applied_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, description, new Date().toISOString()]
  );
}

async function applySchema(pool) {
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await recordMigration(
    pool,
    "001_initial_schema",
    "Baseline schema applied by postgres.sql (recorded, not re-applied)."
  );
  console.log("Applied baseline schema from postgres.sql");
}

async function applyPendingMigrations(pool) {
  const applied = await appliedMigrationIds(pool);
  const files = listMigrationFiles();
  let appliedCount = 0;

  for (const filePath of files) {
    const id = migrationIdFromFilename(filePath);
    if (applied.has(id)) continue;

    const sql = readFileSync(filePath, "utf8").trim();
    if (sql) {
      await pool.query(sql);
    }
    const description = descriptionFromSql(sql, `PostgreSQL migration ${id}`);
    await recordMigration(pool, id, description);
    applied.add(id);
    appliedCount++;
    console.log(`Applied migration ${id}`);
  }

  if (appliedCount === 0) {
    console.log("No pending migrations.");
  }
}

async function main() {
  const connectionString = connectionStringFromArgs();
  if (!connectionString) {
    console.error("Error: DATABASE_URL environment variable or connection string argument is required.");
    console.error("Usage: node scripts/migrate-pg.mjs <connection-string> [--list|--pending]");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    if (args.includes("--list")) {
      const rows = await listAppliedMigrations(pool);
      if (rows.length === 0) {
        console.log("No migrations applied yet.");
      } else {
        console.log("Applied migrations:");
        for (const row of rows) {
          console.log(`  ${row.id}  (applied ${row.applied_at})`);
        }
      }
      return;
    }

    if (args.includes("--pending")) {
      const applied = await appliedMigrationIds(pool);
      const pending = listMigrationFiles()
        .map((filePath) => ({
          id: migrationIdFromFilename(filePath),
          filePath
        }))
        .filter((migration) => !applied.has(migration.id));

      if (pending.length === 0) {
        console.log("No pending migrations.");
      } else {
        console.log("Pending migrations:");
        for (const migration of pending) {
          const sql = readFileSync(migration.filePath, "utf8");
          const description = descriptionFromSql(sql, `PostgreSQL migration ${migration.id}`);
          console.log(`  ${migration.id} — ${description}`);
        }
      }
      return;
    }

    if (await isDatabaseFresh(pool)) {
      await applySchema(pool);
    } else {
      await ensureSchemaMigrationsTable(pool);
      console.log("Database already initialized; skipping baseline schema.");
    }

    await applyPendingMigrations(pool);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Migration failed: ${error.message}`);
      if ("detail" in error && error.detail) {
        console.error(`Detail: ${error.detail}`);
      }
      if ("code" in error && error.code) {
        console.error(`Code: ${error.code}`);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
