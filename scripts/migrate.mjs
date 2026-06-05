#!/usr/bin/env node
/**
 * Migration helper CLI.
 * Usage:
 *   node scripts/migrate.mjs --list
 *   node scripts/migrate.mjs --pending
 *   npx tsx scripts/migrate.mjs --pending --from-source
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DATABASE_FILE || "data/app.db";
const args = process.argv.slice(2);

async function main() {
  if (!existsSync(dbFile)) {
    console.log(`Database not found at ${dbFile}. Run the app first to create it.`);
    return;
  }

  const db = new DatabaseSync(dbFile);

  try {
    if (args.includes("--list")) {
      const rows = db.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY applied_at, id").all();
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
      const registry = args.includes("--from-source")
        ? (await import("../src/server/db/migrations.ts")).migrations
        : JSON.parse(readFileSync(join(scriptDir, "migration-registry.json"), "utf8"));
      const applied = new Set(
        db.prepare("SELECT id FROM schema_migrations").all().map((row) => String(row.id))
      );
      const pending = registry.filter((m) => !applied.has(m.id));
      if (pending.length === 0) {
        console.log("No pending migrations.");
      } else {
        console.log("Pending migrations:");
        for (const migration of pending) {
          console.log(`  ${migration.id} — ${migration.description}`);
        }
      }
      return;
    }

    console.log("Usage:");
    console.log("  node scripts/migrate.mjs --list");
    console.log("  node scripts/migrate.mjs --pending");
    console.log("  npx tsx scripts/migrate.mjs --pending --from-source");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
