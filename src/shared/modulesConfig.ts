import type { AppConfig, ModulesConfig } from "./appConfigTypes";
import { defaultAppConfig } from "./appConfigDefaults";

export const defaultModulesConfig: ModulesConfig = defaultAppConfig.modules!;

export function resolveModulesConfig(config: AppConfig): ModulesConfig {
  return { ...defaultModulesConfig, ...config.modules };
}

export function allModulesEnabled(): ModulesConfig {
  return {
    multiTenancy: true,
    offlineSync: true,
    apiPlatform: true,
    environmentManagement: true,
    chatAssistant: true,
    scheduler: true,
    platformExtras: true
  };
}

export function isChatAssistantEnabled(config: AppConfig, modules: ModulesConfig): boolean {
  return modules.chatAssistant && (config.ai?.enabled ?? false);
}
