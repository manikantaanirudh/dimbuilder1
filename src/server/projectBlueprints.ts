import type { AppConfig, DimensionBlueprintConfig } from "../shared/appConfigTypes";
import { getDimensionSchema } from "../shared/dimensionSchemas";
import type { DimensionType, ProjectRecord } from "../shared/types";
import type { Repositories } from "./db/repositories";

interface CreateBlueprintProjectInput {
  name: string;
  description: string;
  createdBy: string;
}

export function createProjectFromBlueprints(
  repos: Repositories,
  config: AppConfig,
  input: CreateBlueprintProjectInput
): ProjectRecord {
  return repos.transaction(() => {
    const project = repos.projects.create({
      name: input.name.trim() || "New Metadata Project",
      description: input.description,
      sourceFileName: "",
      createdBy: input.createdBy
    });
    const enabledTypes = new Set(config.dimensions.enabledTypes);
    const orderedTypes = config.dimensions.displayOrder.filter((type) => enabledTypes.has(type));

    orderedTypes.forEach((dimensionType, index) => {
      const schema = getDimensionSchema(dimensionType);
      const blueprint = resolveBlueprint(config, dimensionType);
      const dimension = repos.dimensions.create({
        projectId: project.id,
        sheetName: schema.sheetNames[0] ?? dimensionType,
        dimensionType,
        dimensionName: blueprint.defaultDimensionName,
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: index + 1,
        metadata: {
          source: "blueprint",
          allowMultipleParents: blueprint.allowMultipleParents,
          relationshipDefaults: blueprint.relationshipDefaults
        }
      });

      blueprint.rootMembers.forEach((rootMember, rootIndex) => {
        repos.members.create({
          dimensionId: dimension.id,
          memberKey: rootMember,
          description: "",
          properties: {
            [blueprint.memberKeyField]: rootMember,
            Description: ""
          },
          rowOrder: rootIndex + 1,
          sourceRowNumber: 0,
          isActive: true
        });
      });
    });

    repos.audit.record({
      projectId: project.id,
      userId: input.createdBy,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      after: {
        source: "blueprint",
        dimensionCount: orderedTypes.length
      }
    });

    return project;
  });
}

function resolveBlueprint(config: AppConfig, dimensionType: DimensionType): DimensionBlueprintConfig {
  const schema = getDimensionSchema(dimensionType);
  const configured = config.dimensions.blueprints[dimensionType];
  if (configured) return configured;

  return {
    defaultDimensionName: config.dimensions.preferredMetadataNames[dimensionType] ?? schema.sheetNames[0] ?? dimensionType,
    rootMembers: ["Root"],
    memberKeyField: schema.memberKeyField,
    relationshipDefaults: schema.relationshipFields.some((field) => field.name === "Aggregation Weight") ? { aggregationWeight: 1 } : {},
    allowMultipleParents: true
  };
}
