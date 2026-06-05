import { describe, expect, it } from "vitest";
import {
  assessProposedChange,
  buildMemberWhereUsed,
  detectArtifactType,
  scanArtifactReferences,
  type ArtifactReference
} from "../shared/artifactReferenceScanner";

describe("artifact reference scanner", () => {
  it("detects A#/E#/U1# prefixed references as high confidence with line numbers", () => {
    const content = [
      "Dim cube",
      'result = A#Sales + E#Houston',
      "value = U1#ProductA"
    ].join("\n");
    const refs = scanArtifactReferences(content);
    const sales = refs.find((r) => r.memberKey === "Sales");
    expect(sales).toBeDefined();
    expect(sales!.dimensionHint).toBe("Account");
    expect(sales!.confidence).toBe("high");
    expect(sales!.lineNumber).toBe(2);
    expect(refs.find((r) => r.memberKey === "Houston")?.dimensionHint).toBe("Entity");
    expect(refs.find((r) => r.memberKey === "ProductA")?.dimensionHint).toBe("UD1");
  });

  it("supports bracketed member names with spaces", () => {
    const refs = scanArtifactReferences("x = A#[Net Sales Revenue]");
    expect(refs[0].memberKey).toBe("Net Sales Revenue");
    expect(refs[0].confidence).toBe("high");
  });

  it("detects api.GetMember references as medium confidence", () => {
    const refs = scanArtifactReferences('api.Members.GetMember("Entity", "Houston")');
    expect(refs[0].dimensionHint).toBe("Entity");
    expect(refs[0].memberKey).toBe("Houston");
    expect(refs[0].confidence).toBe("medium");
  });

  it("does not treat arbitrary quoted text as references without known members", () => {
    const refs = scanArtifactReferences('comment = "This mentions Sales but is not a reference"');
    expect(refs).toHaveLength(0);
  });

  it("matches quoted known members at low confidence", () => {
    const refs = scanArtifactReferences('label = "Houston"', {
      knownMembers: [{ dimensionType: "Entity", memberKey: "Houston" }]
    });
    expect(refs).toHaveLength(1);
    expect(refs[0].confidence).toBe("low");
    expect(refs[0].dimensionHint).toBe("Entity");
  });

  it("captures a snippet for each reference", () => {
    const refs = scanArtifactReferences("line1\nformula = A#Revenue * 2");
    expect(refs[0].snippet).toContain("A#Revenue");
  });

  it("aggregates where-used across artifacts", () => {
    const artifactRefs: ArtifactReference[] = scanArtifactReferences("A#Sales\nA#Sales");
    const whereUsed = buildMemberWhereUsed("Account", "Sales", [
      { artifactId: "a1", artifactName: "Rule 1", references: artifactRefs }
    ]);
    expect(whereUsed.references).toHaveLength(2);
    expect(whereUsed.highConfidence).toBe(2);
  });

  it("flags a proposed delete of a referenced member as high risk", () => {
    const refs = scanArtifactReferences("A#Sales");
    const impact = assessProposedChange("Account", "Sales", "delete", [
      { artifactId: "a1", artifactName: "Rule 1", references: refs }
    ]);
    expect(impact.riskLevel).toBe("high");
    expect(impact.affectedArtifacts).toBe(1);
    expect(impact.totalReferences).toBe(1);
  });

  it("reports no risk when a member is not referenced", () => {
    const refs = scanArtifactReferences("A#Other");
    const impact = assessProposedChange("Account", "Sales", "delete", [
      { artifactId: "a1", artifactName: "Rule 1", references: refs }
    ]);
    expect(impact.riskLevel).toBe("none");
    expect(impact.totalReferences).toBe(0);
  });

  it("detects artifact type from file name", () => {
    expect(detectArtifactType("MyCubeView.xml")).toBe("cubeView");
    expect(detectArtifactType("CalcBusinessRule.vb")).toBe("businessRule");
    expect(detectArtifactType("notes.txt")).toBe("text");
  });
});
