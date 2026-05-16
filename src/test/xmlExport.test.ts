import { describe, expect, it } from "vitest";
import { exportProjectXml } from "../shared/xmlExport";
import {
  memberFixture,
  relationshipFixture,
  sampleProject,
  sampleScenarioDimension
} from "./fixtures";

describe("xml export", () => {
  it("generates OneStream wrapper and escapes XML values", () => {
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
    expect(xml).toContain('<OneStreamXF version="5.0.0.9826">');
    expect(xml).toContain('type="Scenario"');
    expect(xml).toContain("<scenarioMember ");
    expect(xml).toContain("A&amp;B &lt;Actual&gt;");
    expect(xml).not.toContain("#NAME?");
  });
});

