import { getDimensionSchema } from "../../shared/dimensionSchemas";
import type {
  GroupedOneStreamPropertyDictionary,
  OneStreamPropertyValueType,
} from "../../shared/oneStreamPropertyDictionary";
import { SPECIAL_FIELDS, type FilterTarget } from "../../shared/structuredSearch";
import type { DimensionType } from "../../shared/types";

export interface FieldCatalogEntry {
  label: string;
  fieldKey: string;
  target: FilterTarget;
  valueType: OneStreamPropertyValueType;
  enumValues?: string[];
}

/** Built-in column-backed fields, offered regardless of dimension type. */
const BUILT_IN_FIELDS: FieldCatalogEntry[] = [
  { label: "Member key", fieldKey: SPECIAL_FIELDS.memberKey, target: "member", valueType: "string" },
  { label: "Description", fieldKey: SPECIAL_FIELDS.description, target: "member", valueType: "string" },
  { label: "Parent", fieldKey: SPECIAL_FIELDS.parentKey, target: "relationship", valueType: "string" },
  { label: "Child", fieldKey: SPECIAL_FIELDS.childKey, target: "relationship", valueType: "string" },
  { label: "Ownership Type", fieldKey: SPECIAL_FIELDS.ownershipType, target: "relationship", valueType: "string" },
];

const RESERVED_LABELS = new Set(
  ["description", "parent", "child", "ownership type", "name", "member", "member key"].map((s) => s),
);

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Builds a de-duplicated field catalog for the guided filter bar from the OneStream
 * property dictionary, scoped to the dimension types present in the project.
 */
export function buildFieldCatalog(
  dictionary: GroupedOneStreamPropertyDictionary,
  dimensionTypes: DimensionType[],
): FieldCatalogEntry[] {
  const seen = new Set<string>();
  const catalog: FieldCatalogEntry[] = [];

  for (const entry of BUILT_IN_FIELDS) {
    seen.add(`${entry.target}:${norm(entry.label)}`);
    catalog.push(entry);
  }

  // Member-key field labels per present dimension type (e.g. "Entity", "Account") are
  // represented by the built-in "Member key", so exclude their property duplicates.
  const memberKeyLabels = new Set<string>();
  for (const type of dimensionTypes) {
    try {
      memberKeyLabels.add(norm(getDimensionSchema(type).memberKeyField));
    } catch {
      // Unknown dimension type — skip.
    }
  }

  const uniqueTypes = Array.from(new Set(dimensionTypes));
  for (const type of uniqueTypes) {
    const group = dictionary.dimensions[type];
    if (!group) continue;
    for (const level of ["member", "relationship"] as const) {
      const target: FilterTarget = level === "member" ? "member" : "relationship";
      for (const def of group[level] ?? []) {
        const labelNorm = norm(def.displayName);
        if (RESERVED_LABELS.has(labelNorm)) continue;
        if (target === "member" && memberKeyLabels.has(labelNorm)) continue;
        const dedupeKey = `${target}:${labelNorm}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        catalog.push({
          label: def.displayName,
          fieldKey: def.displayName,
          target,
          valueType: def.valueType,
          enumValues: def.enumValues,
        });
      }
    }
  }

  return catalog;
}
