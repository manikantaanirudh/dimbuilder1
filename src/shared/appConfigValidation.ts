import type { AppConfig, ClientAppConfig } from "./appConfigTypes";
import { supportedConfigSeverities } from "./appConfigTypes";
import { getDimensionSchema, supportedDimensionTypes } from "./dimensionSchemas";
import type { DimensionType } from "./types";

type UnknownRecord = Record<string, unknown>;

export function mergeAppConfig(defaults: AppConfig, override: unknown): AppConfig {
  return deepMerge(defaults, override) as AppConfig;
}

export function validateAppConfig(config: AppConfig): AppConfig {
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

  const supportedRelationshipDefaultKeys = new Set([
    "aggregationWeight",
    "percentConsol",
    "percentOwnership",
    "ownershipType"
  ]);

  for (const [type, blueprint] of Object.entries(config.dimensions.blueprints)) {
    if (!isSupportedDimensionType(type)) continue;
    const schema = getDimensionSchema(type as DimensionType);
    const supportedMemberFields = new Set(schema.memberFields.map((field) => field.name));

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
      if (!supportedRelationshipDefaultKeys.has(key)) {
        throw new Error(`Blueprint for '${type}' uses unsupported relationship default '${key}'.`);
      }
    }
  }

  for (const severity of [
    config.import.workbook.skippedDefaultRowSeverity,
    config.validation.duplicateMemberSeverity,
    config.validation.duplicateRelationshipSeverity,
    config.validation.unknownRelationshipMemberSeverity,
    config.validation.missingRequiredFieldSeverity,
    config.validation.circularHierarchySeverity,
    config.validation.relationshipsWithNoLocalMembersSeverity,
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

  for (const pattern of config.dimensions.metadataOnly.excludeNamePatterns) {
    try {
      new RegExp(pattern);
    } catch {
      throw new Error(`Invalid excludeNamePatterns regex '${pattern}'.`);
    }
  }

  return config;
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

function isValidTcpPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isSupportedDimensionType(value: string): boolean {
  return (supportedDimensionTypes as readonly string[]).includes(value);
}
