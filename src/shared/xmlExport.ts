import { getDimensionSchema } from "./dimensionSchemas";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType,
  ProjectRecord
} from "./types";
import { escapeXml, isFormulaError, normalizeCellValue } from "./text";

interface ExportProjectXmlInput {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

const memberElementByType: Record<DimensionType, string> = {
  Scenario: "scenarioMember",
  Entity: "entityMember",
  Account: "accountMember",
  Flow: "flowMember",
  UD2: "udxMember",
  UD3: "udxMember",
  UD4: "udxMember",
  UD5: "udxMember",
  UD6: "udxMember",
  UD7: "udxMember",
  UD8: "udxMember"
};

const relationshipElementByType: Record<DimensionType, string> = {
  Scenario: "scenarioRelationship",
  Entity: "entityRelationship",
  Account: "accountRelationship",
  Flow: "flowRelationship",
  UD2: "udxRelationship",
  UD3: "udxRelationship",
  UD4: "udxRelationship",
  UD5: "udxRelationship",
  UD6: "udxRelationship",
  UD7: "udxRelationship",
  UD8: "udxRelationship"
};

export function exportProjectXml(input: ExportProjectXmlInput): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<OneStreamXF version="5.0.0.9826">',
    "  <metadataRoot>",
    "    <dimensions>"
  ];

  for (const dimension of input.dimensions) {
    lines.push(
      `      <dimension type="${escapeXml(dimension.dimensionType)}" name="${escapeXml(dimension.dimensionName)}" description="${escapeXml(dimension.description)}" accessGroup="${escapeXml(dimension.accessGroup)}" maintenanceGroup="${escapeXml(dimension.maintenanceGroup)}" inheritedDim="${escapeXml(dimension.inheritedDimension)}">`
    );
    lines.push("        <members>");
    for (const member of input.members.filter((candidate) => candidate.dimensionId === dimension.id && candidate.memberKey)) {
      lines.push(renderMember(dimension, member));
    }
    lines.push("        </members>");
    lines.push("        <relationships>");
    for (const relationship of input.relationships.filter((candidate) => candidate.dimensionId === dimension.id && candidate.parentKey && candidate.childKey)) {
      lines.push(renderRelationship(dimension, relationship));
    }
    lines.push("        </relationships>");
    lines.push("      </dimension>");
  }

  lines.push("    </dimensions>", "  </metadataRoot>", "</OneStreamXF>");
  return lines.join("\n");
}

function renderMember(dimension: DimensionRecord, member: DimensionMemberRecord): string {
  const schema = getDimensionSchema(dimension.dimensionType);
  const attributes = schema.memberFields
    .map((field) => [field.name, normalizeCellValue(member.properties[field.name])] as const)
    .filter(([, value]) => value && !isFormulaError(value))
    .map(([name, value]) => `${toXmlAttributeName(name)}="${escapeXml(value)}"`)
    .join(" ");
  const uAttributes = dimension.dimensionType.startsWith("UD") ? ` udDimType="${escapeXml(dimension.dimensionType)}"` : "";
  return `          <${memberElementByType[dimension.dimensionType]}${uAttributes}${attributes ? ` ${attributes}` : ""} />`;
}

function renderRelationship(dimension: DimensionRecord, relationship: DimensionRelationshipRecord): string {
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
  const attributes = schema.relationshipFields
    .map((field) => [field.name, normalizeCellValue(properties[field.name])] as const)
    .filter(([, value]) => value && !isFormulaError(value))
    .map(([name, value]) => `${toXmlAttributeName(name)}="${escapeXml(value)}"`)
    .join(" ");
  const uAttributes = dimension.dimensionType.startsWith("UD") ? ` udDimType="${escapeXml(dimension.dimensionType)}"` : "";
  return `          <${relationshipElementByType[dimension.dimensionType]}${uAttributes}${attributes ? ` ${attributes}` : ""} />`;
}

export function toXmlAttributeName(fieldName: string): string {
  const cleaned = fieldName
    .replace(/#/g, "Number")
    .replace(/&/g, "And")
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, character: string) => character.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
  return cleaned ? cleaned.charAt(0).toLowerCase() + cleaned.slice(1) : "value";
}
