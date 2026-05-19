import { nanoid } from "nanoid";
import { getDimensionSchema } from "./dimensionSchemas";
import { analyzeHierarchy } from "./hierarchy";
import {
  getPropertyDefinitionByName,
  getPropertyDefinitionsForDimension,
  getUnknownProperties,
  normalizePropertyName,
  type OneStreamPropertyDefinition,
  type OneStreamPropertyTargetLevel
} from "./oneStreamPropertyDictionary";
import type {
  DimensionType,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord,
  Severity,
  ValidationIssue
} from "./types";
import {
  hasInvalidXmlControlCharacters,
  isFormulaError,
  normalizeCellValue
} from "./text";

export interface ValidationSeverityOptions {
  duplicateMemberSeverity: Severity;
  duplicateRelationshipSeverity: Severity;
  unknownRelationshipMemberSeverity: Severity;
  missingRequiredFieldSeverity: Severity;
  circularHierarchySeverity: Severity;
  relationshipsWithNoLocalMembersSeverity: Severity;
}

export interface ValidateDimensionInput {
  project: ProjectRecord;
  dimension: DimensionRecord;
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  duplicateSeverity?: Severity;
  severities?: ValidationSeverityOptions;
}

export function validateDimension(input: ValidateDimensionInput): ValidationIssue[] {
  const schema = getDimensionSchema(input.dimension.dimensionType);
  const issues: ValidationIssue[] = [];
  const createdAt = new Date().toISOString();
  const severities: ValidationSeverityOptions = {
    duplicateMemberSeverity: input.severities?.duplicateMemberSeverity ?? input.duplicateSeverity ?? schema.duplicateSeverity,
    duplicateRelationshipSeverity: input.severities?.duplicateRelationshipSeverity ?? "warning",
    unknownRelationshipMemberSeverity: input.severities?.unknownRelationshipMemberSeverity ?? "warning",
    missingRequiredFieldSeverity: input.severities?.missingRequiredFieldSeverity ?? "error",
    circularHierarchySeverity: input.severities?.circularHierarchySeverity ?? "error",
    relationshipsWithNoLocalMembersSeverity: input.severities?.relationshipsWithNoLocalMembersSeverity ?? "warning"
  };

  function addIssue(params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">): void {
    issues.push({
      id: nanoid(),
      projectId: input.project.id,
      dimensionId: input.dimension.id,
      createdAt,
      ...params
    });
  }

  if (!input.dimension.dimensionType) {
    addIssue({
      entityType: "dimension",
      entityId: input.dimension.id,
      severity: severities.missingRequiredFieldSeverity,
      code: "DIMENSION_TYPE_REQUIRED",
      message: "Dimension Type is required.",
      fieldName: "Dimension Type",
      rowNumber: 1
    });
  }

  if (!input.dimension.dimensionName) {
    addIssue({
      entityType: "dimension",
      entityId: input.dimension.id,
      severity: severities.missingRequiredFieldSeverity,
      code: "DIMENSION_NAME_REQUIRED",
      message: "Dimension Name is required.",
      fieldName: "Dimension Name",
      rowNumber: 2
    });
  }

  validateMembers(input.dimension.dimensionType, input.members, schema.memberKeyField, schema.booleanFields, schema.numericFields, severities, addIssue);
  validateRelationships(
    input.dimension,
    input.members,
    input.relationships,
    schema.relationshipFields.filter((field) => field.kind === "number").map((field) => field.name),
    severities,
    addIssue
  );

  const hierarchy = analyzeHierarchy(input.relationships, input.members.map((member) => member.memberKey));
  if (hierarchy.hasCycle) {
    addIssue({
      entityType: "dimension",
      entityId: input.dimension.id,
      severity: severities.circularHierarchySeverity,
      code: "CIRCULAR_HIERARCHY",
      message: "Hierarchy contains a circular parent-child reference.",
      fieldName: "Relationships",
      rowNumber: null
    });
  }

  for (const relationshipId of hierarchy.duplicateRelationshipIds) {
    addIssue({
      entityType: "relationship",
      entityId: relationshipId,
      severity: severities.duplicateRelationshipSeverity,
      code: "DUPLICATE_RELATIONSHIP",
      message: "Duplicate parent-child relationship.",
      fieldName: "Parent/Child",
      rowNumber: null
    });
  }

  for (const memberKey of hierarchy.orphanMemberKeys.slice(0, 100)) {
    const member = input.members.find((candidate) => candidate.memberKey === memberKey);
    if (!member) continue;
    addIssue({
      entityType: "member",
      entityId: member.id,
      severity: "warning",
      code: "ORPHAN_MEMBER",
      message: `Member '${memberKey}' is not reachable from a relationship root.`,
      fieldName: "Relationships",
      rowNumber: member.sourceRowNumber
    });
  }

  if (input.relationships.length > 0 && input.members.length === 0) {
    addIssue({
      entityType: "dimension",
      entityId: input.dimension.id,
      severity: severities.relationshipsWithNoLocalMembersSeverity,
      code: "RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS",
      message: "Dimension has relationships but no local members. This can be valid for inherited dimensions.",
      fieldName: "Relationships",
      rowNumber: null
    });
  }

  return issues;
}

