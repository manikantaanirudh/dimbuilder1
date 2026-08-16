import { describe, expect, it } from "vitest";
import { validateDimension } from "../shared/validationEngine";
import { UNKNOWN_XML_DATA_KEY } from "../shared/xmlImport";
import {
  memberFixture,
  relationshipFixture,
  sampleProject,
  sampleScenarioDimension
} from "./fixtures";

describe("validation engine", () => {
  it("uses configured severities for rule-specific validation issues", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionName: "" },
      members: [
        memberFixture({ id: "m1", memberKey: "Actual", sourceRowNumber: 9 }),
        memberFixture({ id: "m2", memberKey: "Actual", sourceRowNumber: 10 })
      ],
      relationships: [
        relationshipFixture({ id: "r1", parentKey: "Root", childKey: "Forecast", sourceRowNumber: 16 }),
        relationshipFixture({ id: "r2", parentKey: "Root", childKey: "Forecast", sourceRowNumber: 17 })
      ],
      severities: {
        duplicateMemberSeverity: "error",
        duplicateRelationshipSeverity: "info",
        unknownRelationshipMemberSeverity: "error",
        missingRequiredFieldSeverity: "warning",
        circularHierarchySeverity: "info",
        relationshipsWithNoLocalMembersSeverity: "error"
      }
    });

    expect(issues.filter((issue) => issue.code === "DUPLICATE_MEMBER").map((issue) => issue.severity)).toEqual(["error", "error"]);
    expect(issues.find((issue) => issue.code === "DUPLICATE_RELATIONSHIP")?.severity).toBe("info");
    expect(issues.find((issue) => issue.code === "DIMENSION_NAME_REQUIRED")?.severity).toBe("error");
    expect(issues.find((issue) => issue.code === "UNKNOWN_RELATIONSHIP_CHILD")?.severity).toBe("warning");
  });

  it("detects duplicate members and missing relationship children", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: sampleScenarioDimension,
      members: [
        memberFixture({ id: "m1", memberKey: "Actual", sourceRowNumber: 9 }),
        memberFixture({ id: "m2", memberKey: "Actual", sourceRowNumber: 10 })
      ],
      relationships: [
        relationshipFixture({ id: "r1", parentKey: "Root", childKey: "Forecast", sourceRowNumber: 16 })
      ],
      duplicateSeverity: "warning"
    });

    expect(issues.map((issue) => issue.code)).toContain("DUPLICATE_MEMBER");
    expect(issues.map((issue) => issue.code)).toContain("UNKNOWN_RELATIONSHIP_CHILD");
  });

  it("blocks invalid booleans, invalid numbers, and circular references", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: sampleScenarioDimension,
      members: [
        memberFixture({
          id: "m1",
          memberKey: "A",
          properties: { Entity: "A", "Use In Workflow": "Maybe", "# of No Input Periods": "abc" }
        }),
        memberFixture({ id: "m2", memberKey: "B", properties: { Entity: "B" } })
      ],
      relationships: [
        relationshipFixture({ id: "r1", parentKey: "A", childKey: "B" }),
        relationshipFixture({ id: "r2", parentKey: "B", childKey: "A" })
      ]
    });

    expect(issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["INVALID_BOOLEAN", "INVALID_NUMBER"])
    );
    expect(issues.find((issue) => issue.code === "CIRCULAR_HIERARCHY")?.severity).toBe("warning");
  });

  it("blocks invalid numeric relationship properties for OneStream relationship fields", () => {
    const entityIssues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Entity", dimensionName: "Entities", sheetName: "Entities" },
      members: [
        memberFixture({ id: "m1", memberKey: "Root", properties: { Entity: "Root" } }),
        memberFixture({ id: "m2", memberKey: "Child", properties: { Entity: "Child" } })
      ],
      relationships: [
        relationshipFixture({
          parentKey: "Root",
          childKey: "Child",
          properties: {
            Parent: "Root",
            Child: "Child",
            "Parent Sort Order": "first",
            "Percent Consol": "all",
            "Percent Ownership": "half"
          }
        })
      ]
    });

    const accountIssues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      members: [
        memberFixture({ id: "m3", memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "m4", memberKey: "Cash", properties: { Account: "Cash" } })
      ],
      relationships: [
        relationshipFixture({
          parentKey: "Root",
          childKey: "Cash",
          properties: { Parent: "Root", Child: "Cash", "Aggregation Weight": "heavy" }
        })
      ]
    });

    const numericIssues = [...entityIssues, ...accountIssues].filter((issue) => issue.code === "INVALID_NUMBER");
    expect(numericIssues.map((issue) => issue.fieldName)).toEqual(
      expect.arrayContaining(["Parent Sort Order", "Percent Consol", "Percent Ownership", "Aggregation Weight"])
    );
  });

  it("allows OneStream account conditional consolidation and intercompany settings", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      members: [
        memberFixture({
          memberKey: "Sales",
          properties: {
            Account: "Sales",
            "Is Consolidated": "Conditional",
            "Is IC": "Conditional"
          }
        })
      ],
      relationships: []
    });

    expect(issues.filter((issue) => issue.code === "INVALID_BOOLEAN").map((issue) => issue.fieldName)).not.toEqual(
      expect.arrayContaining(["Is Consolidated", "Is IC"])
    );
  });

  it("validates dictionary enum and value types and warns for unknown properties", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      members: [
        memberFixture({
          memberKey: "Sales",
          properties: {
            Account: "Sales",
            Description: "Sales",
            "Account Type": "Unsupported Type",
            "Allow Input": "Sometimes",
            "Legacy Custom Property": "Keep me"
          }
        })
      ],
      relationships: []
    });

    expect(issues.find((issue) => issue.code === "INVALID_ENUM_VALUE" && issue.fieldName === "Account Type")?.severity).toBe("error");
    expect(issues.find((issue) => issue.code === "INVALID_PROPERTY_TYPE" && issue.fieldName === "Allow Input")?.severity).toBe("error");
    expect(issues.find((issue) => issue.code === "UNKNOWN_PROPERTY" && issue.fieldName === "Legacy Custom Property")?.severity).toBe("warning");
  });

  it("runs the OneStream profile when configured and honors profile property severities", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts"
    };
    const issues = validateDimension({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({
          id: "member-revenue",
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: {
            Account: "Revenue",
            "Account Type": "Unsupported Type",
            "Allow Input": "Sometimes",
            "Legacy Custom Property": "Keep me"
          }
        })
      ],
      relationships: [],
      severities: {
        duplicateMemberSeverity: "warning",
        duplicateRelationshipSeverity: "warning",
        unknownRelationshipMemberSeverity: "warning",
        missingRequiredFieldSeverity: "error",
        circularHierarchySeverity: "error",
        relationshipsWithNoLocalMembersSeverity: "warning",
        oneStreamProfile: {
          enabled: true,
          memberNameMaxLength: 250,
          warnOnMemberNameSpaces: true,
          warnOnMemberNamePeriods: true,
          reservedWords: ["Root", "None"],
          restrictedCharacters: ["<"],
          duplicateAliasSeverity: "warning",
          invalidSortOrderSeverity: "warning",
          sharedMemberSeverity: "info",
          parentInputWarningSeverity: "warning",
          unknownPropertySeverity: "info",
          invalidEnumSeverity: "warning",
          invalidPropertyTypeSeverity: "warning"
        }
      }
    });

    expect(issues.find((issue) => issue.code === "ACCOUNT_TYPE_MISSING")).toBeUndefined();
    expect(issues.find((issue) => issue.code === "INVALID_ENUM_VALUE" && issue.fieldName === "Account Type")?.severity).toBe("error");
    expect(issues.find((issue) => issue.code === "INVALID_PROPERTY_TYPE" && issue.fieldName === "Allow Input")?.severity).toBe("error");
    expect(issues.find((issue) => issue.code === "UNKNOWN_PROPERTY" && issue.fieldName === "Legacy Custom Property")?.severity).toBe("info");
  });

  it("can run generic validation without OneStream profile design rules", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts"
    };
    const issues = validateDimension({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({
          id: "member-revenue",
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: { Account: "Revenue" }
        })
      ],
      relationships: [],
      severities: {
        duplicateMemberSeverity: "warning",
        duplicateRelationshipSeverity: "warning",
        unknownRelationshipMemberSeverity: "warning",
        missingRequiredFieldSeverity: "error",
        circularHierarchySeverity: "error",
        relationshipsWithNoLocalMembersSeverity: "warning",
        oneStreamProfile: {
          enabled: false,
          memberNameMaxLength: 250,
          warnOnMemberNameSpaces: true,
          warnOnMemberNamePeriods: true,
          reservedWords: ["Root", "None"],
          restrictedCharacters: ["<"],
          duplicateAliasSeverity: "warning",
          invalidSortOrderSeverity: "warning",
          sharedMemberSeverity: "info",
          parentInputWarningSeverity: "warning",
          unknownPropertySeverity: "warning",
          invalidEnumSeverity: "error",
          invalidPropertyTypeSeverity: "error"
        }
      }
    });

    expect(issues.map((issue) => issue.code)).not.toContain("ACCOUNT_TYPE_MISSING");
  });

  it("validates Flow Switch Type as a True or False setting", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Flow", dimensionName: "Flows", sheetName: "Flow" },
      members: [
        memberFixture({
          memberKey: "Movement",
          properties: {
            "Flow Member": "Movement",
            "Switch Type": "Maybe"
          }
        })
      ],
      relationships: []
    });

    expect(issues.filter((issue) => issue.code === "INVALID_BOOLEAN").map((issue) => issue.fieldName)).toContain("Switch Type");
  });

  it("validates varying property targets, dictionary support, duplicates, and values", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts"
    };
    const issues = validateDimension({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({
          id: "member-revenue",
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: { Account: "Revenue", Text1: "Base" }
        })
      ],
      relationships: [],
      varyingPropertyValues: [
        {
          id: "varying-1",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "member-revenue",
          propertyName: "Text1",
          value: "Finance actual note",
          cubeType: "Finance",
          scenarioType: "Actual",
          timeMember: "2026M1",
          isDefault: false,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        },
        {
          id: "varying-2",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "member-revenue",
          propertyName: "Text1",
          value: "Duplicate context",
          cubeType: "Finance",
          scenarioType: "Actual",
          timeMember: "2026M1",
          isDefault: false,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        },
        {
          id: "varying-3",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "member-revenue",
          propertyName: "Account Type",
          value: "Unsupported Type",
          cubeType: "Finance",
          scenarioType: "",
          timeMember: "",
          isDefault: false,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        },
        {
          id: "varying-4",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "missing-member",
          propertyName: "Text2",
          value: "Missing target",
          cubeType: "",
          scenarioType: "",
          timeMember: "",
          isDefault: true,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        },
        {
          id: "varying-5",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "member-revenue",
          propertyName: "Legacy Varying Field",
          value: "Preserve",
          cubeType: "",
          scenarioType: "",
          timeMember: "2026M1",
          isDefault: false,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        }
      ]
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_VARYING_PROPERTY",
      "VARYING_PROPERTY_TARGET_NOT_FOUND",
      "UNKNOWN_VARYING_PROPERTY",
      "NON_VARYING_PROPERTY_OVERRIDE",
      "INVALID_VARYING_PROPERTY_VALUE"
    ]));
    expect(issues.find((issue) => issue.code === "UNKNOWN_VARYING_PROPERTY")?.severity).toBe("warning");
    expect(issues.find((issue) => issue.code === "INVALID_VARYING_PROPERTY_VALUE" && issue.fieldName === "Account Type")?.severity).toBe("warning");
  });

  it("reports preserved unknown XML attributes and unsupported elements as non-blocking import notes", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts",
      metadata: {
        [UNKNOWN_XML_DATA_KEY]: {
          unknownAttributes: { customDimAttr: "dim-custom" },
          unknownElements: [
            {
              name: "unsupportedDimensionNode",
              attributes: { code: "D1" },
              text: "Hold",
              sourceOrder: 1,
              originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/unsupportedDimensionNode"
            }
          ],
          sourceOrder: 0
        }
      }
    };
    const issues = validateDimension({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: {
            Account: "Revenue",
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: { customMemberAttr: "member-custom" },
              unknownElements: [
                {
                  name: "unsupportedMemberNode",
                  attributes: { code: "M1" },
                  text: "",
                  sourceOrder: 1,
                  originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/members/member/unsupportedMemberNode"
                }
              ],
              sourceOrder: 0
            }
          }
        })
      ],
      relationships: [
        relationshipFixture({
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "Revenue",
          properties: {
            Parent: "Root",
            Child: "Revenue",
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: { customRelationshipAttr: "relationship-custom" },
              unknownElements: [
                {
                  name: "unsupportedRelationshipNode",
                  attributes: { code: "R1" },
                  text: "Rel",
                  sourceOrder: 1,
                  originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/relationships/relationship/unsupportedRelationshipNode"
                }
              ],
              sourceOrder: 0
            }
          }
        })
      ]
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "XML_UNKNOWN_DIMENSION_ATTRIBUTE",
      "XML_UNKNOWN_MEMBER_ATTRIBUTE",
      "XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE",
      "XML_UNSUPPORTED_ELEMENT_PRESERVED"
    ]));
    expect(issues.filter((issue) => issue.code.startsWith("XML_")).map((issue) => issue.severity)).toEqual(
      expect.arrayContaining(["info"])
    );
  });

  it("warns for risky relationship operation planning metadata", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts",
      metadata: { allowMultipleParents: false }
    };
    const issues = validateDimension({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({ id: "m-root", dimensionId: accountDimension.id, memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "m-parent", dimensionId: accountDimension.id, memberKey: "Parent", properties: { Account: "Parent" } }),
        memberFixture({ id: "m-leaf", dimensionId: accountDimension.id, memberKey: "Leaf", properties: { Account: "Leaf" } }),
        memberFixture({ id: "m-copy", dimensionId: accountDimension.id, memberKey: "CopyTarget", properties: { Account: "CopyTarget" } }),
        memberFixture({ id: "m-move", dimensionId: accountDimension.id, memberKey: "MoveTarget", properties: { Account: "MoveTarget" } })
      ],
      relationships: [
        relationshipFixture({
          id: "rel-root-parent",
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "Parent",
          properties: { Parent: "Root", Child: "Parent" }
        }),
        relationshipFixture({
          id: "rel-delete",
          dimensionId: accountDimension.id,
          parentKey: "Parent",
          childKey: "Leaf",
          operation: "delete",
          properties: { Parent: "Parent", Child: "Leaf" }
        }),
        relationshipFixture({
          id: "rel-copy",
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "CopyTarget",
          operation: "copy",
          properties: { Parent: "Root", Child: "CopyTarget" }
        }),
        relationshipFixture({
          id: "rel-move",
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "MoveTarget",
          operation: "move",
          properties: { Parent: "Root", Child: "MoveTarget" }
        }),
        relationshipFixture({
          id: "rel-break",
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "Leaf",
          operation: "break",
          operationSource: "manual",
          properties: { Parent: "Root", Child: "Leaf" }
        }),
        relationshipFixture({
          id: "rel-unsupported",
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "Unsupported",
          operation: "unsupported" as never,
          properties: { Parent: "Root", Child: "Unsupported" }
        })
      ]
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "RELATIONSHIP_DELETE_CREATES_ORPHAN",
      "COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY",
      "MOVE_WITHOUT_OLD_PARENT",
      "BREAK_BUILD_HAS_NO_BASELINE",
      "RELATIONSHIP_OPERATION_UNSUPPORTED"
    ]));
    expect(issues.find((issue) => issue.code === "RELATIONSHIP_DELETE_CREATES_ORPHAN")?.severity).toBe("warning");
    expect(issues.find((issue) => issue.code === "RELATIONSHIP_OPERATION_UNSUPPORTED")?.severity).toBe("warning");
  });
});
