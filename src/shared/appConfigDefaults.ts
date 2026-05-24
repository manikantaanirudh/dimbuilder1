import type { AppConfig } from "./appConfigTypes";

export const defaultAppConfig: AppConfig = {
  application: {
    productName: "SR Onestream Dim Builder",
    applicationName: "Local",
    title: "SR Onestream Dim Builder",
    description: "Build, validate, preview, and export OneStream dimension metadata.",
    environmentName: "Local",
    oneStreamVersionFallback: "9.2.0.18004",
    supportText: "Create or seed a metadata project"
  },
  paths: {
    metadataDirectory: "metadata",
    defaultMetadataFile: "SWF.xml",
    uploadsDirectory: "data/uploads",
    exportsDirectory: "data/exports",
    databaseFile: "data/app.db"
  },
  server: {
    host: "127.0.0.1",
    port: 8787,
    clientDevPort: 5173
  },
  auth: {
    enabled: false,
    strategy: "none",
    jwt: {
      secret: "change-me-in-production-use-env-var",
      accessTokenExpiry: "15m",
      refreshTokenExpiry: "7d"
    },
    defaultRole: "author",
    allowSelfRegistration: false,
    username: "admin",
    password: "changeme"
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
    },
    blueprints: {
      Scenario: {
        defaultDimensionName: "Scenarios",
        rootMembers: ["Root"],
        memberKeyField: "Entity",
        relationshipDefaults: {},
        allowMultipleParents: true
      },
      Entity: {
        defaultDimensionName: "Entities",
        rootMembers: ["Root"],
        memberKeyField: "Entity",
        relationshipDefaults: {
          percentConsol: 100,
          percentOwnership: 100,
          ownershipType: "FullConsolidation"
        },
        allowMultipleParents: true
      },
      Account: {
        defaultDimensionName: "Accounts",
        rootMembers: ["Root"],
        memberKeyField: "Account",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      Flow: {
        defaultDimensionName: "Flow",
        rootMembers: ["Root"],
        memberKeyField: "Flow Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD1: {
        defaultDimensionName: "UD1",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD2: {
        defaultDimensionName: "UD2",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD3: {
        defaultDimensionName: "UD3",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD4: {
        defaultDimensionName: "UD4",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD5: {
        defaultDimensionName: "UD5",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD6: {
        defaultDimensionName: "UD6",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD7: {
        defaultDimensionName: "UD7",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD8: {
        defaultDimensionName: "UD8",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      }
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
    oneStreamProfile: {
      enabled: true,
      memberNameMaxLength: 500,
      warnOnMemberNameSpaces: true,
      warnOnMemberNamePeriods: true,
      reservedWords: [
        "Account", "All", "Cons", "Consolidation", "Default", "DimType",
        "Entity", "EntityDefault", "Flow", "IC", "None", "Origin", "Parent",
        "POV", "Root", "RootAccountDim", "RootEntityDim", "RootFlowDim",
        "RootScenarioDim", "RootUD1Dim", "RootUD2Dim", "RootUD3Dim",
        "RootUD4Dim", "RootUD5Dim", "RootUD6Dim", "RootUD7Dim", "RootUD8Dim",
        "Scenario", "Time", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7",
        "UD8", "UD1Default", "Unknown", "View", "WF", "Workflow", "XFCommon"
      ],
      restrictedCharacters: [
        "/", "|", "!", "@", "#", ",", ";", "^", "*", "+", "-", "=", "\\",
        "?", "<", ">", "\"", "[", "]", "{", "}", "&", "\t", "\r", "\n"
      ],
      duplicateAliasSeverity: "warning",
      invalidSortOrderSeverity: "warning",
      sharedMemberSeverity: "info",
      parentInputWarningSeverity: "warning",
      unknownPropertySeverity: "warning",
      invalidEnumSeverity: "error",
      invalidPropertyTypeSeverity: "error"
    },
    exportBlockedBySeverities: ["error"]
  },
  export: {
    allowValidationBypass: false,
    validationBypassRequiresReason: true,
    requireValidationBeforeExport: false,
    xml: {
      enabled: true,
      prettyPrint: true,
      skipBlankMemberRows: true,
      skipFormulaErrors: true,
      includeDimensionSourceAttributes: true
    },
    xlsx: {
      enabled: true,
      creator: "SR Onestream Dim Builder"
    },
    csv: {
      enabled: true
    },
    json: {
      enabled: true
    }
  },
  ui: {
    defaultWorkspaceTab: "Members",
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
  },
  workflows: {
    enabled: true,
    requireApprovalForDeploy: true,
    defaultDefinition: "standard-review"
  },
  ai: {
    enabled: true,
    provider: 'none',
    model: '',
    apiKey: '',
    features: {
      parentSuggestions: true,
      duplicateDetection: true,
      namingAnomalies: true,
      hierarchyOptimization: true,
      propertySuggestions: true,
      naturalLanguageQuery: true
    },
    duplicateDetection: {
      similarityThreshold: 0.85,
      methods: ['levenshtein', 'soundex', 'prefix']
    },
    suggestions: {
      maxPerAnalysis: 50,
      autoRunOnImport: true
    }
  }
};
