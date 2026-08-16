import { describe, expect, it } from "vitest";
import { validateDimension } from "../shared/validationEngine";
import { getValidationRule, VALIDATION_RULE_CATALOG, resolveValidationSeverity } from "../shared/validationRuleCatalog";
import { memberFixture, relationshipFixture, sampleProject, sampleScenarioDimension } from "./fixtures";

const emittedValidationCodes = [
  "DIMENSION_TYPE_REQUIRED", "DIMENSION_NAME_REQUIRED", "MEMBER_KEY_REQUIRED", "DUPLICATE_MEMBER",
  "RELATIONSHIP_PARENT_REQUIRED", "RELATIONSHIP_CHILD_REQUIRED", "UNKNOWN_RELATIONSHIP_CHILD", "UNKNOWN_RELATIONSHIP_PARENT",
  "DUPLICATE_RELATIONSHIP", "CIRCULAR_HIERARCHY", "ORPHAN_MEMBER", "RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS",
  "SELF_REFERENCING_RELATIONSHIP", "MEMBER_NAME_LEADING_TRAILING_WHITESPACE", "HIERARCHY_MAX_DEPTH_EXCEEDED",
  "DUPLICATE_MEMBER_CASE_INSENSITIVE", "SCENARIO_TYPE_MISSING", "CONSOLIDATION_METHOD_MISMATCH", "DUPLICATE_VARYING_PROPERTY",
  "VARYING_PROPERTY_TARGET_NOT_FOUND", "UNKNOWN_VARYING_PROPERTY", "NON_VARYING_PROPERTY_OVERRIDE", "INVALID_VARYING_PROPERTY_VALUE",
  "RELATIONSHIP_OPERATION_UNSUPPORTED", "COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY", "MOVE_WITHOUT_OLD_PARENT", "BREAK_BUILD_HAS_NO_BASELINE",
  "RELATIONSHIP_DELETE_CREATES_ORPHAN", "INVALID_BOOLEAN", "INVALID_NUMBER", "FORMULA_ERROR_VALUE", "XML_INVALID_CHARACTER",
  "INVALID_ENUM_VALUE", "INVALID_PROPERTY_TYPE", "UNKNOWN_PROPERTY", "XML_UNKNOWN_DIMENSION_ATTRIBUTE", "XML_UNKNOWN_MEMBER_ATTRIBUTE",
  "XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE", "XML_UNSUPPORTED_ELEMENT_PRESERVED", "MEMBER_NAME_ONLY_SPECIAL_CHARACTERS", "MEMBER_NAME_TOO_LONG",
  "MEMBER_NAME_CONTAINS_SPACE", "MEMBER_NAME_CONTAINS_PERIOD", "MEMBER_NAME_QUERY_BRACKETS", "MEMBER_NAME_RESTRICTED_CHARACTER",
  "RESERVED_MEMBER_NAME", "RESERVED_MEMBER_NAME_CASE_MISMATCH", "ALIAS_DUPLICATES_MEMBER_NAME", "DUPLICATE_ALIAS", "SORT_ORDER_ZERO",
  "SORT_ORDER_DUPLICATE", "SHARED_MEMBER_DETECTED", "MULTIPLE_PARENT_NOT_ALLOWED", "PARENT_MEMBER_ALLOW_INPUT_WARNING",
  "ACCOUNT_TYPE_MISSING", "ENTITY_CURRENCY_MISSING", "CROSS_DIMENSION_CURRENCY_INVALID", "ENTITY_OWNERSHIP_VALUE_INVALID",
  "SECURITY_GROUP_REFERENCE_MISSING", "RELATIONSHIP_WEIGHT_MISSING", "VARYING_PROPERTY_DUPLICATE"
];

describe("validation rule catalog", () => {
  it("registers every emitted validation code", () => {
    for (const code of emittedValidationCodes) expect(getValidationRule(code), code).toBeDefined();
  });

  it("locks hard errors and limits advisory overrides", () => {
    const hardRule = getValidationRule("MEMBER_NAME_TOO_LONG")!;
    const advisoryRule = getValidationRule("UNKNOWN_RELATIONSHIP_CHILD")!;
    expect(hardRule.locked).toBe(true);
    expect(hardRule.allowedSeverities).toEqual(["error"]);
    expect(resolveValidationSeverity(hardRule.code, "off")).toBe("error");
    expect(advisoryRule.allowedSeverities).toEqual(["warning", "info", "off"]);
    expect(resolveValidationSeverity(advisoryRule.code, "error")).toBe("warning");
  });

  it("applies an override only to its exact advisory code", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: sampleScenarioDimension,
      members: [memberFixture({ memberKey: "Actual" })],
      relationships: [relationshipFixture({ parentKey: "MissingParent", childKey: "MissingChild" })],
      ruleOverrides: new Map([["UNKNOWN_RELATIONSHIP_CHILD", "off"]])
    });
    expect(issues.some((issue) => issue.code === "UNKNOWN_RELATIONSHIP_CHILD")).toBe(false);
    expect(issues.find((issue) => issue.code === "UNKNOWN_RELATIONSHIP_PARENT")?.severity).toBe("warning");
  });

  it("does not classify supported hierarchy states as blocking", () => {
    for (const code of ["SHARED_MEMBER_DETECTED", "ORPHAN_MEMBER", "RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS", "MULTIPLE_PARENT_NOT_ALLOWED"]) {
      expect(getValidationRule(code)!.blocksExport, code).toBe(false);
    }
    expect(VALIDATION_RULE_CATALOG.filter((rule) => rule.blocksExport).every((rule) => rule.locked && rule.classification === "hard_error")).toBe(true);
  });
});
