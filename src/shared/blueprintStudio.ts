import { stringify } from "yaml";
import type { DimensionBlueprintConfig } from "./appConfigTypes";
import { defaultAppConfig } from "./appConfigDefaults";
import { mergeAppConfig, validateAppConfig } from "./appConfigValidation";
import { getDimensionSchema } from "./dimensionSchemas";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord, DimensionType } from "./types";

export interface BlueprintValidationResult {
  valid: boolean;
  blueprint: DimensionBlueprintConfig | null;
  errors: string[];
}

export interface BlueprintComparisonChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

type BlueprintMember = NonNullable<DimensionBlueprintConfig["members"]>[number];
type BlueprintRelationship = NonNullable<DimensionBlueprintConfig["relationships"]>[number];

export function normalizeBlueprintDraft(draft: unknown): DimensionBlueprintConfig {
  const record = isRecord(draft) ? draft : {};
  const relationshipDefaults = isRecord(record.relationshipDefaults) ? record.relationshipDefaults : {};
  return {
    defaultDimensionName: String(record.defaultDimensionName ?? "").trim(),
    rootMembers: uniqueStrings(record.rootMembers),
    memberKeyField: String(record.memberKeyField ?? "").trim(),
    relationshipDefaults: {
      ...optionalNumberDefault("aggregationWeight", relationshipDefaults),
      ...optionalNumberDefault("percentConsol", relationshipDefaults),
      ...optionalNumberDefault("percentOwnership", relationshipDefaults),
      ...optionalStringDefault("ownershipType", relationshipDefaults)
    },
    allowMultipleParents: typeof record.allowMultipleParents === "boolean" ? record.allowMultipleParents : true,
    ...normalizeMembers(record.members),
    ...normalizeRelationships(record.relationships)
  };
}

export function validateBlueprintDraft(dimensionType: DimensionType, draft: unknown): BlueprintValidationResult {
  const blueprint = normalizeBlueprintDraft(draft);
  try {
    validateAppConfig(mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          [dimensionType]: blueprint
        }
      }
    }));
    return { valid: true, blueprint, errors: [] };
  } catch (caught) {
    return {
      valid: false,
      blueprint,
      errors: [caught instanceof Error ? caught.message : "Blueprint validation failed."]
    };
  }
}

export function blueprintToYamlFragment(dimensionType: DimensionType, blueprint: DimensionBlueprintConfig): string {
  const orderedBlueprint = orderBlueprint(blueprint);
  return stringify({
    dimensions: {
      blueprints: {
        [dimensionType]: orderedBlueprint
      }
    }
  }, { lineWidth: 0 });
}

export function blueprintFromProjectDimension(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): DimensionBlueprintConfig {
  const schema = getDimensionSchema(dimension.dimensionType);
  const memberKeyField = schema.memberKeyField;
  const children = new Set(relationships.map((relationship) => relationship.childKey));
  const rootMembers = members
    .filter((member) => member.isActive && !children.has(member.memberKey))
    .sort((a, b) => a.rowOrder - b.rowOrder)
    .map((member) => member.memberKey);
  const roots = rootMembers.length ? rootMembers : [members.find((member) => member.isActive)?.memberKey ?? "Root"];
  const rootSet = new Set(roots);
  const relationshipDefaults = isRecord(dimension.metadata.relationshipDefaults)
    ? normalizeBlueprintDraft({
      defaultDimensionName: dimension.dimensionName,
      rootMembers: roots,
      memberKeyField,
      relationshipDefaults: dimension.metadata.relationshipDefaults,
      allowMultipleParents: true
    }).relationshipDefaults
    : {};

  return {
    defaultDimensionName: dimension.dimensionName,
    rootMembers: roots,
    memberKeyField,
    relationshipDefaults,
    allowMultipleParents: typeof dimension.metadata.allowMultipleParents === "boolean"
      ? dimension.metadata.allowMultipleParents
      : true,
    members: members
      .filter((member) => member.isActive && !rootSet.has(member.memberKey))
      .sort((a, b) => a.rowOrder - b.rowOrder)
      .map((member) => ({
        memberKey: member.memberKey,
        ...(member.description ? { description: member.description } : {}),
        ...pruneGeneratedMemberProperties(member, memberKeyField)
      })),
    relationships: relationships
      .slice()
      .sort((a, b) => a.rowOrder - b.rowOrder)
      .map((relationship) => ({
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        ...(relationship.aggregationWeight === null ? {} : { aggregationWeight: relationship.aggregationWeight }),
        ...(relationship.percentConsol === null ? {} : { percentConsol: relationship.percentConsol }),
        ...(relationship.percentOwnership === null ? {} : { percentOwnership: relationship.percentOwnership }),
        ...(relationship.ownershipType ? { ownershipType: relationship.ownershipType } : {}),
        ...pruneGeneratedRelationshipProperties(relationship)
      }))
  };
}

