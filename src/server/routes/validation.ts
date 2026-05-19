import { Router } from "express";
import { supportedConfigSeverities, type AppConfig, type OneStreamValidationProfileConfig } from "../../shared/appConfigTypes";
import { validateDimension } from "../../shared/validationEngine";
import type { Repositories } from "../db/repositories";

export function createValidationRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.post("/:projectId/run", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const oneStreamProfile = resolveValidationProfile(req.body, config);
    if (!oneStreamProfile) return res.status(400).json({ error: "profile must be 'default' or 'onestream'" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const varyingPropertyValues = repos.varyingProperties.listVaryingPropertyValues(project.id);
    const issues = dimensions.flatMap((dimension) =>
      validateDimension({
        project,
        dimension,
        members: members.filter((member) => member.dimensionId === dimension.id),
        relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
        varyingPropertyValues: varyingPropertyValues.filter((value) => value.dimensionId === dimension.id),
        severities: {
          ...config.validation,
          duplicateMemberSeverity: req.body?.duplicateSeverity ?? config.validation.duplicateMemberSeverity,
          oneStreamProfile
        },
        duplicateSeverity: req.body?.duplicateSeverity
      })
    );

    repos.issues.replaceForProject(project.id, issues);
    repos.audit.record({ projectId: project.id, action: "validation.run", entityType: "project", entityId: project.id, after: { issues: issues.length } });
    res.json({ issues });
  });

  return router;
}

function resolveValidationProfile(body: unknown, config: AppConfig): OneStreamValidationProfileConfig | null {
  const request = isRecord(body) ? body : {};
  const profile = typeof request.profile === "string" ? request.profile : undefined;
  if (profile !== undefined && profile !== "default" && profile !== "onestream") return null;
  const options = isRecord(request.options) ? request.options : {};
  const enabled = profile === "default"
    ? false
    : profile === "onestream"
      ? true
      : config.validation.oneStreamProfile.enabled;
  return applyProfileOptions({ ...config.validation.oneStreamProfile, enabled }, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function applyProfileOptions(profile: OneStreamValidationProfileConfig, options: Record<string, unknown>): OneStreamValidationProfileConfig {
  const next = { ...profile };
  if (typeof options.memberNameMaxLength === "number" && Number.isInteger(options.memberNameMaxLength) && options.memberNameMaxLength > 0) {
    next.memberNameMaxLength = options.memberNameMaxLength;
  }
  for (const key of ["warnOnMemberNameSpaces", "warnOnMemberNamePeriods"] as const) {
    if (typeof options[key] === "boolean") next[key] = options[key];
  }
  for (const key of ["reservedWords", "restrictedCharacters"] as const) {
    if (Array.isArray(options[key]) && options[key].every((value) => typeof value === "string" && value.length > 0)) {
      next[key] = options[key];
    }
  }
  for (const key of [
    "duplicateAliasSeverity",
    "invalidSortOrderSeverity",
    "sharedMemberSeverity",
    "parentInputWarningSeverity",
    "unknownPropertySeverity",
    "invalidEnumSeverity",
    "invalidPropertyTypeSeverity"
  ] as const) {
    if (isSeverity(options[key])) next[key] = options[key];
  }
  return next;
}

function isSeverity(value: unknown): value is OneStreamValidationProfileConfig["duplicateAliasSeverity"] {
  return supportedConfigSeverities.includes(value as OneStreamValidationProfileConfig["duplicateAliasSeverity"]);
}
