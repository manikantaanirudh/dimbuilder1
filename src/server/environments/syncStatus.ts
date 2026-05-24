import { createHash } from "node:crypto";
import type { Repositories } from "../db/repositories";
import type { SyncStatus, EnvironmentSyncStatus } from "../../shared/multiEnvTypes";

export function computeLocalHash(repos: Repositories, projectId: string, dimensionType: string): string {
  const dimensions = repos.dimensions.listByProject(projectId).filter(d => d.dimensionType === dimensionType);
  if (dimensions.length === 0) return "";

  const hash = createHash("sha256");
  for (const dim of dimensions) {
    const members = repos.members.listAllByDimension(dim.id);
    const relationships = repos.relationships.listByDimension(dim.id);

    hash.update(`dim:${dim.id}:${dim.dimensionName}\n`);
    for (const m of members) {
      hash.update(`m:${m.memberKey}:${JSON.stringify(m.properties)}\n`);
    }
    for (const r of relationships) {
      hash.update(`r:${r.parentKey}:${r.childKey}:${r.aggregationWeight}:${r.ownershipType}\n`);
    }
  }

  return hash.digest("hex");
}

export function refreshSyncStatus(repos: Repositories, projectId: string, environmentId?: string): EnvironmentSyncStatus[] {
  const dimensions = repos.dimensions.listByProject(projectId);
  const dimensionTypes = [...new Set(dimensions.map(d => d.dimensionType))];
  const environments = repos.environments.list();
  const targetEnvs = environmentId
    ? environments.filter(e => e.id === environmentId)
    : environments;

  const results: EnvironmentSyncStatus[] = [];

  for (const env of targetEnvs) {
    for (const dimType of dimensionTypes) {
      const localHash = computeLocalHash(repos, projectId, dimType);
      const existing = repos.environmentSyncStatus.listByEnvironment(env.id, projectId)
        .find(s => s.dimensionType === dimType);

      let syncStatus: SyncStatus = "unknown";
      if (!existing || !existing.lastDeployedAt) {
        syncStatus = localHash ? "local_ahead" : "unknown";
      } else if (existing.localVersionHash === localHash) {
        syncStatus = "in_sync";
      } else {
        syncStatus = "local_ahead";
      }

      const status = repos.environmentSyncStatus.upsert({
        environmentId: env.id,
        projectId,
        dimensionType: dimType,
        localVersionHash: localHash,
        syncStatus
      });
      results.push(status);
    }
  }

  return results;
}

export interface SyncStatusSummary {
  environmentId: string;
  environmentName: string;
  statuses: EnvironmentSyncStatus[];
  totalDimTypes: number;
  inSync: number;
  localAhead: number;
  remoteAhead: number;
  diverged: number;
  unknown: number;
}

export function getSyncStatusSummary(repos: Repositories, projectId: string): SyncStatusSummary[] {
  const allStatuses = repos.environmentSyncStatus.listByProject(projectId);
  const environments = repos.environments.list();

  const byEnv = new Map<string, EnvironmentSyncStatus[]>();
  for (const s of allStatuses) {
    const arr = byEnv.get(s.environmentId) ?? [];
    arr.push(s);
    byEnv.set(s.environmentId, arr);
  }

  return environments.map(env => {
    const statuses = byEnv.get(env.id) ?? [];
    return {
      environmentId: env.id,
      environmentName: env.name,
      statuses,
      totalDimTypes: statuses.length,
      inSync: statuses.filter(s => s.syncStatus === "in_sync").length,
      localAhead: statuses.filter(s => s.syncStatus === "local_ahead").length,
      remoteAhead: statuses.filter(s => s.syncStatus === "remote_ahead").length,
      diverged: statuses.filter(s => s.syncStatus === "diverged").length,
      unknown: statuses.filter(s => s.syncStatus === "unknown").length
    };
  });
}
