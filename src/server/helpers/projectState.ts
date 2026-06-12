import type { ProjectMetadataState } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export async function loadProjectState(repos: Repositories, projectId: string): Promise<ProjectMetadataState> {
  const project = await repos.projects.get(projectId) ?? undefined;
  const [dimensions, members, relationships] = await Promise.all([
    await repos.dimensions.listByProject(projectId),
    await repos.members.listByProject(projectId),
    await repos.relationships.listByProject(projectId)
  ]);
  return {
    project,
    dimensions,
    members,
    relationships
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
