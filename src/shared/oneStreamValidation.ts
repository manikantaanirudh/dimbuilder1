import { nanoid } from "nanoid";
import type { OneStreamValidationProfileConfig } from "./appConfigTypes";
import {
  formatQueryMemberReference,
  memberNameRequiresQueryBrackets,
  printableRestrictedCharacter
} from "./memberNamingGuidelines";
import { memberKeyHasAlphanumeric } from "./memberKeyValidation";
import type { PropertyDefaultResolutionEntry } from "./effectiveProperties";
import { filterDefaultsForTarget, resolveEffectiveProperties } from "./effectiveProperties";
import { normalizePropertyLookupName } from "./oneStreamPropertyDictionary";
import { normalizeCellValue } from "./text";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord,
  Severity,
  ValidationIssue,
  VaryingPropertyValueRecord
} from "./types";
import { findDuplicateVaryingPropertyValues } from "./varyingProperties";

export interface ValidateOneStreamProfileInput {
  project: ProjectRecord;
  dimension: DimensionRecord;
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  varyingPropertyValues?: VaryingPropertyValueRecord[];
  profile: OneStreamValidationProfileConfig;
  propertyDefaults?: PropertyDefaultResolutionEntry[];
}

type IssueParams = Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">;

export function validateOneStreamProfile(input: ValidateOneStreamProfileInput): ValidationIssue[] {
  if (!input.profile.enabled) return [];

  const issues: ValidationIssue[] = [];
  const createdAt = new Date().toISOString();

  const addIssue = (params: IssueParams): void => {
    issues.push({
      id: nanoid(),
      projectId: input.project.id,
      dimensionId: input.dimension.id,
      createdAt,
      ...params
    });
  };

  const activeMembers = input.members.filter((member) => member.isActive !== false);
  validateMemberNames(activeMembers, input.profile, addIssue);
  validateAliases(activeMembers, input.profile, addIssue);
  validateSortOrder(activeMembers, input.relationships, input.profile, addIssue);
  validateSharedMembers(input.dimension, input.relationships, input.profile, addIssue);
  validateParentInputWarnings(activeMembers, input.relationships, input.profile, addIssue);
  validateDimensionSpecificRules(
    input.dimension,
    activeMembers,
    input.relationships,
    input.profile,
    input.propertyDefaults,
    addIssue
  );
  validateOneStreamVaryingProperties(input.dimension, input.varyingPropertyValues ?? [], addIssue);

  return issues;
}

function validateMemberNames(
  members: DimensionMemberRecord[],
  profile: OneStreamValidationProfileConfig,
  addIssue: (params: IssueParams) => void
): void {
  const reservedByLower = new Map(profile.reservedWords.map((word) => [word.toLowerCase(), word]));

  for (const member of members) {
    const memberKey = normalizeCellValue(member.memberKey);
    if (!memberKey) continue;

    if (!memberKeyHasAlphanumeric(memberKey)) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "error",
        code: "MEMBER_NAME_ONLY_SPECIAL_CHARACTERS",
        message: `Member '${memberKey}' must include at least one letter or number (cannot be only special characters).`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }

    if (memberKey.length > profile.memberNameMaxLength) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "error",
        code: "MEMBER_NAME_TOO_LONG",
        message: `Member '${memberKey}' exceeds the OneStream limit of ${profile.memberNameMaxLength} characters.`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }

    if (profile.warnOnMemberNameSpaces && /\s/.test(memberKey)) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "info",
        code: "MEMBER_NAME_CONTAINS_SPACE",
        message: `Member '${memberKey}' contains a space. Spaces are allowed in OneStream but not recommended — prefer underscores (e.g. Gross_Income).`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }

    if (profile.warnOnMemberNamePeriods && memberKey.includes(".")) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "info",
        code: "MEMBER_NAME_CONTAINS_PERIOD",
        message: `Member '${memberKey}' contains a period. Periods are allowed but not recommended — prefer underscores instead of periods in the stored name.`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }

    if (memberNameRequiresQueryBrackets(memberKey)) {
      const example = formatQueryMemberReference("Entity", memberKey);
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "info",
        code: "MEMBER_NAME_QUERY_BRACKETS",
        message: `Member '${memberKey}' contains a space or period. Use square brackets when querying, e.g. ${example}.`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }

    const restricted = profile.restrictedCharacters.find((character) => memberKey.includes(character));
    if (restricted) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "error",
        code: "MEMBER_NAME_RESTRICTED_CHARACTER",
        message: `Member '${memberKey}' contains restricted character '${printableRestrictedCharacter(restricted)}'.`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }

    const reservedCanonical = reservedByLower.get(memberKey.toLowerCase());
    if (reservedCanonical && reservedCanonical !== memberKey) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "warning",
        code: "RESERVED_MEMBER_NAME_CASE_MISMATCH",
        message: `Reserved member '${memberKey}' should use canonical casing '${reservedCanonical}'.`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber
      });
    }
  }
}

