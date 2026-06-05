import { createHash } from "node:crypto";
import { getDimensionSchema } from "./dimensionSchemas";
import {
  getPropertyDefinitionByName,
  normalizePropertyName,
  toOneStreamXmlPropertyNameFromDictionary,
  type OneStreamPropertyTargetLevel
} from "./oneStreamPropertyDictionary";
import { normalizeCellValue } from "./text";
import type { DimensionRelationshipRecord, DimensionType } from "./types";
import { UNKNOWN_XML_DATA_KEY, parseOneStreamXml } from "./xmlImport";

export type PropertyDefaultTargetLevel = "dimension" | "member" | "relationship";

export interface PropertyDefaultProfile {
  name: string;
  sourceFileName: string;
  sourceXmlHash: string;
}

export interface PropertyDefaultValue {
  dimensionType: DimensionType;
  targetLevel: PropertyDefaultTargetLevel;
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
  confidence: number;
  sampleCount: number;
  nonBlankCount: number;
  distinctCount: number;
  sourceDimensionNames: string[];
}

export interface PropertyDefaultAnalysisInput {
  projectName?: string;
  sourceFileName?: string;
  createdBy?: string;
}

export interface PropertyDefaultAnalysisResult {
  profile: PropertyDefaultProfile;
  values: PropertyDefaultValue[];
  dimensionTypesAnalyzed: DimensionType[];
  warnings: string[];
}

interface AggregateBucket {
  dimensionType: DimensionType;
  targetLevel: PropertyDefaultTargetLevel;
  propertyName: string;
  xmlName: string;
  valueCounts: Map<string, number>;
  sampleCount: number;
  nonBlankCount: number;
  sourceDimensionNames: Set<string>;
}

const SKIP_DIMENSION_METADATA = new Set([
  UNKNOWN_XML_DATA_KEY,
  "oneStreamVersion",
  "dimMemberSourceType",
  "dimMemberSourcePath",
  "dimMemberSourceNVPairs"
]);

const SKIP_RELATIONSHIP_PROPERTIES = new Set(["Parent", "Child"]);

function aggregateKey(
  dimensionType: DimensionType,
  targetLevel: PropertyDefaultTargetLevel,
  propertyName: string
): string {
  return `${dimensionType}\0${targetLevel}\0${propertyName}`;
}

function resolveXmlName(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  propertyName: string,
  rawXmlName?: string
): string {
  if (rawXmlName?.trim()) return rawXmlName.trim();
  return toOneStreamXmlPropertyNameFromDictionary(dimensionType, targetLevel, propertyName)
    ?? propertyName.replace(/[^A-Za-z0-9]+/g, "");
}

export function analyzeXmlPropertyDefaults(
  xmlContent: string,
  options: PropertyDefaultAnalysisInput = {}
): PropertyDefaultAnalysisResult {
  const parsed = parseOneStreamXml(xmlContent, {
    projectName: options.projectName,
    sourceFileName: options.sourceFileName,
    createdBy: options.createdBy
  });

  const buckets = new Map<string, AggregateBucket>();
  const warnings = [...parsed.importSummary.warnings];

  for (const dimension of parsed.dimensions) {
    const sourceDimensionName = dimension.dimensionName || dimension.sheetName || dimension.dimensionType;
    recordDimensionMetadata(buckets, dimension.dimensionType, sourceDimensionName, dimension.metadata);

    const schema = getDimensionSchema(dimension.dimensionType);
    const memberKeyField = schema.memberKeyField;

    for (const member of parsed.members.filter((candidate) => candidate.dimensionId === dimension.id)) {
      for (const [fieldName, value] of Object.entries(member.properties)) {
        if (fieldName === UNKNOWN_XML_DATA_KEY || fieldName === memberKeyField) continue;
        recordPropertySample(buckets, dimension.dimensionType, "member", sourceDimensionName, fieldName, value);
      }
    }

    for (const relationship of parsed.relationships.filter((candidate) => candidate.dimensionId === dimension.id)) {
      recordRelationshipSamples(buckets, dimension.dimensionType, sourceDimensionName, relationship);
    }
  }

  const values = finalizeBuckets(buckets);
  const sourceXmlHash = createHash("sha256").update(xmlContent, "utf8").digest("hex");
  const profileName = options.sourceFileName
    ? `Defaults from ${options.sourceFileName}`
    : "XML-derived defaults";

  return {
    profile: {
      name: profileName,
      sourceFileName: options.sourceFileName ?? "",
      sourceXmlHash
    },
    values,
    dimensionTypesAnalyzed: [...new Set(values.map((value) => value.dimensionType))].sort(),
    warnings
  };
}

