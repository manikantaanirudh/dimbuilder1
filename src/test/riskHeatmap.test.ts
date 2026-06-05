import { describe, expect, it } from "vitest";
import { buildRiskHeatmap, type RiskHeatmapInput } from "../shared/riskHeatmap";
import type { ValidationIssue } from "../shared/types";

function issue(overrides: Partial<ValidationIssue>): ValidationIssue {
  return {
    id: "i-1",
    projectId: "p-1",
    dimensionId: "dim-a",
    entityType: "member",
    entityId: "m-1",
    severity: "error",
    code: "VALIDATION_GENERIC",
    message: "Something is wrong",
    fieldName: "",
    rowNumber: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function input(overrides: Partial<RiskHeatmapInput> = {}): RiskHeatmapInput {
  return {
    dimensions: [
      { id: "dim-a", dimensionType: "Account", dimensionName: "Accounts" },
      { id: "dim-b", dimensionType: "Entity", dimensionName: "Entities" }
    ],
    issues: [],
    ...overrides
  };
}

function cell(report: ReturnType<typeof buildRiskHeatmap>, dimId: string, categoryKey: string) {
  const row = report.rows.find((r) => r.dimensionId === dimId)!;
  return row.cells.find((c) => c.categoryKey === categoryKey)!;
}

describe("metadata risk heatmap", () => {
  it("marks a dimension with validation errors as high validation risk", () => {
    const report = buildRiskHeatmap(input({
      issues: [
        issue({ id: "1", dimensionId: "dim-a", severity: "error" }),
        issue({ id: "2", dimensionId: "dim-a", severity: "error" }),
        issue({ id: "3", dimensionId: "dim-a", severity: "error" })
      ]
    }));
    const validation = cell(report, "dim-a", "validationErrors");
    expect(validation.level).toBe("high");
    expect(validation.issueCount).toBe(3);
    expect(validation.topFindings.length).toBeGreaterThan(0);
  });

  it("increases XML risk when certification failed", () => {
    const report = buildRiskHeatmap(input({ certificationStatus: "failed" }));
    const xml = cell(report, "dim-a", "xmlFidelity");
    expect(xml.level).toBe("high");
    expect(xml.topFindings[0]).toMatch(/certification failed/i);
  });

  it("increases artifact risk based on references", () => {
    const report = buildRiskHeatmap(input({ artifactReferencesByDimensionType: { Account: 12 } }));
    const artifact = cell(report, "dim-a", "artifactImpact");
    expect(artifact.score).toBeGreaterThan(0);
    expect(cell(report, "dim-b", "artifactImpact").score).toBe(0);
  });

  it("shows a clean dimension as low/none risk", () => {
    const report = buildRiskHeatmap(input());
    const row = report.rows.find((r) => r.dimensionId === "dim-b")!;
    expect(["none", "low"]).toContain(row.overallLevel);
    expect(row.cells.every((c) => c.level === "none")).toBe(true);
  });

  it("respects a severity filter", () => {
    const report = buildRiskHeatmap(input({
      issues: [issue({ id: "1", dimensionId: "dim-a", severity: "warning" })],
      severityFilter: ["error"]
    }));
    expect(cell(report, "dim-a", "validationErrors").issueCount).toBe(0);
  });

  it("reflects required-property issues separately", () => {
    const report = buildRiskHeatmap(input({
      issues: [issue({ id: "1", dimensionId: "dim-a", code: "MISSING_REQUIRED_PROPERTY", severity: "error" })]
    }));
    expect(cell(report, "dim-a", "requiredProperties").issueCount).toBe(1);
  });
});
