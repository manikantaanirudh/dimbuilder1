import type { AppConfig, ModulesConfig } from "../../shared/appConfigTypes";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import { allModulesEnabled } from "../../shared/modulesConfig";

export function withModules(config: AppConfig, modules: Partial<ModulesConfig>): AppConfig {
  return {
    ...config,
    modules: { ...defaultAppConfig.modules!, ...config.modules, ...modules }
  };
}

/** Enable platform/experimental routes for integration tests that target tier-2/3 APIs. */
export function enablePlatformForTests(config: AppConfig = defaultAppConfig): AppConfig {
  return {
    ...withModules(config, allModulesEnabled()),
    ai: {
      ...(config.ai ?? defaultAppConfig.ai!),
      enabled: true
    }
  };
}
