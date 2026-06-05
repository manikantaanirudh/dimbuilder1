import { describe, expect, it } from "vitest";
import { answerProjectQuestion, classifyIntent, type AssistantContext } from "../shared/projectAssistant";
import { computeReadinessScore } from "../shared/readinessScore";
import type { ValidationIssue } from "../shared/types";

function issue(overrides: Partial<ValidationIssue>): ValidationIssue {
  return {
    id: "i-1",
    projectId: "p-1",
    dimensionId: "dim-account",
    entityType: "member",
    entityId: "m-1",
    severity: "error",
    code: "MISSING_PROPERTY",
    message: "Account Type is required",
    fieldName: "Account Type",
    rowNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function context(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const issues = overrides.issues ?? [];
  return {
    projectName: "Demo",
    readiness: computeReadinessScore({
      issues,
      dimensions: [{ dimensionType: "Account" }],
      expectedDimensionTypes: [],
      certification: null,
      exportBlockedBySeverities: ["error"]
    }),
    issues,
    exportBlockedBySeverities: ["error"],
    dimensions: [
      { id: "dim-account", dimensionType: "Account", dimensionName: "GL Accounts" },
      { id: "dim-entity", dimensionType: "Entity", dimensionName: "Entities" }
    ],
    members: [
      { id: "m-1", dimensionId: "dim-account", memberKey: "Sales", properties: { "Account Type": "" } },
      { id: "m-2", dimensionId: "dim-account", memberKey: "COGS", properties: { "Account Type": "Expense" } },
      { id: "m-3", dimensionId: "dim-entity", memberKey: "Houston", properties: {} }
    ],
    changeSets: [{ id: "cs-1", name: "Release 1", status: "approved", itemCount: 3 }],
    latestDiffSummary: { id: "d-1", added: 2, updated: 1, removed: 0 },
    artifactReferences: [{ memberKey: "Sales", dimensionHint: "Account", artifactName: "CalcRule.vb", confidence: "high" }],
    ...overrides
  };
}

describe("project assistant", () => {
  it("classifies the supported intents", () => {
    expect(classifyIntent("is this project export ready?")).toBe("exportReady");
    expect(classifyIntent("why is the readiness score low?")).toBe("readinessLow");
    expect(classifyIntent("what blocks xml export?")).toBe("blocksExport");
    expect(classifyIntent("which dimensions have the most issues?")).toBe("dimensionsMostIssues");
    expect(classifyIntent("which members are missing account type?")).toBe("missingAccountType");
    expect(classifyIntent("which entity members are missing currency?")).toBe("missingCurrency");
    expect(classifyIntent("what should i fix first?")).toBe("fixFirst");
    expect(classifyIntent("tell me a joke")).toBe("unknown");
  });

  it("answers export readiness using real validation/export-gate state", () => {
    const blocked = answerProjectQuestion("Is this project export ready?", context({ issues: [issue({})] }));
    expect(blocked.summary.toLowerCase()).toContain("not yet");
    expect(blocked.evidence.some((e) => e.includes("MISSING_PROPERTY"))).toBe(true);

    const clean = answerProjectQuestion("Is this project export ready?", context({ issues: [] }));
    expect(clean.summary.toLowerCase()).toContain("yes");
  });

  it("lists members missing Account Type from real data", () => {
    const answer = answerProjectQuestion("Which members are missing Account Type?", context());
    expect(answer.summary).toContain("1");
    expect(answer.evidence).toContain("Sales");
    expect(answer.evidence).not.toContain("COGS");
  });

  it("answers impact using artifact references when available", () => {
    const answer = answerProjectQuestion("What will be impacted if I rename member Sales?", context());
    expect(answer.intent).toBe("impactRename");
    expect(answer.evidence.some((e) => e.includes("CalcRule.vb"))).toBe(true);
  });

  it("returns a helpful fallback for unknown questions", () => {
    const answer = answerProjectQuestion("what is the weather today?", context());
    expect(answer.intent).toBe("unknown");
    expect(answer.nextActions.length).toBeGreaterThan(0);
  });

  it("summarizes changes since baseline from the latest diff", () => {
    const answer = answerProjectQuestion("What changed since baseline?", context());
    expect(answer.summary).toContain("2 added");
    expect(answer.summary).toContain("1 updated");
  });
});
