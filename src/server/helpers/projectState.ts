import type { ProjectMetadataState } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export async function loadProjectState(repos: Repositories, projectId: string): Promise<ProjectMetadataState> {
  const project = await repos.projects.get(projectId) ?? undefined;
  return {
    project,
    dimensions: repos.dimensions.listByProject(projectId),
    members: repos.members.listByProject(projectId),
    relationships: repos.relationships.listByProject(projectId)
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
