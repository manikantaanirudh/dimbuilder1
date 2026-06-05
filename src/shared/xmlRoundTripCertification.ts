import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord,
  VaryingPropertyValueRecord
} from "./types";
import { exportProjectXml, type ExportProjectXmlOptions } from "./xmlExport";
import { parseOneStreamXml, UNKNOWN_XML_DATA_KEY } from "./xmlImport";
import { normalizePropertyLookupName } from "./oneStreamPropertyDictionary";
import { normalizeCellValue } from "./text";

export interface CertificationSnapshot {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  varyingPropertyValues?: VaryingPropertyValueRecord[];
}

export type CertificationStatus = "passed" | "passed_with_warnings" | "failed";

export interface CountComparison {
  original: number;
  exported: number;
  matched: number;
  missing: string[];
  extra: string[];
}

export interface PropertyDiff {
  dimension: string;
  member: string;
  property: string;
  originalValue: string;
  exportedValue: string;
}

export interface XmlRoundTripCertificationReport {
  status: CertificationStatus;
  generatedAt: string;
  dimensions: CountComparison;
  members: CountComparison;
  relationships: CountComparison;
  properties: {
    membersCompared: number;
    changed: PropertyDiff[];
    lost: PropertyDiff[];
  };
  unknownPreservation: {
    attributesOriginal: number;
    attributesExported: number;
    propertiesOriginal: number;
    propertiesExported: number;
    elementsOriginal: number;
    elementsExported: number;
  };
  findings: string[];
  recommendedAction: string;
}

interface CanonicalModel {
  dimensions: Map<string, DimensionRecord>;
  members: Map<string, DimensionMemberRecord>;
  relationships: Map<string, DimensionRelationshipRecord>;
  membersByDimension: Map<string, Map<string, DimensionMemberRecord>>;
  unknown: { attributes: number; properties: number; elements: number };
}

const MAX_DIFF_ITEMS = 200;

/**
 * Internal structural round-trip certification.
 *
 * Exports the project to OneStream XML, re-parses that XML, and compares the persisted records
 * with the re-imported records using canonical (id-independent) keys. This proves that an
 * export -> import round-trip preserves known metadata and preserved unknown XML, ignoring
 * formatting, attribute ordering, and generated IDs.
 *
 * This is NOT proof that OneStream itself will accept the file; it is internal structural
 * certification only.
 */
export function certifyXmlRoundTrip(
  snapshot: CertificationSnapshot,
  options: ExportProjectXmlOptions = {}
): XmlRoundTripCertificationReport {
  const xml = exportProjectXml(snapshot, { prettyPrint: true, emitAllSchemaProperties: false, ...options });
  const reparsed = parseOneStreamXml(xml, { projectName: snapshot.project.name });
  return compareSnapshots(snapshot, {
    project: snapshot.project,
    dimensions: reparsed.dimensions,
    members: reparsed.members,
    relationships: reparsed.relationships
  });
}

/**
 * Compare a source snapshot against a re-imported snapshot using canonical (id-independent) keys.
 * Exposed separately so callers and tests can compare any two snapshots directly.
 */
export function compareSnapshots(
  source: CertificationSnapshot,
  exportedSnapshot: CertificationSnapshot
): XmlRoundTripCertificationReport {
  const original = buildCanonicalModel(source.dimensions, source.members, source.relationships);
  const exported = buildCanonicalModel(exportedSnapshot.dimensions, exportedSnapshot.members, exportedSnapshot.relationships);

  const dimensions = compareKeys(original.dimensions, exported.dimensions);
  const members = compareKeys(original.members, exported.members);
  const relationships = compareKeys(original.relationships, exported.relationships);
  const { changed, lost, membersCompared } = compareProperties(original, exported);

  const findings: string[] = [];
  if (dimensions.missing.length) findings.push(`${dimensions.missing.length} dimension(s) lost on round-trip.`);
  if (members.missing.length) findings.push(`${members.missing.length} member(s) lost on round-trip.`);
  if (relationships.missing.length) findings.push(`${relationships.missing.length} relationship(s) lost on round-trip.`);
  if (lost.length) findings.push(`${lost.length} known property value(s) lost on round-trip.`);
  if (changed.length) findings.push(`${changed.length} property value(s) changed on round-trip.`);
  if (dimensions.extra.length || members.extra.length || relationships.extra.length) {
    findings.push("Re-imported XML contains records not present in the source project.");
  }
  if (original.unknown.attributes !== exported.unknown.attributes) {
    findings.push(`Unknown attribute preservation differs (source ${original.unknown.attributes}, export ${exported.unknown.attributes}).`);
  }
  if (original.unknown.properties !== exported.unknown.properties) {
    findings.push(`Unknown property preservation differs (source ${original.unknown.properties}, export ${exported.unknown.properties}).`);
  }

  const hasLoss =
    dimensions.missing.length > 0 ||
    members.missing.length > 0 ||
    relationships.missing.length > 0 ||
    lost.length > 0;
  const hasWarning =
    changed.length > 0 ||
    dimensions.extra.length > 0 ||
    members.extra.length > 0 ||
    relationships.extra.length > 0 ||
    original.unknown.attributes !== exported.unknown.attributes ||
    original.unknown.properties !== exported.unknown.properties;

  const status: CertificationStatus = hasLoss ? "failed" : hasWarning ? "passed_with_warnings" : "passed";

  return {
    status,
    generatedAt: new Date().toISOString(),
    dimensions,
    members,
    relationships,
    properties: { membersCompared, changed: changed.slice(0, MAX_DIFF_ITEMS), lost: lost.slice(0, MAX_DIFF_ITEMS) },
    unknownPreservation: {
      attributesOriginal: original.unknown.attributes,
      attributesExported: exported.unknown.attributes,
      propertiesOriginal: original.unknown.properties,
      propertiesExported: exported.unknown.properties,
      elementsOriginal: original.unknown.elements,
      elementsExported: exported.unknown.elements
    },
    findings,
    recommendedAction: recommendAction(status, findings)
  };
}