export function compareBlueprints(
  oldBlueprint: DimensionBlueprintConfig,
  newBlueprint: DimensionBlueprintConfig
): BlueprintComparisonChange[] {
  const changes: BlueprintComparisonChange[] = [];
  for (const path of sortedUnique([...Object.keys(oldBlueprint), ...Object.keys(newBlueprint)])) {
    const oldValue = oldBlueprint[path as keyof DimensionBlueprintConfig];
    const newValue = newBlueprint[path as keyof DimensionBlueprintConfig];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ path, oldValue, newValue });
    }
  }
  return changes;
}

function orderBlueprint(blueprint: DimensionBlueprintConfig): DimensionBlueprintConfig {
  return {
    defaultDimensionName: blueprint.defaultDimensionName,
    rootMembers: blueprint.rootMembers,
    memberKeyField: blueprint.memberKeyField,
    relationshipDefaults: blueprint.relationshipDefaults,
    allowMultipleParents: blueprint.allowMultipleParents,
    ...(blueprint.members?.length ? { members: blueprint.members } : {}),
    ...(blueprint.relationships?.length ? { relationships: blueprint.relationships } : {})
  };
}

function normalizeMembers(members: unknown): Pick<DimensionBlueprintConfig, "members"> {
  if (!Array.isArray(members)) return {};
  const normalized = members
    .filter(isRecord)
    .map((member): BlueprintMember => ({
      memberKey: String(member.memberKey ?? "").trim(),
      ...(typeof member.description === "string" ? { description: member.description } : {}),
      ...(isRecord(member.properties) ? { properties: member.properties } : {})
    }))
    .filter((member) => member.memberKey);
  return normalized.length ? { members: normalized } : {};
}

function normalizeRelationships(relationships: unknown): Pick<DimensionBlueprintConfig, "relationships"> {
  if (!Array.isArray(relationships)) return {};
  const normalized = relationships
    .filter(isRecord)
    .map((relationship): BlueprintRelationship => ({
      parentKey: String(relationship.parentKey ?? "").trim(),
      childKey: String(relationship.childKey ?? "").trim(),
      ...optionalNumberDefault("aggregationWeight", relationship),
      ...optionalNumberDefault("percentConsol", relationship),
      ...optionalNumberDefault("percentOwnership", relationship),
      ...optionalStringDefault("ownershipType", relationship),
      ...(isRecord(relationship.properties) ? { properties: relationship.properties } : {})
    }))
    .filter((relationship) => relationship.parentKey && relationship.childKey);
  return normalized.length ? { relationships: normalized } : {};
}

function optionalNumberDefault(key: string, record: Record<string, unknown>): Record<string, number> {
  return typeof record[key] === "number" && Number.isFinite(record[key])
    ? { [key]: record[key] as number }
    : {};
}

function optionalStringDefault(key: string, record: Record<string, unknown>): Record<string, string> {
  return typeof record[key] === "string" && record[key]
    ? { [key]: record[key] }
    : {};
}

function pruneGeneratedMemberProperties(member: DimensionMemberRecord, memberKeyField: string): Pick<BlueprintMember, "properties"> {
  const properties = { ...member.properties };
  if (properties[memberKeyField] === member.memberKey) delete properties[memberKeyField];
  if (properties.Description === member.description) delete properties.Description;
  return Object.keys(properties).length ? { properties } : {};
}

function pruneGeneratedRelationshipProperties(relationship: DimensionRelationshipRecord): Pick<BlueprintRelationship, "properties"> {
  const properties = { ...relationship.properties };
  if (properties.Parent === relationship.parentKey) delete properties.Parent;
  if (properties.Child === relationship.childKey) delete properties.Child;
  if (properties["Aggregation Weight"] === relationship.aggregationWeight) delete properties["Aggregation Weight"];
  if (properties["Percent Consol"] === relationship.percentConsol) delete properties["Percent Consol"];
  if (properties["Percent Ownership"] === relationship.percentOwnership) delete properties["Percent Ownership"];
  if (properties["Ownership Type"] === relationship.ownershipType) delete properties["Ownership Type"];
  return Object.keys(properties).length ? { properties } : {};
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return sortedUnique(value.map((item) => String(item ?? "").trim()).filter(Boolean), false);
}

function sortedUnique(values: string[], sort = true): string[] {
  const unique = [...new Set(values)];
  return sort ? unique.sort((a, b) => a.localeCompare(b)) : unique;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
