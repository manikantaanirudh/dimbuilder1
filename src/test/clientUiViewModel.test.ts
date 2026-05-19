import { describe, expect, it } from "vitest";
import {
  buildGridActionTitles,
  buildGridStatusTone,
  buildOptimisticGridRecord,
  clampGridPageSize,
  shouldRollbackGridRecord
} from "../client/ui/gridViewModel";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { DimensionMemberRecord, DimensionRelationshipRecord, ValidationIssue } from "../shared/types";
import {
  buildDimensionFacts,
  buildDimensionNavItems,
  buildIssueSummary,
  filterDimensionNavItems,
  formatCount,
  getEnabledExportFormats,
  getExportAvailability,
  getReadinessLabel,
  getWorkspaceTabs,
  resolveActiveDimensionId
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

  it("builds selected row action titles for the grid toolbar", () => {
    expect(buildGridActionTitles(null)).toEqual({
      duplicateTitle: "Select a row to duplicate",
      deleteTitle: "Select a row to delete"
    });

    expect(buildGridActionTitles("row-1")).toEqual({
      duplicateTitle: "Duplicate selected row",
      deleteTitle: "Delete selected row"
    });
  });

  it("maps grid status text to stable badge tones", () => {
    expect(buildGridStatusTone("Saved")).toBe("success");
    expect(buildGridStatusTone("Loading rows...")).toBe("info");
    expect(buildGridStatusTone("Save failed")).toBe("danger");
    expect(buildGridStatusTone("")).toBe("neutral");
  });

  it("updates canonical member keys in optimistic grid records", () => {
    const record = {
      id: "member-1",
      dimensionId: "dimension-1",
      memberKey: "OldMember",
      description: "",
      properties: { Member: "OldMember", Text1: "A" },
      rowOrder: 1,
      sourceRowNumber: 2,
      isActive: true,
      createdAt: testTimestamp,
      updatedAt: testTimestamp
    } satisfies DimensionMemberRecord;

    const next = buildOptimisticGridRecord(record, "members", "Member", "Member", "NewMember") as DimensionMemberRecord;

    expect(next.memberKey).toBe("NewMember");
    expect(next.properties.Member).toBe("NewMember");
    expect(record.memberKey).toBe("OldMember");
  });

  it("updates canonical relationship keys in optimistic grid records", () => {
    const record = {
      id: "relationship-1",
      dimensionId: "dimension-1",
      parentKey: "OldParent",
      childKey: "OldChild",
      aggregationWeight: null,
      percentConsol: null,
      percentOwnership: null,
      ownershipType: "",
      properties: { Parent: "OldParent", Child: "OldChild" },
      rowOrder: 1,
      sourceRowNumber: 2,
      createdAt: testTimestamp,
      updatedAt: testTimestamp
    } satisfies DimensionRelationshipRecord;

    const parentNext = buildOptimisticGridRecord(record, "relationships", "Member", "Parent", "NewParent") as DimensionRelationshipRecord;
    const childNext = buildOptimisticGridRecord(record, "relationships", "Member", "Child", "NewChild") as DimensionRelationshipRecord;

    expect(parentNext.parentKey).toBe("NewParent");
    expect(parentNext.properties.Parent).toBe("NewParent");
    expect(childNext.childKey).toBe("NewChild");
    expect(childNext.properties.Child).toBe("NewChild");
  });

  it("rolls back only when the failed optimistic record is still current", () => {
    const previous = {
      id: "member-1",
      dimensionId: "dimension-1",
      memberKey: "OldMember",
      description: "",
      properties: { Member: "OldMember", Text1: "A" },
      rowOrder: 1,
      sourceRowNumber: 2,
      isActive: true,
      createdAt: testTimestamp,
      updatedAt: testTimestamp
    } satisfies DimensionMemberRecord;
    const failedOptimistic = buildOptimisticGridRecord(previous, "members", "Member", "Member", "FailedMember");
    const newerEdit = buildOptimisticGridRecord(failedOptimistic, "members", "Member", "Text1", "B");

    expect(shouldRollbackGridRecord(failedOptimistic, failedOptimistic)).toBe(true);
    expect(shouldRollbackGridRecord(newerEdit, failedOptimistic)).toBe(false);
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
    })).toEqual({ disabled: true, title: "Create or open a project before exporting", reason: "No project open" });

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

  it("keeps XML out of tabs when disabled", () => {
    expect(getWorkspaceTabs(false).map((tab) => tab.label)).toEqual(["Overview", "Members", "Relationships", "Hierarchy", "Issues"]);
  });

  it("keeps null active dimension as project overview and falls back only for stale dimension ids", () => {
    expect(resolveActiveDimensionId(null, [sampleScenarioDimension])).toBeNull();
    expect(resolveActiveDimensionId("missing", [sampleScenarioDimension])).toBe(sampleScenarioDimension.id);
    expect(resolveActiveDimensionId(sampleScenarioDimension.id, [sampleScenarioDimension])).toBe(sampleScenarioDimension.id);
    expect(resolveActiveDimensionId(null, [])).toBeNull();
  });

  it("filters dimension nav items by label, subtitle, type, and sheet name", () => {
    const items = buildDimensionNavItems(
      [sampleScenarioDimension],
      [],
      defaultAppConfig.dimensions.display,
      defaultAppConfig.validation.exportBlockedBySeverities
    );

    expect(filterDimensionNavItems(items, "sample")).toHaveLength(1);
    expect(filterDimensionNavItems(items, "scenarios")).toHaveLength(1);
    expect(filterDimensionNavItems(items, "scenario")).toHaveLength(1);
    expect(filterDimensionNavItems(items, "nothing")).toHaveLength(0);
  });

  it("uses the shorter XML tab label for the clean workbench", () => {
    expect(getWorkspaceTabs(true).map((tab) => tab.label)).toEqual(["Overview", "Members", "Relationships", "Hierarchy", "XML", "Issues"]);
    expect(getWorkspaceTabs(false).map((tab) => tab.label)).toEqual(["Overview", "Members", "Relationships", "Hierarchy", "Issues"]);
  });

  it("builds compact readiness labels and dimension facts", () => {
    const cleanSummary = buildIssueSummary([], defaultAppConfig.validation.exportBlockedBySeverities);
    const reviewSummary = buildIssueSummary([issue({ severity: "warning" })], defaultAppConfig.validation.exportBlockedBySeverities);
    const blockedSummary = buildIssueSummary([issue({ severity: "error" })], defaultAppConfig.validation.exportBlockedBySeverities);

    expect(getReadinessLabel(cleanSummary)).toBe("Ready");
    expect(getReadinessLabel(reviewSummary)).toBe("Needs review");
    expect(getReadinessLabel(blockedSummary)).toBe("Export blocked");

    expect(buildDimensionFacts(sampleScenarioDimension, blockedSummary)).toEqual([
      { label: "Type", value: "Scenario" },
      { label: "Sheet", value: "Scenarios" },
      { label: "Access", value: "Everyone" },
      { label: "Maintenance", value: "Everyone" },
      { label: "Errors", value: "1", tone: "danger" },
      { label: "Warnings", value: "0", tone: "neutral" }
    ]);
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
