import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import {
  buildClientAppConfig,
  mergeAppConfig,
  validateAppConfig
} from "../shared/appConfigValidation";

describe("app config", () => {
  it("deep merges partial yaml config onto defaults", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      application: { title: "Custom Builder" },
      ui: { gridPageSize: 250 }
    });

    expect(config.application.title).toBe("Custom Builder");
    expect(config.application.productName).toBe("OneStream XF Dimension Builder");
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
