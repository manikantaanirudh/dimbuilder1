import type { Readable } from "node:stream";
import { nanoid } from "nanoid";
import { getDimensionSchema, supportedDimensionTypes } from "./dimensionSchemas";
import { getPropertyDefinitionByName, type OneStreamPropertyTargetLevel } from "./oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType,
  ParsedProject,
  ProjectRecord,
  UnknownXmlData,
  UnknownXmlElementData
} from "./types";

export const UNKNOWN_XML_DATA_KEY = "__unknownXml";

export interface ParseOneStreamXmlOptions {
  projectName?: string;
  sourceFileName?: string;
  createdBy?: string;
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
  sourceOrder: number;
}

interface XmlImportCounters {
  unknownAttributesPreserved: number;
  unknownElementsPreserved: number;
  unknownPropertiesPreserved: number;
  warnings: string[];
  errors: string[];
}

const dimensionAttributeFields: Record<string, keyof DimensionRecord | "metadata"> = {
  type: "dimensionType",
  name: "dimensionName",
  description: "description",
  accessGroup: "accessGroup",
  maintenanceGroup: "maintenanceGroup",
  inheritedDim: "inheritedDimension",
  dimMemberSourceType: "metadata",
  dimMemberSourcePath: "metadata",
  dimMemberSourceNVPairs: "metadata"
};

export function parseOneStreamXml(xml: string, options: ParseOneStreamXmlOptions = {}): ParsedProject {
  const document = parseXml(xml);
  return buildParsedProjectFromDocument(document, options);
}

export async function parseOneStreamXmlFromStream(
  stream: Readable,
  options: ParseOneStreamXmlOptions = {}
): Promise<ParsedProject> {
  const document = await parseXmlStream(stream);
  return buildParsedProjectFromDocument(document, options);
}

