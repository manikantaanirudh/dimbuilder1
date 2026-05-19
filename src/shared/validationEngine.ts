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
  UnknownXmlData,
  UnknownXmlElementData,
  VaryingPropertyValueRecord,
  ValidationIssue
} from "./types";
import {
  hasInvalidXmlControlCharacters,
  isFormulaError,
  normalizeCellValue
} from "./text";
import {
  findDuplicateVaryingPropertyValues,
  hasVaryingOverrideContext
} from "./varyingProperties";
import {
  findMembersThatBecomeOrphanedAfterRelationshipDeletes,
  isRelationshipOperation
} from "./relationshipOperations";
import { UNKNOWN_XML_DATA_KEY } from "./xmlImport";
import { validateOneStreamProfile } from "./oneStreamValidation";
import type { OneStreamValidationProfileConfig } from "./appConfigTypes";

export interface ValidationSeverityOptions {
  duplicateMemberSeverity: Severity;
  duplicateRelationshipSeverity: Severity;
  unknownRelationshipMemberSeverity: Severity;
  missingRequiredFieldSeverity: Severity;
  circularHierarchySeverity: Severity;
  relationshipsWithNoLocalMembersSeverity: Severity;
  oneStreamProfile?: OneStreamValidationProfileConfig;
}

export interface ValidateDimensionInput {
  project: ProjectRecord;
  dimension: DimensionRecord;
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  varyingPropertyValues?: VaryingPropertyValueRecord[];
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
    relationshipsWithNoLocalMembersSeverity: input.severities?.relationshipsWithNoLocalMembersSeverity ?? "warning",
    oneStreamProfile: input.severities?.oneStreamProfile
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

  validateImportedUnknownXml("dimension", input.dimension.id, input.dimension.metadata, null, addIssue);
  validateMembers(input.dimension.dimensionType, input.members, schema.memberKeyField, schema.booleanFields, schema.numericFields, severities, addIssue);
  validateRelationships(
    input.dimension,
    input.members,
    input.relationships,
    schema.relationshipFields.filter((field) => field.kind === "number").map((field) => field.name),
    severities,
    addIssue
  );
  validateVaryingProperties(
    input.dimension,
    input.members,
    input.relationships,
    input.varyingPropertyValues ?? [],
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

  if (severities.oneStreamProfile?.enabled) {
    issues.push(...validateOneStreamProfile({
      project: input.project,
      dimension: input.dimension,
      members: input.members,
      relationships: input.relationships,
      varyingPropertyValues: input.varyingPropertyValues,
      profile: severities.oneStreamProfile
    }));
  }

  return issues;
}

function validateVaryingProperties(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  varyingPropertyValues: VaryingPropertyValueRecord[],
  severities: ValidationSeverityOptions,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const dimensionValues = varyingPropertyValues.filter((value) => value.dimensionId === dimension.id);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));

  for (const duplicate of findDuplicateVaryingPropertyValues(dimensionValues)) {
    for (const value of duplicate.records) {
      addIssue({
        entityType: value.targetType,
        entityId: value.targetId,
        severity: "error",
        code: "DUPLICATE_VARYING_PROPERTY",
        message: `${value.propertyName} has more than one varying value for the same target and context.`,
        fieldName: value.propertyName,
        rowNumber: rowNumberForVaryingTarget(value, memberById, relationshipById)
      });
    }
  }

  for (const value of dimensionValues) {
    const targetExists = varyingTargetExists(dimension, value, memberById, relationshipById);
    if (!targetExists) {
      addIssue({
        entityType: value.targetType,
        entityId: value.targetId,
        severity: "error",
        code: "VARYING_PROPERTY_TARGET_NOT_FOUND",
        message: `Varying property target '${value.targetId}' was not found in this dimension.`,
        fieldName: value.propertyName,
        rowNumber: null
      });
    }

    const definition = getPropertyDefinitionByName(dimension.dimensionType, value.targetType, value.propertyName);
    if (!definition) {
      addIssue({
        entityType: value.targetType,
        entityId: value.targetId,
        severity: severities.oneStreamProfile?.unknownPropertySeverity ?? "warning",
        code: "UNKNOWN_VARYING_PROPERTY",
        message: `${value.propertyName} is not in the OneStream ${dimension.dimensionType} ${value.targetType} property dictionary.`,
        fieldName: value.propertyName,
        rowNumber: rowNumberForVaryingTarget(value, memberById, relationshipById)
      });
      continue;
    }

    if ((definition.supportsVarying === false || definition.supportsVarying === undefined) && hasVaryingOverrideContext(value)) {
      addIssue({
        entityType: value.targetType,
        entityId: value.targetId,
        severity: "warning",
        code: "NON_VARYING_PROPERTY_OVERRIDE",
        message: `${definition.displayName} is not marked as a varying OneStream property.`,
        fieldName: definition.displayName,
        rowNumber: rowNumberForVaryingTarget(value, memberById, relationshipById)
      });
    }

    validateVaryingDictionaryValue(value, definition, severities, rowNumberForVaryingTarget(value, memberById, relationshipById), addIssue);
  }
}