function validateAliases(
  members: DimensionMemberRecord[],
  profile: OneStreamValidationProfileConfig,
  addIssue: (params: IssueParams) => void
): void {
  const memberKeys = new Set(members.map((member) => normalizeCellValue(member.memberKey).toLowerCase()).filter(Boolean));
  const byAlias = new Map<string, DimensionMemberRecord[]>();

  for (const member of members) {
    const alias = getPropertyValue(member.properties, ["Alias"]);
    if (!alias) continue;
    const normalizedAlias = alias.toLowerCase();
    byAlias.set(normalizedAlias, [...(byAlias.get(normalizedAlias) ?? []), member]);

    if (memberKeys.has(normalizedAlias)) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: profile.duplicateAliasSeverity,
        code: "ALIAS_DUPLICATES_MEMBER_NAME",
        message: `Alias '${alias}' duplicates a member name in this dimension.`,
        fieldName: "Alias",
        rowNumber: member.sourceRowNumber
      });
    }
  }

  for (const [alias, duplicates] of byAlias) {
    if (duplicates.length <= 1) continue;
    for (const member of duplicates) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: profile.duplicateAliasSeverity,
        code: "DUPLICATE_ALIAS",
        message: `Alias '${alias}' appears more than once in this dimension.`,
        fieldName: "Alias",
        rowNumber: member.sourceRowNumber
      });
    }
  }
}

function validateSortOrder(
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  profile: OneStreamValidationProfileConfig,
  addIssue: (params: IssueParams) => void
): void {
  for (const member of members) {
    if (member.rowOrder !== 0) continue;
    addIssue({
      entityType: "member",
      entityId: member.id,
      severity: profile.invalidSortOrderSeverity,
      code: "SORT_ORDER_ZERO",
      message: `Member '${member.memberKey}' has sort order 0.`,
      fieldName: "Sort Order",
      rowNumber: member.sourceRowNumber
    });
  }

  const siblingSorts = new Map<string, DimensionRelationshipRecord[]>();
  for (const relationship of relationships) {
    if (relationship.rowOrder === 0) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: profile.invalidSortOrderSeverity,
        code: "SORT_ORDER_ZERO",
        message: `Relationship '${relationship.parentKey} -> ${relationship.childKey}' has sort order 0.`,
        fieldName: "Sort Order",
        rowNumber: relationship.sourceRowNumber
      });
    }

    if (relationship.rowOrder <= 0 || !relationship.parentKey) continue;
    const key = `${relationship.parentKey.toLowerCase()}::${relationship.rowOrder}`;
    siblingSorts.set(key, [...(siblingSorts.get(key) ?? []), relationship]);
  }

  for (const duplicates of siblingSorts.values()) {
    if (duplicates.length <= 1) continue;
    for (const relationship of duplicates) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: profile.invalidSortOrderSeverity,
        code: "SORT_ORDER_DUPLICATE",
        message: `Siblings under '${relationship.parentKey}' share sort order ${relationship.rowOrder}.`,
        fieldName: "Sort Order",
        rowNumber: relationship.sourceRowNumber
      });
    }
  }
}

