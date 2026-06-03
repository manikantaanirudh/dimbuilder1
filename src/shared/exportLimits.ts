import type { AppConfig } from "./appConfigTypes";
import type { Repositories } from "../server/db/repositories";

export interface ExportLimitResponse {
  error: string;
  exportType: string;
  memberCount: number;
  limit: number;
  suggestion: string;
}

export class ExportLimitError extends Error {
  readonly status = 413;
  readonly payload: ExportLimitResponse;

  constructor(payload: ExportLimitResponse) {
    super(payload.error);
    this.payload = payload;
  }
}

export function resolveExportMaxMembers(config: AppConfig): number {
  return config.operations?.exportMaxMembers ?? 100_000;
}

export function formatExportLimitSuggestion(exportType: string): string {
  const normalized = exportType.toLowerCase();
  if (normalized.includes("xml") || normalized.includes("dimension")) {
    return "Raise operations.exportMaxMembers in config, or export a single dimension with ?dimensionId= for large projects.";
  }
  return "Raise operations.exportMaxMembers in config, or use XML/CSV exports for large handoffs.";
}

export function formatExportLimitMessage(exportType: string, memberCount: number, limit: number): string {
  return `Export "${exportType}" exceeds the configured member limit (${memberCount} members, limit ${limit}).`;
}

export function assertExportWithinMemberLimit(input: {
  memberCount: number;
  exportType: string;
  limit: number;
}): void {
  if (input.limit <= 0) return;
  if (input.memberCount <= input.limit) return;
  const payload: ExportLimitResponse = {
    error: formatExportLimitMessage(input.exportType, input.memberCount, input.limit),
    exportType: input.exportType,
    memberCount: input.memberCount,
    limit: input.limit,
    suggestion: formatExportLimitSuggestion(input.exportType)
  };
  throw new ExportLimitError(payload);
}

type ExportLimitRepos = Pick<Repositories, "members">;

export function assertProjectExportWithinMemberLimit(
  repos: ExportLimitRepos,
  projectId: string,
  exportType: string,
  config: AppConfig
): void {
  const limit = resolveExportMaxMembers(config);
  const memberCount = repos.members.countByProject(projectId);
  assertExportWithinMemberLimit({ memberCount, exportType, limit });
}

export function assertDimensionExportWithinMemberLimit(
  repos: ExportLimitRepos,
  dimensionId: string,
  exportType: string,
  config: AppConfig
): void {
  const limit = resolveExportMaxMembers(config);
  const memberCount = repos.members.countByDimension(dimensionId);
  assertExportWithinMemberLimit({ memberCount, exportType, limit });
}
