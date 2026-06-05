import type { AppDatabase } from "./db/database";

export interface ArtifactCleanupResult {
  retentionDays: number;
  diffRunsRemoved: number;
  baselinesRemoved: number;
  bulkJobsRemoved: number;
  changeSetsRemoved: number;
}

/**
 * Remove baselines and metadata diff runs older than retentionDays.
 * A retentionDays of 0 disables cleanup. Diff items cascade via FK.
 */
export function cleanupStaleArtifacts(
  db: AppDatabase,
  retentionDays: number,
  now: Date = new Date()
): ArtifactCleanupResult {
  const result: ArtifactCleanupResult = {
    retentionDays,
    diffRunsRemoved: 0,
    baselinesRemoved: 0,
    bulkJobsRemoved: 0,
    changeSetsRemoved: 0
  };
  if (retentionDays <= 0) return result;

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const diffRuns = db.prepare("DELETE FROM metadata_diff_runs WHERE created_at < ?").run(cutoff) as { changes?: number };
  result.diffRunsRemoved = diffRuns.changes ?? 0;
  const baselines = db.prepare(
    `DELETE FROM project_baselines
     WHERE created_at < ?
       AND id NOT IN (SELECT baseline_id FROM metadata_diff_runs)`
  ).run(cutoff) as { changes?: number };
  result.baselinesRemoved = baselines.changes ?? 0;
  if (tableExists(db, "bulk_update_jobs")) {
    const bulkJobs = db.prepare(
      `DELETE FROM bulk_update_jobs WHERE created_at < ? AND status IN ('applied', 'rolledBack')`
    ).run(cutoff) as { changes?: number };
    result.bulkJobsRemoved = bulkJobs.changes ?? 0;
  }
  if (tableExists(db, "change_sets")) {
    const changeSets = db.prepare(
      `DELETE FROM change_sets WHERE created_at < ? AND status IN ('exported', 'rejected')`
    ).run(cutoff) as { changes?: number };
    result.changeSetsRemoved = changeSets.changes ?? 0;
  }
  return result;
}

function tableExists(db: AppDatabase, tableName: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}
