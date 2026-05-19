import type { AppConfig, ClientAppConfig } from "./appConfigTypes";
import { supportedConfigSeverities } from "./appConfigTypes";
import { getDimensionSchema, supportedDimensionTypes } from "./dimensionSchemas";
import {
  relationshipDefaultFieldNames,
  supportedRelationshipDefaultKeys,
  type RelationshipDefaultKey
} from "./relationshipDefaults";
import type { DimensionType } from "./types";

type UnknownRecord = Record<string, unknown>;

export function mergeAppConfig(defaults: AppConfig, override: unknown): AppConfig {
  return deepMerge(defaults, override) as AppConfig;
}

export function validateAppConfig(config: AppConfig): AppConfig {
  if (!isRecord(config.dimensions.blueprints)) {
    throw new Error("dimensions.blueprints must be an object.");
  }

  for (const type of [...config.dimensions.enabledTypes, ...config.dimensions.displayOrder]) {
    if (!isSupportedDimensionType(type)) {
      throw new Error(`Unknown dimension type '${type}' in configuration.`);
    }
  }
  for (const type of [
    ...Object.keys(config.dimensions.sheetAliases),
    ...Object.keys(config.dimensions.preferredMetadataNames),
    ...Object.keys(config.dimensions.blueprints)
  ]) {
    if (!isSupportedDimensionType(type)) {
      throw new Error(`Unknown dimension type '${type}' in configuration.`);
    }
  }

  const supportedRelationshipDefaultKeySet = new Set<RelationshipDefaultKey>(supportedRelationshipDefaultKeys);

  for (const [type, blueprint] of Object.entries(config.dimensions.blueprints)) {
    if (!isSupportedDimensionType(type)) continue;
    if (!isRecord(blueprint)) {
      throw new Error(`Blueprint for '${type}' must be an object.`);
    }
    const schema = getDimensionSchema(type as DimensionType);
    const supportedMemberFields = new Set(schema.memberFields.map((field) => field.name));
    const supportedRelationshipFields = new Set(schema.relationshipFields.map((field) => field.name));

    if (typeof blueprint.defaultDimensionName !== "string" || !blueprint.defaultDimensionName.trim()) {
      throw new Error(`Blueprint for '${type}' must define defaultDimensionName.`);
    }
    if (
      !Array.isArray(blueprint.rootMembers) ||
      blueprint.rootMembers.length === 0 ||
      blueprint.rootMembers.some((member) => typeof member !== "string" || !member.trim())
    ) {
      throw new Error(`Blueprint for '${type}' must define non-empty rootMembers.`);
    }
    if (!supportedMemberFields.has(blueprint.memberKeyField)) {
      throw new Error(`Blueprint for '${type}' uses unsupported memberKeyField '${blueprint.memberKeyField}'.`);
    }
    if (!isRecord(blueprint.relationshipDefaults)) {
      throw new Error(`Blueprint for '${type}' must define relationshipDefaults as an object.`);
    }
    for (const key of Object.keys(blueprint.relationshipDefaults)) {
      if (!isRelationshipDefaultKey(key)) {
        throw new Error(`Blueprint for '${type}' uses unsupported relationship default '${key}'.`);
      }
      validateRelationshipDefaultValue(
        `Blueprint for '${type}' relationshipDefaults.${key}`,
        key,
        blueprint.relationshipDefaults[key]
      );
    }
    validateBlueprintMembers(type, blueprint.members, supportedMemberFields);
    validateBlueprintRelationships(type, blueprint.relationships, supportedRelationshipFields, supportedRelationshipDefaultKeySet);
  }

  validateOneStreamProfileConfig(config.validation.oneStreamProfile);

  for (const severity of [
    config.import.workbook.skippedDefaultRowSeverity,
    config.validation.duplicateMemberSeverity,
    config.validation.duplicateRelationshipSeverity,
    config.validation.unknownRelationshipMemberSeverity,
    config.validation.missingRequiredFieldSeverity,
    config.validation.circularHierarchySeverity,
    config.validation.relationshipsWithNoLocalMembersSeverity,
    config.validation.oneStreamProfile.duplicateAliasSeverity,
    config.validation.oneStreamProfile.invalidSortOrderSeverity,
    config.validation.oneStreamProfile.sharedMemberSeverity,
    config.validation.oneStreamProfile.parentInputWarningSeverity,
    config.validation.oneStreamProfile.unknownPropertySeverity,
    config.validation.oneStreamProfile.invalidEnumSeverity,
    config.validation.oneStreamProfile.invalidPropertyTypeSeverity,
    ...config.validation.exportBlockedBySeverities
  ]) {
    if (!supportedConfigSeverities.includes(severity)) {
      throw new Error(`Invalid severity '${severity}' in configuration.`);
    }
  }

  if (!isValidTcpPort(config.server.port)) {
    throw new Error("server.port must be an integer from 1 to 65535.");
  }
  if (!isValidTcpPort(config.server.clientDevPort)) {
    throw new Error("server.clientDevPort must be an integer from 1 to 65535.");
  }
  if (!Number.isInteger(config.ui.gridPageSize) || config.ui.gridPageSize <= 0) {
    throw new Error("ui.gridPageSize must be a positive integer.");
  }

  validateOptionalBoolean("export.allowValidationBypass", config.export.allowValidationBypass);
  validateOptionalBoolean("export.validationBypassRequiresReason", config.export.validationBypassRequiresReason);
  validateOptionalBoolean("export.requireValidationBeforeExport", config.export.requireValidationBeforeExport);

  for (const pattern of config.dimensions.metadataOnly.excludeNamePatterns) {
    try {
      new RegExp(pattern);
    } catch {
      throw new Error(`Invalid excludeNamePatterns regex '${pattern}'.`);
    }
  }

  return config;
}

