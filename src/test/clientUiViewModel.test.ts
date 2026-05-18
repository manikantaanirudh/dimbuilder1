import { describe, expect, it } from "vitest";
import { clampGridPageSize } from "../client/components/EditableGrid";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { ValidationIssue } from "../shared/types";
import {
  buildDimensionNavItems,
  buildIssueSummary,
  formatCount,
  getEnabledExportFormats,
  getExportAvailability,
  getWorkspaceTabs
} from "../client/ui/viewModel";
import { sampleScenarioDimension, testTimestamp } from "./fixtures";

function issue(overrides: Partial<ValidationIssue>): ValidationIssue {
  return {
    id: "issue-1",
    projectId: sampleScenarioDimension.projectId,
    dimensionId: sampleScenarioDimension.id,
    entityType: "member",
    entityId: "member-1",
    severity: "error",
    code: "REQUIRED_FIELD",
    message: "Member is required",
    fieldName: "Member",
    rowNumber: 9,
    createdAt: testTimestamp,
    ...overrides
  };
}

describe("client UI view model", () => {
  it("clamps grid page size for stable paged editing", () => {
    expect(clampGridPageSize(0)).toBe(1);
    expect(clampGridPageSize(600)).toBe(600);
    expect(clampGridPageSize(5000)).toBe(1000);
    expect(clampGridPageSize(Number.NaN)).toBe(1);
  });

  it("summarizes issues for all dimensions and one dimension", () => {
    const issues = [
      issue({ id: "error-1", severity: "error" }),
      issue({ id: "warning-1", severity: "warning" }),
      issue({ id: "info-1", severity: "info", dimensionId: "other-dim" })
    ];

    expect(buildIssueSummary(issues, defaultAppConfig.validation.exportBlockedBySeverities)).toEqual({
      errors: 1,
      warnings: 1,
      infos: 1,
      total: 3,
      blocksExport: true
    });

    expect(buildIssueSummary(issues, defaultAppConfig.validation.exportBlockedBySeverities, sampleScenarioDimension.id)).toEqual({
      errors: 1,
      warnings: 1,
      infos: 0,
      total: 2,
      blocksExport: true
    });
  });

  it("explains export availability in priority order", () => {
    const enabled = getExportAvailability({
      projectId: "project-1",
      exportConfig: defaultAppConfig.export,
      issues: [],
      blockedSeverities: ["error"]
    });
    expect(enabled).toEqual({ disabled: false, title: "Export metadata", reason: "Ready to export" });

    expect(getExportAvailability({
      projectId: null,
      exportConfig: defaultAppConfig.export,
      issues: [],
      blockedSeverities: ["error"]
    })).toEqual({ disabled: true, title: "Import a project before exporting", reason: "No project imported" });

    expect(getExportAvailability({
      projectId: "project-1",
      exportConfig: {
        xml: { ...defaultAppConfig.export.xml, enabled: false },
        xlsx: { ...defaultAppConfig.export.xlsx, enabled: false },
        csv: { enabled: false },
        json: { enabled: false }
      },
      issues: [],
      blockedSeverities: ["error"]
    })).toEqual({ disabled: true, title: "Exports are disabled by configuration", reason: "No export formats enabled" });

    expect(getExportAvailability({
      projectId: "project-1",
      exportConfig: defaultAppConfig.export,
      issues: [issue({ severity: "error" })],
      blockedSeverities: ["error"]
    })).toEqual({ disabled: true, title: "Resolve blocking validation issues before exporting", reason: "Blocking validation issues" });
  });

  it("lists enabled export formats", () => {
    expect(getEnabledExportFormats(defaultAppConfig.export).map((format) => format.key)).toEqual(["xml", "xlsx", "csvMembers", "csvRelationships", "json"]);
  });

  it("keeps XML Preview out of tabs when disabled", () => {
    expect(getWorkspaceTabs(true).map((tab) => tab.label)).toEqual(["Overview", "Members", "Relationships", "Hierarchy", "XML Preview", "Issues"]);
    expect(getWorkspaceTabs(false).map((tab) => tab.label)).toEqual(["Overview", "Members", "Relationships", "Hierarchy", "Issues"]);
  });

  it("builds nav items with issue summaries", () => {
    const items = buildDimensionNavItems(
      [sampleScenarioDimension],
      [issue({ severity: "warning" })],
      defaultAppConfig.dimensions.display,
      defaultAppConfig.validation.exportBlockedBySeverities
    );

    expect(items[0]).toMatchObject({
      id: sampleScenarioDimension.id,
      label: "Scenario - SampleScenario",
      subtitle: "Scenarios",
      issueSummary: {
        errors: 0,
        warnings: 1,
        infos: 0,
        total: 1,
        blocksExport: false
      }
    });
  });

  it("formats large counts compactly", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1200)).toBe("1.2k");
    expect(formatCount(65055)).toBe("65.1k");
  });
});
