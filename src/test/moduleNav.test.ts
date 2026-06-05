import { describe, expect, it } from "vitest";
import { buildMoreNavItems } from "../client/ui/moduleNav";

const ALL_ITEMS = [
  { value: "__ai_insights__", label: "Smart Insights" },
  { value: "__chat__", label: "Chat" },
  { value: "__environments__", label: "Environments" },
  { value: "__excel_addin__", label: "Excel Add-In" },
  { value: "__tenants__", label: "Tenants" },
  { value: "__audit_log__", label: "Audit Log" }
];

describe("buildMoreNavItems", () => {
  it("hides chat and AI when chatAssistant is disabled", () => {
    const items = buildMoreNavItems({ chatAssistant: false, environmentManagement: false, offlineSync: false, apiPlatform: false, multiTenancy: false, scheduler: false, platformExtras: false }, ALL_ITEMS);
    expect(items.map((i) => i.value)).not.toContain("__chat__");
    expect(items.map((i) => i.value)).not.toContain("__ai_insights__");
    expect(items.map((i) => i.value)).toContain("__audit_log__");
  });

  it("shows chat when chatAssistant is enabled", () => {
    const items = buildMoreNavItems({ chatAssistant: true, environmentManagement: false, offlineSync: false, apiPlatform: false, multiTenancy: false, scheduler: false, platformExtras: false }, ALL_ITEMS, { aiEnabled: true });
    expect(items.map((i) => i.value)).toContain("__chat__");
  });
});
