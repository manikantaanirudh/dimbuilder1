import { getDimensionSchema } from "./dimensionSchemas";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  FieldDefinition,
  ProjectRecord
} from "./types";
import { escapeXml, isFormulaError, normalizeCellValue } from "./text";

interface ExportProjectXmlInput {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export interface ExportProjectXmlOptions {
  oneStreamVersionFallback?: string;
  prettyPrint?: boolean;
  skipBlankMemberRows?: boolean;
  skipFormulaErrors?: boolean;
  includeDimensionSourceAttributes?: boolean;
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
    lines.push("        <members>");
    for (const member of input.members.filter((candidate) => candidate.dimensionId === dimension.id && (!exportOptions.skipBlankMemberRows || candidate.memberKey))) {
      lines.push(renderMember(dimension, member, exportOptions));
    }
    lines.push("        </members>");
    lines.push("        <relationships>");
    for (const relationship of input.relationships.filter((candidate) => candidate.dimensionId === dimension.id && candidate.parentKey && candidate.childKey)) {
      lines.push(renderRelationship(dimension, relationship, exportOptions));
    }
    lines.push("        </relationships>");
    lines.push("      </dimension>");
  }

  lines.push("    </dimensions>", "  </metadataRoot>", "</OneStreamXF>");
  const xml = lines.join("\n");
  return exportOptions.prettyPrint ? xml : xml.replace(/>\s+</g, "><");
}

function getOneStreamVersion(dimensions: DimensionRecord[], fallback = DEFAULT_ONESTREAM_VERSION): string {
  return dimensions
    .map((dimension) => normalizeCellValue(dimension.metadata.oneStreamVersion))
    .find(Boolean) ?? fallback;
}

function renderMember(dimension: DimensionRecord, member: DimensionMemberRecord, options: typeof defaultExportOptions): string {
  const schema = getDimensionSchema(dimension.dimensionType);
  const attributeFieldMap = memberAttributeFieldsByType[dimension.dimensionType] ?? {};
  const attributes: Record<string, unknown> = {
    name: member.memberKey,
    alias: "",
    description: member.description || member.properties.Description || ""
  };

  for (const [fieldName, attributeName] of Object.entries(attributeFieldMap)) {
    attributes[attributeName] = member.properties[fieldName];
  }

  const propertyLines = renderPropertyLines(
    schema.memberFields.filter((field) => field.name !== schema.memberKeyField && field.name !== "Description" && !attributeFieldMap[field.name]),
    member.properties,
    12,
    options
  );

  if (propertyLines.length === 0) return `          <member ${renderAttributes(attributes, options)} />`;
  return [
    `          <member ${renderAttributes(attributes, options)}>`,
    "            <properties>",
    ...propertyLines,
    "            </properties>",
    "          </member>"
  ].join("\n");
}

function renderRelationship(dimension: DimensionRecord, relationship: DimensionRelationshipRecord, options: typeof defaultExportOptions): string {
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

  const propertyFields = dimension.dimensionType === "Entity"
    ? schema.relationshipFields.filter((field) => field.name !== "Parent" && field.name !== "Child")
    : [];
  const propertyLines = renderPropertyLines(propertyFields, properties, 12, options);

  if (propertyLines.length === 0) return `          <relationship ${renderAttributes(relationshipAttributes, options)} />`;
  return [
    `          <relationship ${renderAttributes(relationshipAttributes, options)}>`,
    "            <properties>",
    ...propertyLines,
    "            </properties>",
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
  return `      <dimension ${renderAttributes(attributes, options)}>`;
}

function renderPropertyLines(
  fields: FieldDefinition[],
  properties: Record<string, unknown>,
  indent: number,
  options: typeof defaultExportOptions
): string[] {
  const prefix = " ".repeat(indent);
  return fields
    .map((field) => [toOneStreamPropertyName(field.name), normalizeCellValue(properties[field.name])] as const)
    .filter(([, value]) => value && (!options.skipFormulaErrors || !isFormulaError(value)))
    .map(([name, value]) => `${prefix}<property name="${escapeXml(name)}" value="${escapeXml(value)}" />`);
}

function renderAttributes(attributes: Record<string, unknown>, options: typeof defaultExportOptions): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && (!options.skipFormulaErrors || !isFormulaError(value)))
    .map(([name, value]) => `${name}="${escapeXml(normalizeCellValue(value))}"`)
    .join(" ");
}

export function toOneStreamPropertyName(fieldName: string): string {
  return fieldNameOverrides[fieldName] ?? toXmlAttributeName(fieldName, true);
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
