import type { AppConfig } from "../shared/appConfigTypes";

export const DEFAULT_JWT_SECRETS = new Set([
  "",
  "change-me-in-production",
  "change-me-in-production-use-env-var"
]);

export const DEFAULT_ADMIN_PASSWORDS = new Set([
  "ChangeMe123!",
  "changeme"
]);

export function isLocalhostHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function isDefaultJwtSecret(secret: string): boolean {
  return DEFAULT_JWT_SECRETS.has(secret.trim());
}

export function isWeakAdminPassword(password: string): boolean {
  return DEFAULT_ADMIN_PASSWORDS.has(password);
}

export interface StartupSafetyInput {
  host: string;
  authEnabled: boolean;
  jwtSecret: string;
  adminEmail?: string;
  adminPassword?: string;
  seedingAdmin?: boolean;
}

export type StartupSafetyFailure =
  | { code: "NON_LOCALHOST_WITHOUT_AUTH"; message: string }
  | { code: "PLACEHOLDER_JWT_SECRET"; message: string }
  | { code: "WEAK_ADMIN_CREDENTIALS"; message: string };

export function evaluateStartupSafety(input: StartupSafetyInput): StartupSafetyFailure | null {
  const host = input.host ?? "127.0.0.1";
  const local = isLocalhostHost(host);

  if (!local && !input.authEnabled) {
    return {
      code: "NON_LOCALHOST_WITHOUT_AUTH",
      message: `Refusing to start: binding to ${host} without auth enabled. Set auth.enabled: true or AUTH_ENABLED=true.`
    };
  }

  if (!local && input.authEnabled && isDefaultJwtSecret(input.jwtSecret)) {
    return {
      code: "PLACEHOLDER_JWT_SECRET",
      message: "Refusing to start: JWT secret is a placeholder. Set JWT_SECRET to a strong random value before shared deployment."
    };
  }

  if (!local && input.authEnabled && input.seedingAdmin) {
    const email = (input.adminEmail ?? "").trim();
    const password = input.adminPassword ?? "";
    if (!email || isWeakAdminPassword(password)) {
      return {
        code: "WEAK_ADMIN_CREDENTIALS",
        message: "Refusing to start: set ADMIN_EMAIL and a non-default ADMIN_PASSWORD before first admin bootstrap on a shared host."
      };
    }
  }

  return null;
}

export function resolveAppMode(config: AppConfig, env: NodeJS.ProcessEnv = process.env): "local" | "shared" | "production" {
  const fromEnv = env.APP_MODE?.trim().toLowerCase();
  if (fromEnv === "shared" || fromEnv === "production" || fromEnv === "local") {
    return fromEnv;
  }
  return config.operations?.appMode ?? "local";
}

export function evaluateStartupSafetyFromConfig(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
  options: { seedingAdmin?: boolean } = {}
): StartupSafetyFailure | null {
  const jwtSecret = env.JWT_SECRET?.trim() || config.auth.jwt.secret;
  const appMode = resolveAppMode(config, env);
  const authEnabled = config.auth.enabled && config.auth.strategy !== "none";

  if ((appMode === "shared" || appMode === "production") && !authEnabled) {
    return {
      code: "NON_LOCALHOST_WITHOUT_AUTH",
      message: `Refusing to start: operations.appMode is '${appMode}' but auth is disabled. Set auth.enabled: true or APP_MODE=local.`
    };
  }

  const hostFailure = evaluateStartupSafety({
    host: config.server.host ?? "127.0.0.1",
    authEnabled,
    jwtSecret,
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
    seedingAdmin: options.seedingAdmin
  });
  if (hostFailure) return hostFailure;

  if ((appMode === "shared" || appMode === "production") && authEnabled && isDefaultJwtSecret(jwtSecret)) {
    return {
      code: "PLACEHOLDER_JWT_SECRET",
      message: "Refusing to start: JWT secret is a placeholder in shared/production appMode."
    };
  }

  return null;
}

/** Force experimental modules off unless explicitly overridden in local mode. */
export function applyAppModeModuleDefaults(config: AppConfig, env: NodeJS.ProcessEnv = process.env): void {
  const appMode = resolveAppMode(config, env);
  if (appMode === "local") return;
  if (env.UNSAFE_ALLOW_EXPERIMENTAL === "true") return;
  if (!config.modules) config.modules = { ...defaultModulesForMode() };
  config.modules.multiTenancy = false;
  config.modules.offlineSync = false;
  config.modules.apiPlatform = false;
  config.modules.environmentManagement = false;
  config.modules.chatAssistant = false;
  config.modules.scheduler = false;
  config.modules.platformExtras = false;
  if (config.ai) config.ai.enabled = false;
}

function defaultModulesForMode() {
  return {
    multiTenancy: false,
    offlineSync: false,
    apiPlatform: false,
    environmentManagement: false,
    chatAssistant: false,
    scheduler: false,
    platformExtras: false
  };
}
