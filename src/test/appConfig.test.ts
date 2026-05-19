import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../server/config/loadAppConfig";
import { findDefaultMetadataReferencePath } from "../server/metadataReference";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import {
  buildClientAppConfig,
  mergeAppConfig,
  validateAppConfig
} from "../shared/appConfigValidation";

describe("app config", () => {
  it("defaults to the SR Onestream builder identity", () => {
    expect(defaultAppConfig.application.productName).toBe("SR Onestream Dim Builder");
    expect(defaultAppConfig.application.title).toBe("SR Onestream Dim Builder");
    expect(defaultAppConfig.export.xlsx.creator).toBe("SR Onestream Dim Builder");
    expect(defaultAppConfig.export.allowValidationBypass).toBe(false);
    expect(defaultAppConfig.export.validationBypassRequiresReason).toBe(true);
    expect(defaultAppConfig.export.requireValidationBeforeExport).toBe(false);
    expect(defaultAppConfig.validation.oneStreamProfile).toMatchObject({
      enabled: true,
      memberNameMaxLength: 250,
      warnOnMemberNameSpaces: true,
      warnOnMemberNamePeriods: true,
      duplicateAliasSeverity: "warning",
      invalidSortOrderSeverity: "warning",
      sharedMemberSeverity: "info",
      parentInputWarningSeverity: "warning",
      unknownPropertySeverity: "warning",
      invalidEnumSeverity: "error",
      invalidPropertyTypeSeverity: "error"
    });
    expect(defaultAppConfig.ui.defaultWorkspaceTab).toBe("Members");
  });

  it("loads dimension blueprint configuration", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Corporate Accounts",
            rootMembers: ["Root", "Net Income"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(validateAppConfig(config).dimensions.blueprints.Account).toEqual({
      defaultDimensionName: "Corporate Accounts",
      rootMembers: ["Root", "Net Income"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true
    });
  });

  it("loads configured dimension blueprint members and relationships", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Corporate Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true,
            members: [
              { memberKey: "Revenue", description: "Revenue", properties: { "Account Type": "Revenue" } }
            ],
            relationships: [
              { parentKey: "Root", childKey: "Revenue", properties: { "Aggregation Weight": 1 } }
            ]
          }
        }
      }
    });

    expect(validateAppConfig(config).dimensions.blueprints.Account).toMatchObject({
      members: [
        { memberKey: "Revenue", description: "Revenue", properties: { "Account Type": "Revenue" } }
      ],
      relationships: [
        { parentKey: "Root", childKey: "Revenue", properties: { "Aggregation Weight": 1 } }
      ]
    });
  });

  it("rejects unknown dimension types in blueprints", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          BadDim: {
            defaultDimensionName: "Bad",
            rootMembers: ["Root"],
            memberKeyField: "Member",
            relationshipDefaults: {},
            allowMultipleParents: false
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Unknown dimension type 'BadDim'");
  });

  it("rejects blueprint member key fields outside the dimension schema", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Bad Field",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' uses unsupported memberKeyField 'Bad Field'.");
  });

  it("rejects blueprint root member arrays with no members", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: [],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' must define non-empty rootMembers.");
  });

  it("rejects blank blueprint default dimension names", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: " ",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' must define defaultDimensionName.");
  });

  it("rejects blueprint root member arrays with blank members", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root", " "],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' must define non-empty rootMembers.");
  });

  it("rejects non-string blueprint default dimension names with a validation error", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: 123,
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' must define defaultDimensionName.");
  });

  it("rejects non-string blueprint root members with a validation error", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root", 123],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' must define non-empty rootMembers.");
  });

  it("rejects null blueprint relationship defaults with a validation error", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: null,
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow(
      "Blueprint for 'Account' must define relationshipDefaults as an object."
    );
  });

  it("rejects unsupported blueprint relationship default keys", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { badDefault: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow(
      "Blueprint for 'Account' uses unsupported relationship default 'badDefault'."
    );
  });

  it("rejects invalid blueprint relationship default value types", () => {
    const invalidAggregationWeightConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: "1" },
            allowMultipleParents: true
          }
        }
      }
    });
    const invalidOwnershipTypeConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Entity: {
            defaultDimensionName: "Entities",
            rootMembers: ["Root"],
            memberKeyField: "Entity",
            relationshipDefaults: { ownershipType: 123 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(invalidAggregationWeightConfig)).toThrow(
      "Blueprint for 'Account' relationshipDefaults.aggregationWeight must be a number."
    );
    expect(() => validateAppConfig(invalidOwnershipTypeConfig)).toThrow(
      "Blueprint for 'Entity' relationshipDefaults.ownershipType must be a string."
    );
  });

  it("rejects unsupported configured blueprint member fields", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true,
            members: [
              { memberKey: "Revenue", properties: { "Bad Field": "x" } }
            ]
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow(
      "Blueprint for 'Account' member 'Revenue' uses unsupported field 'Bad Field'."
    );
  });

  it("rejects unsupported configured blueprint relationship fields", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "Revenue", properties: { "Bad Field": "x" } }
            ]
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow(
      "Blueprint for 'Account' relationship 'Root -> Revenue' uses unsupported field 'Bad Field'."
    );
  });

  it("rejects invalid configured blueprint relationship default value types", () => {
    const invalidPercentOwnershipConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Entity: {
            defaultDimensionName: "Entities",
            rootMembers: ["Root"],
            memberKeyField: "Entity",
            relationshipDefaults: { percentConsol: 100 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "US", percentOwnership: "100" }
            ]
          }
        }
      }
    });
    const invalidOwnershipTypeConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Entity: {
            defaultDimensionName: "Entities",
            rootMembers: ["Root"],
            memberKeyField: "Entity",
            relationshipDefaults: { percentConsol: 100 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "US", ownershipType: 123 }
            ]
          }
        }
      }
    });

    expect(() => validateAppConfig(invalidPercentOwnershipConfig)).toThrow(
      "Blueprint for 'Entity' relationship 'Root -> US' percentOwnership must be a number."
    );
    expect(() => validateAppConfig(invalidOwnershipTypeConfig)).toThrow(
      "Blueprint for 'Entity' relationship 'Root -> US' ownershipType must be a string."
    );
  });

  it("rejects invalid configured blueprint relationship property default value types", () => {
    const invalidAggregationWeightConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "Revenue", properties: { "Aggregation Weight": "heavy" } }
            ]
          }
        }
      }
    });
    const invalidPercentConsolConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Entity: {
            defaultDimensionName: "Entities",
            rootMembers: ["Root"],
            memberKeyField: "Entity",
            relationshipDefaults: { percentConsol: 100 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "US", properties: { "Percent Consol": "100" } }
            ]
          }
        }
      }
    });
    const invalidPercentOwnershipConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Entity: {
            defaultDimensionName: "Entities",
            rootMembers: ["Root"],
            memberKeyField: "Entity",
            relationshipDefaults: { percentConsol: 100 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "US", properties: { "Percent Ownership": "100" } }
            ]
          }
        }
      }
    });
    const invalidOwnershipTypeConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Entity: {
            defaultDimensionName: "Entities",
            rootMembers: ["Root"],
            memberKeyField: "Entity",
            relationshipDefaults: { percentConsol: 100 },
            allowMultipleParents: true,
            relationships: [
              { parentKey: "Root", childKey: "US", properties: { "Ownership Type": 123 } }
            ]
          }
        }
      }
    });

    expect(() => validateAppConfig(invalidAggregationWeightConfig)).toThrow(
      "Blueprint for 'Account' relationship 'Root -> Revenue' property 'Aggregation Weight' must be a number."
    );
    expect(() => validateAppConfig(invalidPercentConsolConfig)).toThrow(
      "Blueprint for 'Entity' relationship 'Root -> US' property 'Percent Consol' must be a number."
    );
    expect(() => validateAppConfig(invalidPercentOwnershipConfig)).toThrow(
      "Blueprint for 'Entity' relationship 'Root -> US' property 'Percent Ownership' must be a number."
    );
    expect(() => validateAppConfig(invalidOwnershipTypeConfig)).toThrow(
      "Blueprint for 'Entity' relationship 'Root -> US' property 'Ownership Type' must be a string."
    );
  });

  it("rejects non-object dimension blueprints with a validation error", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: null
      }
    });

    expect(() => validateAppConfig(config)).toThrow("dimensions.blueprints must be an object.");
  });

  it("rejects null dimension blueprint entries with a validation error", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: null
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' must be an object.");
  });

  it("deep merges partial yaml config onto defaults", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      application: { title: "Custom Builder" },
      ui: { gridPageSize: 250 }
    });

    expect(config.application.title).toBe("Custom Builder");
    expect(config.application.productName).toBe("SR Onestream Dim Builder");
    expect(config.ui.gridPageSize).toBe(250);
    expect(config.features.enableXmlPreview).toBe(true);
  });

  it("treats null yaml config as no override", () => {
    const config = mergeAppConfig(defaultAppConfig, null);

    expect(config).toEqual(defaultAppConfig);
  });

  it("rejects unknown dimension types", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: { enabledTypes: ["Scenario", "BadDim"] }
    });

    expect(() => validateAppConfig(config)).toThrow("Unknown dimension type 'BadDim'");
  });

  it("rejects unknown dimension types in dimension maps", () => {
    const sheetAliasesConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: { sheetAliases: { BadDim: ["BadDim"] } }
    });
    const preferredMetadataNamesConfig = mergeAppConfig(defaultAppConfig, {
      dimensions: { preferredMetadataNames: { BadDim: "BadDim" } }
    });

    expect(() => validateAppConfig(sheetAliasesConfig)).toThrow("Unknown dimension type 'BadDim'");
    expect(() => validateAppConfig(preferredMetadataNamesConfig)).toThrow("Unknown dimension type 'BadDim'");
  });

  it("rejects invalid severities", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      validation: { duplicateMemberSeverity: "fatal" }
    });

    expect(() => validateAppConfig(config)).toThrow("Invalid severity 'fatal'");
  });

  it("rejects invalid export validation gate settings", () => {
    const invalidBypassConfig = mergeAppConfig(defaultAppConfig, {
      export: { allowValidationBypass: "yes" }
    });
    const invalidReasonConfig = mergeAppConfig(defaultAppConfig, {
      export: { validationBypassRequiresReason: "yes" }
    });
    const invalidRequireValidationConfig = mergeAppConfig(defaultAppConfig, {
      export: { requireValidationBeforeExport: "yes" }
    });

    expect(() => validateAppConfig(invalidBypassConfig)).toThrow("export.allowValidationBypass must be a boolean.");
    expect(() => validateAppConfig(invalidReasonConfig)).toThrow("export.validationBypassRequiresReason must be a boolean.");
    expect(() => validateAppConfig(invalidRequireValidationConfig)).toThrow("export.requireValidationBeforeExport must be a boolean.");
  });

  it("rejects invalid OneStream validation profile settings", () => {
    const invalidEnabledConfig = mergeAppConfig(defaultAppConfig, {
      validation: { oneStreamProfile: { enabled: "yes" } }
    });
    const invalidLengthConfig = mergeAppConfig(defaultAppConfig, {
      validation: { oneStreamProfile: { memberNameMaxLength: 0 } }
    });
    const invalidSeverityConfig = mergeAppConfig(defaultAppConfig, {
      validation: { oneStreamProfile: { duplicateAliasSeverity: "fatal" } }
    });
    const invalidReservedWordsConfig = mergeAppConfig(defaultAppConfig, {
      validation: { oneStreamProfile: { reservedWords: ["Root", 123] } }
    });
    const invalidRestrictedCharactersConfig = mergeAppConfig(defaultAppConfig, {
      validation: { oneStreamProfile: { restrictedCharacters: ["<", ""] } }
    });

    expect(() => validateAppConfig(invalidEnabledConfig)).toThrow("validation.oneStreamProfile.enabled must be a boolean.");
    expect(() => validateAppConfig(invalidLengthConfig)).toThrow("validation.oneStreamProfile.memberNameMaxLength must be a positive integer.");
    expect(() => validateAppConfig(invalidSeverityConfig)).toThrow("Invalid severity 'fatal' in configuration.");
    expect(() => validateAppConfig(invalidReservedWordsConfig)).toThrow("validation.oneStreamProfile.reservedWords must be an array of non-empty strings.");
    expect(() => validateAppConfig(invalidRestrictedCharactersConfig)).toThrow("validation.oneStreamProfile.restrictedCharacters must be an array of non-empty strings.");
  });

  it("rejects invalid metadata-only exclusion regex", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        metadataOnly: {
          ...defaultAppConfig.dimensions.metadataOnly,
          excludeNamePatterns: ["["]
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Invalid excludeNamePatterns regex");
  });

  it("rejects invalid numeric bounds", () => {
    const invalidPortConfig = mergeAppConfig(defaultAppConfig, {
      server: { port: 65536 }
    });
    const invalidClientDevPortConfig = mergeAppConfig(defaultAppConfig, {
      server: { clientDevPort: 65536 }
    });
    const invalidGridPageSizeConfig = mergeAppConfig(defaultAppConfig, {
      ui: { gridPageSize: 0 }
    });

    expect(() => validateAppConfig(invalidPortConfig)).toThrow("server.port must be an integer from 1 to 65535.");
    expect(() => validateAppConfig(invalidClientDevPortConfig)).toThrow("server.clientDevPort must be an integer from 1 to 65535.");
    expect(() => validateAppConfig(invalidGridPageSizeConfig)).toThrow("ui.gridPageSize must be a positive integer.");
  });

  it("removes server-only paths from client-safe config", () => {
    const clientConfig = buildClientAppConfig(defaultAppConfig);

    expect(clientConfig.application.title).toBe(defaultAppConfig.application.title);
    expect("paths" in clientConfig).toBe(false);
    expect("server" in clientConfig).toBe(false);
  });
});

