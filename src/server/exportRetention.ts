import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface CleanupResult {
  scanned: number;
  removed: string[];
  retentionDays: number;
}

/**
 * Remove generated export files/directories older than retentionDays from the exports directory.
 * A retentionDays of 0 disables cleanup and is a no-op. Pure filesystem operation; safe to run
 * on startup and from a scheduled script.
 */
export function cleanupExports(
  exportsDirectory: string,
  retentionDays: number,
  now: Date = new Date()
): CleanupResult {
  const result: CleanupResult = { scanned: 0, removed: [], retentionDays };
  if (retentionDays <= 0) return result;
  if (!existsSync(exportsDirectory)) return result;

  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of readdirSync(exportsDirectory)) {
    const fullPath = join(exportsDirectory, entry);
    result.scanned += 1;
    let mtime: number;
    try {
      mtime = statSync(fullPath).mtimeMs;
    } catch {
      continue;
    }
    if (mtime < cutoff) {
      try {
        rmSync(fullPath, { recursive: true, force: true });
        result.removed.push(entry);
      } catch {
        // Leave files that cannot be removed; the next run will retry.
      }
    }
  }
  return result;
}
