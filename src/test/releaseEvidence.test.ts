import { describe, expect, it } from "vitest";
import { buildReleaseEvidence, defaultEvidenceOptions, parseEvidenceOptions, type EvidenceInput } from "../shared/releaseEvidence";
import { computeReadinessScore } from "../shared/readinessScore";
import type { ChangeSetDetail, ChangeSetItemRecord, ValidationIssue } from "../shared/types";

function item(overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: "ci-1",
    changeSetId: "cs-1",
    diffItemId: "di-1",
    itemType: "property",
    changeType: "update",
    severity: "info",
    dimensionType: "Account",
    objectKey: "Revenue",
    propertyName: "Account Type",
    oldValue: "Asset",
    newValue: "Revenue",
    details: {},
    ...overrides
  };
}

function detail(): ChangeSetDetail {
  return {
    changeSet: {
      id: "cs-1",
      projectId: "p-1",
      baselineId: "b-1",
      diffRunId: "d-1",
      name: "Release 1",
      description: "",
      status: "approved",
      targetEnvironment: "Production",
      createdBy: "local-admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    items: [item()],
    approvals: [],
    latestPackage: null
  };
}

function baseInput(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    detail: detail(),
    projectName: "Demo",
    issues: [],
    readiness: computeReadinessScore({
      issues: [],
      dimensions: [{ dimensionType: "Account" }],
      expectedDimensionTypes: [],
      certification: { status: "passed" },
      exportBlockedBySeverities: ["error"]
    }),
    certification: null,
    certificationMarkdown: null,
    impact: [],
    options: defaultEvidenceOptions,
    ...overrides
  };
}

describe("release evidence package", () => {
  it("includes all required files", () => {
    const result = buildReleaseEvidence(baseInput());
    for (const required of [
      "release-summary.md",
      "readiness-report.json",
      "validation-report.json",
      "before-after-diff.json",
      "change-summary.csv",
      "approver-signoff.md",
      "post-import-smoke-test-checklist.md"
    ]) {
      expect(result.fileNames).toContain(required);
    }
  });

  it("produces a not-available note and warning when optional data is missing", () => {
    const result = buildReleaseEvidence(baseInput({ options: { ...defaultEvidenceOptions, includeXmlCertification: true, includeImpactReport: true } }));
    expect(result.fileNames).toContain("xml-round-trip-check.NOT-AVAILABLE.md");
    expect(result.fileNames).toContain("impact-report.NOT-AVAILABLE.md");
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    // The not-available files are present but flagged as not populated.
    const cert = result.files.find((f) => f.fileName === "xml-round-trip-check.NOT-AVAILABLE.md");
    expect(cert?.populated).toBe(false);
  });

  it("includes waived issues and validation profile in validation report", () => {
    const waived: ValidationIssue[] = [{
      id: "w1",
      projectId: "p-1",
      dimensionId: "d-1",
      entityType: "member",
      entityId: "m-1",
      severity: "warning",
      code: "TEST",
      message: "waived",
      fieldName: "memberKey",
      rowNumber: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    }];
    const result = buildReleaseEvidence(baseInput({ validationProfileId: "acm-handoff", waivedIssues: waived }));
    expect(result.fileNames).toContain("waived-issues.json");
    const validation = JSON.parse(result.files.find((f) => f.fileName === "validation-report.json")!.content) as {
      validationProfileId: string;
      issues: unknown[];
    };
    expect(validation.validationProfileId).toBe("acm-handoff");
  });

  it("includes round-trip check json and markdown when available", () => {
    const certification = {
      status: "passed" as const,
      generatedAt: "2026-01-01T00:00:00.000Z",
      dimensions: { original: 1, exported: 1, matched: 1, missing: [], extra: [] },
      members: { original: 1, exported: 1, matched: 1, missing: [], extra: [] },
      relationships: { original: 0, exported: 0, matched: 0, missing: [], extra: [] },
      properties: { membersCompared: 1, changed: [], lost: [] },
      unknownPreservation: { attributesOriginal: 0, attributesExported: 0, propertiesOriginal: 0, propertiesExported: 0, elementsOriginal: 0, elementsExported: 0 },
      findings: [],
      recommendedAction: "ok"
    };
    const result = buildReleaseEvidence(baseInput({ certification, certificationMarkdown: "# cert" }));
    expect(result.fileNames).toContain("xml-round-trip-check.json");
    expect(result.fileNames).toContain("xml-round-trip-check.md");
    expect(result.fileNames).not.toContain("xml-round-trip-check.NOT-AVAILABLE.md");
  });

  it("only lists files that were generated (manifest accuracy)", () => {
    const result = buildReleaseEvidence(baseInput({ options: { ...defaultEvidenceOptions, includeSmokeTestChecklist: false } }));
    expect(result.fileNames).not.toContain("post-import-smoke-test-checklist.md");
    expect(result.fileNames.length).toBe(result.files.length);
  });

  it("parses evidence options with safe defaults", () => {
    expect(parseEvidenceOptions(undefined)).toEqual(defaultEvidenceOptions);
    expect(parseEvidenceOptions({ includeAcmHandoff: true }).includeAcmHandoff).toBe(true);
  });
});
