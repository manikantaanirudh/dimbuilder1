import type { OneStreamPropertyValueType } from "./oneStreamPropertyDictionary";

export type FilterTarget = "member" | "relationship";

export type FilterOp =
  | "contains"
  | "equals"
  | "startsWith"
  | "is"
  | "isNot"
  | "isTrue"
  | "isFalse"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export interface FilterCondition {
  target: FilterTarget;
  /** Stored property display name (e.g. "Account Type") or a special column token (e.g. "@memberKey"). */
  fieldKey: string;
  op: FilterOp;
  value: string;
}

/** Special field tokens that map to real table columns rather than properties_json keys. */
export const SPECIAL_FIELDS = {
  memberKey: "@memberKey",
  description: "@description",
  parentKey: "@parentKey",
  childKey: "@childKey",
  ownershipType: "@ownershipType",
} as const;

export const OPERATOR_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  equals: "equals",
  startsWith: "starts with",
  is: "is",
  isNot: "is not",
  isTrue: "is true",
  isFalse: "is false",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
};

/** Operators offered for a given property value type. */
export function operatorsForValueType(valueType: OneStreamPropertyValueType): FilterOp[] {
  switch (valueType) {
    case "boolean":
      return ["isTrue", "isFalse"];
    case "enum":
      return ["is", "isNot"];
    case "number":
    case "decimal":
      return ["equals", "gt", "lt", "gte", "lte"];
    default:
      // string, currency, memberRef, formula, securityGroup, timeMember
      return ["contains", "equals", "startsWith"];
  }
}

const TRUTHY = new Set(["true", "1", "yes", "y", "t"]);

/** Pure predicate used by the app-side property filter and unit tests. */
export function evaluateCondition(recordValue: unknown, op: FilterOp, value: string): boolean {
  const raw = recordValue === null || recordValue === undefined ? "" : String(recordValue);
  const rv = raw.trim().toLowerCase();
  const target = value.trim().toLowerCase();

  switch (op) {
    case "contains":
      return rv.includes(target);
    case "equals":
    case "is":
      return rv === target;
    case "isNot":
      return rv !== target;
    case "startsWith":
      return rv.startsWith(target);
    case "isTrue":
      return TRUTHY.has(rv);
    case "isFalse":
      return !TRUTHY.has(rv);
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      const a = Number(raw);
      const b = Number(value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (op === "gt") return a > b;
      if (op === "lt") return a < b;
      if (op === "gte") return a >= b;
      return a <= b;
    }
    default:
      return false;
  }
}

/** Returns the entity target for a special field token, or null for property-name fields. */
export function specialFieldTarget(fieldKey: string): FilterTarget | null {
  switch (fieldKey) {
    case SPECIAL_FIELDS.memberKey:
    case SPECIAL_FIELDS.description:
      return "member";
    case SPECIAL_FIELDS.parentKey:
    case SPECIAL_FIELDS.childKey:
    case SPECIAL_FIELDS.ownershipType:
      return "relationship";
    default:
      return null;
  }
}

/** Maps a special field token to its physical column, or null for property-name fields. */
export function columnForSpecialField(
  fieldKey: string,
): { target: FilterTarget; column: string } | null {
  switch (fieldKey) {
    case SPECIAL_FIELDS.memberKey:
      return { target: "member", column: "member_key" };
    case SPECIAL_FIELDS.description:
      return { target: "member", column: "description" };
    case SPECIAL_FIELDS.parentKey:
      return { target: "relationship", column: "parent_key" };
    case SPECIAL_FIELDS.childKey:
      return { target: "relationship", column: "child_key" };
    case SPECIAL_FIELDS.ownershipType:
      return { target: "relationship", column: "ownership_type" };
    default:
      return null;
  }
}

/**
 * Reads the value a condition tests against from a parsed record.
 * `properties` is the parsed properties_json object; column fields are supplied via `columns`.
 */
export function readConditionValue(
  fieldKey: string,
  properties: Record<string, unknown>,
  columns: Partial<Record<string, unknown>> = {},
): unknown {
  const special = columnForSpecialField(fieldKey);
  if (special) return columns[special.column];
  // Property fields: match the stored display-name key case-insensitively.
  if (fieldKey in properties) return properties[fieldKey];
  const wanted = fieldKey.trim().toLowerCase();
  for (const [key, val] of Object.entries(properties)) {
    if (key.trim().toLowerCase() === wanted) return val;
  }
  return undefined;
}