function recordDimensionMetadata(
  buckets: Map<string, AggregateBucket>,
  dimensionType: DimensionType,
  sourceDimensionName: string,
  metadata: Record<string, unknown>
): void {
  for (const [fieldName, value] of Object.entries(metadata)) {
    if (SKIP_DIMENSION_METADATA.has(fieldName)) continue;
    if (typeof value === "object" && value !== null) continue;
    recordPropertySample(buckets, dimensionType, "dimension", sourceDimensionName, fieldName, value);
  }
}

function recordRelationshipSamples(
  buckets: Map<string, AggregateBucket>,
  dimensionType: DimensionType,
  sourceDimensionName: string,
  relationship: DimensionRelationshipRecord
): void {
  const enriched: Record<string, unknown> = { ...relationship.properties };
  if (relationship.aggregationWeight !== null && relationship.aggregationWeight !== undefined) {
    enriched["Aggregation Weight"] = relationship.aggregationWeight;
  }
  if (relationship.percentConsol !== null && relationship.percentConsol !== undefined) {
    enriched["Percent Consol"] = relationship.percentConsol;
  }
  if (relationship.percentOwnership !== null && relationship.percentOwnership !== undefined) {
    enriched["Percent Ownership"] = relationship.percentOwnership;
  }
  if (relationship.ownershipType) {
    enriched["Ownership Type"] = relationship.ownershipType;
  }

  for (const [fieldName, value] of Object.entries(enriched)) {
    if (fieldName === UNKNOWN_XML_DATA_KEY || SKIP_RELATIONSHIP_PROPERTIES.has(fieldName)) continue;
    recordPropertySample(buckets, dimensionType, "relationship", sourceDimensionName, fieldName, value);
  }
}

function recordPropertySample(
  buckets: Map<string, AggregateBucket>,
  dimensionType: DimensionType,
  targetLevel: PropertyDefaultTargetLevel,
  sourceDimensionName: string,
  rawPropertyName: string,
  rawValue: unknown,
  rawXmlName?: string
): void {
  const propertyName = normalizePropertyName(dimensionType, targetLevel, rawPropertyName);
  const xmlName = resolveXmlName(dimensionType, targetLevel, propertyName, rawXmlName);
  const key = aggregateKey(dimensionType, targetLevel, propertyName);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      dimensionType,
      targetLevel,
      propertyName,
      xmlName,
      valueCounts: new Map(),
      sampleCount: 0,
      nonBlankCount: 0,
      sourceDimensionNames: new Set()
    };
    buckets.set(key, bucket);
  }

  bucket.sampleCount += 1;
  bucket.sourceDimensionNames.add(sourceDimensionName);

  const normalized = normalizeCellValue(rawValue);
  if (!normalized) return;

  bucket.nonBlankCount += 1;
  bucket.valueCounts.set(normalized, (bucket.valueCounts.get(normalized) ?? 0) + 1);
}

function finalizeBuckets(buckets: Map<string, AggregateBucket>): PropertyDefaultValue[] {
  const results: PropertyDefaultValue[] = [];

  for (const bucket of buckets.values()) {
    let winningValue = "";
    let winningCount = 0;
    for (const [value, count] of bucket.valueCounts) {
      if (count > winningCount) {
        winningCount = count;
        winningValue = value;
      }
    }

    const distinctCount = bucket.valueCounts.size;
    const confidence = bucket.nonBlankCount > 0 ? winningCount / bucket.nonBlankCount : 0;

    results.push({
      dimensionType: bucket.dimensionType,
      targetLevel: bucket.targetLevel,
      propertyName: bucket.propertyName,
      xmlName: bucket.xmlName,
      defaultValue: winningValue,
      enabled: true,
      confidence,
      sampleCount: bucket.sampleCount,
      nonBlankCount: bucket.nonBlankCount,
      distinctCount,
      sourceDimensionNames: [...bucket.sourceDimensionNames].sort()
    });
  }

  return results.sort((left, right) =>
    left.dimensionType.localeCompare(right.dimensionType)
    || left.targetLevel.localeCompare(right.targetLevel)
    || left.propertyName.localeCompare(right.propertyName)
  );
}

export function propertyDefaultFromDictionary(
  dimensionType: DimensionType,
  targetLevel: PropertyDefaultTargetLevel,
  propertyName: string
): Pick<PropertyDefaultValue, "propertyName" | "xmlName"> {
  const definition = getPropertyDefinitionByName(dimensionType, targetLevel, propertyName);
  return {
    propertyName: definition?.displayName ?? propertyName,
    xmlName: definition?.xmlName ?? resolveXmlName(dimensionType, targetLevel, propertyName)
  };
}
