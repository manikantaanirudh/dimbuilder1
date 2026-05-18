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

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element);
}

function configWithToolbar(toolbar: Partial<ClientAppConfig["ui"]["toolbar"]>): ClientAppConfig {
  return {
    ...defaultAppConfig,
    ui: {
      ...defaultAppConfig.ui,
      toolbar: {
        ...defaultAppConfig.ui.toolbar,
        ...toolbar
      }
    }
  };
}

function dashboardMarkup(appConfig: ClientAppConfig, summary: DashboardSummary | null = null, project: ProjectRecord | null = null) {
  return render(createElement(Dashboard, {
    dimensions: [],
    summary,
    project,
    issues: [],
    onImport: () => undefined,
    exportAvailability: readyExportAvailability,
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

  it("hides dashboard command and empty-state import actions when import is hidden", () => {
    const markup = dashboardMarkup(configWithToolbar({ showImport: false }));

    expect(markup).not.toContain("Import XLSX");
    expect(markup).not.toMatch(/dashboard-command-actions">[\s\S]*FileUp/);
  });

  it("hides dashboard validate and export command actions when toolbar flags hide them", () => {
    const markup = dashboardMarkup(configWithToolbar({ showValidate: false, showExport: false }));

    expect(markup).not.toMatch(/dashboard-command-actions">[\s\S]*Validate/);
    expect(markup).not.toMatch(/dashboard-command-actions">[\s\S]*>Export<\/button>/);
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
