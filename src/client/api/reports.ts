import { apiPost } from "./core";

export interface HealthReport {
  overallScore: number;
  trend: string;
  snapshots: Array<{
    dimensionType: string;
    qualityScore: number;
    completenessScore: number;
    namingScore: number;
    memberCount: number;
    orphanCount: number;
    validationErrorCount: number;
    validationWarningCount: number;
  }>;
}

export interface VelocityReport {
  totalChanges: number;
  periods: Array<{
    periodStart: string;
    membersAdded: number;
    membersModified: number;
    membersDeleted: number;
    totalChanges: number;
  }>;
}

export interface CoverageReport {
  overallCoverage: number;
  dimensions: Array<{
    dimensionType: string;
    memberCount: number;
    propertyCoverage: number;
    descriptionCoverage: number;
    lastModified: string;
    isStale: boolean;
  }>;
}

export function fetchHealthReport(projectId: string) {
  return apiPost<HealthReport>("/reports/generate/health", { projectId });
}

export function fetchVelocityReport(projectId: string) {
  return apiPost<VelocityReport>("/reports/generate/velocity", { projectId });
}

export function fetchCoverageReport(projectId: string) {
  return apiPost<CoverageReport>("/reports/generate/coverage", { projectId });
}

export function exportReport(projectId: string, reportType: string, format: "html" | "csv" | "json") {
  return apiPost<Blob>(`/reports/export/${reportType}`, { projectId, format });
}
