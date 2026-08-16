import type { AppConfig } from "../../shared/appConfigTypes";
import { validateAliasUniquenessAcrossDimensionTypes, validateMemberUniquenessAcrossDimensionTypes } from "../../shared/memberUniquenessValidation";
import { validateProjectStructure } from "../../shared/projectValidation";
import { validateDimension } from "../../shared/validationEngine";
import { resolveValidationSeverity } from "../../shared/validationRuleCatalog";
import type { DimensionMemberRecord, DimensionRecord, Severity, ValidationIssue } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export interface ProjectValidationOptions {
  dimensionId?: string;
  ruleOverrides?: Map<string, Severity>;
  duplicateSeverity?: Severity;
}

export async function collectProjectValidation(repos: Repositories, config: AppConfig, projectId: string, options: ProjectValidationOptions = {}): Promise<ValidationIssue[]> {
  const project = await repos.projects.get(projectId);
  if (!project) return [];
  const [dimensions, members, relationships] = await Promise.all([
    await repos.dimensions.listByProject(project.id),
    await repos.members.listByProject(project.id),
    await repos.relationships.listByProject(project.id)
  ]);
  const varyingPropertyValues = await repos.varyingProperties.listVaryingPropertyValues(project.id);
  const propertyDefaults = await repos.propertyDefaults.getEffectiveDefaultsForExport(project.id);
  const selectedDimensions = options.dimensionId ? dimensions.filter((dimension) => dimension.id === options.dimensionId) : dimensions;
  const issues = selectedDimensions.flatMap((dimension) =>
    validateDimension({
      project,
      dimension,
      members: members.filter((member) => member.dimensionId === dimension.id),
      relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
      varyingPropertyValues: varyingPropertyValues.filter((value) => value.dimensionId === dimension.id),
      severities: {
        ...config.validation,
        duplicateMemberSeverity: options.duplicateSeverity ?? config.validation.duplicateMemberSeverity
      },
      propertyDefaults: propertyDefaults.filter((entry) => entry.dimensionType === dimension.dimensionType)
    })
  );

  if (!options.dimensionId) {
    issues.push(...validateProjectStructure({ project, dimensions, config, ruleOverrides: options.ruleOverrides }));
    issues.push(...validateCurrencyReferences(project.id, dimensions, members, config));
  }

  issues.push(
    ...validateMemberUniquenessAcrossDimensionTypes({
      project,
      dimensions,
      members,
      severity: options.duplicateSeverity ?? config.validation.duplicateMemberSeverity,
      ruleOverrides: options.ruleOverrides
    })
  );
  if (config.validation.oneStreamProfile.enabled) {
    issues.push(...validateAliasUniquenessAcrossDimensionTypes({ project, dimensions, members, ruleOverrides: options.ruleOverrides }));
  }

  return issues.map((issue) => ({
    ...issue,
    severity: resolveValidationSeverity(issue.code, issue.severity, options.ruleOverrides)
  })).filter((issue) => issue.severity !== "off");
}

export async function runProjectValidation(repos: Repositories, config: AppConfig, projectId: string, options: ProjectValidationOptions = {}) {
  const issues = await collectProjectValidation(repos, config, projectId, options);

  await repos.issues.replaceForProject(projectId, issues);
  return issues;
}

function validateCurrencyReferences(projectId: string, dimensions: DimensionRecord[], members: DimensionMemberRecord[], config: AppConfig): ValidationIssue[] {
  const allowed = config.validation.oneStreamProfile.validCurrencyCodes;
  if (!allowed || allowed.length === 0) return [];
  const allowedCodes = new Set(allowed.map((value) => value.trim().toUpperCase()).filter(Boolean));
  const entityDimensions = dimensions.filter((dimension) => dimension.dimensionType === "Entity");
  const createdAt = new Date().toISOString();
  return entityDimensions.flatMap((dimension) => members
    .filter((member) => member.dimensionId === dimension.id)
    .flatMap((member) => {
      const raw = member.properties["Default Currency"] ?? member.properties["Currency"];
      const currency = typeof raw === "string" ? raw.trim() : "";
      if (!currency || allowedCodes.has(currency.toUpperCase())) return [];
      return [{
        id: `currency-${member.id}`,
        projectId,
        dimensionId: dimension.id,
        entityType: "member" as const,
        entityId: member.id,
        severity: "warning" as const,
        code: "CROSS_DIMENSION_CURRENCY_INVALID",
        message: `Entity '${member.memberKey}' references currency '${currency}', which is not in the configured authoritative currency list.`,
        fieldName: "Currency",
        rowNumber: member.sourceRowNumber,
        createdAt
      }];
    }));
}