function validateSharedMembers(
  dimension: DimensionRecord,
  relationships: DimensionRelationshipRecord[],
  profile: OneStreamValidationProfileConfig,
  addIssue: (params: IssueParams) => void
): void {
  const parentsByChild = new Map<string, Set<string>>();
  const relationshipsByChild = new Map<string, DimensionRelationshipRecord[]>();

  for (const relationship of relationships) {
    const childKey = normalizeCellValue(relationship.childKey);
    const parentKey = normalizeCellValue(relationship.parentKey);
    if (!childKey || !parentKey) continue;
    const child = childKey.toLowerCase();
    parentsByChild.set(child, (parentsByChild.get(child) ?? new Set()).add(parentKey.toLowerCase()));
    relationshipsByChild.set(child, [...(relationshipsByChild.get(child) ?? []), relationship]);
  }

  const allowMultipleParents = dimension.metadata.allowMultipleParents !== false;
  for (const [child, parents] of parentsByChild) {
    if (parents.size <= 1) continue;
    for (const relationship of relationshipsByChild.get(child) ?? []) {
      if (allowMultipleParents) {
        addIssue({
          entityType: "relationship",
          entityId: relationship.id,
          severity: profile.sharedMemberSeverity,
          code: "SHARED_MEMBER_DETECTED",
          message: `Member '${relationship.childKey}' appears under multiple parents.`,
          fieldName: "Child",
          rowNumber: relationship.sourceRowNumber
        });
      } else {
        addIssue({
          entityType: "relationship",
          entityId: relationship.id,
          severity: "error",
          code: "MULTIPLE_PARENT_NOT_ALLOWED",
          message: `Member '${relationship.childKey}' appears under multiple parents, but this dimension is configured as single-parent.`,
          fieldName: "Child",
          rowNumber: relationship.sourceRowNumber
        });
      }
    }
  }
}

function validateParentInputWarnings(
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  profile: OneStreamValidationProfileConfig,
  addIssue: (params: IssueParams) => void
): void {
  const memberByKey = new Map(members.map((member) => [member.memberKey.toLowerCase(), member]));
  const warnedParents = new Set<string>();

  for (const relationship of relationships) {
    const parent = memberByKey.get(relationship.parentKey.toLowerCase());
    if (!parent || warnedParents.has(parent.id)) continue;
    if (!isTruthyOneStreamValue(getPropertyValue(parent.properties, ["Allow Input", "AllowInput"]))) continue;
    warnedParents.add(parent.id);
    addIssue({
      entityType: "member",
      entityId: parent.id,
      severity: profile.parentInputWarningSeverity,
      code: "PARENT_MEMBER_ALLOW_INPUT_WARNING",
      message: `Parent member '${parent.memberKey}' has AllowInput enabled while acting as a hierarchy parent. This is common for accounts accepting manual adjustments but unusual for consolidation-only parents.`,
      fieldName: "Allow Input",
      rowNumber: parent.sourceRowNumber
    });
  }
}

function validateDimensionSpecificRules(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  profile: OneStreamValidationProfileConfig,
  propertyDefaults: PropertyDefaultResolutionEntry[] | undefined,
  addIssue: (params: IssueParams) => void
): void {
  const memberDefaults = filterDefaultsForTarget(propertyDefaults ?? [], dimension.dimensionType, "member");

  if (dimension.dimensionType === "Account") {
    for (const member of members.filter((candidate) => !isReservedMember(candidate.memberKey, profile))) {
      const effectiveProperties = resolveEffectiveProperties(member.properties, memberDefaults);
      if (getPropertyValue(effectiveProperties, ["Account Type", "AccountType"])) continue;
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "warning",
        code: "ACCOUNT_TYPE_MISSING",
        message: `Account member '${member.memberKey}' is missing Account Type.`,
        fieldName: "Account Type",
        rowNumber: member.sourceRowNumber
      });
    }
  }

  if (dimension.dimensionType === "Entity") {
    for (const member of members.filter((candidate) => !isReservedMember(candidate.memberKey, profile))) {
      const effectiveProperties = resolveEffectiveProperties(member.properties, memberDefaults);
      const currency = getPropertyValue(effectiveProperties, ["Currency"]);
      if (!currency) {
        addIssue({
          entityType: "member",
          entityId: member.id,
          severity: "warning",
          code: "ENTITY_CURRENCY_MISSING",
          message: `Entity member '${member.memberKey}' is missing Currency.`,
          fieldName: "Currency",
          rowNumber: member.sourceRowNumber
        });
        continue;
      }
      if (profile.validCurrencyCodes && profile.validCurrencyCodes.length > 0 && !profile.validCurrencyCodes.includes(currency)) {
        addIssue({
          entityType: "member",
          entityId: member.id,
          severity: "warning",
          code: "CROSS_DIMENSION_CURRENCY_INVALID",
          message: `Entity member '${member.memberKey}' has currency '${currency}' outside the configured list.`,
          fieldName: "Currency",
          rowNumber: member.sourceRowNumber
        });
      }
    }

    for (const relationship of relationships) {
      const percentConsol = numericRelationshipValue(relationship, "percentConsol", ["Percent Consol", "Percent Consolidation"]);
      const percentOwnership = numericRelationshipValue(relationship, "percentOwnership", ["Percent Ownership", "Ownership Percent"]);
      if (!isOutOfOwnershipRange(percentConsol) && !isOutOfOwnershipRange(percentOwnership)) continue;
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: profile.invalidPropertyTypeSeverity,
        code: "ENTITY_OWNERSHIP_VALUE_INVALID",
        message: `Entity relationship '${relationship.parentKey} -> ${relationship.childKey}' has ownership or consolidation percentage outside 0-100.`,
        fieldName: "Ownership",
        rowNumber: relationship.sourceRowNumber
      });
    }
  }

  if (profile.securityGroups && profile.securityGroups.length > 0) {
    for (const member of members.filter((candidate) => !isReservedMember(candidate.memberKey, profile))) {
      const effectiveProperties = resolveEffectiveProperties(member.properties, memberDefaults);
      const accessGroup = getPropertyValue(effectiveProperties, ["Access Group", "AccessGroup"]);
      if (!accessGroup || profile.securityGroups.includes(accessGroup)) continue;
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: "warning",
        code: "SECURITY_GROUP_REFERENCE_MISSING",
        message: `Member '${member.memberKey}' references access group '${accessGroup}' which is not in the configured list.`,
        fieldName: "Access Group",
        rowNumber: member.sourceRowNumber
      });
    }
  }

  if (requiresAggregationWeight(dimension)) {
    for (const relationship of relationships) {
      if (numericRelationshipValue(relationship, "aggregationWeight", ["Aggregation Weight", "Weight"]) !== null) continue;
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: "info",
        code: "RELATIONSHIP_WEIGHT_MISSING",
        message: `Relationship '${relationship.parentKey} -> ${relationship.childKey}' is missing Aggregation Weight. Default of 1.0 (100% roll-up) will be used.`,
        fieldName: "Aggregation Weight",
        rowNumber: relationship.sourceRowNumber
      });
    }
  }
}

