import type { FieldMapping, FilterRule, HierarchyRule, MappingRule, ConflictResolution } from "../../../shared/connectorTypes";

export interface MappedMember {
  memberKey: string;
  description: string;
  properties: Record<string, unknown>;
}

export interface MappedRelationship {
  parentKey: string;
  childKey: string;
}

export interface MappingPipelineResult {
  members: MappedMember[];
  relationships: MappedRelationship[];
  conflicts: { memberKey: string; reason: string }[];
  filteredOut: number;
  sourceRecordsRead: number;
}

export function applyTransform(value: string, transform: string): string {
  if (!transform) return value;

  const prefixMatch = transform.match(/^prefix\("(.*)"\)$/);
  if (prefixMatch) return `${prefixMatch[1]}${value}`;

  const suffixMatch = transform.match(/^suffix\("(.*)"\)$/);
  if (suffixMatch) return `${value}${suffixMatch[1]}`;

  switch (transform) {
    case "trim":
      return value.trim();
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "noop":
      return value;
    default:
      return value;
  }
}

export function applyFilterRules(records: Record<string, unknown>[], rules: FilterRule[]): Record<string, unknown>[] {
  if (!rules || rules.length === 0) return records;

  return records.filter(record => {
    return rules.every(rule => {
      const fieldValue = String(record[rule.field] ?? "");
      switch (rule.operator) {
        case "in":
          return rule.values.includes(fieldValue);
        case "not_in":
          return !rule.values.includes(fieldValue);
        case "equals":
          return rule.values.length > 0 && fieldValue === rule.values[0];
        case "not_equals":
          return rule.values.length > 0 && fieldValue !== rule.values[0];
        case "starts_with":
          return rule.values.some(v => fieldValue.startsWith(v));
        case "contains":
          return rule.values.some(v => fieldValue.includes(v));
        default:
          return true;
      }
    });
  });
}

export function applyFieldMappings(record: Record<string, unknown>, mappings: FieldMapping[]): MappedMember {
  let memberKey = "";
  let description = "";
  const properties: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const rawValue = String(record[mapping.source] ?? "");
    const value = mapping.transform ? applyTransform(rawValue, mapping.transform) : rawValue;

    if (mapping.target === "memberKey") {
      memberKey = value;
    } else if (mapping.target === "description") {
      description = value;
    } else {
      properties[mapping.target] = value;
    }
  }

  return { memberKey, description, properties };
}

export function buildHierarchy(records: Record<string, unknown>[], rule: HierarchyRule, fieldMappings: FieldMapping[]): MappedRelationship[] {
  const relationships: MappedRelationship[] = [];

  for (const record of records) {
    const parentRaw = String(record[rule.parentField] ?? "");
    const parentKey = rule.parentTransform ? applyTransform(parentRaw, rule.parentTransform) : parentRaw;

    const memberKeyMapping = fieldMappings.find(m => m.target === "memberKey");
    if (!memberKeyMapping) continue;

    const childRaw = String(record[memberKeyMapping.source] ?? "");
    const childKey = memberKeyMapping.transform ? applyTransform(childRaw, memberKeyMapping.transform) : childRaw;

    if (childKey && parentKey) {
      relationships.push({ parentKey, childKey });
    }
  }

  return relationships;
}

export function detectConflicts(
  members: MappedMember[],
  existingMemberKeys: Set<string>,
  conflictResolution: ConflictResolution
): { memberKey: string; reason: string }[] {
  if (conflictResolution === "source_wins") return [];

  const conflicts: { memberKey: string; reason: string }[] = [];
  for (const member of members) {
    if (existingMemberKeys.has(member.memberKey)) {
      conflicts.push({
        memberKey: member.memberKey,
        reason: `Member "${member.memberKey}" already exists in project`
      });
    }
  }
  return conflicts;
}

export function executeMappingPipeline(
  sourceRecords: Record<string, unknown>[],
  rule: Pick<MappingRule, "fieldMappings" | "hierarchyRules" | "filterRules" | "conflictResolution">,
  existingMemberKeys: Set<string> = new Set()
): MappingPipelineResult {
  const sourceRecordsRead = sourceRecords.length;

  // Apply filter rules
  const filtered = applyFilterRules(sourceRecords, rule.filterRules);
  const filteredOut = sourceRecordsRead - filtered.length;

  // Apply field mappings to produce members
  const members = filtered.map(record => applyFieldMappings(record, rule.fieldMappings));

  // Build hierarchy if rules provided
  let relationships: MappedRelationship[] = [];
  if (rule.hierarchyRules) {
    relationships = buildHierarchy(filtered, rule.hierarchyRules, rule.fieldMappings);
  }

  // Detect conflicts
  const conflicts = detectConflicts(members, existingMemberKeys, rule.conflictResolution);

  return {
    members,
    relationships,
    conflicts,
    filteredOut,
    sourceRecordsRead
  };
}
