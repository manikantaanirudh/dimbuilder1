import { describe, expect, it } from "vitest";
import { computeWorkflowStatus, type WorkflowInput } from "../shared/workflowReadiness";

function baseInput(overrides: Partial<WorkflowInput> = {}): WorkflowInput {
  return {
    dimensionCount: 0,
    memberCount: 0,
    validation: { hasRun: false, errorCount: 0, warningCount: 0 },
    certificationStatus: null,
    impactRunCount: 0,
    baselineCount: 0,
    changeSet: { latestStatus: null, hasPackage: false },
    ...overrides
  };
}

function stage(report: ReturnType<typeof computeWorkflowStatus>, key: string) {
  const found = report.stages.find((s) => s.key === key);
  if (!found) throw new Error(`stage ${key} not found`);
  return found;
}

describe("workflow status", () => {
  it("a new empty project points to import/review as incomplete", () => {
    const report = computeWorkflowStatus(baseInput());
    expect(stage(report, "create-import").status).toBe("not_started");
    expect(stage(report, "review-dimensions").status).toBe("not_started");
    expect(report.completedStages).toBe(0);
    expect(report.nextBestAction?.stageKey).toBe("create-import");
  });

  it("a project with validation errors points to validation", () => {
    const report = computeWorkflowStatus(
      baseInput({
        dimensionCount: 3,
        memberCount: 100,
        validation: { hasRun: true, errorCount: 5, warningCount: 2 }
      })
    );
    expect(stage(report, "validate").status).toBe("needs_attention");
    expect(report.nextBestAction?.stageKey).toBe("validate");
    expect(stage(report, "validate").blockers.length).toBeGreaterThan(0);
  });

  it("an approved change set points to packaging/export", () => {
    const report = computeWorkflowStatus(
      baseInput({
        dimensionCount: 3,
        memberCount: 100,
        validation: { hasRun: true, errorCount: 0, warningCount: 0 },
        certificationStatus: "passed",
        changeSet: { latestStatus: "approved", hasPackage: false }
      })
    );
    expect(stage(report, "change-set").status).toBe("complete");
    expect(stage(report, "release-package").status).toBe("ready");
    expect(report.nextBestAction?.stageKey).toBe("release-package");
  });

  it("marks the release package complete once a package exists", () => {
    const report = computeWorkflowStatus(
      baseInput({
        dimensionCount: 3,
        memberCount: 100,
        validation: { hasRun: true, errorCount: 0, warningCount: 0 },
        certificationStatus: "passed",
        changeSet: { latestStatus: "exported", hasPackage: true }
      })
    );
    expect(stage(report, "release-package").status).toBe("complete");
    expect(stage(report, "export-handoff").status).toBe("ready");
  });

  it("treats failed certification as needs attention", () => {
    const report = computeWorkflowStatus(
      baseInput({ dimensionCount: 1, memberCount: 10, certificationStatus: "failed" })
    );
    expect(stage(report, "xml-certification").status).toBe("needs_attention");
  });
});
