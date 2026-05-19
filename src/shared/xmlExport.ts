import { getDimensionSchema } from "./dimensionSchemas";
import {
  getPropertyDefinitionByName,
  normalizePropertyLookupName,
  toOneStreamXmlPropertyNameFromDictionary,
  type OneStreamPropertyTargetLevel
} from "./oneStreamPropertyDictionary";
import type {
  DimensionType,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ExportLoadMode,
  FieldDefinition,
  ProjectRecord,
  UnknownXmlData,
  UnknownXmlElementData,
  VaryingPropertyValueRecord
} from "./types";
import { escapeXml, isFormulaError, normalizeCellValue } from "./text";
import { UNKNOWN_XML_DATA_KEY } from "./xmlImport";
import type { RelationshipOperationPlan, RelationshipOperationPlanItem } from "./relationshipOperations";

interface ExportProjectXmlInput {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  varyingPropertyValues?: VaryingPropertyValueRecord[];
}

export interface ExportProjectXmlOptions {
  oneStreamVersionFallback?: string;
  prettyPrint?: boolean;
  skipBlankMemberRows?: boolean;
  skipFormulaErrors?: boolean;
  includeDimensionSourceAttributes?: boolean;
  loadMode?: ExportLoadMode;
  relationshipPlan?: RelationshipOperationPlan;
  dimensionId?: string;
}

const DEFAULT_ONESTREAM_VERSION = "9.2.0.18004";
const defaultExportOptions = {
  prettyPrint: true,
  skipBlankMemberRows: true,
  skipFormulaErrors: true,
  includeDimensionSourceAttributes: true
};

const fieldNameOverrides: Record<string, string> = {
  "# of No Input Periods": "WorkflowNumNoInputTimePeriods",
  "FX Rate Type Revenue Expense": "FxRateTypeForRevenueExpense",
  "FX Rule Type Revenue Expense": "FxRuleTypeForRevenueExpense",
  "FX Rate Type Asset Liability": "FxRateTypeForAssetLiability",
  "FX Rule Type Asset Liability": "FxRuleTypeForAssetLiability",
  "Use Cube FX Settings": "UseCubeFxSettings",
  "Flow Aggregation": "EnableFlowAggregation",
  "Origin Aggregation": "EnableOriginAggregation",
  "IC Aggregation": "EnableICAggregation",
  "UD1 Aggregation": "EnableUD1Aggregation",
  "UD2 Aggregation": "EnableUD2Aggregation",
  "UD3 Aggregation": "EnableUD3Aggregation",
  "UD4 Aggregation": "EnableUD4Aggregation",
  "UD5 Aggregation": "EnableUD5Aggregation",
  "UD6 Aggregation": "EnableUD6Aggregation",
  "UD7 Aggregation": "EnableUD7Aggregation",
  "UD8 Aggregation": "EnableUD8Aggregation",
  "Allow Adj": "AllowAdjustments",
  "Allow Adj From Child": "AllowAdjustmentsFromChildren",
  "Sibling Consol Pass": "SiblingConsolidationPass",
  "Auto Translate Currencies": "AutoTranslationCurrencies",
  "Source Member For Alternate Input Currency": "SourceMemberForAltInputCurrency",
  "Source Member For Data": "AttributeMemberSourceMember",
  "Expression Type": "AttributeMemberExpressionType",
  "Related Dimension Type 1": "AttributeMemberRelatedDimType1",
  "Related Property 1": "AttributeMemberPropType1",
  "Comparison Text 1": "AttributeMemberComparisonText1",
  "Comparison Operator 1": "AttributeMemberOperatorType1",
  "Related Dimension Type 2": "AttributeMemberRelatedDimType2",
  "Related Property 2": "AttributeMemberPropType2",
  "Comparison Text 2": "AttributeMemberComparisonText2",
  "Comparison Operator 2": "AttributeMemberOperatorType2",
  "Parent Sort Order": "ParentSortOrder",
  "Percent Consol": "PercentConsolidation",
  "Percent Ownership": "PercentOwnership",
  "Ownership Type": "OwnershipType",
  "Aggregation Weight": "AggregationWeight"
};

