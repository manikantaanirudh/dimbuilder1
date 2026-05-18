import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "../client/components/Dashboard";
import { ExportModal, ImportModal } from "../client/components/ImportExportModals";
import { XmlPreview } from "../client/components/XmlPreview";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { ClientAppConfig } from "../shared/appConfigTypes";
import type { DashboardSummary, ProjectRecord } from "../shared/types";
import { sampleProject, sampleScenarioDimension } from "./fixtures";

const readyExportAvailability = {
  disabled: false,
  title: "Export metadata",
  reason: "Ready to export"
};

const blockedExportAvailability = {
  disabled: true,
  title: "Resolve blocking validation issues before exporting",
  reason: "Blocking validation issues"
};

const summaryWithValidationCounts: DashboardSummary = {
  totalDimensions: 7,
  totalMembers: 1200,
  totalRelationships: 4500,
  validationErrors: 2,
  validationWarnings: 3,
  recentDimensions: []
};

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element);
}

function dashboardMarkup(appConfig: ClientAppConfig, summary: DashboardSummary | null = null, project: ProjectRecord | null = null) {
  return render(createElement(Dashboard, {
    dimensions: [],
    summary,
    project,
    issues: [],
    onOpenDimension: () => undefined,
    appConfig
  }));
}

describe("client component markup", () => {
  it("keeps primary workflow actions in the toolbar instead of duplicating them on the dashboard card", () => {
    const markup = dashboardMarkup(defaultAppConfig, null, sampleProject);

    expect(markup).not.toContain("dashboard-command-actions");
    expect(markup).not.toMatch(/<button[\s\S]*>Import<\/button>/);
    expect(markup).not.toMatch(/<button[\s\S]*>Validate<\/button>/);
    expect(markup).not.toMatch(/<button[\s\S]*>Export<\/button>/);
  });

  it("keeps dashboard overview copy compact and does not render lifecycle buttons there", () => {
    const markup = dashboardMarkup(defaultAppConfig, null, sampleProject);

    expect(markup).not.toContain("Project command center");
    expect(markup).not.toContain("dashboard-command");
    expect(markup).not.toContain("Import XLSX");
    expect(markup).not.toMatch(/<button[\s\S]*>Validate<\/button>/);
    expect(markup).not.toMatch(/<button[\s\S]*>Export<\/button>/);
  });

  it("renders compact dashboard facts from the provided summary", () => {
    const markup = dashboardMarkup(defaultAppConfig, summaryWithValidationCounts, sampleProject);

    expect(markup).toContain('<span class="fact-item neutral"><span>Dimensions</span><b>7</b></span>');
    expect(markup).toContain('<span class="fact-item neutral"><span>Members</span><b>1.2k</b></span>');
    expect(markup).toContain('<span class="fact-item neutral"><span>Relationships</span><b>4.5k</b></span>');
    expect(markup).toContain('<span class="fact-item danger"><span>Errors</span><b>2</b></span>');
    expect(markup).toContain('<span class="fact-item warning"><span>Warnings</span><b>3</b></span>');
  });

  it("uses summary validation counts for dashboard fact tones when issues are empty", () => {
    const markup = dashboardMarkup(defaultAppConfig, summaryWithValidationCounts, sampleProject);

    expect(markup).toContain('<span class="status-badge danger">Export blocked</span>');
    expect(markup).toContain('<span class="fact-item danger"><span>Errors</span><b>2</b></span>');
    expect(markup).toContain('<span class="fact-item warning"><span>Warnings</span><b>3</b></span>');
  });

  it("renders top-command-bar import guidance in the no-project empty state", () => {
    const markup = dashboardMarkup(defaultAppConfig);

    expect(markup).toContain("Use the Import button in the top command bar to load an XF metadata workbook.");
  });

  it("does not expose an XML preview download href when export is blocked", () => {
    const markup = render(createElement(XmlPreview, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension,
      exportAvailability: blockedExportAvailability
    }));

    expect(markup).toContain("aria-disabled=\"true\"");
    expect(markup).toContain("tabindex=\"-1\"");
    expect(markup).not.toContain(`href="/api/export/${sampleProject.id}/xml"`);
  });

  it("labels import and export modals as dialogs", () => {
    const importMarkup = render(createElement(ImportModal, {
      open: true,
      onClose: () => undefined,
      onImported: () => undefined
    }));
    const exportMarkup = render(createElement(ExportModal, {
      open: true,
      onClose: () => undefined,
      projectId: sampleProject.id,
      appConfig: defaultAppConfig,
      exportAvailability: readyExportAvailability
    }));

    expect(importMarkup).toContain("role=\"dialog\"");
    expect(importMarkup).toContain("aria-modal=\"true\"");
    expect(importMarkup).toContain("aria-labelledby=\"import-modal-title\"");
    expect(exportMarkup).toContain("role=\"dialog\"");
    expect(exportMarkup).toContain("aria-modal=\"true\"");
    expect(exportMarkup).toContain("aria-labelledby=\"export-modal-title\"");
  });
});
