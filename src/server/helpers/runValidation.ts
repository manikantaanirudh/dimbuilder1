import type { AppConfig } from "../../shared/appConfigTypes";
import { validateMemberUniquenessAcrossDimensionTypes } from "../../shared/memberUniquenessValidation";
import { validateDimension } from "../../shared/validationEngine";
import type { Repositories } from "../db/repositories";

export async function runProjectValidation(repos: Repositories, config: AppConfig, projectId: string) {
  const project = await repos.projects.get(projectId);
  if (!project) return [];
  const [dimensions, members, relationships] = await Promise.all([
    await repos.dimensions.listByProject(project.id),
    await repos.members.listByProject(project.id),
    await repos.relationships.listByProject(project.id)
  ]);
  const varyingPropertyValues = await repos.varyingProperties.listVaryingPropertyValues(project.id);
  const propertyDefaults = await repos.propertyDefaults.getEffectiveDefaultsForExport(project.id);
  const issues = dimensions.flatMap((dimension) =>
    validateDimension({
      project,
      dimension,
      members: members.filter((member) => member.dimensionId === dimension.id),
      relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
      varyingPropertyValues: varyingPropertyValues.filter((value) => value.dimensionId === dimension.id),
      severities: config.validation,
      propertyDefaults: propertyDefaults.filter((entry) => entry.dimensionType === dimension.dimensionType)
    })
  );

  // Project-level rule: DIMENSION_MISSING_FROM_PROJECT
  const requiredTypes = ["Account", "Entity", "Scenario", "Flow"] as const;
  const presentTypes = new Set(dimensions.map(d => d.dimensionType));
  for (const requiredType of requiredTypes) {
    if (!presentTypes.has(requiredType)) {
      issues.push({
        id: `proj-missing-${requiredType}`,
        projectId: project.id,
        dimensionId: dimensions[0]?.id ?? project.id,
        entityType: "dimension",
        entityId: project.id,
        severity: "warning",
        code: "DIMENSION_MISSING_FROM_PROJECT",
        message: `Project is missing a '${requiredType}' dimension. Most OneStream applications require Account, Entity, Scenario, and Flow dimensions.`,
        fieldName: "Dimensions",
        rowNumber: null,
        createdAt: new Date().toISOString()
      });
    }
  }

  // Project-level rule: CROSS_DIMENSION_CURRENCY_INVALID
  // Check if Entity dimension members reference currencies that don't exist as Account members
  const entityDim = dimensions.find(d => d.dimensionType === "Entity");
  const accountDim = dimensions.find(d => d.dimensionType === "Account");
  if (entityDim && accountDim) {
    const entityMembers = members.filter(m => m.dimensionId === entityDim.id);
    const accountKeys = new Set(members.filter(m => m.dimensionId === accountDim.id).map(m => m.memberKey));
    for (const member of entityMembers) {
      const currency = member.properties["Default Currency"] || member.properties["Currency"];
      if (currency && typeof currency === "string" && currency.trim() !== "") {
        // Currency should typically be a valid ISO code, but if it references an Account member that doesn't exist
        if (currency.length > 5 && !accountKeys.has(currency)) {
          issues.push({
            id: `xdim-currency-${member.id}`,
            projectId: project.id,
            dimensionId: entityDim.id,
            entityType: "member",
            entityId: member.id,
            severity: "warning",
            code: "CROSS_DIMENSION_CURRENCY_INVALID",
            message: `Entity '${member.memberKey}' references currency '${currency}' which is not a recognized currency code or Account member.`,
            fieldName: "Default Currency",
            rowNumber: member.sourceRowNumber,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  }

  issues.push(
    ...validateMemberUniquenessAcrossDimensionTypes({
      project,
      dimensions,
      members,
      severity: config.validation.duplicateMemberSeverity
    })
  );

  await repos.issues.replaceForProject(project.id, issues);
  return issues;
}
