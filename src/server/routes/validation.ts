import { Router } from "express";
import { supportedConfigSeverities, type AppConfig, type OneStreamValidationProfileConfig } from "../../shared/appConfigTypes";
import { validateDimension } from "../../shared/validationEngine";
import type { Severity } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export function createValidationRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.post("/:projectId/run", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const oneStreamProfile = resolveValidationProfile(req.body, config);
    if (!oneStreamProfile) return res.status(400).json({ error: "profile must be 'default' or 'onestream'" });

    // Load per-project validation overrides
    const projectOverrides = repos.validationOverrides.listByProject(project.id);
    const overrideSeverityMap = new Map(projectOverrides.map(o => [o.ruleCode, o.severity as Severity]));

    const baseSeverities: any = {
      ...config.validation,
      duplicateMemberSeverity: req.body?.duplicateSeverity ?? config.validation.duplicateMemberSeverity,
      oneStreamProfile
    };

    // Apply per-project rule overrides
    if (overrideSeverityMap.has("DUPLICATE_MEMBER")) baseSeverities.duplicateMemberSeverity = overrideSeverityMap.get("DUPLICATE_MEMBER");
    if (overrideSeverityMap.has("DUPLICATE_RELATIONSHIP")) baseSeverities.duplicateRelationshipSeverity = overrideSeverityMap.get("DUPLICATE_RELATIONSHIP");
    if (overrideSeverityMap.has("UNKNOWN_RELATIONSHIP_CHILD")) baseSeverities.unknownRelationshipMemberSeverity = overrideSeverityMap.get("UNKNOWN_RELATIONSHIP_CHILD");
    if (overrideSeverityMap.has("MEMBER_KEY_REQUIRED") || overrideSeverityMap.has("RELATIONSHIP_PARENT_REQUIRED")) baseSeverities.missingRequiredFieldSeverity = overrideSeverityMap.get("MEMBER_KEY_REQUIRED") ?? baseSeverities.missingRequiredFieldSeverity;
    if (overrideSeverityMap.has("CIRCULAR_HIERARCHY")) baseSeverities.circularHierarchySeverity = overrideSeverityMap.get("CIRCULAR_HIERARCHY");
    if (overrideSeverityMap.has("RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS")) baseSeverities.relationshipsWithNoLocalMembersSeverity = overrideSeverityMap.get("RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS");

    // Apply OneStream profile overrides
    if (baseSeverities.oneStreamProfile) {
      const profile = { ...baseSeverities.oneStreamProfile };
      if (overrideSeverityMap.has("DUPLICATE_ALIAS")) profile.duplicateAliasSeverity = overrideSeverityMap.get("DUPLICATE_ALIAS");
      if (overrideSeverityMap.has("INVALID_SORT_ORDER")) profile.invalidSortOrderSeverity = overrideSeverityMap.get("INVALID_SORT_ORDER");
      if (overrideSeverityMap.has("SHARED_MEMBER_DETECTED")) profile.sharedMemberSeverity = overrideSeverityMap.get("SHARED_MEMBER_DETECTED");
      if (overrideSeverityMap.has("UNKNOWN_PROPERTY")) profile.unknownPropertySeverity = overrideSeverityMap.get("UNKNOWN_PROPERTY");
      if (overrideSeverityMap.has("INVALID_ENUM_VALUE")) profile.invalidEnumSeverity = overrideSeverityMap.get("INVALID_ENUM_VALUE");
      if (overrideSeverityMap.has("INVALID_PROPERTY_TYPE")) profile.invalidPropertyTypeSeverity = overrideSeverityMap.get("INVALID_PROPERTY_TYPE");
      baseSeverities.oneStreamProfile = profile;
    }

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
        severities: baseSeverities,
        duplicateSeverity: req.body?.duplicateSeverity,
        ruleOverrides: overrideSeverityMap
      })
    );

    repos.issues.replaceForProject(project.id, issues);
    repos.audit.record({ projectId: project.id, action: "validation.run", entityType: "project", entityId: project.id, after: { issues: issues.length } });
    res.json({ issues });
  });

  return router;
}

type ProjectValidationRouterDeps = { repos: Repositories; config?: AppConfig; getAI?: unknown };

export function createProjectValidationRouter({ repos }: ProjectValidationRouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/issues", (req, res) => {
    const params = req.params as Record<string, string>;
    res.json(repos.issues.listByProject(params.projectId));
  });

  router.get("/validation-config", (req, res) => {
    const params = req.params as Record<string, string>;
    const project = repos.projects.get(params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = repos.validationOverrides.listByProject(project.id);
    res.json({ overrides });
  });

  router.post("/validation-config", (req, res) => {
    const params = req.params as Record<string, string>;
    const project = repos.projects.get(params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = req.body?.overrides;
    if (!Array.isArray(overrides)) return res.status(400).json({ error: "overrides must be an array" });
    for (const override of overrides) {
      if (!override.ruleCode || !override.severity) continue;
      if (override.severity === "default") {
        repos.validationOverrides.deleteByProject(project.id, override.ruleCode);
      } else {
        repos.validationOverrides.upsert(project.id, override.ruleCode, override.severity);
      }
    }
    repos.audit.record({ projectId: project.id, action: "validation.configUpdate", entityType: "project", entityId: project.id, after: { overrides } });
    const result = repos.validationOverrides.listByProject(project.id);
    res.json({ overrides: result });
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
