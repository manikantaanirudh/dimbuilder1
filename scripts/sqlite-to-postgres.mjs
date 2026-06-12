#!/usr/bin/env node
/**
 * Copy data from SQLite to PostgreSQL in foreign-key order.
 *
 * Usage:
 *   node scripts/sqlite-to-postgres.mjs --sqlite data/app.db --postgres $DATABASE_URL
 *   node scripts/sqlite-to-postgres.mjs --sqlite data/app.db --postgres $DATABASE_URL --truncate
 *
 * Requires the target Postgres database to already have schema applied (migrate-pg.mjs).
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { Pool } = pg;
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const schemaPath = join(rootDir, "src/server/db/schema/postgres.sql");
const BATCH_SIZE = 500;

export function parseTableOrder(schemaSql = readFileSync(schemaPath, "utf8")) {
  const tables = [];
  const pattern = /CREATE TABLE IF NOT EXISTS (\w+)/g;
  let match;
  while ((match = pattern.exec(schemaSql)) !== null) {
    tables.push(match[1]);
  }
  return tables;
}

export const TABLE_ORDER = parseTableOrder();

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sqlite: null,
    postgres: process.env.DATABASE_URL?.trim() || null,
    truncate: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sqlite") {
      options.sqlite = argv[++i] ?? null;
    } else if (arg === "--postgres") {
      options.postgres = argv[++i] ?? null;
    } else if (arg === "--truncate") {
      options.truncate = true;
    } else if (!arg.startsWith("--") && !options.postgres) {
      options.postgres = arg;
    }
  }

  return options;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function sqliteTableExists(sqlite, tableName) {
  const row = sqlite
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function sqliteColumns(sqlite, tableName) {
  return sqlite.prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`).all().map((row) => row.name);
}

async function postgresColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((row) => row.column_name);
}

async function postgresBooleanColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND data_type = 'boolean'`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function mapBooleanValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") return true;
    if (normalized === "0" || normalized === "false") return false;
  }
  return Boolean(value);
}

function mapRowValue(column, value, booleanColumns) {
  if (booleanColumns.has(column)) {
    return mapBooleanValue(value);
  }
  return value ?? null;
}

async function truncateTables(pool, tableNames) {
  const existing = [];
  for (const tableName of [...tableNames].reverse()) {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
       LIMIT 1`,
      [tableName]
    );
    if (result.rowCount > 0) {
      existing.push(quoteIdent(tableName));
    }
  }
  if (existing.length === 0) return;
  await pool.query(`TRUNCATE ${existing.join(", ")} RESTART IDENTITY CASCADE`);
}

async function copyTable(sqlite, pool, tableName) {
  if (!sqliteTableExists(sqlite, tableName)) {
    return { table: tableName, source: 0, dest: 0, skipped: true };
  }

  const pgTableExists = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );
  if (pgTableExists.rowCount === 0) {
    return { table: tableName, source: 0, dest: 0, skipped: true };
  }

  const sourceColumns = sqliteColumns(sqlite, tableName);
  const destColumns = new Set(await postgresColumns(pool, tableName));
  const columns = sourceColumns.filter((column) => destColumns.has(column));
  if (columns.length === 0) {
    return { table: tableName, source: 0, dest: 0, skipped: true };
  }

  const booleanColumns = await postgresBooleanColumns(pool, tableName);
  const quotedColumns = columns.map(quoteIdent).join(", ");
  const rows = sqlite
    .prepare(`SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(tableName)}`)
    .all();

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const placeholders = batch
      .map((row, rowIndex) => {
        const base = rowIndex * columns.length;
        columns.forEach((column) => {
          values.push(mapRowValue(column, row[column], booleanColumns));
        });
        const tuple = columns.map((_, columnIndex) => `$${base + columnIndex + 1}`).join(", ");
        return `(${tuple})`;
      })
      .join(", ");

    await pool.query(
      `INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES ${placeholders}`,
      values
    );
  }

  const sourceCount = rows.length;
  const destResult = await pool.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(tableName)}`);
  const destCount = Number(destResult.rows[0]?.count ?? 0);

  return { table: tableName, source: sourceCount, dest: destCount, skipped: false };
}

export function formatVerificationTable(results) {
  const header = ["Table", "Source", "Dest", "Match"];
  const rows = results
    .filter((result) => !result.skipped || result.source > 0)
    .map((result) => [
      result.table,
      String(result.source),
      String(result.dest),
      result.source === result.dest ? "OK" : "MISMATCH"
    ]);

  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length))
  );

  const formatRow = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  return [formatRow(header), formatRow(widths.map((width) => "-".repeat(width))), ...rows.map(formatRow)].join(
    "\n"
  );
}

export async function migrateSqliteToPostgres({
  sqlitePath,
  postgresUrl,
  truncate = false,
  tableOrder = TABLE_ORDER
}) {
  if (!sqlitePath) {
    throw new Error("sqlitePath is required");
  }
  if (!postgresUrl) {
    throw new Error("postgresUrl is required");
  }

  const sqlite = new DatabaseSync(sqlitePath);
  sqlite.exec("PRAGMA wal_checkpoint(FULL)");
  const pool = new Pool({ connectionString: postgresUrl });

  try {
    if (truncate) {
      await truncateTables(pool, tableOrder);
    }

    const results = [];
    for (const tableName of tableOrder) {
      results.push(await copyTable(sqlite, pool, tableName));
    }

    const mismatches = results.filter((result) => !result.skipped && result.source !== result.dest);
    return { results, mismatches, verificationTable: formatVerificationTable(results) };
  } finally {
    sqlite.close();
    await pool.end();
  }
}

async function main() {
  const options = parseArgs();
  if (!options.sqlite || !options.postgres) {
    console.error("Usage: node scripts/sqlite-to-postgres.mjs --sqlite <path> --postgres <url> [--truncate]");
    process.exit(1);
  }

  try {
    const { verificationTable, mismatches } = await migrateSqliteToPostgres({
      sqlitePath: options.sqlite,
      postgresUrl: options.postgres,
      truncate: options.truncate
    });

    console.log(verificationTable);

    if (mismatches.length > 0) {
      console.error(`Migration failed: ${mismatches.length} table(s) have count mismatches.`);
      process.exit(1);
    }

    console.log("Migration complete. All table counts match.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