function varyingTargetExists(
  dimension: DimensionRecord,
  value: VaryingPropertyValueRecord,
  memberById: Map<string, DimensionMemberRecord>,
  relationshipById: Map<string, DimensionRelationshipRecord>
): boolean {
  if (value.targetType === "dimension") return value.targetId === dimension.id;
  if (value.targetType === "member") return memberById.has(value.targetId);
  return relationshipById.has(value.targetId);
}

function rowNumberForVaryingTarget(
  value: Pick<VaryingPropertyValueRecord, "targetType" | "targetId">,
  memberById: Map<string, DimensionMemberRecord>,
  relationshipById: Map<string, DimensionRelationshipRecord>
): number | null {
  if (value.targetType === "member") return memberById.get(value.targetId)?.sourceRowNumber ?? null;
  if (value.targetType === "relationship") return relationshipById.get(value.targetId)?.sourceRowNumber ?? null;
  return null;
}

function validateVaryingDictionaryValue(
  value: VaryingPropertyValueRecord,
  definition: OneStreamPropertyDefinition,
  severities: ValidationSeverityOptions,
  rowNumber: number | null,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const normalized = normalizeCellValue(value.value);
  if (!normalized) return;
  const invalid = (
    (definition.valueType === "enum" && definition.enumValues?.length && !new Set(definition.enumValues.map((candidate) => candidate.toLowerCase())).has(normalized.toLowerCase()))
    || (definition.valueType === "boolean" && !["true", "false"].includes(normalized.toLowerCase()))
    || ((definition.valueType === "number" || definition.valueType === "decimal") && !Number.isFinite(Number(normalized)))
  );

  if (!invalid) return;
  addIssue({
    entityType: value.targetType,
    entityId: value.targetId,
    severity: definition.valueType === "enum"
      ? severities.oneStreamProfile?.invalidEnumSeverity ?? "error"
      : severities.oneStreamProfile?.invalidPropertyTypeSeverity ?? "error",
    code: "INVALID_VARYING_PROPERTY_VALUE",
    message: `${definition.displayName} has an invalid varying property value.`,
    fieldName: definition.displayName,
    rowNumber
  });
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
    validateDictionaryProperties(dimensionType, "member", member, severities, addIssue);
    warnForUnknownProperties(dimensionType, "member", member, severities, addIssue);
    validateImportedUnknownXml("member", member.id, member.properties, member.sourceRowNumber, addIssue);
    for (const [fieldName, value] of Object.entries(member.properties)) {
      if (fieldName === UNKNOWN_XML_DATA_KEY) continue;
      validateTextValue(member, fieldName, value, addIssue);
    }
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
    validateDictionaryProperties(dimension.dimensionType, "relationship", relationship, severities, addIssue);
    warnForUnknownProperties(dimension.dimensionType, "relationship", relationship, severities, addIssue);
    validateImportedUnknownXml("relationship", relationship.id, relationship.properties, relationship.sourceRowNumber, addIssue);

    for (const [fieldName, value] of Object.entries(relationship.properties)) {
      if (fieldName === UNKNOWN_XML_DATA_KEY) continue;
      validateTextValue(relationship, fieldName, value, addIssue);
    }
  }

  validateRelationshipOperations(dimension, members, relationships, addIssue);
}

