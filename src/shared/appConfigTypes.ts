import type { DimensionType, Severity } from "./types";

export const supportedConfigSeverities: Severity[] = ["error", "warning", "info", "off"];

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
  corsOrigins?: string[];
}

export interface AuthConfig {
  enabled: boolean;
  strategy: "local" | "oidc" | "none";
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  oidc?: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scopes: string[];
  };
  defaultRole: "admin" | "author" | "reviewer" | "viewer";
  allowSelfRegistration: boolean;
  // Legacy fields for backward compat
  username?: string;
  password?: string;
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
  members?: Array<{
    memberKey: string;
    description?: string;
    properties?: Record<string, unknown>;
  }>;
  relationships?: Array<{
    parentKey: string;
    childKey: string;
    aggregationWeight?: number;
    percentConsol?: number;
    percentOwnership?: number;
    ownershipType?: string;
    properties?: Record<string, unknown>;
  }>;
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
  oneStreamProfile: OneStreamValidationProfileConfig;
  exportBlockedBySeverities: Severity[];
}

export interface OneStreamValidationProfileConfig {
  enabled: boolean;
  memberNameMaxLength: number;
  warnOnMemberNameSpaces: boolean;
  warnOnMemberNamePeriods: boolean;
  reservedWords: string[];
  restrictedCharacters: string[];
  duplicateAliasSeverity: Severity;
  invalidSortOrderSeverity: Severity;
  sharedMemberSeverity: Severity;
  parentInputWarningSeverity: Severity;
  unknownPropertySeverity: Severity;
  invalidEnumSeverity: Severity;
  invalidPropertyTypeSeverity: Severity;
}

export interface ExportConfig {
  allowValidationBypass?: boolean;
  validationBypassRequiresReason?: boolean;
  requireValidationBeforeExport?: boolean;
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
  auth: AuthConfig;
  features: FeatureConfig;
  dashboard: DashboardConfig;
  dimensions: DimensionsConfig;
  import: ImportConfig;
  validation: ValidationConfig;
  export: ExportConfig;
  ui: UiConfig;
}

export type ClientAppConfig = Omit<AppConfig, "paths" | "server" | "auth">;
