// Remove generated export files older than the retention window.
//
// Usage:
//   node scripts/cleanup-exports.mjs [exportsDir] [retentionDays]
//
// Defaults: exportsDir = EXPORTS_DIRECTORY env or data/exports,
//           retentionDays = EXPORT_RETENTION_DAYS env or 30
import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

const exportsDir = process.argv[2] ?? process.env.EXPORTS_DIRECTORY ?? "data/exports";
const retentionDays = Number(process.argv[3] ?? process.env.EXPORT_RETENTION_DAYS ?? 30);

if (!Number.isFinite(retentionDays) || retentionDays < 0) {
  console.error(`Invalid retentionDays: ${retentionDays}`);
  process.exit(1);
}

if (retentionDays === 0) {
  console.log("Retention disabled (retentionDays=0); nothing removed.");
  process.exit(0);
}

if (!existsSync(exportsDir)) {
  console.log(`Exports directory does not exist: ${exportsDir}`);
  process.exit(0);
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let removed = 0;
for (const entry of readdirSync(exportsDir)) {
  const full = join(exportsDir, entry);
  try {
    if (statSync(full).mtimeMs < cutoff) {
      rmSync(full, { recursive: true, force: true });
      removed += 1;
      console.log(`Removed ${full}`);
    }
  } catch {
    // skip
  }
}
console.log(`Export cleanup complete. Removed ${removed} item(s) older than ${retentionDays} day(s).`);
