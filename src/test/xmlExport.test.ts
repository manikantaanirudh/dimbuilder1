import { describe, expect, it } from "vitest";
import { exportProjectXml } from "../shared/xmlExport";
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

  it("uses the OneStream version captured from metadata reference", () => {
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [{ ...sampleScenarioDimension, metadata: { oneStreamVersion: "9.3.1.0" } }],
      members: [],
      relationships: []
    });

    expect(xml).toContain('<OneStreamXF version="9.3.1.0">');
  });
});
