import type { AppConfig, DimensionBlueprintConfig } from "../shared/appConfigTypes";
import { getDimensionSchema } from "../shared/dimensionSchemas";
import { relationshipDefaultsToProperties, relationshipPropertiesToDefaults } from "../shared/relationshipDefaults";
import type { DimensionRecord, DimensionType, ProjectRecord } from "../shared/types";
import type { Repositories } from "./db/repositories";

interface CreateBlueprintProjectInput {
  name: string;
  description: string;
  createdBy: string;
}

export async function createProjectFromBlueprints(
  repos: Repositories,
  config: AppConfig,
  input: CreateBlueprintProjectInput
): Promise<ProjectRecord> {
  return await repos.transaction(async (tx) => {
    const project = await tx.projects.create({
      name: input.name.trim() || "New Metadata Project",
      description: input.description,
      sourceFileName: "",
      createdBy: input.createdBy
    });
    const enabledTypes = new Set(config.dimensions.enabledTypes);
    const orderedTypes = config.dimensions.displayOrder.filter((type) => enabledTypes.has(type));

    for (const [index, dimensionType] of orderedTypes.entries()) {
      await createDimensionWithBlueprint(tx, config, project.id, dimensionType, index + 1);
    }

    await tx.audit.record({
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

export async function createDimensionWithBlueprint(
  repos: Repositories,
  config: AppConfig,
  projectId: string,
  dimensionType: DimensionType,
  sortOrder: number,
  options?: { dimensionName?: string }
): Promise<DimensionRecord> {
  const schema = getDimensionSchema(dimensionType);
  const blueprint = resolveBlueprint(config, dimensionType);
  const dimension = await repos.dimensions.create({
    projectId,
    sheetName: schema.sheetNames[0] ?? dimensionType,
    dimensionType,
    dimensionName: options?.dimensionName?.trim() || blueprint.defaultDimensionName,
    description: "",
    accessGroup: "",
    maintenanceGroup: "",
    inheritedDimension: "",
    sortOrder,
    metadata: {
      source: "blueprint",
      allowMultipleParents: blueprint.allowMultipleParents,
      relationshipDefaults: blueprint.relationshipDefaults
    }
  });

  const rootMemberKeys = new Set(blueprint.rootMembers);
  const configuredMemberMap = new Map<string, NonNullable<DimensionBlueprintConfig["members"]>[number]>();
  blueprint.rootMembers.forEach((memberKey) => {
    configuredMemberMap.set(memberKey, { memberKey });
  });
  blueprint.members?.forEach((configuredMember) => {
    const existing = configuredMemberMap.get(configuredMember.memberKey);
    if (existing && !rootMemberKeys.has(configuredMember.memberKey)) return;
    configuredMemberMap.set(configuredMember.memberKey, {
      ...existing,
      ...configuredMember,
      properties: {
        ...(existing?.properties ?? {}),
        ...(configuredMember.properties ?? {})
      }
    });
  });
  const configuredMembers = [...configuredMemberMap.values()];
  for (const [memberIndex, configuredMember] of configuredMembers.entries()) {
    const description = configuredMember.description ?? "";
    await repos.members.create({
      dimensionId: dimension.id,
      memberKey: configuredMember.memberKey,
      description,
      properties: {
        ...(configuredMember.properties ?? {}),
        [blueprint.memberKeyField]: configuredMember.memberKey,
        Description: description
      },
      rowOrder: memberIndex + 1,
      sourceRowNumber: 0,
      isActive: true
    });
  }

  const supportedRelationshipFields = new Set(schema.relationshipFields.map((field) => field.name));
  for (const [relationshipIndex, relationship] of (blueprint.relationships ?? []).entries()) {
    const relationshipPropertyValues = relationshipPropertiesToDefaults(
      relationship.properties ?? {},
      supportedRelationshipFields
    );
    const relationshipValues = {
      ...blueprint.relationshipDefaults,
      ...relationshipPropertyValues,
      aggregationWeight: relationship.aggregationWeight ?? relationshipPropertyValues.aggregationWeight ?? blueprint.relationshipDefaults.aggregationWeight,
      percentConsol: relationship.percentConsol ?? relationshipPropertyValues.percentConsol ?? blueprint.relationshipDefaults.percentConsol,
      percentOwnership: relationship.percentOwnership ?? relationshipPropertyValues.percentOwnership ?? blueprint.relationshipDefaults.percentOwnership,
      ownershipType: relationship.ownershipType ?? relationshipPropertyValues.ownershipType ?? blueprint.relationshipDefaults.ownershipType
    };
    const relationshipProperties = {
      ...relationship.properties,
      ...relationshipDefaultsToProperties(relationshipValues, supportedRelationshipFields),
      Parent: relationship.parentKey,
      Child: relationship.childKey
    };
    await repos.relationships.create({
      dimensionId: dimension.id,
      parentKey: relationship.parentKey,
      childKey: relationship.childKey,
      aggregationWeight: relationshipValues.aggregationWeight ?? null,
      percentConsol: relationshipValues.percentConsol ?? null,
      percentOwnership: relationshipValues.percentOwnership ?? null,
      ownershipType: relationshipValues.ownershipType ?? "",
      properties: relationshipProperties,
      rowOrder: relationshipIndex + 1,
      sourceRowNumber: 0
    });
  }

  return dimension;
}

function resolveBlueprint(config: AppConfig, dimensionType: DimensionType): DimensionBlueprintConfig {
  const schema = getDimensionSchema(dimensionType);
  const configured = config.dimensions.blueprints[dimensionType];
  if (configured) return configured;

  return {
    defaultDimensionName: config.dimensions.preferredMetadataNames[dimensionType] ?? schema.sheetNames[0] ?? dimensionType,
    rootMembers: ["Root"],
    memberKeyField: schema.memberKeyField,
    relationshipDefaults: resolveFallbackRelationshipDefaults(schema.relationshipFields.map((field) => field.name)),
    allowMultipleParents: true
  };
}

function resolveFallbackRelationshipDefaults(fieldNames: string[]): DimensionBlueprintConfig["relationshipDefaults"] {
  const fields = new Set(fieldNames);
  return {
    ...(fields.has("Aggregation Weight") ? { aggregationWeight: 1 } : {}),
    ...(fields.has("Percent Consol") ? { percentConsol: 100 } : {}),
    ...(fields.has("Percent Ownership") ? { percentOwnership: 100 } : {}),
    ...(fields.has("Ownership Type") ? { ownershipType: "FullConsolidation" } : {})
  };
}
