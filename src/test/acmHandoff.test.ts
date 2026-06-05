import { describe, expect, it } from "vitest";
import { buildAcmHandoff } from "../shared/acmHandoff";
import type { ChangeSetDetail } from "../shared/types";

const detail: ChangeSetDetail = {
  changeSet: {
    id: "cs-1",
    projectId: "p1",
    diffRunId: "dr-1",
    baselineId: "b1",
    name: "Revenue update",
    description: "Q1 metadata",
    status: "approved",
    targetEnvironment: "DEV",
    createdBy: "consultant",
    createdAt: "2026-06-02T12:00:00.000Z",
    updatedAt: "2026-06-02T12:00:00.000Z"
  },
  items: [
    {
      id: "i1",
      changeSetId: "cs-1",
      diffItemId: "d1",
      itemType: "member",
      changeType: "update",
      severity: "warning",
      dimensionType: "Account",
      objectKey: "Revenue",
      propertyName: "Text1",
      oldValue: "A",
      newValue: "B",
      details: { riskLevel: "low" }
    }
  ],
  approvals: [{ id: "a1", changeSetId: "cs-1", action: "approve", comment: "OK", createdBy: "reviewer", createdAt: "2026-06-02T12:01:00.000Z" }],
  latestPackage: null
};

describe("buildAcmHandoff", () => {
  it("includes ACM handoff evidence files", () => {
    const result = buildAcmHandoff({
      detail,
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readinessScore: 80,
      validationProfileId: "acm-handoff"
    });
    expect(result.fileNames).toContain("acm-change-request.csv");
    expect(result.fileNames).toContain("handoff-readme.md");
    expect(result.fileNames).toContain("post-import-smoke-checklist.md");
    expect(result.fileNames).toContain("rollback-notes.md");
    expect(result.fileNames).toContain("validation-summary.json");
    const manifest = JSON.parse(result.files.find((f) => f.fileName === "manifest.json")!.content);
    expect(manifest.disclaimer).toMatch(/Does not submit to ACM/i);
  });
});
