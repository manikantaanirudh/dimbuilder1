import { Router } from "express";
import { supportedConfigSeverities, type AppConfig, type OneStreamValidationProfileConfig } from "../../shared/appConfigTypes";
import type { Severity } from "../../shared/types";
import { VALIDATION_RULE_CATALOG_VERSION, VALIDATION_RULE_TARGET_VERSION, canOverrideValidationRule, getValidationRule, getValidationRuleCatalog, isExportBlockingValidationIssue, resolveValidationSeverity } from "../../shared/validationRuleCatalog";
import { requireProjectRole } from "../acl/projectACL";
import { collectProjectValidation } from "../helpers/runValidation";
import type { Repositories } from "../db/repositories";

export function createValidationRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();
  const viewer = requireProjectRole(repos, "viewer");

  router.post("/:projectId/run", viewer, async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const oneStreamProfile = resolveValidationProfile(req.body, config);
    if (!oneStreamProfile) return res.status(400).json({ error: "profile must be 'default' or 'onestream'" });

    // Load per-project validation overrides
    const projectOverrides = await repos.validationOverrides.listByProject(project.id);
    const overrideSeverityMap = new Map(projectOverrides.map(o => [o.ruleCode, o.severity as Severity]));

    const runConfig: AppConfig = { ...config, validation: { ...config.validation, oneStreamProfile } };
    const dimensionId = typeof req.body?.dimensionId === "string" ? req.body.dimensionId : undefined;
    const issues = await collectProjectValidation(repos, runConfig, project.id, {
      dimensionId,
      duplicateSeverity: isSeverity(req.body?.duplicateSeverity) ? req.body.duplicateSeverity : undefined,
      ruleOverrides: overrideSeverityMap
    });

    if (dimensionId) {
      const existingIssues = await repos.issues.listByProject(project.id);
      const otherIssues = existingIssues.filter(issue => issue.dimensionId !== dimensionId);
      const mergedIssues = [...otherIssues, ...issues];
      await repos.issues.replaceForProject(project.id, mergedIssues);
      const blockingCount = mergedIssues.filter(isBlockingIssue).length;
      await repos.validationSnapshots.create({ projectId: project.id, projectUpdatedAt: project.updatedAt, issueCount: mergedIssues.length, blockingCount, result: validationSnapshotResult(oneStreamProfile, dimensionId) });
      await repos.audit.record({ projectId: project.id, action: "validation.run", entityType: "project", entityId: project.id, after: { issues: mergedIssues.length } });
      res.json({ issues: mergedIssues });
    } else {
      await repos.issues.replaceForProject(project.id, issues);
      const blockingCount = issues.filter(isBlockingIssue).length;
      await repos.validationSnapshots.create({ projectId: project.id, projectUpdatedAt: project.updatedAt, issueCount: issues.length, blockingCount, result: validationSnapshotResult(oneStreamProfile, null) });
      await repos.audit.record({ projectId: project.id, action: "validation.run", entityType: "project", entityId: project.id, after: { issues: issues.length } });
      res.json({ issues });
    }
  });

  return router;
}

type ProjectValidationRouterDeps = { repos: Repositories; config?: AppConfig; getAI?: unknown };