function validateMembers(
  dimensionType: DimensionType,
  members: DimensionMemberRecord[],
  memberKeyField: string,
  booleanFields: string[],
  numericFields: string[],
  severities: ValidationSeverityOptions,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const byKey = new Map<string, DimensionMemberRecord[]>();

  for (const member of members) {
    if (!member.memberKey) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: severities.missingRequiredFieldSeverity,
        code: "MEMBER_KEY_REQUIRED",
        message: "Member key is required.",
        fieldName: memberKeyField,
        rowNumber: member.sourceRowNumber
      });
    }

    if (member.memberKey) byKey.set(member.memberKey, [...(byKey.get(member.memberKey) ?? []), member]);

    for (const fieldName of booleanFields) validateBooleanField(member, fieldName, addIssue);
    for (const fieldName of numericFields) validateNumericField(member, fieldName, addIssue);
    validateDictionaryProperties(dimensionType, "member", member, addIssue);
    warnForUnknownProperties(dimensionType, "member", member, addIssue);
    for (const [fieldName, value] of Object.entries(member.properties)) validateTextValue(member, fieldName, value, addIssue);
  }

  for (const [memberKey, duplicates] of byKey) {
    if (duplicates.length <= 1) continue;
    for (const member of duplicates) {
      addIssue({
        entityType: "member",
        entityId: member.id,
        severity: severities.duplicateMemberSeverity,
        code: "DUPLICATE_MEMBER",
        message: `Member '${memberKey}' appears more than once in this dimension.`,
        fieldName: memberKeyField,
        rowNumber: member.sourceRowNumber
      });
    }
  }
}

function validateRelationships(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  numericFields: string[],
  severities: ValidationSeverityOptions,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const memberKeys = new Set(members.map((member) => member.memberKey).filter(Boolean));

  for (const relationship of relationships) {
    if (!relationship.parentKey) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: severities.missingRequiredFieldSeverity,
        code: "RELATIONSHIP_PARENT_REQUIRED",
        message: "Relationship Parent is required.",
        fieldName: "Parent",
        rowNumber: relationship.sourceRowNumber
      });
    }

    if (!relationship.childKey) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: severities.missingRequiredFieldSeverity,
        code: "RELATIONSHIP_CHILD_REQUIRED",
        message: "Relationship Child is required.",
        fieldName: "Child",
        rowNumber: relationship.sourceRowNumber
      });
    }

    if (relationship.childKey && memberKeys.size > 0 && !memberKeys.has(relationship.childKey) && !dimension.inheritedDimension) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: severities.unknownRelationshipMemberSeverity,
        code: "UNKNOWN_RELATIONSHIP_CHILD",
        message: `Relationship child '${relationship.childKey}' does not exist in local members.`,
        fieldName: "Child",
        rowNumber: relationship.sourceRowNumber
      });
    }

    for (const fieldName of numericFields) validateNumericField(relationship, fieldName, addIssue);
    validateDictionaryProperties(dimension.dimensionType, "relationship", relationship, addIssue);
    warnForUnknownProperties(dimension.dimensionType, "relationship", relationship, addIssue);

    for (const [fieldName, value] of Object.entries(relationship.properties)) {
      validateTextValue(relationship, fieldName, value, addIssue);
    }
  }
}

function validateBooleanField(
  member: DimensionMemberRecord,
  fieldName: string,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const value = normalizeCellValue(member.properties[fieldName]);
  if (!value) return;
  if (!["true", "false"].includes(value.toLowerCase())) {
    addIssue({
      entityType: "member",
      entityId: member.id,
      severity: "error",
      code: "INVALID_BOOLEAN",
      message: `${fieldName} must be TRUE or FALSE.`,
      fieldName,
      rowNumber: member.sourceRowNumber
    });
  }
}