describe("server app config loader", () => {
  it("loads the committed config with SR identity and Account blueprint", () => {
    const config = loadAppConfig({ configFilePath: "config/dimbuilder.yaml" });

    expect(config.application.title).toBe("SR Onestream Dim Builder");
    expect(config.dimensions.blueprints.Account).toEqual({
      defaultDimensionName: "Accounts",
      rootMembers: ["Root"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true
    });
  });

  it("loads config from yaml and applies environment overrides", () => {
    const directory = mkdtempSync(join(tmpdir(), "dimbuilder-config-"));
    const filePath = join(directory, "dimbuilder.yaml");
    writeFileSync(filePath, "application:\n  title: YAML Title\nserver:\n  port: 9001\n", "utf8");
    const previousPort = process.env.PORT;
    process.env.PORT = "9002";

    try {
      const config = loadAppConfig({ configFilePath: filePath });
      expect(config.application.title).toBe("YAML Title");
      expect(config.server.port).toBe(9002);
    } finally {
      if (previousPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = previousPort;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses defaults when config file is missing", () => {
    const config = loadAppConfig({ configFilePath: "missing-config-file.yaml" });

    expect(config.application.title).toBe(defaultAppConfig.application.title);
  });
});

describe("metadata reference config", () => {
  it("accepts a legacy metadata directory string argument", () => {
    const directory = mkdtempSync(join(tmpdir(), "dimbuilder-metadata-"));
    const referencePath = join(directory, "reference.xml");
    writeFileSync(referencePath, "<OneStreamXF />", "utf8");

    try {
      expect(findDefaultMetadataReferencePath(directory)).toBe(referencePath);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("prefers configured default metadata file when present", () => {
    const directory = mkdtempSync(join(tmpdir(), "dimbuilder-metadata-"));
    const firstPath = join(directory, "first.xml");
    const preferredPath = join(directory, "preferred.xml");
    writeFileSync(firstPath, "<OneStreamXF />", "utf8");
    writeFileSync(preferredPath, "<OneStreamXF />", "utf8");

    try {
      expect(findDefaultMetadataReferencePath({ directory, defaultFile: "preferred.xml" })).toBe(preferredPath);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
