import { getPropertyDefinitionByName, normalizePropertyLookupName } from "./oneStreamPropertyDictionary";
import { normalizeCellValue } from "./text";
import type { DimensionType, VaryingPropertyContext, VaryingPropertyValueRecord } from "./types";
import { normalizeVaryingContext } from "./varyingProperties";

export type EffectivePropertySource =
  | "varyingOverride"
  | "varyingDefault"
  | "baseProperty"
  | "dictionaryDefault"
  | "missing";

export interface EffectiveProperty {
  propertyName: string;
  value: string;
  source: EffectivePropertySource;
  matchedContext: { cubeType: string; scenarioType: string; timeMember: string } | null;
  required: boolean;
  conflict: boolean;
  conflictingValues: string[];
  explanation: string;
}

export type EffectivePovTargetType = "member" | "relationship" | "dimension";

export interface EffectivePovInput {
  dimensionType: DimensionType;
  targetType: EffectivePovTargetType;
  baseProperties: Record<string, unknown>;
  /** Varying property values already scoped to the target. */
  varyingValues: VaryingPropertyValueRecord[];
  context: VaryingPropertyContext;
  propertyNames?: string[];
}

export interface EffectivePovReport {
  context: Required<VaryingPropertyContext>;
  properties: EffectiveProperty[];
  warnings: string[];
}

/**
 * Resolve the effective OneStream property values for a target under a given POV context.
 *
 * Precedence (highest first):
 *   1. Varying override that matches the context (more specific contexts win).
 *   2. Varying default value.
 *   3. Base persisted property.
 *   4. Dictionary default value.
 *   5. Unresolved / missing.
 *
 * When two equally specific overrides match with different values, the property is flagged as a
 * conflict rather than silently picking one.
 */
export function resolveEffectivePov(input: EffectivePovInput): EffectivePovReport {
  const context = normalizeVaryingContext(input.context);
  const warnings: string[] = [];

  const propertyNames = input.propertyNames && input.propertyNames.length > 0
    ? input.propertyNames
    : collectPropertyNames(input.baseProperties, input.varyingValues);

  const properties: EffectiveProperty[] = propertyNames.map((propertyName) =>
    resolveProperty(propertyName, input, context, warnings)
  );

  return { context, properties, warnings };
}

function resolveProperty(
  propertyName: string,
  input: EffectivePovInput,
  context: Required<VaryingPropertyContext>,
  warnings: string[]
): EffectiveProperty {
  const definition = getPropertyDefinitionByName(input.dimensionType, input.targetType, propertyName);
  const required = Boolean(definition?.required);

  const normalizedName = normalizePropertyLookupName(propertyName);
  const candidates = input.varyingValues
    .filter((value) => normalizePropertyLookupName(value.propertyName) === normalizedName)
    .filter((value) => contextMatches(value, context))
    .map((value) => ({ value, score: specificity(value) + (value.isDefault ? 0 : 10) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.value.updatedAt.localeCompare(b.value.updatedAt) || a.value.id.localeCompare(b.value.id);
    });

  // Conflict detection: equally-scored top candidates with differing values.
  let conflict = false;
  let conflictingValues: string[] = [];
  if (candidates.length > 1) {
    const topScore = candidates[0].score;
    const topGroup = candidates.filter((c) => c.score === topScore);
    const distinct = [...new Set(topGroup.map((c) => normalizeCellValue(c.value.value)))];
    if (topGroup.length > 1 && distinct.length > 1) {
      conflict = true;
      conflictingValues = distinct;
      warnings.push(`Conflicting varying overrides for '${propertyName}': ${distinct.join(", ")}.`);
    }
  }

  const top = candidates[0]?.value;
  let value = "";
  let source: EffectivePropertySource = "missing";
  let matchedContext: EffectiveProperty["matchedContext"] = null;

  if (top) {
    value = normalizeCellValue(top.value);
    if (!top.isDefault && specificity(top) > 0) {
      source = "varyingOverride";
      matchedContext = normalizeVaryingContext(top);
    } else {
      source = "varyingDefault";
    }
  }

  if (source === "missing") {
    const baseValue = normalizeCellValue(findBaseValue(input.baseProperties, propertyName));
    if (baseValue) {
      value = baseValue;
      source = "baseProperty";
    } else if (definition?.defaultValue !== undefined && definition.defaultValue !== "") {
      value = String(definition.defaultValue);
      source = "dictionaryDefault";
    }
  }

  if (!value && required) {
    warnings.push(`Required property '${propertyName}' has no effective value under this context.`);
  }

  return {
    propertyName,
    value,
    source,
    matchedContext,
    required,
    conflict,
    conflictingValues,
    explanation: explain(source, matchedContext, conflict)
  };
}

function explain(
  source: EffectivePropertySource,
  matchedContext: EffectiveProperty["matchedContext"],
  conflict: boolean
): string {
  const base = (() => {
    switch (source) {
      case "varyingOverride": {
        const axes = matchedContext
          ? [matchedContext.cubeType, matchedContext.scenarioType, matchedContext.timeMember].filter(Boolean).join(" / ")
          : "";
        return `Varying override matched context (${axes || "any"}).`;
      }
      case "varyingDefault": return "Varying default value (no context-specific override matched).";
      case "baseProperty": return "Base persisted property value.";
      case "dictionaryDefault": return "OneStream dictionary default value.";
      case "missing": return "No value resolved for this property under the given context.";
    }
  })();
  return conflict ? `${base} Multiple equally specific overrides conflict; review required.` : base;
}

function collectPropertyNames(
  baseProperties: Record<string, unknown>,
  varyingValues: VaryingPropertyValueRecord[]
): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(baseProperties)) {
    if (key.startsWith("__")) continue;
    names.add(key);
  }
  for (const value of varyingValues) names.add(value.propertyName);
  return [...names].sort((a, b) => a.localeCompare(b));
}

function findBaseValue(baseProperties: Record<string, unknown>, propertyName: string): unknown {
  if (propertyName in baseProperties) return baseProperties[propertyName];
  const normalized = normalizePropertyLookupName(propertyName);
  for (const [key, value] of Object.entries(baseProperties)) {
    if (normalizePropertyLookupName(key) === normalized) return value;
  }
  return "";
}

function contextMatches(value: VaryingPropertyValueRecord, context: Required<VaryingPropertyContext>): boolean {
  const valueContext = normalizeVaryingContext(value);
  return matchesAxis(valueContext.cubeType, context.cubeType)
    && matchesAxis(valueContext.scenarioType, context.scenarioType)
    && matchesAxis(valueContext.timeMember, context.timeMember);
}

function matchesAxis(valueAxis: string, contextAxis: string): boolean {
  if (!valueAxis) return true;
  return valueAxis.toLowerCase() === contextAxis.toLowerCase();
}

function specificity(value: VaryingPropertyValueRecord): number {
  const context = normalizeVaryingContext(value);
  return [context.cubeType, context.scenarioType, context.timeMember].filter(Boolean).length;
}