function validateBlueprintMembers(type: string, members: unknown, supportedMemberFields: Set<string>): void {
  if (members === undefined) return;
  if (!Array.isArray(members)) {
    throw new Error(`Blueprint for '${type}' members must be an array.`);
  }

  for (const member of members) {
    if (!isRecord(member) || typeof member.memberKey !== "string" || !member.memberKey.trim()) {
      throw new Error(`Blueprint for '${type}' members must define non-empty memberKey values.`);
    }
    if (member.description !== undefined && typeof member.description !== "string") {
      throw new Error(`Blueprint for '${type}' member '${member.memberKey}' description must be a string.`);
    }
    if (member.properties !== undefined && !isRecord(member.properties)) {
      throw new Error(`Blueprint for '${type}' member '${member.memberKey}' properties must be an object.`);
    }
    for (const fieldName of Object.keys(member.properties ?? {})) {
      if (!supportedMemberFields.has(fieldName)) {
        throw new Error(`Blueprint for '${type}' member '${member.memberKey}' uses unsupported field '${fieldName}'.`);
      }
    }
  }
}

function validateBlueprintRelationships(
  type: string,
  relationships: unknown,
  supportedRelationshipFields: Set<string>,
  supportedRelationshipDefaultKeys: Set<RelationshipDefaultKey>
): void {
  if (relationships === undefined) return;
  if (!Array.isArray(relationships)) {
    throw new Error(`Blueprint for '${type}' relationships must be an array.`);
  }

  const supportedKeys = new Set([
    "parentKey",
    "childKey",
    "properties",
    ...supportedRelationshipDefaultKeys
  ]);
  for (const relationship of relationships) {
    if (
      !isRecord(relationship) ||
      typeof relationship.parentKey !== "string" ||
      !relationship.parentKey.trim() ||
      typeof relationship.childKey !== "string" ||
      !relationship.childKey.trim()
    ) {
      throw new Error(`Blueprint for '${type}' relationships must define non-empty parentKey and childKey values.`);
    }
    const label = `${relationship.parentKey} -> ${relationship.childKey}`;
    for (const key of Object.keys(relationship)) {
      if (!supportedKeys.has(key)) {
        throw new Error(`Blueprint for '${type}' relationship '${label}' uses unsupported relationship default '${key}'.`);
      }
      if (isRelationshipDefaultKey(key)) {
        validateRelationshipDefaultValue(
          `Blueprint for '${type}' relationship '${label}' ${key}`,
          key,
          relationship[key]
        );
      }
    }
    if (relationship.properties !== undefined && !isRecord(relationship.properties)) {
      throw new Error(`Blueprint for '${type}' relationship '${label}' properties must be an object.`);
    }
    for (const fieldName of Object.keys(relationship.properties ?? {})) {
      if (!supportedRelationshipFields.has(fieldName)) {
        throw new Error(`Blueprint for '${type}' relationship '${label}' uses unsupported field '${fieldName}'.`);
      }
      const defaultKey = relationshipDefaultKeyForFieldName(fieldName);
      if (defaultKey !== undefined) {
        validateRelationshipDefaultValue(
          `Blueprint for '${type}' relationship '${label}' property '${fieldName}'`,
          defaultKey,
          (relationship.properties as UnknownRecord)[fieldName]
        );
      }
    }
  }
}

