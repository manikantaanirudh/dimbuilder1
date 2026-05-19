import { describe, expect, it } from "vitest";
import { planRelationshipLoadMode } from "../shared/relationshipOperations";
import { exportProjectXml } from "../shared/xmlExport";
import { UNKNOWN_XML_DATA_KEY } from "../shared/xmlImport";
import {
  memberFixture,
  relationshipFixture,
  sampleProject,
  sampleScenarioDimension
} from "./fixtures";

describe("xml export", () => {
  it("generates OneStream Load/Extract member and relationship XML", () => {
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [sampleScenarioDimension],
      members: [
        memberFixture({
          description: "A&B <Actual>",
          properties: {
            Entity: "Actual",
            Description: "A&B <Actual>",
            Text1: "quoted \"text\"",
            Text2: "#NAME?"
          }
        })
      ],
      relationships: [relationshipFixture()]
    });

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<OneStreamXF version="9.2.0.18004">');
    expect(xml).toContain('type="Scenario"');
    expect(xml).toContain('<member name="Actual" alias="" description="A&amp;B &lt;Actual&gt;"');
    expect(xml).toContain('<properties>');
    expect(xml).toContain('<property name="Text1" value="quoted &quot;text&quot;" />');
    expect(xml).toContain('<relationship parent="Root" child="Actual" />');
    expect(xml).toContain("A&amp;B &lt;Actual&gt;");
    expect(xml).not.toContain("#NAME?");
  });

  it("writes entity ownership fields as relationship properties", () => {
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [{ ...sampleScenarioDimension, dimensionType: "Entity", dimensionName: "CompanyCode" }],
      members: [
        memberFixture({
          memberKey: "E100",
          properties: {
            Entity: "E100",
            Description: "Entity 100",
            "Read Group": "Everyone",
            "Read Write Group": "Administrators",
            "Display Group": "Everyone"
          }
        })
      ],
      relationships: [
        relationshipFixture({
          parentKey: "Root",
          childKey: "E100",
          properties: {
            Parent: "Root",
            Child: "E100",
            "Parent Sort Order": "1",
            "Percent Consol": "100",
            "Percent Ownership": "75",
            "Ownership Type": "FullConsolidation"
          }
        })
      ]
    });

    expect(xml).toContain('<relationship parent="Root" child="E100">');
    expect(xml).toContain('<property name="ParentSortOrder" value="1" />');
    expect(xml).toContain('<property name="PercentConsolidation" value="100" />');
    expect(xml).toContain('<property name="PercentOwnership" value="75" />');
    expect(xml).toContain('<property name="OwnershipType" value="FullConsolidation" />');
  });

  it("uses dictionary aliases and XML names before fallback property conversion", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      id: "dim-account",
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts"
    };
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [accountDimension],
      members: [
        memberFixture({
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: {
            Account: "Revenue",
            Description: "Revenue",
            "Acct Type": "Revenue",
            "Legacy Custom Property": "Retain"
          }
        })
      ],
      relationships: []
    });

    expect(xml).toContain('<property name="AccountType" value="Revenue" />');
    expect(xml).toContain('<property name="LegacyCustomProperty" value="Retain" />');
    expect(xml).not.toContain('<property name="AcctType"');
  });

  it("emits varying properties with deterministic explicit context attributes", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      id: "dim-account",
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts"
    };
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [accountDimension],
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
          id: "varying-2",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "member-revenue",
          propertyName: "Legacy Varying Field",
          value: "Keep",
          cubeType: "",
          scenarioType: "Budget",
          timeMember: "",
          isDefault: false,
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        },
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
          source: "manual",
          metadata: {},
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z"
        }
      ]
    });

    expect(xml).toContain('<property name="Text1" value="Base" />');
    expect(xml).toContain('<property name="Text1" value="Finance actual note" cubeType="Finance" scenarioType="Actual" timeMember="2026M1" />');
    expect(xml).toContain('<property name="LegacyVaryingField" value="Keep" scenarioType="Budget" />');
    expect(xml.indexOf('name="Text1" value="Finance actual note"')).toBeLessThan(xml.indexOf('name="LegacyVaryingField"'));
  });

  it("uses the OneStream version captured from metadata reference", () => {
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [{ ...sampleScenarioDimension, metadata: { oneStreamVersion: "9.3.1.0" } }],
      members: [],
      relationships: []
    });

    expect(xml).toContain('<OneStreamXF version="9.3.1.0">');
  });

  it("uses the configured OneStream fallback version when metadata has no version", () => {
    const xml = exportProjectXml(
      {
        project: sampleProject,
        dimensions: [sampleScenarioDimension],
        members: [],
        relationships: []
      },
      { oneStreamVersionFallback: "10.0.0.1" }
    );

    expect(xml).toContain('<OneStreamXF version="10.0.0.1">');
  });

  it("writes compact XML and omits dimension source attributes when configured", () => {
    const xml = exportProjectXml(
      {
        project: sampleProject,
        dimensions: [
          {
            ...sampleScenarioDimension,
            metadata: {
              dimMemberSourceType: "Delimited",
              dimMemberSourcePath: "/imports/scenarios.csv",
              dimMemberSourceNVPairs: "Delimiter=,"
            }
          }
        ],
        members: [memberFixture()],
        relationships: []
      },
      { prettyPrint: false, includeDimensionSourceAttributes: false }
    );

    expect(xml).not.toContain("\n");
    expect(xml).toContain("?><OneStreamXF");
    expect(xml).not.toContain("dimMemberSourceType");
    expect(xml).not.toContain("dimMemberSourcePath");
    expect(xml).not.toContain("dimMemberSourceNVPairs");
  });

  it("includes formula errors and blank member rows when configured", () => {
    const xml = exportProjectXml(
      {
        project: sampleProject,
        dimensions: [sampleScenarioDimension],
        members: [
          memberFixture({
            memberKey: "",
            description: "#NAME?",
            properties: {
              Entity: "",
              Description: "#NAME?",
              Text1: "#VALUE?"
            }
          })
        ],
        relationships: []
      },
      { skipBlankMemberRows: false, skipFormulaErrors: false }
    );

    expect(xml).toContain('<member name="" alias="" description="#NAME?">');
    expect(xml).toContain('<property name="Text1" value="#VALUE?" />');
  });

  it("preserves imported unknown XML fields after known exported properties", () => {
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [
        {
          ...sampleScenarioDimension,
          metadata: {
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: { customDimensionAttribute: "preserved" },
              unknownElements: [
                {
                  name: "property",
                  attributes: { name: "LegacyDimensionProperty", value: "KeepDimension" },
                  text: "",
                  sourceOrder: 1,
                  originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/properties/property"
                },
                {
                  name: "unsupportedDimensionNode",
                  attributes: { code: "D1" },
                  text: "Hold",
                  sourceOrder: 2,
                  originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/unsupportedDimensionNode"
                }
              ],
              sourceOrder: 0
            }
          }
        }
      ],
      members: [
        memberFixture({
          properties: {
            Entity: "Actual",
            Text1: "Known",
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: { customMemberAttribute: "preserved" },
              unknownElements: [
                {
                  name: "property",
                  attributes: { name: "LegacyMemberProperty", value: "KeepMember" },
                  text: "",
                  sourceOrder: 1,
                  originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/members/member/properties/property"
                }
              ],
              sourceOrder: 0
            }
          }
        })
      ],
      relationships: [
        relationshipFixture({
          properties: {
            Parent: "Root",
            Child: "Actual",
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: { customRelationshipAttribute: "preserved" },
              unknownElements: [
                {
                  name: "property",
                  attributes: { name: "LegacyRelationshipProperty", value: "KeepRelationship" },
                  text: "",
                  sourceOrder: 1,
                  originalXmlPath: "/OneStreamXF/metadataRoot/dimensions/dimension/relationships/relationship/properties/property"
                }
              ],
              sourceOrder: 0
            }
          }
        })
      ]
    });

    expect(xml).toContain('customDimensionAttribute="preserved"');
    expect(xml).toContain('customMemberAttribute="preserved"');
    expect(xml).toContain('customRelationshipAttribute="preserved"');
    expect(xml).toContain('<property name="LegacyDimensionProperty" value="KeepDimension" />');
    expect(xml).toContain('<property name="LegacyMemberProperty" value="KeepMember" />');
    expect(xml).toContain('<property name="LegacyRelationshipProperty" value="KeepRelationship" />');
    expect(xml).toContain('<unsupportedDimensionNode code="D1">Hold</unsupportedDimensionNode>');
    expect(xml.indexOf('<property name="Text1" value="Known" />')).toBeLessThan(xml.indexOf('<property name="LegacyMemberProperty" value="KeepMember" />'));
  });

  it("emits deterministic relationship operation plans for non-full XML load modes", () => {
    const accountDimension = {
      ...sampleScenarioDimension,
      id: "dim-account",
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      sheetName: "Accounts"
    };
    const baseline = {
      project: sampleProject,
      dimensions: [accountDimension],
      members: [
        memberFixture({ id: "root", dimensionId: accountDimension.id, memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "old", dimensionId: accountDimension.id, memberKey: "OldParent", properties: { Account: "OldParent" } }),
        memberFixture({ id: "new", dimensionId: accountDimension.id, memberKey: "NewParent", properties: { Account: "NewParent" } }),
        memberFixture({ id: "rev", dimensionId: accountDimension.id, memberKey: "Revenue", properties: { Account: "Revenue" } })
      ],
      relationships: [
        relationshipFixture({
          id: "old-rel",
          dimensionId: accountDimension.id,
          parentKey: "OldParent",
          childKey: "Revenue",
          aggregationWeight: 1,
          properties: { Parent: "OldParent", Child: "Revenue", "Aggregation Weight": 1 }
        })
      ]
    };
    const target = {
      ...baseline,
      relationships: [
        relationshipFixture({
          id: "new-rel",
          dimensionId: accountDimension.id,
          parentKey: "NewParent",
          childKey: "Revenue",
          aggregationWeight: 1,
          properties: { Parent: "NewParent", Child: "Revenue", "Aggregation Weight": 1 }
        })
      ]
    };

    for (const mode of ["additive", "propertyUpdate", "relationshipDelete", "moveCopy", "breakBuild"] as const) {
      const plan = planRelationshipLoadMode(target, baseline, mode, { dimensionId: accountDimension.id });
      const xml = exportProjectXml(target, { loadMode: mode, relationshipPlan: plan });
      expect(xml).toContain(`<relationshipOperations mode="${mode}"`);
      expect(xml).toContain("SR Onestream Dim Builder relationship operation plan");
    }

    const moveCopyPlan = planRelationshipLoadMode(target, baseline, "moveCopy", { dimensionId: accountDimension.id });
    const moveCopyXml = exportProjectXml(target, { loadMode: "moveCopy", relationshipPlan: moveCopyPlan });
    expect(moveCopyXml).toContain('<relationshipOperation operation="move" dimensionType="Account" dimensionName="Accounts" parent="NewParent" child="Revenue" oldParent="OldParent" newParent="NewParent"');
    expect(moveCopyXml).toContain("OneStream delete/move XML syntax requires implementation-team confirmation");

    const fullXml = exportProjectXml(target);
    expect(fullXml).not.toContain("<relationshipOperations");
  });
});
