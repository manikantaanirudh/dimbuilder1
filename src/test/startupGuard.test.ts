import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import {
  applyAppModeModuleDefaults,
  evaluateStartupSafety,
  evaluateStartupSafetyFromConfig,
  isLocalhostHost,
  resolveAppMode
} from "../server/startupSafety";

describe("startup guard logic", () => {
  it("identifies localhost hosts", () => {
    expect(isLocalhostHost("127.0.0.1")).toBe(true);
    expect(isLocalhostHost("::1")).toBe(true);
    expect(isLocalhostHost("localhost")).toBe(true);
    expect(isLocalhostHost("0.0.0.0")).toBe(false);
    expect(isLocalhostHost("192.168.1.1")).toBe(false);
  });

  it("allows localhost without auth", () => {
    expect(evaluateStartupSafety({
      host: "127.0.0.1",
      authEnabled: false,
      jwtSecret: "change-me-in-production"
    })).toBeNull();
  });

  it("blocks non-localhost without auth", () => {
    expect(evaluateStartupSafety({
      host: "0.0.0.0",
      authEnabled: false,
      jwtSecret: "secret"
    })?.code).toBe("NON_LOCALHOST_WITHOUT_AUTH");
  });

  it("blocks non-localhost with placeholder JWT when auth is enabled", () => {
    expect(evaluateStartupSafety({
      host: "0.0.0.0",
      authEnabled: true,
      jwtSecret: "change-me-in-production-use-env-var"
    })?.code).toBe("PLACEHOLDER_JWT_SECRET");
  });

  it("blocks non-localhost admin bootstrap with default password", () => {
    expect(evaluateStartupSafety({
      host: "10.0.0.5",
      authEnabled: true,
      jwtSecret: "a-real-secret-value-here",
      adminEmail: "admin@example.com",
      adminPassword: "ChangeMe123!",
      seedingAdmin: true
    })?.code).toBe("WEAK_ADMIN_CREDENTIALS");
  });

  it("allows non-localhost auth when JWT and admin credentials are set", () => {
    expect(evaluateStartupSafetyFromConfig({
      ...defaultAppConfig,
      server: { ...defaultAppConfig.server, host: "0.0.0.0" },
      auth: { ...defaultAppConfig.auth, enabled: true, strategy: "local" }
    }, {
      JWT_SECRET: "super-secret-jwt-key-for-tests-only",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "NotTheDefaultPassword1!"
    }, { seedingAdmin: true })).toBeNull();
  });

  it("blocks shared appMode without auth", () => {
    const config = {
      ...defaultAppConfig,
      operations: { ...defaultAppConfig.operations!, appMode: "shared" as const },
      auth: { ...defaultAppConfig.auth, enabled: false, strategy: "none" as const }
    };
    expect(evaluateStartupSafetyFromConfig(config)?.message).toMatch(/appMode is 'shared'/i);
  });

  it("forces experimental modules off in production appMode", () => {
    const config = {
      ...defaultAppConfig,
      modules: {
        multiTenancy: true,
        offlineSync: true,
        apiPlatform: true,
        environmentManagement: true,
        chatAssistant: true,
        scheduler: true,
        platformExtras: true
      },
      operations: { ...defaultAppConfig.operations!, appMode: "production" as const }
    };
    applyAppModeModuleDefaults(config, {});
    expect(config.modules?.chatAssistant).toBe(false);
    expect(config.modules?.platformExtras).toBe(false);
    expect(config.ai?.enabled).toBe(false);
  });

  it("resolveAppMode prefers APP_MODE env", () => {
    expect(resolveAppMode(defaultAppConfig, { APP_MODE: "shared" })).toBe("shared");
  });
});