function recommendAction(status: CertificationStatus, findings: string[]): string {
  if (status === "passed") return "Round-trip is clean. The project can be exported for handoff.";
  if (status === "passed_with_warnings") {
    return `Review warnings before export: ${findings.join(" ")}`;
  }
  return `Do not export yet. Metadata loss detected: ${findings.join(" ")}`;
}

function buildCanonicalModel(
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): CanonicalModel {
  const dimensionById = new Map(dimensions.map((d) => [d.id, d]));
  const dimensionKeyById = new Map<string, string>();
  const dimensionsMap = new Map<string, DimensionRecord>();
  const unknown = { attributes: 0, properties: 0, elements: 0 };

  for (const dimension of dimensions) {
    const key = dimensionKey(dimension);
    dimensionKeyById.set(dimension.id, key);
    dimensionsMap.set(key, dimension);
    countUnknown(dimension.metadata, unknown);
  }

  const membersMap = new Map<string, DimensionMemberRecord>();
  const membersByDimension = new Map<string, Map<string, DimensionMemberRecord>>();
  for (const member of members) {
    const dimKey = dimensionKeyById.get(member.dimensionId) ?? member.dimensionId;
    const memberKeyNorm = normalizeCellValue(member.memberKey).toLowerCase();
    if (!memberKeyNorm) continue;
    const fullKey = `${dimKey}::${memberKeyNorm}`;
    membersMap.set(fullKey, member);
    if (!membersByDimension.has(dimKey)) membersByDimension.set(dimKey, new Map());
    membersByDimension.get(dimKey)!.set(memberKeyNorm, member);
    countUnknown(member.properties, unknown);
  }

  const relationshipsMap = new Map<string, DimensionRelationshipRecord>();
  for (const relationship of relationships) {
    const dimKey = dimensionKeyById.get(relationship.dimensionId) ?? relationship.dimensionId;
    const parent = normalizeCellValue(relationship.parentKey).toLowerCase();
    const child = normalizeCellValue(relationship.childKey).toLowerCase();
    if (!parent || !child) continue;
    relationshipsMap.set(`${dimKey}::${parent}->${child}`, relationship);
    countUnknown(relationship.properties, unknown);
  }

  void dimensionById;
  return { dimensions: dimensionsMap, members: membersMap, relationships: relationshipsMap, membersByDimension, unknown };
}

function dimensionKey(dimension: DimensionRecord): string {
  return `${normalizeCellValue(dimension.dimensionType).toLowerCase()}::${normalizeCellValue(dimension.dimensionName).toLowerCase()}`;
}

function compareKeys<T>(original: Map<string, T>, exported: Map<string, T>): CountComparison {
  const missing: string[] = [];
  const extra: string[] = [];
  let matched = 0;
  for (const key of original.keys()) {
    if (exported.has(key)) matched += 1;
    else missing.push(key);
  }
  for (const key of exported.keys()) {
    if (!original.has(key)) extra.push(key);
  }
  return {
    original: original.size,
    exported: exported.size,
    matched,
    missing: missing.slice(0, MAX_DIFF_ITEMS),
    extra: extra.slice(0, MAX_DIFF_ITEMS)
  };
}

