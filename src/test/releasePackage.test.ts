import { describe, expect, it } from "vitest";
import {
  renderChangeSetManifest,
  renderReleaseNotesMarkdown,
  selectXmlExportModeForChangeSet,
  summarizeChangeSet
} from "../shared/releasePackage";
import type { ChangeSetDetail } from "../shared/types";

const approvedChangeSet: ChangeSetDetail = {
  changeSet: {
    id: "change-set-1",
    projectId: "project-1",
    baselineId: "baseline-1",
    diffRunId: "diff-run-1",
    name: "May close metadata release",
    description: "Move reviewed metadata into production.",
    status: "approved",
    targetEnvironment: "Production",
    createdBy: "local-admin",
    createdAt: "2026-05-19T00:00:00.000Z",
    updatedAt: "2026-05-19T00:00:00.000Z"
  },
  items: [
    {
      id: "change-item-1",
      changeSetId: "change-set-1",
      diffItemId: "diff-item-1",
      itemType: "member",
      changeType: "add",
      severity: "info",
      dimensionType: "Account",
      objectKey: "Revenue",
      propertyName: "",
      oldValue: "",
      newValue: "Revenue",
      details: { dimensionName: "Accounts" }
    },
    {
      id: "change-item-2",
      changeSetId: "change-set-1",
      diffItemId: "diff-item-2",
      itemType: "relationship",
      changeType: "move",
      severity: "warning",
      dimensionType: "Account",
      objectKey: "Root -> Revenue",
      propertyName: "",
      oldValue: "OldParent",
      newValue: "Root",
      details: { dimensionName: "Accounts", risk: "move branch" }
    }
  ],
  approvals: [
    {
      id: "approval-1",
      changeSetId: "change-set-1",
      action: "approve",
      comment: "Approved for package export.",
      createdBy: "controller",
      createdAt: "2026-05-19T01:00:00.000Z"
    }
  ],
  latestPackage: null
};

describe("release package helpers", () => {
  it("summarizes change sets by severity and change type", () => {
    const summary = summarizeChangeSet(approvedChangeSet);

    expect(summary).toMatchObject({
      totalItems: 2,
      bySeverity: { info: 1, warning: 1, error: 0 },
      byChangeType: { add: 1, move: 1 },
      warnings: 1,
      errors: 0
    });
  });

  it("renders human-readable release notes and a machine-readable manifest", () => {
    const notes = renderReleaseNotesMarkdown(approvedChangeSet);
    const manifest = renderChangeSetManifest(approvedChangeSet, {
      packageName: "may-close",
      packagePath: "data/exports/release-packages/may-close",
      mode: "breakBuild",
      files: ["01-summary.md", "05-metadata.xml", "manifest.json"],
      validationSummary: { totalIssues: 0, blockingIssues: 0 }
    });

    expect(notes).toContain("# Release Notes - May close metadata release");
    expect(notes).toContain("Target environment: Production");
    expect(notes).toContain("| move | relationship | Account | Root -> Revenue |");
    expect(notes).toContain("Approved for package export.");
    expect(notes).toContain("Rollback XML is not generated yet.");

    expect(manifest).toMatchObject({
      packageVersion: 1,
      packageName: "may-close",
      mode: "breakBuild",
      changeSet: {
        id: "change-set-1",
        name: "May close metadata release",
        status: "approved"
      },
      summary: {
        totalItems: 2,
        warnings: 1,
        errors: 0
      },
      validationSummary: {
        totalIssues: 0,
        blockingIssues: 0
      }
    });
    expect(manifest.files).toContain("05-metadata.xml");
  });

  it("selects supported XML export modes and falls back to full packages", () => {
    expect(selectXmlExportModeForChangeSet(approvedChangeSet, "propertyUpdate")).toBe("propertyUpdate");
    expect(selectXmlExportModeForChangeSet(approvedChangeSet, "unsupported" as never)).toBe("full");
  });
});