function relationshipDefaultKeyForFieldName(fieldName: string): RelationshipDefaultKey | undefined {
  return supportedRelationshipDefaultKeys.find((key) => relationshipDefaultFieldNames[key] === fieldName);
}

function isRelationshipDefaultKey(key: string): key is RelationshipDefaultKey {
  return (supportedRelationshipDefaultKeys as readonly string[]).includes(key);
}

function validateRelationshipDefaultValue(label: string, key: string, value: unknown): void {
  if (
    (key === "aggregationWeight" || key === "percentConsol" || key === "percentOwnership") &&
    typeof value !== "number"
  ) {
    throw new Error(`${label} must be a number.`);
  }
  if (key === "ownershipType" && typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

function validateOptionalBoolean(label: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

function validateOneStreamProfileConfig(profile: unknown): void {
  if (!isRecord(profile)) {
    throw new Error("validation.oneStreamProfile must be an object.");
  }
  if (typeof profile.enabled !== "boolean") {
    throw new Error("validation.oneStreamProfile.enabled must be a boolean.");
  }
  const memberNameMaxLength = profile.memberNameMaxLength;
  if (typeof memberNameMaxLength !== "number" || !Number.isInteger(memberNameMaxLength) || memberNameMaxLength <= 0) {
    throw new Error("validation.oneStreamProfile.memberNameMaxLength must be a positive integer.");
  }
  if (typeof profile.warnOnMemberNameSpaces !== "boolean") {
    throw new Error("validation.oneStreamProfile.warnOnMemberNameSpaces must be a boolean.");
  }
  if (typeof profile.warnOnMemberNamePeriods !== "boolean") {
    throw new Error("validation.oneStreamProfile.warnOnMemberNamePeriods must be a boolean.");
  }
  if (!isNonEmptyStringArray(profile.reservedWords)) {
    throw new Error("validation.oneStreamProfile.reservedWords must be an array of non-empty strings.");
  }
  if (!isNonEmptyStringArray(profile.restrictedCharacters)) {
    throw new Error("validation.oneStreamProfile.restrictedCharacters must be an array of non-empty strings.");
  }
}

export function buildClientAppConfig(config: AppConfig): ClientAppConfig {
  const { paths: _paths, server: _server, ...clientConfig } = config;
  return clientConfig;
}

function deepMerge<T>(base: T, override: unknown, isRoot = true): T {
  if (override === null) {
    return isRoot ? base : (override as T);
  }

  if (!isRecord(base) || !isRecord(override)) {
    return override === undefined ? base : (override as T);
  }

  const result: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value, false) : value;
  }
  return result as T;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function isValidTcpPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isSupportedDimensionType(value: string): boolean {
  return (supportedDimensionTypes as readonly string[]).includes(value);
}