export function createProjectValidationRouter({ repos }: ProjectValidationRouterDeps): Router {
  const router = Router({ mergeParams: true });
  const viewer = requireProjectRole(repos, "viewer");

  router.get("/issues", viewer, async (req, res) => {
    const params = req.params as Record<string, string>;
    res.json(await repos.issues.listByProject(params.projectId));
  });

  router.get("/validation-rules", viewer, async (req, res) => {
    const params = req.params as Record<string, string>;
    const project = await repos.projects.get(params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = await repos.validationOverrides.listByProject(project.id);
    const overrideMap = new Map(overrides.map((override) => [override.ruleCode, override.severity]));
    const rules = getValidationRuleCatalog().map((rule) => {
      const override = overrideMap.get(rule.code);
      const validOverride = override && canOverrideValidationRule(rule.code, override as Severity) ? override as Severity : undefined;
      return {
        ...rule,
        effectiveSeverity: resolveValidationSeverity(rule.code, validOverride ?? rule.defaultSeverity),
        active: validOverride !== "off",
        overridden: Boolean(validOverride),
        legacyOverride: override && !validOverride
          ? { severity: override, reason: getValidationRule(rule.code)?.locked ? "locked_rule" as const : "illegal_severity" as const }
          : undefined
      };
    });
    const knownCodes = new Set(rules.map((rule) => rule.code));
    const legacyOverrides = overrides.filter((override) => !knownCodes.has(override.ruleCode)).map((override) => ({ ...override, reason: "unknown_rule" as const }));
    res.json({ catalogVersion: VALIDATION_RULE_CATALOG_VERSION, targetVersion: VALIDATION_RULE_TARGET_VERSION, rules, legacyOverrides });
  });

  router.get("/validation-config", viewer, async (req, res) => {
    const params = req.params as Record<string, string>;
    const project = await repos.projects.get(params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = await repos.validationOverrides.listByProject(project.id);
    res.json({ overrides });
  });

  router.put("/validation-config", viewer, async (req, res) => {
    return replaceValidationConfig(req, res, repos);
  });

  router.post("/validation-config", viewer, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", "Wed, 10 Feb 2027 00:00:00 GMT");
    return replaceValidationConfig(req, res, repos);
  });

  return router;
}

async function replaceValidationConfig(req: any, res: any, repos: Repositories): Promise<void> {
    const params = req.params as Record<string, string>;
    const project = await repos.projects.get(params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = req.body?.overrides;
    if (!Array.isArray(overrides)) return res.status(400).json({ error: "overrides must be an array" });
    const normalized = overrides.map((override: unknown) => {
      if (!isRecord(override) || typeof override.ruleCode !== "string" || typeof override.severity !== "string") return { error: "each override requires ruleCode and severity" };
      return { ruleCode: override.ruleCode, severity: override.severity };
    });
    const invalid = normalized.find((override) => "error" in override || !getValidationRule(override.ruleCode) || (override.severity !== "default" && !canOverrideValidationRule(override.ruleCode, override.severity as Severity)));
    if (invalid) {
      const message = "error" in invalid
        ? invalid.error
        : !getValidationRule(invalid.ruleCode)
          ? `unknown rule code '${invalid.ruleCode}'`
          : getValidationRule(invalid.ruleCode)?.locked
            ? `rule '${invalid.ruleCode}' is locked`
            : `severity '${invalid.severity}' is not allowed for '${invalid.ruleCode}'`;
      return res.status(400).json({ error: message });
    }
    const current = await repos.validationOverrides.listByProject(project.id);
    const nextCodes = new Set(normalized.filter((override): override is { ruleCode: string; severity: string } => !("error" in override) && override.severity !== "default").map((override) => override.ruleCode));
    for (const existing of current) {
      if (!nextCodes.has(existing.ruleCode)) await repos.validationOverrides.deleteByProject(project.id, existing.ruleCode);
    }
    for (const override of normalized) {
      if ("error" in override || override.severity === "default") continue;
      await repos.validationOverrides.upsert(project.id, override.ruleCode, override.severity);
    }
    await repos.audit.record({ projectId: project.id, action: "validation.configUpdate", entityType: "project", entityId: project.id, after: { overrides } });
    const result = await repos.validationOverrides.listByProject(project.id);
    res.json({ overrides: result });
}

function isBlockingIssue(issue: { code: string; severity: Severity }): boolean {
  return isExportBlockingValidationIssue(issue);
}

function validationSnapshotResult(profile: OneStreamValidationProfileConfig, dimensionId: string | null): Record<string, unknown> {
  return { profile: profile.enabled ? "onestream" : "default", dimensionId, catalogVersion: VALIDATION_RULE_CATALOG_VERSION, targetVersion: VALIDATION_RULE_TARGET_VERSION };
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
