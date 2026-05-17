import type { AppConfig, ClientAppConfig } from "./appConfigTypes";
import { supportedConfigSeverities } from "./appConfigTypes";
import { supportedDimensionTypes } from "./dimensionSchemas";

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
    ...Object.keys(config.dimensions.preferredMetadataNames)
  ]) {
    if (!isSupportedDimensionType(type)) {
      throw new Error(`Unknown dimension type '${type}' in configuration.`);
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

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null) {
    return base;
  }

  if (!isRecord(base) || !isRecord(override)) {
    return override === undefined ? base : (override as T);
  }

  const result: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value) : value;
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
