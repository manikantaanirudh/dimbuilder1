import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { resolveNamedValidationProfile } from "../shared/validationProfiles";

describe("validationProfiles", () => {
  it("defaults to consultant-review", () => {
    const resolved = resolveNamedValidationProfile(undefined, defaultAppConfig);
    expect(resolved?.profileId).toBe("consultant-review");
    expect(resolved?.exportBlockedBySeverities).toEqual(["error"]);
  });

  it("acm-handoff blocks warnings for export gate", () => {
    const resolved = resolveNamedValidationProfile("acm-handoff", defaultAppConfig);
    expect(resolved?.exportBlockedBySeverities).toEqual(["error", "warning"]);
  });

  it("local-draft does not block export by severity", () => {
    const resolved = resolveNamedValidationProfile("local-draft", defaultAppConfig);
    expect(resolved?.exportBlockedBySeverities).toEqual([]);
  });
});
