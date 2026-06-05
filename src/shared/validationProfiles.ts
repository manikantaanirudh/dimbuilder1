import type { AppConfig, OneStreamValidationProfileConfig, ValidationConfig } from "./appConfigTypes";
import type { Severity } from "./types";

export const VALIDATION_PROFILE_IDS = [
  "local-draft",
  "consultant-review",
  "acm-handoff",
  "strict-import-readiness"
] as const;

export type ValidationProfileId = (typeof VALIDATION_PROFILE_IDS)[number];

export interface ResolvedValidationRun {
  profileId: ValidationProfileId;
  oneStreamProfile: OneStreamValidationProfileConfig;
  exportBlockedBySeverities: Severity[];
}

export function isValidationProfileId(value: string): value is ValidationProfileId {
  return (VALIDATION_PROFILE_IDS as readonly string[]).includes(value);
}

/** Named severity presets for consultant workflows. */
export function resolveNamedValidationProfile(
  profileId: string | undefined,
  config: AppConfig
): ResolvedValidationRun | null {
  const id = (profileId ?? config.validation.defaultProfileId ?? "consultant-review") as string;
  if (!isValidationProfileId(id)) return null;

  const base = { ...config.validation };
  const oneStream = { ...base.oneStreamProfile, enabled: true };

  switch (id) {
    case "local-draft":
      return {
        profileId: id,
        oneStreamProfile: oneStream,
        exportBlockedBySeverities: []
      };
    case "consultant-review":
      return {
        profileId: id,
        oneStreamProfile: oneStream,
        exportBlockedBySeverities: ["error"]
      };
    case "acm-handoff":
      return {
        profileId: id,
        oneStreamProfile: {
          ...oneStream,
          duplicateAliasSeverity: "warning",
          invalidSortOrderSeverity: "warning",
          parentInputWarningSeverity: "warning"
        },
        exportBlockedBySeverities: ["error", "warning"]
      };
    case "strict-import-readiness":
      return {
        profileId: id,
        oneStreamProfile: {
          ...oneStream,
          duplicateAliasSeverity: "error",
          invalidSortOrderSeverity: "error",
          parentInputWarningSeverity: "error",
          unknownPropertySeverity: "error"
        },
        exportBlockedBySeverities: ["error", "warning"]
      };
    default:
      return null;
  }
}

export function mergeValidationSeverities(
  config: ValidationConfig,
  resolved: ResolvedValidationRun
): ValidationConfig {
  return {
    ...config,
    oneStreamProfile: resolved.oneStreamProfile,
    exportBlockedBySeverities: resolved.exportBlockedBySeverities
  };
}