function buildParsedProjectFromDocument(document: XmlNode, options: ParseOneStreamXmlOptions): ParsedProject {
  const root = findFirstElementByName(document, "OneStreamXF") ?? document;
  const oneStreamVersion = root.attributes.version ?? "";
  const dimensionsParent = findFirstDescendantByName(root, "dimensions") ?? root;
  const dimensionNodes = childrenByName(dimensionsParent, "dimension");
  const timestamp = new Date().toISOString();
  const project: ProjectRecord = {
    id: nanoid(),
    name: options.projectName || "Imported OneStream XML Project",
    description: "Imported from OneStream metadata XML.",
    sourceFileName: options.sourceFileName ?? "",
    createdBy: options.createdBy ?? "local-admin",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const counters: XmlImportCounters = {
    unknownAttributesPreserved: 0,
    unknownElementsPreserved: 0,
    unknownPropertiesPreserved: 0,
    warnings: [],
    errors: []
  };

  const dimensions: DimensionRecord[] = [];
  const members: DimensionMemberRecord[] = [];
  const relationships: DimensionRelationshipRecord[] = [];

  for (const [dimensionIndex, node] of dimensionNodes.entries()) {
    const parsedDimension = parseDimensionNode(node, {
      projectId: project.id,
      sortOrder: dimensionIndex + 1,
      timestamp,
      oneStreamVersion,
      counters
    });
    dimensions.push(parsedDimension.dimension);
    members.push(...parsedDimension.members);
    relationships.push(...parsedDimension.relationships);
  }

  return {
    project,
    dimensions,
    members,
    relationships,
    importSummary: {
      sheetsDetected: dimensionNodes.length,
      dimensionsImported: dimensions.length,
      membersImported: members.length,
      relationshipsImported: relationships.length,
      skippedBlankRows: 0,
      warnings: counters.warnings,
      errors: counters.errors,
      unknownAttributesPreserved: counters.unknownAttributesPreserved,
      unknownElementsPreserved: counters.unknownElementsPreserved,
      unknownPropertiesPreserved: counters.unknownPropertiesPreserved
    }
  };
}

function parseDimensionNode(
  node: XmlNode,
  context: {
    projectId: string;
    sortOrder: number;
    timestamp: string;
    oneStreamVersion: string;
    counters: XmlImportCounters;
  }
): { dimension: DimensionRecord; members: DimensionMemberRecord[]; relationships: DimensionRelationshipRecord[] } {
  const dimensionType = toDimensionType(node.attributes.type, context.counters);
  const metadata: Record<string, unknown> = {};
  if (context.oneStreamVersion) metadata.oneStreamVersion = context.oneStreamVersion;

  const unknownXml = createUnknownXmlData(node, dimensionPath(context.sortOrder));
  const dimension: DimensionRecord = {
    id: nanoid(),
    projectId: context.projectId,
    sheetName: node.attributes.name || dimensionType,
    dimensionType,
    dimensionName: node.attributes.name ?? "",
    description: node.attributes.description ?? "",
    accessGroup: node.attributes.accessGroup ?? "",
    maintenanceGroup: node.attributes.maintenanceGroup ?? "",
    inheritedDimension: node.attributes.inheritedDim ?? "",
    sortOrder: context.sortOrder,
    metadata,
    createdAt: context.timestamp,
    updatedAt: context.timestamp
  };

  for (const [attributeName, value] of Object.entries(node.attributes)) {
    const knownField = dimensionAttributeFields[attributeName];
    if (knownField === "metadata") {
      metadata[attributeName] = value;
    } else if (!knownField) {
      unknownXml.unknownAttributes[attributeName] = value;
      context.counters.unknownAttributesPreserved += 1;
    }
  }

  for (const child of node.children) {
    if (localName(child.name) === "properties") {
      parsePropertyElements(child, dimension.dimensionType, "dimension", dimension.metadata, unknownXml, `${unknownXml.originalXmlPath}/properties`, context.counters);
    } else if (!["members", "relationships"].includes(localName(child.name))) {
      unknownXml.unknownElements.push(toUnknownElement(child, `${unknownXml.originalXmlPath}/${child.name}`));
      context.counters.unknownElementsPreserved += 1;
    }
  }

  attachUnknownXml(dimension.metadata, unknownXml);

  return {
    dimension,
    members: parseMemberNodes(node, dimension, context.timestamp, context.counters),
    relationships: parseRelationshipNodes(node, dimension, context.timestamp, context.counters)
  };
}

function parseMemberNodes(
  dimensionNode: XmlNode,
  dimension: DimensionRecord,
  timestamp: string,
  counters: XmlImportCounters
): DimensionMemberRecord[] {
  const membersParent = childrenByName(dimensionNode, "members")[0];
  if (!membersParent) return [];

  return childrenByName(membersParent, "member").map((node, index) => {
    const schema = getDimensionSchema(dimension.dimensionType);
    const unknownXml = createUnknownXmlData(node, `${dimensionPath(dimension.sortOrder)}/members/member[${index + 1}]`);
    const properties: Record<string, unknown> = {};
    const memberKey = node.attributes.name ?? "";
    const description = node.attributes.description ?? "";

    if (node.attributes.alias !== undefined) properties.Alias = node.attributes.alias;
    properties[schema.memberKeyField] = memberKey;
    if (description) properties.Description = description;

    for (const [attributeName, value] of Object.entries(node.attributes)) {
      if (["name", "alias", "description"].includes(attributeName)) continue;
      const knownField = resolveKnownPropertyName(dimension.dimensionType, "member", attributeName);
      if (knownField) {
        properties[knownField] = value;
      } else {
        unknownXml.unknownAttributes[attributeName] = value;
        counters.unknownAttributesPreserved += 1;
      }
    }

    for (const child of node.children) {
      if (localName(child.name) === "properties") {
        parsePropertyElements(child, dimension.dimensionType, "member", properties, unknownXml, `${unknownXml.originalXmlPath}/properties`, counters);
      } else {
        unknownXml.unknownElements.push(toUnknownElement(child, `${unknownXml.originalXmlPath}/${child.name}`));
        counters.unknownElementsPreserved += 1;
      }
    }
    attachUnknownXml(properties, unknownXml);

    return {
      id: nanoid(),
      dimensionId: dimension.id,
      memberKey,
      description,
      properties,
      rowOrder: index + 1,
      sourceRowNumber: index + 1,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}

function parseRelationshipNodes(
  dimensionNode: XmlNode,
  dimension: DimensionRecord,
  timestamp: string,
  counters: XmlImportCounters
): DimensionRelationshipRecord[] {
  const relationshipsParent = childrenByName(dimensionNode, "relationships")[0];
  if (!relationshipsParent) return [];

  return childrenByName(relationshipsParent, "relationship").map((node, index) => {
    const unknownXml = createUnknownXmlData(node, `${dimensionPath(dimension.sortOrder)}/relationships/relationship[${index + 1}]`);
    const properties: Record<string, unknown> = {
      Parent: node.attributes.parent ?? "",
      Child: node.attributes.child ?? ""
    };

    for (const [attributeName, value] of Object.entries(node.attributes)) {
      if (["parent", "child"].includes(attributeName)) continue;
      const knownField = resolveKnownPropertyName(dimension.dimensionType, "relationship", attributeName);
      if (knownField) {
        properties[knownField] = parseMaybeNumber(value);
      } else {
        unknownXml.unknownAttributes[attributeName] = value;
        counters.unknownAttributesPreserved += 1;
      }
    }

    for (const child of node.children) {
      if (localName(child.name) === "properties") {
        parsePropertyElements(child, dimension.dimensionType, "relationship", properties, unknownXml, `${unknownXml.originalXmlPath}/properties`, counters);
      } else {
        unknownXml.unknownElements.push(toUnknownElement(child, `${unknownXml.originalXmlPath}/${child.name}`));
        counters.unknownElementsPreserved += 1;
      }
    }
    attachUnknownXml(properties, unknownXml);

    return {
      id: nanoid(),
      dimensionId: dimension.id,
      parentKey: node.attributes.parent ?? "",
      childKey: node.attributes.child ?? "",
      aggregationWeight: toNullableNumber(properties["Aggregation Weight"]),
      percentConsol: toNullableNumber(properties["Percent Consol"]),
      percentOwnership: toNullableNumber(properties["Percent Ownership"]),
      ownershipType: String(properties["Ownership Type"] ?? ""),
      properties,
      rowOrder: index + 1,
      sourceRowNumber: index + 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}

function parsePropertyElements(
  propertiesNode: XmlNode,
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  target: Record<string, unknown>,
  unknownXml: UnknownXmlData,
  originalXmlPath: string,
  counters: XmlImportCounters
): void {
  // Known varying context attribute names (not stored as property value)
  const varyingContextAttrs = new Set(["name", "value", "scenarioType", "time", "cubeType", "revertToDefaultScenarioType"]);

  for (const node of childrenByName(propertiesNode, "property")) {
    const propertyName = node.attributes.name ?? "";
    const value = node.attributes.value ?? node.text.trim();
    if (!propertyName) continue;

    const knownField = resolveKnownPropertyName(dimensionType, targetLevel, propertyName);
    if (knownField) {
      target[knownField] = parseMaybeNumber(value);
      // Preserve non-default varying context attributes as unknown element for round-trip
      const hasNonDefaultContext = (node.attributes.scenarioType && node.attributes.scenarioType !== "")
        || (node.attributes.time && node.attributes.time !== "")
        || (node.attributes.cubeType && node.attributes.cubeType !== "");
      const hasExtraAttributes = Object.keys(node.attributes).some((attr) => !varyingContextAttrs.has(attr));
      if (hasNonDefaultContext || hasExtraAttributes) {
        unknownXml.unknownElements.push({
          name: "property",
          attributes: { ...node.attributes },
          text: node.text.trim(),
          sourceOrder: node.sourceOrder,
          originalXmlPath: `${originalXmlPath}/property`
        });
        counters.unknownPropertiesPreserved += 1;
      }
    } else {
      unknownXml.unknownElements.push({
        name: propertyName,
        attributes: { ...node.attributes, name: propertyName, value },
        text: node.text.trim(),
        sourceOrder: node.sourceOrder,
        originalXmlPath: `${originalXmlPath}/property`
      });
      counters.unknownPropertiesPreserved += 1;
    }
  }
}

function resolveKnownPropertyName(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  xmlName: string
): string | undefined {
  return getPropertyDefinitionByName(dimensionType, targetLevel, xmlName)?.displayName;
}

function createUnknownXmlData(node: XmlNode, originalXmlPath: string): UnknownXmlData {
  return {
    unknownAttributes: {},
    unknownElements: [],
    originalXmlPath,
    sourceOrder: node.sourceOrder
  };
}

function attachUnknownXml(target: Record<string, unknown>, unknownXml: UnknownXmlData): void {
  if (Object.keys(unknownXml.unknownAttributes).length === 0 && unknownXml.unknownElements.length === 0) return;
  target[UNKNOWN_XML_DATA_KEY] = unknownXml;
}

function toUnknownElement(node: XmlNode, originalXmlPath: string): UnknownXmlElementData {
  return {
    name: node.name,
    attributes: { ...node.attributes },
    text: node.text.trim(),
    sourceOrder: node.sourceOrder,
    originalXmlPath
  };
}

function toDimensionType(value: string | undefined, counters: XmlImportCounters): DimensionType {
  if (value && supportedDimensionTypes.includes(value as DimensionType)) return value as DimensionType;
  counters.warnings.push(value ? `Unsupported dimension type '${value}' imported as Scenario.` : "Missing dimension type imported as Scenario.");
  return "Scenario";
}

function parseMaybeNumber(value: string): string | number {
  const trimmed = value.trim();
  if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dimensionPath(sortOrder: number): string {
  return `/OneStreamXF/metadataRoot/dimensions/dimension[${sortOrder}]`;
}

interface ParseState {
  root: XmlNode;
  stack: XmlNode[];
  sourceOrder: number;
}

function createParseState(): ParseState {
  const root: XmlNode = { name: "#document", attributes: {}, children: [], text: "", sourceOrder: 0 };
  return { root, stack: [root], sourceOrder: 0 };
}

function processToken(token: string, state: ParseState): void {
  if (!token) return;
  if (token.startsWith("<!--") || token.startsWith("<?")) return;
  if (token.startsWith("<![CDATA[")) {
    state.stack[state.stack.length - 1].text += token.slice(9, -3);
    return;
  }
  if (token.startsWith("</")) {
    if (state.stack.length > 1) state.stack.pop();
    return;
  }
  if (token.startsWith("<")) {
    const selfClosing = /\/>\s*$/.test(token);
    const content = token.slice(1, selfClosing ? -2 : -1).trim();
    if (!content || content.startsWith("!")) return;
    const { name, attributes } = parseStartTag(content);
    const node: XmlNode = {
      name,
      attributes,
      children: [],
      text: "",
      sourceOrder: ++state.sourceOrder
    };
    state.stack[state.stack.length - 1].children.push(node);
    if (!selfClosing) state.stack.push(node);
    return;
  }
  const text = decodeXml(token);
  if (text) state.stack[state.stack.length - 1].text += text;
}

function parseXml(xml: string): XmlNode {
  const state = createParseState();
  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g;
  const tokens = xml.match(tokenPattern) ?? [];
  for (const token of tokens) processToken(token, state);
  return state.root;
}

async function parseXmlStream(stream: Readable): Promise<XmlNode> {
  const state = createParseState();
  let buf = "";
  let i = 0;

  const emit = (token: string) => processToken(token, state);

  const drain = (final: boolean): boolean => {
    while (i < buf.length) {
      const ch = buf.charCodeAt(i);
      if (ch === 0x3c /* < */) {
        if (buf.startsWith("<!--", i)) {
          const end = buf.indexOf("-->", i + 4);
          if (end < 0) return false;
          emit(buf.slice(i, end + 3));
          i = end + 3;
        } else if (buf.startsWith("<?", i)) {
          const end = buf.indexOf("?>", i + 2);
          if (end < 0) return false;
          emit(buf.slice(i, end + 2));
          i = end + 2;
        } else if (buf.startsWith("<![CDATA[", i)) {
          const end = buf.indexOf("]]>", i + 9);
          if (end < 0) return false;
          emit(buf.slice(i, end + 3));
          i = end + 3;
        } else {
          const end = buf.indexOf(">", i + 1);
          if (end < 0) return false;
          emit(buf.slice(i, end + 1));
          i = end + 1;
        }
      } else {
        const next = buf.indexOf("<", i);
        if (next < 0) {
          if (!final) {
            // Emit accumulated text now to keep buffer bounded; subsequent
            // chunks of the same text run will append to the same parent node
            // because text tokens are concatenated in processToken.
            emit(buf.slice(i));
            i = buf.length;
            return false;
          }
          emit(buf.slice(i));
          i = buf.length;
        } else {
          emit(buf.slice(i, next));
          i = next;
        }
      }
    }
    return true;
  };

  stream.setEncoding("utf8");
  for await (const chunk of stream as AsyncIterable<string>) {
    buf += chunk;
    drain(false);
    if (i > 0) {
      buf = buf.slice(i);
      i = 0;
    }
  }
  drain(true);
  return state.root;
}

function parseStartTag(content: string): { name: string; attributes: Record<string, string> } {
  const nameMatch = /^([^\s/>]+)/.exec(content);
  const name = localName(nameMatch?.[1] ?? "");
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of content.matchAll(attributePattern)) {
    attributes[localName(match[1])] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return { name, attributes };
}

function findFirstElementByName(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((child) => localName(child.name) === name);
}

function findFirstDescendantByName(node: XmlNode, name: string): XmlNode | undefined {
  for (const child of node.children) {
    if (localName(child.name) === name) return child;
    const descendant = findFirstDescendantByName(child, name);
    if (descendant) return descendant;
  }
  return undefined;
}

function childrenByName(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => localName(child.name) === name);
}

function localName(name: string): string {
  return name.includes(":") ? name.split(":").pop() ?? name : name;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
