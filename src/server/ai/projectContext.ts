import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { runProjectValidation } from "../helpers/runValidation";
import { summarizeValidationIssues, type ValidationSummary } from "../../shared/releasePackage";
import { generateCoverageReport } from "../reporting/reportingEngine";

export interface ProjectDimensionBreakdown {
  dimensionType: string;
  dimensionName: string;
  memberCount: number;
}

export interface ProjectTopIssue {
  code: string;
  count: number;
  message: string;
}

export interface DimensionIssueSummary {
  dimensionType: string;
  dimensionName: string;
  totalCount: number;
  errors: number;
  warnings: number;
}

export interface ProjectCoverageSummary {
  overallPercent: number;
  dimensions: Array<{
    dimensionType: string;
    dimensionName: string;
    propertyCoverage: number;
    descriptionCoverage: number;
    isStale: boolean;
  }>;
}

export interface ProjectAIContext {
  projectName: string;
  dimensionCount: number;
  memberCount: number;
  relationshipCount: number;
  dimensions: ProjectDimensionBreakdown[];
  validation: ValidationSummary;
  topIssues: ProjectTopIssue[];
  exportReady: boolean;
  issuesByDimension: DimensionIssueSummary[];
  coverage: ProjectCoverageSummary;
}

/**
 * Assembles project-level context (counts, validation summary, export readiness,
 * top issue codes) so the natural-language assistant can answer health, summary,
 * and export-readiness questions instead of falling back to keyword search.
 * Returns null when the project does not exist.
 */
export async function buildProjectAIContext(
  repos: Repositories,
  config: AppConfig,
  projectId: string
): Promise<ProjectAIContext | null> {
  const project = await repos.projects.get(projectId);
  if (!project) return null;

  const dimensions = await repos.dimensions.listByProject(project.id);
  const members = await repos.members.listByProject(project.id);
  const relationships = await repos.relationships.listByProject(project.id);

  const memberCountByDimension = new Map<string, number>();
  for (const member of members) {
    memberCountByDimension.set(member.dimensionId, (memberCountByDimension.get(member.dimensionId) ?? 0) + 1);
  }

  const issues = await runProjectValidation(repos, config, project.id);
  const validation = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);

  const issuesByCode = new Map<string, ProjectTopIssue>();
  for (const issue of issues) {
    const existing = issuesByCode.get(issue.code);
    if (existing) {
      existing.count += 1;
    } else {
      issuesByCode.set(issue.code, { code: issue.code, count: 1, message: issue.message });
    }
  }
  const topIssues = Array.from(issuesByCode.values()).sort((a, b) => b.count - a.count).slice(0, 5);

  const dimensionById = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  const issueRollup = new Map<string, DimensionIssueSummary>();
  for (const issue of issues) {
    const dimension = dimensionById.get(issue.dimensionId);
    if (!dimension) continue;
    const key = dimension.id;
    const existing = issueRollup.get(key) ?? {
      dimensionType: dimension.dimensionType,
      dimensionName: dimension.dimensionName,
      totalCount: 0,
      errors: 0,
      warnings: 0
    };
    existing.totalCount += 1;
    if (issue.severity === "error") existing.errors += 1;
    if (issue.severity === "warning") existing.warnings += 1;
    issueRollup.set(key, existing);
  }
  const issuesByDimension = Array.from(issueRollup.values()).sort((a, b) => b.totalCount - a.totalCount);

  const coverageReport = generateCoverageReport(project.id, { dimensions, members, relationships });

  return {
    projectName: project.name,
    dimensionCount: dimensions.length,
    memberCount: members.length,
    relationshipCount: relationships.length,
    dimensions: dimensions.map((dimension) => ({
      dimensionType: dimension.dimensionType,
      dimensionName: dimension.dimensionName,
      memberCount: memberCountByDimension.get(dimension.id) ?? 0
    })),
    validation,
    topIssues,
    exportReady: validation.blockingIssues === 0,
    issuesByDimension,
    coverage: {
      overallPercent: coverageReport.overallCoverage,
      dimensions: coverageReport.dimensions.map((row) => ({
        dimensionType: row.dimensionType,
        dimensionName: row.dimensionName,
        propertyCoverage: row.propertyCoverage,
        descriptionCoverage: row.descriptionCoverage,
        isStale: row.isStale
      }))
    }
  };
}