function validateRelationshipOperations(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const memberKeys = members.map((member) => member.memberKey);
  const destructiveRelationships: DimensionRelationshipRecord[] = [];

  for (const relationship of relationships) {
    const operation = normalizeCellValue(relationship.operation);
    if (!operation) continue;

    if (!isRelationshipOperation(operation)) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: "error",
        code: "RELATIONSHIP_OPERATION_UNSUPPORTED",
        message: `Relationship operation '${operation}' is not supported.`,
        fieldName: "Operation",
        rowNumber: relationship.sourceRowNumber
      });
      continue;
    }

    if (operation === "delete" || operation === "break") destructiveRelationships.push(relationship);

    if (operation === "copy" && dimension.metadata.allowMultipleParents === false) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: "warning",
        code: "COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY",
        message: "Copy operation conflicts with the dimension blueprint single-parent policy.",
        fieldName: "Operation",
        rowNumber: relationship.sourceRowNumber
      });
    }

    if (operation === "move" && !hasOldParentMetadata(relationship)) {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: "warning",
        code: "MOVE_WITHOUT_OLD_PARENT",
        message: "Move operation requires the old parent context before export planning.",
        fieldName: "Operation",
        rowNumber: relationship.sourceRowNumber
      });
    }

    if (operation === "break" && normalizeCellValue(relationship.operationSource).toLowerCase() !== "baseline") {
      addIssue({
        entityType: "relationship",
        entityId: relationship.id,
        severity: "warning",
        code: "BREAK_BUILD_HAS_NO_BASELINE",
        message: "Break operation should be sourced from a baseline comparison.",
        fieldName: "Operation",
        rowNumber: relationship.sourceRowNumber
      });
    }
  }

  for (const memberKey of findMembersThatBecomeOrphanedAfterRelationshipDeletes(memberKeys, relationships, destructiveRelationships)) {
    const relationship = destructiveRelationships.find((candidate) => candidate.childKey === memberKey);
    if (!relationship) continue;
    addIssue({
      entityType: "relationship",
      entityId: relationship.id,
      severity: "warning",
      code: "RELATIONSHIP_DELETE_CREATES_ORPHAN",
      message: `Deleting or breaking this relationship may orphan '${memberKey}'.`,
      fieldName: "Operation",
      rowNumber: relationship.sourceRowNumber
    });
  }
}

function hasOldParentMetadata(relationship: DimensionRelationshipRecord): boolean {
  if (normalizeCellValue(relationship.properties.OldParent || relationship.properties.oldParentKey)) return true;
  return /oldParent(Key)?/i.test(normalizeCellValue(relationship.operationNotes));
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
  severities: ValidationSeverityOptions,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  for (const [fieldName, value] of Object.entries(entity.properties)) {
    if (fieldName === UNKNOWN_XML_DATA_KEY) continue;
    const definition = getPropertyDefinitionByName(dimensionType, targetLevel, fieldName);
    if (!definition) continue;
    validateDictionaryValue(entity, targetLevel, definition, value, severities, addIssue);
  }
}