const memberAttributeFieldsByType: Record<string, Record<string, string>> = {
  Scenario: {
    "Read Data Group": "readDataGroup",
    "Read and Write Data Group": "readWriteDataGroup"
  },
  Entity: {
    "Display Group": "displayMemberGroup",
    "Read Group": "readDataGroup",
    "Read Group2": "readDataGroup2",
    "Read Write Group": "readWriteDataGroup",
    "Read Write Group2": "readWriteDataGroup2",
    "Use Cube Data Access Security": "useCubeDataAccessSecurity",
    "Cube Data Cell Access Categories": "dataCellAccessCategories",
    "Cube Conditional Input Categories": "conditionalInputCategories",
    "Cube Data Mgmt Access Categories": "dataMgmtAccessCategories"
  },
  Account: { "Display Group": "displayMemberGroup" },
  Flow: { "Display Group": "displayMemberGroup" },
  UD1: { "Display Group": "displayMemberGroup" },
  UD2: { "Display Group": "displayMemberGroup" },
  UD3: { "Display Group": "displayMemberGroup" },
  UD4: { "Display Group": "displayMemberGroup" },
  UD5: { "Display Group": "displayMemberGroup" },
  UD6: { "Display Group": "displayMemberGroup" },
  UD7: { "Display Group": "displayMemberGroup" },
  UD8: { "Display Group": "displayMemberGroup" }
};

