import { nanoid } from "nanoid";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { DimensionMemberRecord } from "../../shared/types";
import type { Repositories } from "../../server/db/repositories";
import { createProjectFromBlueprints } from "../../server/projectBlueprints";

function now(): string {
  return new Date().toISOString();
}

export interface LargeHierarchyProject {
  projectId: string;
  dimensionIds: string[];
}

export function createLargeHierarchyProject(
  repos: Repositories,
  config: AppConfig,
  options: { memberCount: number; projectName?: string }
): LargeHierarchyProject {
  const project = createProjectFromBlueprints(repos, config, {
    name: options.projectName ?? "Large hierarchy test project",
    description: "",
    createdBy: "test"
  });
  const dimensions = repos.dimensions.listByProject(project.id);
  if (dimensions.length === 0) {
    throw new Error("createLargeHierarchyProject requires at least one dimension");
  }

  const targetCount = options.memberCount;
  let currentCount = repos.members.countByProject(project.id);
  const batch: DimensionMemberRecord[] = [];
  let sequence = 0;

  while (currentCount < targetCount) {
    const dimension = dimensions[sequence % dimensions.length];
    const schema = getDimensionSchema(dimension.dimensionType);
    const memberKey = `BulkMember_${sequence}`;
    const timestamp = now();
    batch.push({
      id: nanoid(),
      dimensionId: dimension.id,
      memberKey,
      description: memberKey,
      properties: { [schema.memberKeyField]: memberKey, Description: memberKey },
      rowOrder: currentCount + 1,
      sourceRowNumber: 0,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    sequence += 1;
    currentCount += 1;
    if (batch.length >= 500) {
      repos.members.bulkInsert(batch);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    repos.members.bulkInsert(batch);
  }

  return { projectId: project.id, dimensionIds: dimensions.map((dimension) => dimension.id) };
}
