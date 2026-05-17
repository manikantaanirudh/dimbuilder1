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

  it("rejects unknown dimension types", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: { enabledTypes: ["Scenario", "BadDim"] }
    });

    expect(() => validateAppConfig(config)).toThrow("Unknown dimension type 'BadDim'");
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

  it("removes server-only paths from client-safe config", () => {
    const clientConfig = buildClientAppConfig(defaultAppConfig);

    expect(clientConfig.application.title).toBe(defaultAppConfig.application.title);
    expect("paths" in clientConfig).toBe(false);
    expect("server" in clientConfig).toBe(false);
  });
});