function validateOneStreamVaryingProperties(
  dimension: DimensionRecord,
  varyingPropertyValues: VaryingPropertyValueRecord[],
  addIssue: (params: IssueParams) => void
): void {
  const dimensionValues = varyingPropertyValues.filter((value) => value.dimensionId === dimension.id);
  for (const duplicate of findDuplicateVaryingPropertyValues(dimensionValues)) {
    for (const value of duplicate.records) {
      addIssue({
        entityType: value.targetType,
        entityId: value.targetId,
        severity: "error",
        code: "VARYING_PROPERTY_DUPLICATE",
        message: `${value.propertyName} has duplicate OneStream varying values for the same target and context.`,
        fieldName: value.propertyName,
        rowNumber: null
      });
    }
  }
}

function getPropertyValue(properties: Record<string, unknown>, fieldNames: string[]): string {
  const lookup = new Map(Object.entries(properties).map(([key, value]) => [normalizePropertyLookupName(key), value]));
  for (const fieldName of fieldNames) {
    const value = lookup.get(normalizePropertyLookupName(fieldName));
    const normalized = normalizeCellValue(value);
    if (normalized) return normalized;
  }
  return "";
}

function isTruthyOneStreamValue(value: string): boolean {
  return ["true", "yes", "y", "1"].includes(value.toLowerCase());
}

function isReservedMember(memberKey: string, profile: OneStreamValidationProfileConfig): boolean {
  const normalized = memberKey.toLowerCase();
  return profile.reservedWords.some((word) => word.toLowerCase() === normalized);
}

function numericRelationshipValue(
  relationship: DimensionRelationshipRecord,
  directKey: "aggregationWeight" | "percentConsol" | "percentOwnership",
  propertyNames: string[]
): number | null {
  const directValue = relationship[directKey];
  if (typeof directValue === "number" && Number.isFinite(directValue)) return directValue;
  const propertyValue = getPropertyValue(relationship.properties, propertyNames);
  if (!propertyValue) return null;
  const numeric = Number(propertyValue);
  return Number.isFinite(numeric) ? numeric : null;
}

function isOutOfOwnershipRange(value: number | null): boolean {
  return value !== null && (value < 0 || value > 100);
}

function requiresAggregationWeight(dimension: DimensionRecord): boolean {
  return dimension.dimensionType !== "Scenario" && dimension.dimensionType !== "Entity";
}