function validateNumericField(
  entity: DimensionMemberRecord | DimensionRelationshipRecord,
  fieldName: string,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const value = normalizeCellValue(entity.properties[fieldName]);
  if (!value) return;
  if (!Number.isFinite(Number(value))) {
    addIssue({
      entityType: "memberKey" in entity ? "member" : "relationship",
      entityId: entity.id,
      severity: "error",
      code: "INVALID_NUMBER",
      message: `${fieldName} must be numeric.`,
      fieldName,
      rowNumber: entity.sourceRowNumber
    });
  }
}

function validateTextValue(
  entity: DimensionMemberRecord | DimensionRelationshipRecord,
  fieldName: string,
  value: unknown,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const normalized = normalizeCellValue(value);
  if (!normalized) return;
  if (isFormulaError(normalized)) {
    addIssue({
      entityType: "memberKey" in entity ? "member" : "relationship",
      entityId: entity.id,
      severity: "error",
      code: "FORMULA_ERROR_VALUE",
      message: `${fieldName} contains an Excel formula error value.`,
      fieldName,
      rowNumber: entity.sourceRowNumber
    });
  }
  if (hasInvalidXmlControlCharacters(normalized)) {
    addIssue({
      entityType: "memberKey" in entity ? "member" : "relationship",
      entityId: entity.id,
      severity: "error",
      code: "XML_INVALID_CHARACTER",
      message: `${fieldName} contains XML-invalid control characters.`,
      fieldName,
      rowNumber: entity.sourceRowNumber
    });
  }
}

function validateDictionaryProperties(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  entity: DimensionMemberRecord | DimensionRelationshipRecord,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  for (const [fieldName, value] of Object.entries(entity.properties)) {
    const definition = getPropertyDefinitionByName(dimensionType, targetLevel, fieldName);
    if (!definition) continue;
    validateDictionaryValue(entity, targetLevel, definition, value, addIssue);
  }
}

function validateDictionaryValue(
  entity: DimensionMemberRecord | DimensionRelationshipRecord,
  targetLevel: OneStreamPropertyTargetLevel,
  definition: OneStreamPropertyDefinition,
  value: unknown,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const normalized = normalizeCellValue(value);
  if (!normalized) return;
  const entityType = targetLevel === "relationship" ? "relationship" : "member";

  if (definition.valueType === "enum" && definition.enumValues?.length) {
    const allowed = new Set(definition.enumValues.map((candidate) => candidate.toLowerCase()));
    if (!allowed.has(normalized.toLowerCase())) {
      addIssue({
        entityType,
        entityId: entity.id,
        severity: "error",
        code: "INVALID_ENUM_VALUE",
        message: `${definition.displayName} must be one of: ${definition.enumValues.join(", ")}.`,
        fieldName: definition.displayName,
        rowNumber: entity.sourceRowNumber
      });
    }
  }

  if (definition.valueType === "boolean" && !["true", "false"].includes(normalized.toLowerCase())) {
    addIssue({
      entityType,
      entityId: entity.id,
      severity: "error",
      code: "INVALID_PROPERTY_TYPE",
      message: `${definition.displayName} must be TRUE or FALSE.`,
      fieldName: definition.displayName,
      rowNumber: entity.sourceRowNumber
    });
  }

  if ((definition.valueType === "number" || definition.valueType === "decimal") && !Number.isFinite(Number(normalized))) {
    addIssue({
      entityType,
      entityId: entity.id,
      severity: "error",
      code: "INVALID_PROPERTY_TYPE",
      message: `${definition.displayName} must be numeric.`,
      fieldName: definition.displayName,
      rowNumber: entity.sourceRowNumber
    });
  }
}

function warnForUnknownProperties(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  entity: DimensionMemberRecord | DimensionRelationshipRecord,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const dictionary = getPropertyDefinitionsForDimension(dimensionType, targetLevel);
  for (const fieldName of getUnknownProperties(entity.properties, dictionary)) {
    if (!normalizeCellValue(entity.properties[fieldName])) continue;
    addIssue({
      entityType: targetLevel === "relationship" ? "relationship" : "member",
      entityId: entity.id,
      severity: "warning",
      code: "UNKNOWN_PROPERTY",
      message: `${fieldName} is not in the OneStream ${dimensionType} ${targetLevel} property dictionary.`,
      fieldName: normalizePropertyName(dimensionType, targetLevel, fieldName),
      rowNumber: entity.sourceRowNumber
    });
  }
}