function validateDictionaryValue(
  entity: DimensionMemberRecord | DimensionRelationshipRecord,
  targetLevel: OneStreamPropertyTargetLevel,
  definition: OneStreamPropertyDefinition,
  value: unknown,
  severities: ValidationSeverityOptions,
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
        severity: severities.oneStreamProfile?.invalidEnumSeverity ?? "error",
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
      severity: severities.oneStreamProfile?.invalidPropertyTypeSeverity ?? "error",
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
      severity: severities.oneStreamProfile?.invalidPropertyTypeSeverity ?? "error",
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
  severities: ValidationSeverityOptions,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const dictionary = getPropertyDefinitionsForDimension(dimensionType, targetLevel);
  for (const fieldName of getUnknownProperties(entity.properties, dictionary).filter((name) => name !== UNKNOWN_XML_DATA_KEY)) {
    if (!normalizeCellValue(entity.properties[fieldName])) continue;
    addIssue({
      entityType: targetLevel === "relationship" ? "relationship" : "member",
      entityId: entity.id,
      severity: severities.oneStreamProfile?.unknownPropertySeverity ?? "warning",
      code: "UNKNOWN_PROPERTY",
      message: `${fieldName} is not in the OneStream ${dimensionType} ${targetLevel} property dictionary.`,
      fieldName: normalizePropertyName(dimensionType, targetLevel, fieldName),
      rowNumber: entity.sourceRowNumber
    });
  }
}

function validateImportedUnknownXml(
  entityType: "dimension" | "member" | "relationship",
  entityId: string,
  source: Record<string, unknown>,
  rowNumber: number | null,
  addIssue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const unknownXml = getUnknownXmlData(source);
  if (!unknownXml) return;

  for (const attributeName of Object.keys(unknownXml.unknownAttributes)) {
    addIssue({
      entityType,
      entityId,
      severity: "info",
      code: unknownAttributeCode(entityType),
      message: `Imported XML attribute '${attributeName}' is not mapped yet and will be preserved on export.`,
      fieldName: attributeName,
      rowNumber
    });
  }

  for (const element of unknownXml.unknownElements.filter((candidate) => !isPreservedPropertyElement(candidate))) {
    addIssue({
      entityType,
      entityId,
      severity: "info",
      code: "XML_UNSUPPORTED_ELEMENT_PRESERVED",
      message: `Imported XML element '${element.name}' is not mapped yet and will be preserved on export.`,
      fieldName: element.name,
      rowNumber
    });
  }
}

function unknownAttributeCode(entityType: "dimension" | "member" | "relationship"): string {
  if (entityType === "dimension") return "XML_UNKNOWN_DIMENSION_ATTRIBUTE";
  if (entityType === "member") return "XML_UNKNOWN_MEMBER_ATTRIBUTE";
  return "XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE";
}

function getUnknownXmlData(source: Record<string, unknown>): UnknownXmlData | null {
  const value = source[UNKNOWN_XML_DATA_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<UnknownXmlData>;
  if (!candidate.unknownAttributes && !candidate.unknownElements) return null;
  return {
    unknownAttributes: isRecord(candidate.unknownAttributes) ? candidate.unknownAttributes as Record<string, string> : {},
    unknownElements: Array.isArray(candidate.unknownElements) ? candidate.unknownElements.filter(isUnknownElementData) : [],
    sourceOrder: typeof candidate.sourceOrder === "number" ? candidate.sourceOrder : 0,
    originalXmlPath: typeof candidate.originalXmlPath === "string" ? candidate.originalXmlPath : undefined,
    sourcePath: typeof candidate.sourcePath === "string" ? candidate.sourcePath : undefined
  };
}

function isPreservedPropertyElement(element: UnknownXmlElementData): boolean {
  return element.name === "property" || Boolean(element.originalXmlPath?.endsWith("/properties/property"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUnknownElementData(value: unknown): value is UnknownXmlElementData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UnknownXmlElementData>;
  return typeof candidate.name === "string"
    && isRecord(candidate.attributes)
    && typeof candidate.sourceOrder === "number";
}
