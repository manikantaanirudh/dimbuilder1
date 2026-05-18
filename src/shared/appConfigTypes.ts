import type { DimensionType, Severity } from "./types";

export const supportedConfigSeverities: Severity[] = ["error", "warning", "info"];

export interface ApplicationConfig {
  productName: string;
  applicationName: string;
  title: string;
  description: string;
  environmentName: string;
  oneStreamVersionFallback: string;
  supportText: string;
}

export interface PathsConfig {
  metadataDirectory: string;
  defaultMetadataFile: string;
  uploadsDirectory: string;
  exportsDirectory: string;
  databaseFile: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  clientDevPort: number;
}

export interface FeatureConfig {
  enableMetadataReferenceAlignment: boolean;
  includeMetadataOnlyDimensions: boolean;
  enableXmlPreview: boolean;
  enableXlsxExport: boolean;
  enableCsvExport: boolean;
  enableJsonBackup: boolean;
  enableAuditLog: boolean;
  enableSnapshots: boolean;
}

export interface DashboardConfig {
  cards: {
    totalDimensions: boolean;
    totalMembers: boolean;
    totalRelationships: boolean;
    validationErrors: boolean;
    validationWarnings: boolean;
    recentDimensions: boolean;
    importStatus: boolean;
    exportStatus: boolean;
  };
}

export interface DimensionBlueprintConfig {
  defaultDimensionName: string;
  rootMembers: string[];
  memberKeyField: string;
  relationshipDefaults: {
    aggregationWeight?: number;
    percentConsol?: number;
    percentOwnership?: number;
    ownershipType?: string;
  };
  allowMultipleParents: boolean;
}

export interface DimensionsConfig {
  expectedDimensionCount: number;
  enabledTypes: DimensionType[];
  displayOrder: DimensionType[];
  display: {
    labelFormat: string;
    showInheritedDimensionSubtitle: boolean;
    showMetadataOnlyBadge: boolean;
  };
  metadataOnly: {
    includeWhenWorkbookSheetMissing: boolean;
    excludeNamePatterns: string[];
  };
  sheetAliases: Partial<Record<DimensionType, string[]>>;
  preferredMetadataNames: Partial<Record<DimensionType, string>>;
  blueprints: Partial<Record<DimensionType, DimensionBlueprintConfig>>;
}

export interface ImportConfig {
  workbook: {
    mergeDuplicateDimensionSheets: boolean;
    ignoreGeneratedXmlColumns: boolean;
    ignoreFormulaErrors: boolean;
    preserveOriginalColumnNames: boolean;
    skippedDefaultRowSeverity: Severity;
  };
  metadataReference: {
    enabled: boolean;
    preferExactDimensionNameMatch: boolean;
    fallbackToLargestPopulatedDimension: boolean;
    includeMetadataOnlyDimensions: boolean;
  };
}

export interface ValidationConfig {
  duplicateMemberSeverity: Severity;
  duplicateRelationshipSeverity: Severity;
  unknownRelationshipMemberSeverity: Severity;
  missingRequiredFieldSeverity: Severity;
  circularHierarchySeverity: Severity;
  relationshipsWithNoLocalMembersSeverity: Severity;
  exportBlockedBySeverities: Severity[];
}

export interface ExportConfig {
  xml: {
    enabled: boolean;
    prettyPrint: boolean;
    skipBlankMemberRows: boolean;
    skipFormulaErrors: boolean;
    includeDimensionSourceAttributes: boolean;
  };
  xlsx: {
    enabled: boolean;
    creator: string;
  };
  csv: {
    enabled: boolean;
  };
  json: {
    enabled: boolean;
  };
}

export interface UiConfig {
  defaultWorkspaceTab: string;
  gridPageSize: number;
  toolbar: {
    showImport: boolean;
    showValidate: boolean;
    showExport: boolean;
    showSave: boolean;
    showUndoRedo: boolean;
  };
  xmlPreview: {
    defaultScope: "currentDimension" | "allDimensions";
    allowAllDimensions: boolean;
  };
}

export interface AppConfig {
  application: ApplicationConfig;
  paths: PathsConfig;
  server: ServerConfig;
  features: FeatureConfig;
  dashboard: DashboardConfig;
  dimensions: DimensionsConfig;
  import: ImportConfig;
  validation: ValidationConfig;
  export: ExportConfig;
  ui: UiConfig;
}

export type ClientAppConfig = Omit<AppConfig, "paths" | "server">;
