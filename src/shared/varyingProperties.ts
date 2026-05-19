import { normalizeCellValue } from "./text";
import type { VaryingPropertyContext, VaryingPropertyValueRecord } from "./types";

export interface DuplicateVaryingProperty {
  key: string;
  records: VaryingPropertyValueRecord[];
}

export function normalizeVaryingContext(value: VaryingPropertyContext): Required<VaryingPropertyContext> {
  return {
    cubeType: normalizeCellValue(value.cubeType),
    scenarioType: normalizeCellValue(value.scenarioType),
    timeMember: normalizeCellValue(value.timeMember)
  };
}

export function getVaryingPropertyContextKey(value: Pick<VaryingPropertyValueRecord, "targetType" | "targetId" | "propertyName" | "cubeType" | "scenarioType" | "timeMember">): string {
  const context = normalizeVaryingContext(value);
  return [
    value.targetType,
    value.targetId,
    normalizePropertyNameForContextKey(value.propertyName),
    context.cubeType.toLowerCase(),
    context.scenarioType.toLowerCase(),
    context.timeMember.toLowerCase()
  ].join("|");
}

function normalizePropertyNameForContextKey(propertyName: string): string {
  return normalizeCellValue(propertyName).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findDuplicateVaryingPropertyValues(values: VaryingPropertyValueRecord[]): DuplicateVaryingProperty[] {
  const byKey = new Map<string, VaryingPropertyValueRecord[]>();
  for (const value of values) {
    const key = getVaryingPropertyContextKey(value);
    byKey.set(key, [...(byKey.get(key) ?? []), value]);
  }
  return [...byKey.entries()]
    .filter(([, records]) => records.length > 1)
    .map(([key, records]) => ({ key, records }));
}

export function hasVaryingOverrideContext(value: VaryingPropertyValueRecord): boolean {
  const context = normalizeVaryingContext(value);
  return !value.isDefault || Boolean(context.cubeType || context.scenarioType || context.timeMember);
}

export function getEffectivePropertyValue(
  baseValue: unknown,
  varyingValues: VaryingPropertyValueRecord[],
  context: VaryingPropertyContext = {}
): string {
  const normalizedContext = normalizeVaryingContext(context);
  const ranked = varyingValues
    .filter((value) => contextMatches(value, normalizedContext))
    .map((value) => ({ value, score: contextSpecificity(value) + (value.isDefault ? 0 : 10) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.value.updatedAt.localeCompare(right.value.updatedAt) || left.value.id.localeCompare(right.value.id);
    });

  return ranked[0]?.value.value ?? normalizeCellValue(baseValue);
}

function contextMatches(
  value: VaryingPropertyValueRecord,
  context: Required<VaryingPropertyContext>
): boolean {
  const valueContext = normalizeVaryingContext(value);
  return matchesAxis(valueContext.cubeType, context.cubeType)
    && matchesAxis(valueContext.scenarioType, context.scenarioType)
    && matchesAxis(valueContext.timeMember, context.timeMember);
}

function matchesAxis(valueAxis: string, contextAxis: string): boolean {
  if (!valueAxis) return true;
  return valueAxis.toLowerCase() === contextAxis.toLowerCase();
}

function contextSpecificity(value: VaryingPropertyValueRecord): number {
  const context = normalizeVaryingContext(value);
  return [context.cubeType, context.scenarioType, context.timeMember].filter(Boolean).length;
}
