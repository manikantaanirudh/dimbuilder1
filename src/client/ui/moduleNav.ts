import type { ModulesConfig } from "@shared/appConfigTypes";

export interface NavItem {
  value: string;
  label: string;
}

function resolvedModules(modules: ModulesConfig | undefined): Required<ModulesConfig> {
  return {
    chatAssistant: modules?.chatAssistant ?? false,
    environmentManagement: modules?.environmentManagement ?? false,
    offlineSync: modules?.offlineSync ?? false,
    apiPlatform: modules?.apiPlatform ?? false,
    multiTenancy: modules?.multiTenancy ?? false,
    scheduler: modules?.scheduler ?? false,
    platformExtras: modules?.platformExtras ?? false
  };
}

/** Workspace nav entries gated by optional platform modules. */
export function buildMoreNavItems(
  modules: ModulesConfig | undefined,
  items: NavItem[],
  options: { aiEnabled?: boolean } = {}
): NavItem[] {
  const resolved = resolvedModules(modules);
  const chatOn = resolved.chatAssistant && (options.aiEnabled ?? false);

  return items.filter((item) => {
    if (!chatOn && (item.value === "__chat__" || item.value === "__ai_insights__" || item.value === "__project_assistant__")) {
      return false;
    }
    if (!resolved.environmentManagement && item.value === "__environments__") {
      return false;
    }
    if (!(resolved.offlineSync || resolved.apiPlatform) && item.value === "__excel_addin__") {
      return false;
    }
    if (!resolved.multiTenancy && item.value === "__tenants__") {
      return false;
    }
    if (!resolved.platformExtras) {
      const platformOnly = new Set([
        "__migration_cockpit__",
        "__risk_heatmap__",
        "__pattern_profiler__",
        "__config_editor__"
      ]);
      if (platformOnly.has(item.value)) return false;
    }
    if (!resolved.platformExtras && item.value === "__quality__") {
      return false;
    }
    return true;
  });
}

export function showSecondaryNavItem(
  value: string,
  modules: ModulesConfig | undefined,
  options: { aiEnabled?: boolean } = {}
): boolean {
  const resolved = resolvedModules(modules);
  const chatOn = resolved.chatAssistant && (options.aiEnabled ?? false);
  if (value === "__quality__") return resolved.platformExtras;
  if (value === "__project_assistant__") return chatOn;
  return true;
}
