import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "../client/components/AppShell";
import { Dashboard } from "../client/components/Dashboard";
import { DimensionWorkspace } from "../client/components/DimensionWorkspace";
import { ExportModal, ImportModal } from "../client/components/ImportExportModals";
import { IssuePanel } from "../client/components/IssuePanel";
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

  it("keeps dashboard readiness aligned with configured blocking severities", () => {
    const config = {
      ...defaultAppConfig,
      validation: {
        ...defaultAppConfig.validation,
        exportBlockedBySeverities: ["warning" as const]
      }
    };
    const summaryWithNonBlockingErrors: DashboardSummary = {
      ...summaryWithValidationCounts,
      validationErrors: 2,
      validationWarnings: 0
    };
    const markup = dashboardMarkup(config, summaryWithNonBlockingErrors, sampleProject);

    expect(markup).toContain('<span class="status-badge warning">Needs review</span>');
    expect(markup).toContain('<span class="fact-item danger"><span>Errors</span><b>2</b></span>');
    expect(markup).toContain('<span class="fact-item neutral"><span>Warnings</span><b>0</b></span>');
    expect(markup).not.toContain("Export blocked");
  });

  it("explains why validation is disabled before a project is imported", () => {
    const markup = render(createElement(AppShell, { appConfig: defaultAppConfig }));

    expect(markup).toMatch(/<button[^>]*title="Import a project before validating"[^>]*disabled=""[^>]*>[\s\S]*Validate<\/button>/);
  });

  it("renders the Notion-inspired global workbench toolbar", () => {
    const markup = render(createElement(AppShell, { appConfig: defaultAppConfig }));

    expect(markup).toContain("global-toolbar");
    expect(markup).toContain("brand-wordmark");
    expect(markup).toContain(">DimBuilder<");
    expect(markup).toContain("project-context");
    expect(markup).not.toContain("nav-project");
  });

  it("keeps the left rail focused on searchable dimensions", () => {
    const markup = render(createElement(AppShell, { appConfig: defaultAppConfig }));

    expect(markup).toContain("sidebar-heading");
    expect(markup).toContain("Search dimensions");
    expect(markup).not.toContain("OneStream XF Dimension Builder</span></div><div class=\"nav-project\"");
  });

  it("renders clean workbench workspace facts and the short XML tab label", () => {
    const markup = render(createElement(DimensionWorkspace, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension,
      issues: [],
      onRefresh: () => undefined,
      appConfig: defaultAppConfig,
      exportAvailability: readyExportAvailability
    }));

    expect(markup).toContain("workspace-facts");
    expect(markup).toContain("Scenario - SampleScenario");
    expect(markup).toContain(">XML</button>");
    expect(markup).not.toContain("XML Preview</button>");
    expect(markup).not.toContain("section-kicker\">Scenario dimension");
  });

  it("renders the validation rail as a compact details surface", () => {
    const markup = render(createElement(IssuePanel, {
      dimension: sampleScenarioDimension,
      issues: [],
      appConfig: defaultAppConfig
    }));

    expect(markup).toContain("details-rail");
    expect(markup).toContain("Readiness");
    expect(markup).toContain("Dimension details");
    expect(markup).not.toContain("Issue rail");
  });

  it("renders no-project status and top-command-bar import guidance in the empty state", () => {
    const markup = dashboardMarkup(defaultAppConfig);

    expect(markup).toContain('<span class="status-badge neutral">No project</span>');
    expect(markup).not.toContain('<span class="status-badge success">Ready</span>');
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
