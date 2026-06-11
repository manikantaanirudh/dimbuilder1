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
  const exportMaxMembers = parseOptionalNonNegativeInt(process.env.EXPORT_MAX_MEMBERS);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const databasePoolMax = parseOptionalPositiveInt(process.env.DATABASE_POOL_MAX);
  return {
    ...config,
    ...(exportMaxMembers !== undefined
      ? {
          operations: {
            uploadMaxMb: config.operations?.uploadMaxMb ?? 25,
            exportRetentionDays: config.operations?.exportRetentionDays ?? 30,
            artifactRetentionDays: config.operations?.artifactRetentionDays ?? 30,
            corsAllowLocalhostByDefault: config.operations?.corsAllowLocalhostByDefault ?? true,
            exportMaxMembers,
            appMode: config.operations?.appMode
          }
        }
      : {}),
    database: {
      ...config.database,
      ...(databaseUrl ? { url: databaseUrl } : {}),
      ...(databasePoolMax !== undefined ? { poolMax: databasePoolMax } : {})
    },
    paths: {
      ...config.paths,
      metadataDirectory: process.env.METADATA_DIRECTORY ?? config.paths.metadataDirectory,
      databaseFile: process.env.DATABASE_FILE ?? config.paths.databaseFile
    },
    server: {
      ...config.server,
      host: process.env.HOST ?? config.server.host,
      port: resolveApiPort(config, process.env.PORT)
    },
    auth: {
      ...config.auth,
      enabled: process.env.AUTH_ENABLED ? process.env.AUTH_ENABLED === "true" : config.auth.enabled,
      username: process.env.AUTH_USERNAME ?? config.auth.username,
      password: process.env.AUTH_PASSWORD ?? config.auth.password,
      ...(process.env.JWT_SECRET ? { jwt: { ...config.auth.jwt, secret: process.env.JWT_SECRET } } : {})
    }
  };
}

function resolveApiPort(config: AppConfig, portEnv: string | undefined): number {
  const configured = portEnv ? Number(portEnv) : config.server.port;
  if (!Number.isFinite(configured) || configured <= 0) {
    return config.server.port;
  }
  // Vite owns clientDevPort during local dev; a mistaken PORT=5173 breaks npm run dev.
  if (process.env.NODE_ENV !== "production" && configured === config.server.clientDevPort) {
    return config.server.port;
  }
  return configured;
}

function parseOptionalNonNegativeInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) return undefined;
  return parsed;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return undefined;
  return parsed;
}