export function exportProjectXml(input: ExportProjectXmlInput, options: ExportProjectXmlOptions = {}): string {
  const exportOptions = { ...defaultExportOptions, ...options };
  const oneStreamVersion = getOneStreamVersion(input.dimensions, options.oneStreamVersionFallback);
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<OneStreamXF version="${escapeXml(oneStreamVersion)}">`,
    "  <metadataRoot>",
    "    <dimensions>"
  ];

  for (const dimension of input.dimensions) {
    lines.push(renderDimensionStart(dimension, exportOptions));
    const unknownXml = getUnknownXmlData(dimension.metadata);
    const dimensionVaryingProperties = renderVaryingPropertyLines(
      input.varyingPropertyValues ?? [],
      dimension,
      "dimension",
      dimension.id,
      10,
      exportOptions
    );
    const preservedDimensionProperties = renderPreservedUnknownPropertyLines(unknownXml, new Set(), 10, exportOptions);
    const dimensionPropertyLines = [...dimensionVaryingProperties, ...preservedDimensionProperties];
    if (dimensionPropertyLines.length > 0) {
      lines.push("        <properties>", ...dimensionPropertyLines, "        </properties>");
    }
    lines.push(...renderPreservedUnknownElementLines(unknownXml, 8, exportOptions));
    lines.push("        <members>");
    for (const member of input.members.filter((candidate) => candidate.dimensionId === dimension.id && (!exportOptions.skipBlankMemberRows || candidate.memberKey))) {
      lines.push(renderMember(dimension, member, input.varyingPropertyValues ?? [], exportOptions));
    }
    lines.push("        </members>");
    lines.push("        <relationships>");
    for (const relationship of input.relationships.filter((candidate) => candidate.dimensionId === dimension.id && candidate.parentKey && candidate.childKey)) {
      lines.push(renderRelationship(dimension, relationship, input.varyingPropertyValues ?? [], exportOptions));
    }
    lines.push("        </relationships>");
    lines.push("      </dimension>");
  }

  lines.push("    </dimensions>");
  if (exportOptions.relationshipPlan && exportOptions.loadMode && exportOptions.loadMode !== "full") {
    lines.push(...renderRelationshipOperationPlan(exportOptions.relationshipPlan, exportOptions));
  }
  lines.push("  </metadataRoot>", "</OneStreamXF>");
  const xml = lines.join("\n");
  return exportOptions.prettyPrint ? xml : xml.replace(/>\s+</g, "><");
}

function renderRelationshipOperationPlan(
  plan: RelationshipOperationPlan,
  options: typeof defaultExportOptions & ExportProjectXmlOptions
): string[] {
  const lines = [
    "    <!-- SR Onestream Dim Builder relationship operation plan. OneStream delete/move XML syntax requires implementation-team confirmation before direct import. -->",
    `    <relationshipOperations ${renderAttributes({
      mode: plan.mode,
      total: plan.summary.total,
      warnings: plan.summary.warnings,
      errors: plan.summary.errors
    }, options)}>`
  ];

  for (const item of [...plan.items].sort(compareRelationshipPlanItemsForXml)) {
    lines.push(`      <relationshipOperation ${renderAttributes({
      operation: item.operation,
      dimensionType: item.dimensionType,
      dimensionName: item.dimensionName,
      parent: item.parentKey,
      child: item.childKey,
      oldParent: item.oldParentKey,
      newParent: item.newParentKey,
      propertyName: item.propertyName,
      oldValue: item.oldValue,
      newValue: item.newValue,
      severity: item.severity,
      relationshipId: item.relationshipId
    }, options)} />`);
  }

  for (const issue of [...plan.errors, ...plan.warnings].sort(compareRelationshipPlanIssuesForXml)) {
    lines.push(`      <relationshipOperationIssue ${renderAttributes({
      code: issue.code,
      severity: issue.severity,
      objectKey: issue.objectKey,
      parent: issue.parentKey,
      child: issue.childKey,
      message: issue.message
    }, options)} />`);
  }

  lines.push("    </relationshipOperations>");
  return lines;
}

function compareRelationshipPlanItemsForXml(left: RelationshipOperationPlanItem, right: RelationshipOperationPlanItem): number {
  return left.dimensionName.localeCompare(right.dimensionName)
    || left.operation.localeCompare(right.operation)
    || left.parentKey.localeCompare(right.parentKey)
    || left.childKey.localeCompare(right.childKey)
    || (left.propertyName ?? "").localeCompare(right.propertyName ?? "");
}

function compareRelationshipPlanIssuesForXml(
  left: RelationshipOperationPlan["warnings"][number],
  right: RelationshipOperationPlan["warnings"][number]
): number {
  return left.severity.localeCompare(right.severity)
    || left.code.localeCompare(right.code)
    || normalizeCellValue(left.objectKey).localeCompare(normalizeCellValue(right.objectKey))
    || normalizeCellValue(left.message).localeCompare(normalizeCellValue(right.message));
}

function getOneStreamVersion(dimensions: DimensionRecord[], fallback = DEFAULT_ONESTREAM_VERSION): string {
  return dimensions
    .map((dimension) => normalizeCellValue(dimension.metadata.oneStreamVersion))
    .find(Boolean) ?? fallback;
}

function renderMember(
  dimension: DimensionRecord,
  member: DimensionMemberRecord,
  varyingPropertyValues: VaryingPropertyValueRecord[],
  options: typeof defaultExportOptions
): string {
  const schema = getDimensionSchema(dimension.dimensionType);
  const attributeFieldMap = memberAttributeFieldsByType[dimension.dimensionType] ?? {};
  const attributes: Record<string, unknown> = {
    name: member.memberKey,
    alias: member.properties.Alias ?? "",
    description: member.description || member.properties.Description || ""
  };

  for (const [fieldName, attributeName] of Object.entries(attributeFieldMap)) {
    attributes[attributeName] = member.properties[fieldName];
  }

  const renderedPropertyLines = renderPropertyLines(
    buildPropertyFields({
      baseFields: schema.memberFields.filter((field) => field.name !== schema.memberKeyField && field.name !== "Description" && !attributeFieldMap[field.name]),
      properties: member.properties,
      dimensionType: dimension.dimensionType,
      targetLevel: "member",
      excludedFieldNames: [schema.memberKeyField, "Description", ...Object.keys(attributeFieldMap)]
    }),
    member.properties,
    12,
    options,
    dimension.dimensionType,
    "member"
  );

  const unknownXml = getUnknownXmlData(member.properties);
  const propertyLines = renderedPropertyLines.map((property) => property.line);
  const varyingPropertyLines = renderVaryingPropertyLines(varyingPropertyValues, dimension, "member", member.id, 12, options);
  const preservedPropertyLines = renderPreservedUnknownPropertyLines(
    unknownXml,
    new Set(renderedPropertyLines.map((property) => property.name)),
    12,
    options
  );
  const allPropertyLines = [...propertyLines, ...varyingPropertyLines, ...preservedPropertyLines];
  const unknownElementLines = renderPreservedUnknownElementLines(unknownXml, 12, options);

  if (allPropertyLines.length === 0 && unknownElementLines.length === 0) return `          <member ${renderAttributes(attributes, options, unknownXml)} />`;
  return [
    `          <member ${renderAttributes(attributes, options, unknownXml)}>`,
    ...(allPropertyLines.length > 0 ? ["            <properties>", ...allPropertyLines, "            </properties>"] : []),
    ...unknownElementLines,
    "          </member>"
  ].join("\n");
}

function renderRelationship(
  dimension: DimensionRecord,
  relationship: DimensionRelationshipRecord,
  varyingPropertyValues: VaryingPropertyValueRecord[],
  options: typeof defaultExportOptions
): string {
  const schema = getDimensionSchema(dimension.dimensionType);
  const properties: Record<string, unknown> = {
    ...relationship.properties,
    Parent: relationship.parentKey,
    Child: relationship.childKey,
    "Aggregation Weight": relationship.aggregationWeight ?? relationship.properties["Aggregation Weight"],
    "Percent Consol": relationship.percentConsol ?? relationship.properties["Percent Consol"],
    "Percent Ownership": relationship.percentOwnership ?? relationship.properties["Percent Ownership"],
    "Ownership Type": relationship.ownershipType || relationship.properties["Ownership Type"]
  };
  const relationshipAttributes: Record<string, unknown> = {
    parent: relationship.parentKey,
    child: relationship.childKey
  };

  if (dimension.dimensionType !== "Scenario" && dimension.dimensionType !== "Entity") {
    relationshipAttributes.aggregationWeight = properties["Aggregation Weight"];
  }

  const basePropertyFields = dimension.dimensionType === "Entity"
    ? schema.relationshipFields.filter((field) => field.name !== "Parent" && field.name !== "Child")
    : [];
  const renderedPropertyLines = renderPropertyLines(
    buildPropertyFields({
      baseFields: basePropertyFields,
      properties,
      dimensionType: dimension.dimensionType,
      targetLevel: "relationship",
      excludedFieldNames: ["Parent", "Child", ...(dimension.dimensionType !== "Scenario" && dimension.dimensionType !== "Entity" ? ["Aggregation Weight"] : [])]
    }),
    properties,
    12,
    options,
    dimension.dimensionType,
    "relationship"
  );

  const unknownXml = getUnknownXmlData(relationship.properties);
  const propertyLines = renderedPropertyLines.map((property) => property.line);
  const varyingPropertyLines = renderVaryingPropertyLines(varyingPropertyValues, dimension, "relationship", relationship.id, 12, options);
  const preservedPropertyLines = renderPreservedUnknownPropertyLines(
    unknownXml,
    new Set(renderedPropertyLines.map((property) => property.name)),
    12,
    options
  );
  const allPropertyLines = [...propertyLines, ...varyingPropertyLines, ...preservedPropertyLines];
  const unknownElementLines = renderPreservedUnknownElementLines(unknownXml, 12, options);

  if (allPropertyLines.length === 0 && unknownElementLines.length === 0) return `          <relationship ${renderAttributes(relationshipAttributes, options, unknownXml)} />`;
  return [
    `          <relationship ${renderAttributes(relationshipAttributes, options, unknownXml)}>`,
    ...(allPropertyLines.length > 0 ? ["            <properties>", ...allPropertyLines, "            </properties>"] : []),
    ...unknownElementLines,
    "          </relationship>"
  ].join("\n");
}

function renderDimensionStart(dimension: DimensionRecord, options: typeof defaultExportOptions): string {
  const attributes: Record<string, unknown> = {
    type: dimension.dimensionType,
    name: dimension.dimensionName,
    accessGroup: dimension.accessGroup,
    maintenanceGroup: dimension.maintenanceGroup,
    description: dimension.description,
    inheritedDim: dimension.inheritedDimension
  };
  if (options.includeDimensionSourceAttributes) {
    attributes.dimMemberSourceType = dimension.metadata.dimMemberSourceType ?? "Standard";
    attributes.dimMemberSourcePath = dimension.metadata.dimMemberSourcePath ?? "";
    attributes.dimMemberSourceNVPairs = dimension.metadata.dimMemberSourceNVPairs ?? "";
  }
  return `      <dimension ${renderAttributes(attributes, options, getUnknownXmlData(dimension.metadata))}>`;
}

interface RenderedPropertyLine {
  name: string;
  line: string;
}

function renderPropertyLines(
  fields: FieldDefinition[],
  properties: Record<string, unknown>,
  indent: number,
  options: typeof defaultExportOptions,
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel
): RenderedPropertyLine[] {
  const prefix = " ".repeat(indent);
  return fields
    .map((field) => [
      toOneStreamPropertyName(field.name, dimensionType, targetLevel),
      normalizeCellValue(getPropertyValue(properties, field.name, dimensionType, targetLevel))
    ] as const)
    .filter(([, value]) => value && (!options.skipFormulaErrors || !isFormulaError(value)))
    .map(([name, value]) => ({ name, line: `${prefix}<property name="${escapeXml(name)}" value="${escapeXml(value)}" />` }));
}

function renderVaryingPropertyLines(
  varyingPropertyValues: VaryingPropertyValueRecord[],
  dimension: DimensionRecord,
  targetLevel: OneStreamPropertyTargetLevel,
  targetId: string,
  indent: number,
  options: typeof defaultExportOptions
): string[] {
  const prefix = " ".repeat(indent);
  return varyingPropertyValues
    .filter((value) => value.dimensionId === dimension.id && value.targetType === targetLevel && value.targetId === targetId)
    .map((value) => [
      value,
      toOneStreamPropertyName(value.propertyName, dimension.dimensionType, targetLevel),
      normalizeCellValue(value.value)
    ] as const)
    .filter(([, , value]) => value && (!options.skipFormulaErrors || !isFormulaError(value)))
    .sort((left, right) => compareVaryingProperties(left[0], right[0], dimension.dimensionType, targetLevel))
    .map(([value, propertyName, propertyValue]) => {
      // TODO: Confirm exact OneStream Load/Extract XML shape for varying properties; this conservative form keeps all context explicit.
      const attributes: Record<string, unknown> = {
        name: propertyName,
        value: propertyValue
      };
      if (value.cubeType) attributes.cubeType = value.cubeType;
      if (value.scenarioType) attributes.scenarioType = value.scenarioType;
      if (value.timeMember) attributes.timeMember = value.timeMember;
      if (value.isDefault) attributes.isDefault = "true";
      return `${prefix}<property ${renderAttributes(attributes, options)} />`;
    });
}

function compareVaryingProperties(
  left: VaryingPropertyValueRecord,
  right: VaryingPropertyValueRecord,
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel
): number {
  const leftDefinition = getPropertyDefinitionByName(dimensionType, targetLevel, left.propertyName);
  const rightDefinition = getPropertyDefinitionByName(dimensionType, targetLevel, right.propertyName);
  if (Boolean(leftDefinition) !== Boolean(rightDefinition)) return leftDefinition ? -1 : 1;
  return (leftDefinition?.displayName ?? left.propertyName).localeCompare(rightDefinition?.displayName ?? right.propertyName)
    || left.cubeType.localeCompare(right.cubeType)
    || left.scenarioType.localeCompare(right.scenarioType)
    || left.timeMember.localeCompare(right.timeMember)
    || left.id.localeCompare(right.id);
}

function renderAttributes(attributes: Record<string, unknown>, options: typeof defaultExportOptions, unknownXml?: UnknownXmlData | null): string {
  const mergedAttributes: Record<string, unknown> = { ...attributes };
  if (unknownXml) {
    const represented = new Set(Object.keys(mergedAttributes).map((name) => name.toLowerCase()));
    for (const [name, value] of Object.entries(unknownXml.unknownAttributes).sort(([left], [right]) => left.localeCompare(right))) {
      if (!represented.has(name.toLowerCase())) mergedAttributes[name] = value;
    }
  }
  return Object.entries(mergedAttributes)
    .filter(([, value]) => value !== null && value !== undefined && (!options.skipFormulaErrors || !isFormulaError(value)))
    .map(([name, value]) => `${name}="${escapeXml(normalizeCellValue(value))}"`)
    .join(" ");
}

export function toOneStreamPropertyName(
  fieldName: string,
  dimensionType?: DimensionType,
  targetLevel?: OneStreamPropertyTargetLevel
): string {
  return fieldNameOverrides[fieldName]
    ?? (dimensionType && targetLevel ? toOneStreamXmlPropertyNameFromDictionary(dimensionType, targetLevel, fieldName) : undefined)
    ?? toXmlAttributeName(fieldName, true);
}

export function toXmlAttributeName(fieldName: string, pascalCase = false): string {
  const cleaned = fieldName
    .replace(/#/g, "Number")
    .replace(/&/g, "And")
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, character: string) => character.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned) return "value";
  return pascalCase ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function buildPropertyFields({
  baseFields,
  properties,
  dimensionType,
  targetLevel,
  excludedFieldNames
}: {
  baseFields: FieldDefinition[];
  properties: Record<string, unknown>;
  dimensionType: DimensionType;
  targetLevel: OneStreamPropertyTargetLevel;
  excludedFieldNames: string[];
}): FieldDefinition[] {
  const represented = new Set<string>();
  const representedFields: FieldDefinition[] = [
    ...baseFields,
    ...excludedFieldNames.map((name) => ({ name, kind: "text" as const }))
  ];
  for (const field of representedFields) {
    addRepresentedField(represented, dimensionType, targetLevel, field.name);
    for (const alias of field.aliases ?? []) addRepresentedField(represented, dimensionType, targetLevel, alias);
  }

  const extraFields = Object.keys(properties)
    .filter((fieldName) => fieldName !== UNKNOWN_XML_DATA_KEY)
    .filter((fieldName) => !represented.has(normalizePropertyLookupName(fieldName)))
    .map((fieldName) => ({ name: fieldName, kind: "text" as const }));

  return [...baseFields, ...extraFields];
}

function addRepresentedField(
  represented: Set<string>,
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  fieldName: string
): void {
  represented.add(normalizePropertyLookupName(fieldName));
  const definition = getPropertyDefinitionByName(dimensionType, targetLevel, fieldName);
  if (!definition) return;
  for (const candidate of [definition.propertyKey, definition.displayName, definition.xmlName, ...definition.aliases]) {
    represented.add(normalizePropertyLookupName(candidate));
  }
}

function getPropertyValue(
  properties: Record<string, unknown>,
  fieldName: string,
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel
): unknown {
  if (properties[fieldName] !== undefined) return properties[fieldName];
  const definition = getPropertyDefinitionByName(dimensionType, targetLevel, fieldName);
  if (!definition) return undefined;
  for (const candidate of [definition.displayName, definition.propertyKey, definition.xmlName, ...definition.aliases]) {
    if (properties[candidate] !== undefined) return properties[candidate];
  }
  return undefined;
}

function getUnknownXmlData(source: Record<string, unknown>): UnknownXmlData | null {
  const value = source[UNKNOWN_XML_DATA_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<UnknownXmlData>;
  return {
    unknownAttributes: isRecord(candidate.unknownAttributes) ? normalizeStringRecord(candidate.unknownAttributes) : {},
    unknownElements: Array.isArray(candidate.unknownElements) ? candidate.unknownElements.filter(isUnknownElementData) : [],
    originalXmlPath: typeof candidate.originalXmlPath === "string" ? candidate.originalXmlPath : undefined,
    sourcePath: typeof candidate.sourcePath === "string" ? candidate.sourcePath : undefined,
    sourceOrder: typeof candidate.sourceOrder === "number" ? candidate.sourceOrder : 0
  };
}

function renderPreservedUnknownPropertyLines(
  unknownXml: UnknownXmlData | null,
  emittedPropertyNames: Set<string>,
  indent: number,
  options: typeof defaultExportOptions
): string[] {
  if (!unknownXml) return [];
  const prefix = " ".repeat(indent);
  const emitted = new Set([...emittedPropertyNames].map(normalizePropertyLookupName));
  return unknownXml.unknownElements
    .filter(isPreservedPropertyElement)
    .sort(compareUnknownElements)
    .map((element) => toPreservedPropertyAttributes(element))
    .filter((attributes): attributes is Record<string, string> => Boolean(attributes))
    .filter((attributes) => !emitted.has(normalizePropertyLookupName(attributes.name ?? "")))
    .filter((attributes) => normalizeCellValue(attributes.value) && (!options.skipFormulaErrors || !isFormulaError(attributes.value)))
    .map((attributes) => `${prefix}<property ${renderAttributes(attributes, options)} />`);
}

function renderPreservedUnknownElementLines(
  unknownXml: UnknownXmlData | null,
  indent: number,
  options: typeof defaultExportOptions
): string[] {
  if (!unknownXml) return [];
  const prefix = " ".repeat(indent);
  return unknownXml.unknownElements
    .filter((element) => !isPreservedPropertyElement(element))
    .sort(compareUnknownElements)
    .map((element) => renderUnknownElement(element, prefix, options))
    .filter(Boolean);
}

function isPreservedPropertyElement(element: UnknownXmlElementData): boolean {
  return element.name === "property" || Boolean(element.originalXmlPath?.endsWith("/properties/property"));
}

function toPreservedPropertyAttributes(element: UnknownXmlElementData): Record<string, string> | null {
  const propertyName = element.attributes.name || (element.name === "property" ? "" : element.name);
  const value = element.attributes.value ?? element.text ?? "";
  if (!propertyName) return null;
  return {
    name: propertyName,
    value,
    ...Object.fromEntries(
      Object.entries(element.attributes)
        .filter(([name]) => name !== "name" && name !== "value")
        .sort(([left], [right]) => left.localeCompare(right))
    )
  };
}

function renderUnknownElement(element: UnknownXmlElementData, prefix: string, options: typeof defaultExportOptions): string {
  const text = normalizeCellValue(element.text ?? "");
  if (text && options.skipFormulaErrors && isFormulaError(text)) return "";
  const attributes = renderAttributes(
    Object.fromEntries(Object.entries(element.attributes).sort(([left], [right]) => left.localeCompare(right))),
    options
  );
  const attributeText = attributes ? ` ${attributes}` : "";
  if (!text) return `${prefix}<${element.name}${attributeText} />`;
  return `${prefix}<${element.name}${attributeText}>${escapeXml(text)}</${element.name}>`;
}

function compareUnknownElements(left: UnknownXmlElementData, right: UnknownXmlElementData): number {
  return left.sourceOrder - right.sourceOrder || left.name.localeCompare(right.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, normalizeCellValue(value)]));
}

function isUnknownElementData(value: unknown): value is UnknownXmlElementData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UnknownXmlElementData>;
  return typeof candidate.name === "string"
    && isRecord(candidate.attributes)
    && typeof candidate.sourceOrder === "number";
}