function compareProperties(original: CanonicalModel, exported: CanonicalModel): {
  changed: PropertyDiff[];
  lost: PropertyDiff[];
  membersCompared: number;
} {
  const changed: PropertyDiff[] = [];
  const lost: PropertyDiff[] = [];
  let membersCompared = 0;

  for (const [fullKey, originalMember] of original.members) {
    const exportedMember = exported.members.get(fullKey);
    if (!exportedMember) continue; // missing members already reported as loss
    membersCompared += 1;
    const [dimKey, memberKey] = splitKey(fullKey);
    const originalProps = normalizeProps(originalMember.properties);
    const exportedProps = normalizeProps(exportedMember.properties);
    for (const [propName, originalValue] of originalProps) {
      const exportedValue = exportedProps.get(propName);
      if (exportedValue === undefined) {
        lost.push({ dimension: dimKey, member: memberKey, property: propName, originalValue, exportedValue: "" });
      } else if (exportedValue !== originalValue) {
        changed.push({ dimension: dimKey, member: memberKey, property: propName, originalValue, exportedValue });
      }
    }
  }

  return { changed, lost, membersCompared };
}

function normalizeProps(properties: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(properties)) {
    if (key === UNKNOWN_XML_DATA_KEY) continue;
    const normalizedValue = normalizeCellValue(value);
    if (!normalizedValue) continue; // ignore empty values; absence vs blank is not a loss
    map.set(normalizePropertyLookupName(key), normalizedValue);
  }
  return map;
}

function countUnknown(source: Record<string, unknown> | null | undefined, unknown: { attributes: number; properties: number; elements: number }): void {
  if (!source || typeof source !== "object") return;
  const value = (source as Record<string, unknown>)[UNKNOWN_XML_DATA_KEY];
  if (!value || typeof value !== "object") return;
  const candidate = value as { unknownAttributes?: Record<string, unknown>; unknownElements?: unknown[] };
  if (candidate.unknownAttributes && typeof candidate.unknownAttributes === "object") {
    unknown.attributes += Object.keys(candidate.unknownAttributes).length;
  }
  if (Array.isArray(candidate.unknownElements)) {
    for (const element of candidate.unknownElements) {
      const name = (element as { name?: string })?.name;
      if (name === "property" || (element as { originalXmlPath?: string })?.originalXmlPath?.endsWith("/properties/property")) {
        unknown.properties += 1;
      } else {
        unknown.elements += 1;
      }
    }
  }
}

function splitKey(fullKey: string): [string, string] {
  const idx = fullKey.lastIndexOf("::");
  if (idx === -1) return [fullKey, ""];
  return [fullKey.slice(0, idx), fullKey.slice(idx + 2)];
}

export function renderCertificationMarkdown(report: XmlRoundTripCertificationReport, projectName: string): string {
  const statusLabel =
    report.status === "passed" ? "Passed" : report.status === "passed_with_warnings" ? "Passed with warnings" : "Failed";
  const lines = [
    `# XML Round-Trip / Import-Readiness Check - ${projectName}`,
    "",
    `Status: ${statusLabel}`,
    `Generated: ${report.generatedAt}`,
    "",
    "> Internal structural import-readiness check only. This does not prove that OneStream will accept the exported file.",
    "",
    "## Counts",
    "",
    "| Entity | Source | Exported | Matched | Lost | Extra |",
    "|---|---:|---:|---:|---:|---:|",
    `| Dimensions | ${report.dimensions.original} | ${report.dimensions.exported} | ${report.dimensions.matched} | ${report.dimensions.missing.length} | ${report.dimensions.extra.length} |`,
    `| Members | ${report.members.original} | ${report.members.exported} | ${report.members.matched} | ${report.members.missing.length} | ${report.members.extra.length} |`,
    `| Relationships | ${report.relationships.original} | ${report.relationships.exported} | ${report.relationships.matched} | ${report.relationships.missing.length} | ${report.relationships.extra.length} |`,
    "",
    "## Properties",
    "",
    `- Members compared: ${report.properties.membersCompared}`,
    `- Changed values: ${report.properties.changed.length}`,
    `- Lost values: ${report.properties.lost.length}`,
    "",
    "## Unknown XML preservation",
    "",
    `- Attributes: source ${report.unknownPreservation.attributesOriginal}, export ${report.unknownPreservation.attributesExported}`,
    `- Properties: source ${report.unknownPreservation.propertiesOriginal}, export ${report.unknownPreservation.propertiesExported}`,
    "",
    "## Findings",
    "",
    ...(report.findings.length ? report.findings.map((f) => `- ${f}`) : ["- No issues detected."]),
    "",
    "## Recommended action",
    "",
    report.recommendedAction
  ];
  return lines.join("\n");
}
