import { describe, expect, it } from "vitest";
import {
  columnForSpecialField,
  evaluateCondition,
  operatorsForValueType,
  readConditionValue,
  specialFieldTarget,
  SPECIAL_FIELDS,
} from "../shared/structuredSearch";

describe("operatorsForValueType", () => {
  it("offers text operators for string-like types", () => {
    expect(operatorsForValueType("string")).toEqual(["contains", "equals", "startsWith"]);
    expect(operatorsForValueType("currency")).toEqual(["contains", "equals", "startsWith"]);
    expect(operatorsForValueType("memberRef")).toEqual(["contains", "equals", "startsWith"]);
  });
  it("offers boolean operators", () => {
    expect(operatorsForValueType("boolean")).toEqual(["isTrue", "isFalse"]);
  });
  it("offers enum operators", () => {
    expect(operatorsForValueType("enum")).toEqual(["is", "isNot"]);
  });
  it("offers numeric comparisons", () => {
    expect(operatorsForValueType("number")).toEqual(["equals", "gt", "lt", "gte", "lte"]);
    expect(operatorsForValueType("decimal")).toEqual(["equals", "gt", "lt", "gte", "lte"]);
  });
});

describe("evaluateCondition", () => {
  it("contains is case-insensitive", () => {
    expect(evaluateCondition("USDollar", "contains", "usd")).toBe(true);
    expect(evaluateCondition("Euro", "contains", "usd")).toBe(false);
  });
  it("equals / is compare full value case-insensitively", () => {
    expect(evaluateCondition("Expense", "equals", "expense")).toBe(true);
    expect(evaluateCondition("Expense", "is", "revenue")).toBe(false);
    expect(evaluateCondition("Expense", "isNot", "revenue")).toBe(true);
  });
  it("startsWith checks the prefix", () => {
    expect(evaluateCondition("Fcst_M1", "startsWith", "fcst")).toBe(true);
    expect(evaluateCondition("Act_M1", "startsWith", "fcst")).toBe(false);
  });
  it("boolean ops interpret truthy tokens", () => {
    expect(evaluateCondition("true", "isTrue", "")).toBe(true);
    expect(evaluateCondition("1", "isTrue", "")).toBe(true);
    expect(evaluateCondition("false", "isTrue", "")).toBe(false);
    expect(evaluateCondition("", "isFalse", "")).toBe(true);
    expect(evaluateCondition("yes", "isFalse", "")).toBe(false);
  });
  it("numeric ops compare as numbers", () => {
    expect(evaluateCondition("5", "gt", "3")).toBe(true);
    expect(evaluateCondition("5", "lt", "3")).toBe(false);
    expect(evaluateCondition("3", "gte", "3")).toBe(true);
    expect(evaluateCondition("2", "lte", "3")).toBe(true);
    expect(evaluateCondition("abc", "gt", "3")).toBe(false);
  });
  it("treats null/undefined as empty string", () => {
    expect(evaluateCondition(null, "equals", "")).toBe(true);
    expect(evaluateCondition(undefined, "contains", "x")).toBe(false);
  });
});

describe("special field mapping", () => {
  it("infers target for special tokens", () => {
    expect(specialFieldTarget(SPECIAL_FIELDS.memberKey)).toBe("member");
    expect(specialFieldTarget(SPECIAL_FIELDS.parentKey)).toBe("relationship");
    expect(specialFieldTarget("Account Type")).toBeNull();
  });
  it("maps special tokens to columns", () => {
    expect(columnForSpecialField(SPECIAL_FIELDS.memberKey)).toEqual({ target: "member", column: "member_key" });
    expect(columnForSpecialField(SPECIAL_FIELDS.childKey)).toEqual({ target: "relationship", column: "child_key" });
    expect(columnForSpecialField("Currency")).toBeNull();
  });
});

describe("readConditionValue", () => {
  it("reads special fields from columns", () => {
    expect(readConditionValue(SPECIAL_FIELDS.memberKey, {}, { member_key: "Cash" })).toBe("Cash");
    expect(readConditionValue(SPECIAL_FIELDS.parentKey, {}, { parent_key: "Total" })).toBe("Total");
  });
  it("reads property fields by display-name key, case-insensitively", () => {
    const props = { "Account Type": "Expense" };
    expect(readConditionValue("Account Type", props)).toBe("Expense");
    expect(readConditionValue("account type", props)).toBe("Expense");
    expect(readConditionValue("Missing", props)).toBeUndefined();
  });
});
