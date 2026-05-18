import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../../shared/types";

export type GridRecord = DimensionMemberRecord | DimensionRelationshipRecord;
export type GridKind = "members" | "relationships";

const MAX_GRID_PAGE_SIZE = 1000;

export function clampGridPageSize(pageSize: number) {
  const integerPageSize = Number.isFinite(pageSize) ? Math.trunc(pageSize) : 1;
  return Math.min(MAX_GRID_PAGE_SIZE, Math.max(1, integerPageSize));
}

export function buildOptimisticGridRecord(
  record: GridRecord,
  kind: GridKind,
  memberKeyField: string,
  fieldName: string,
  value: string
): GridRecord {
  const properties = { ...record.properties, [fieldName]: value };

  if (kind === "members" && fieldName === memberKeyField) {
    return { ...record, memberKey: value, properties } as DimensionMemberRecord;
  }

  if (kind === "relationships") {
    const relationship = record as DimensionRelationshipRecord;
    if (fieldName === "Parent") return { ...relationship, parentKey: value, properties };
    if (fieldName === "Child") return { ...relationship, childKey: value, properties };
  }

  return { ...record, properties } as GridRecord;
}

export function shouldRollbackGridRecord(current: GridRecord, optimisticRecord: GridRecord) {
  if (current.id !== optimisticRecord.id) return false;
  if (!areGridPropertiesEqual(current.properties, optimisticRecord.properties)) return false;

  if ("memberKey" in current && "memberKey" in optimisticRecord) {
    return current.memberKey === optimisticRecord.memberKey;
  }

  if ("parentKey" in current && "parentKey" in optimisticRecord) {
    return current.parentKey === optimisticRecord.parentKey && current.childKey === optimisticRecord.childKey;
  }

  return false;
}

function areGridPropertiesEqual(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && areGridValuesEqual(left[key], right[key]));
}

function areGridValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => areGridValuesEqual(value, right[index]));
  }
  if (isGridObject(left) || isGridObject(right)) {
    return isGridObject(left) && isGridObject(right) && areGridPropertiesEqual(left, right);
  }
  return false;
}

function isGridObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
