import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import type { AppConfig } from "../../shared/appConfigTypes";
import { mergeAppConfig, validateAppConfig } from "../../shared/appConfigValidation";

interface LoadAppConfigOptions {
  configFilePath?: string;
}

export function loadAppConfig(options: LoadAppConfigOptions = {}): AppConfig {
  const configFilePath = options.configFilePath ?? process.env.DIMBUILDER_CONFIG_FILE ?? "config/dimbuilder.yaml";
  const yamlConfig = existsSync(configFilePath)
    ? parse(readFileSync(configFilePath, "utf8")) ?? {}
    : {};
  const merged = mergeAppConfig(defaultAppConfig, yamlConfig);

  return validateAppConfig(applyEnvironmentOverrides(merged));
}

function applyEnvironmentOverrides(config: AppConfig): AppConfig {
  return {
    ...config,
    paths: {
      ...config.paths,
      metadataDirectory: process.env.METADATA_DIRECTORY ?? config.paths.metadataDirectory,
      databaseFile: process.env.DATABASE_FILE ?? config.paths.databaseFile
    },
    server: {
      ...config.server,
      port: process.env.PORT ? Number(process.env.PORT) : config.server.port
    }
  };
}
