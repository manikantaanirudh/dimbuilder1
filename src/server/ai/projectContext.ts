import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { runProjectValidation } from "../helpers/runValidation";
import { summarizeValidationIssues, type ValidationSummary } from "../../shared/releasePackage";

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

export interface ProjectAIContext {
  projectName: string;
  dimensionCount: number;
  memberCount: number;
  relationshipCount: number;
  dimensions: ProjectDimensionBreakdown[];
  validation: ValidationSummary;
  topIssues: ProjectTopIssue[];
  exportReady: boolean;
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
    exportReady: validation.blockingIssues === 0
  };
}
