import type { AppConfig } from "./appConfigTypes";

export const defaultAppConfig: AppConfig = {
  application: {
    productName: "OneStream XF Dimension Builder",
    applicationName: "Dev",
    title: "OneStream XF Dimension Builder",
    description: "Import the metadata template, manage dimensions in controlled grids, validate hierarchy issues, and export OneStream-compatible files.",
    environmentName: "Local",
    oneStreamVersionFallback: "9.2.0.18004",
    supportText: "Local metadata workspace"
  },
  paths: {
    metadataDirectory: "metadata",
    defaultMetadataFile: "Dev_Metadata_20260516_202239Z.xml",
    uploadsDirectory: "data/uploads",
    exportsDirectory: "data/exports",
    databaseFile: "data/app.db"
  },
  server: {
    host: "127.0.0.1",
    port: 8787,
    clientDevPort: 5173
  },
  features: {
    enableMetadataReferenceAlignment: true,
    includeMetadataOnlyDimensions: true,
    enableXmlPreview: true,
    enableXlsxExport: true,
    enableCsvExport: true,
    enableJsonBackup: true,
    enableAuditLog: true,
    enableSnapshots: true
  },
  dashboard: {
    cards: {
      totalDimensions: true,
      totalMembers: true,
      totalRelationships: true,
      validationErrors: true,
      validationWarnings: true,
      recentDimensions: true,
      importStatus: true,
      exportStatus: true
    }
  },
  dimensions: {
    expectedDimensionCount: 18,
    enabledTypes: ["Scenario", "Entity", "Account", "Flow", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"],
    displayOrder: ["Scenario", "Entity", "Account", "Flow", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"],
    display: {
      labelFormat: "{type} - {name}",
      showInheritedDimensionSubtitle: true,
      showMetadataOnlyBadge: true
    },
    metadataOnly: {
      includeWhenWorkbookSheetMissing: true,
      excludeNamePatterns: ["^FVA_", "^Root"]
    },
    sheetAliases: {
      UD3: ["UD3", "UD3 OUC", "UD3 OUC (2)"]
    },
    preferredMetadataNames: {
      Scenario: "Scenarios",
      Account: "GLAccounts",
      UD4: "ChannelPartner",
      UD5: "CustomerType",
      UD8: "Reporting"
    }
  },
  import: {
    workbook: {
      mergeDuplicateDimensionSheets: true,
      ignoreGeneratedXmlColumns: true,
      ignoreFormulaErrors: true,
      preserveOriginalColumnNames: true,
      skippedDefaultRowSeverity: "warning"
    },
    metadataReference: {
      enabled: true,
      preferExactDimensionNameMatch: true,
      fallbackToLargestPopulatedDimension: true,
      includeMetadataOnlyDimensions: true
    }
  },
  validation: {
    duplicateMemberSeverity: "warning",
    duplicateRelationshipSeverity: "warning",
    unknownRelationshipMemberSeverity: "warning",
    missingRequiredFieldSeverity: "error",
    circularHierarchySeverity: "error",
    relationshipsWithNoLocalMembersSeverity: "warning",
    exportBlockedBySeverities: ["error"]
  },
  export: {
    xml: {
      enabled: true,
      prettyPrint: true,
      skipBlankMemberRows: true,
      skipFormulaErrors: true,
      includeDimensionSourceAttributes: true
    },
    xlsx: {
      enabled: true,
      creator: "OneStream XF Dimension Builder"
    },
    csv: {
      enabled: true
    },
    json: {
      enabled: true
    }
  },
  ui: {
    defaultWorkspaceTab: "Overview",
    gridPageSize: 600,
    toolbar: {
      showImport: true,
      showValidate: true,
      showExport: true,
      showSave: true,
      showUndoRedo: true
    },
    xmlPreview: {
      defaultScope: "currentDimension",
      allowAllDimensions: true
    }
  }
};
