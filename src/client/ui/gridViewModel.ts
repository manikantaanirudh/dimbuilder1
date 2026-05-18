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
  return JSON.stringify(current) === JSON.stringify(optimisticRecord);
}
