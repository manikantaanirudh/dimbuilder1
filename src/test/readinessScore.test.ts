import { describe, expect, it } from "vitest";
import { bandLabel, computeReadinessScore, type ReadinessInput } from "../shared/readinessScore";
import type { Severity, ValidationIssue } from "../shared/types";

function issue(code: string, severity: Severity): ValidationIssue {
  return {
    id: `i-${code}`,
    projectId: "p-1",
    dimensionId: "dim-1",
    entityType: "member",
    entityId: "m-1",
    severity,
    code,
    message: `${code} message`,
    fieldName: "",
    rowNumber: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function baseInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    issues: [],
    dimensions: [{ dimensionType: "Account" }, { dimensionType: "Entity" }],
    expectedDimensionTypes: [],
    certification: { status: "passed" },
    exportBlockedBySeverities: ["error"],
    ...overrides
  };
}

describe("readiness score", () => {
  it("scores a clean project with passing certification as ready", () => {
    const report = computeReadinessScore(baseInput());
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.band).toBe("ready");
    expect(report.blockers).toHaveLength(0);
  });

  it("reduces score and flags blockers for validation errors", () => {
    const report = computeReadinessScore(
      baseInput({ issues: [issue("ACCOUNT_TYPE_MISSING", "error"), issue("CIRCULAR_HIERARCHY", "error")] })
    );
    const clean = computeReadinessScore(baseInput());
    expect(report.score).toBeLessThan(clean.score);
    expect(report.blockers.length).toBeGreaterThan(0);
    expect(report.band).not.toBe("ready");
  });

  it("reduces score when XML certification failed", () => {
    const failed = computeReadinessScore(baseInput({ certification: { status: "failed" } }));
    const passed = computeReadinessScore(baseInput({ certification: { status: "passed" } }));
    expect(failed.score).toBeLessThan(passed.score);
    expect(failed.blockers.some((b) => /certification failed/i.test(b))).toBe(true);
  });

  it("treats missing certification as lower than a passing one", () => {
    const none = computeReadinessScore(baseInput({ certification: null }));
    const passed = computeReadinessScore(baseInput({ certification: { status: "passed" } }));
    expect(none.score).toBeLessThan(passed.score);
  });

  it("reduces release readiness when expected dimensions are missing", () => {
    const report = computeReadinessScore(
      baseInput({ expectedDimensionTypes: ["Account", "Entity", "Scenario", "Flow"] })
    );
    const release = report.categories.find((c) => c.key === "releaseReadiness");
    expect(release).toBeDefined();
    expect(release!.score).toBeLessThan(100);
    expect(release!.findings.join(" ")).toMatch(/Missing expected dimensions/);
  });

  it("provides human-readable band labels", () => {
    expect(bandLabel("ready")).toBe("Ready");
    expect(bandLabel("not_ready")).toBe("Not ready");
  });
});
