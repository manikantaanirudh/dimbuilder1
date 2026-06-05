// Backup the SQLite database file (and its WAL/SHM sidecars) into a timestamped copy.
//
// Usage:
//   node scripts/backup-db.mjs [sourceDbPath] [backupDir]
//
// Defaults: source = DATABASE_FILE env or data/app.db, backupDir = data/backups
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const source = process.argv[2] ?? process.env.DATABASE_FILE ?? "data/app.db";
const backupDir = process.argv[3] ?? "data/backups";

if (!existsSync(source)) {
  console.error(`Database file not found: ${source}`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = basename(source);
const targets = [];

for (const suffix of ["", "-wal", "-shm"]) {
  const src = `${source}${suffix}`;
  if (!existsSync(src)) continue;
  const dest = join(backupDir, `${base}${suffix}.${stamp}.bak`);
  copyFileSync(src, dest);
  targets.push(dest);
}

console.log(`Backed up ${source} -> ${backupDir}`);
for (const t of targets) console.log(`  ${t}`);
