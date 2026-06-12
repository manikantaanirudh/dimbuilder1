import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppShell } from "../client/components/AppShell";
import { AuthContext, type AuthContextValue } from "../client/auth/AuthProvider";
import { Dashboard } from "../client/components/Dashboard";
import { DimensionWorkspace } from "../client/components/DimensionWorkspace";
import { EditableGrid } from "../client/components/EditableGrid";
import { HierarchyTree } from "../client/components/HierarchyTree";
import { ChangeSetsPanel } from "../client/components/ChangeSetsPanel";
import { BulkUpdatePanel } from "../client/components/BulkUpdatePanel";
import { ExportModal, ImportModal } from "../client/components/ImportExportModals";
import { IssuePanel } from "../client/components/IssuePanel";
import { MetadataEditor } from "../client/components/MetadataEditor";
import { VaryingPropertiesPanel } from "../client/components/VaryingPropertiesPanel";
import { XmlPreview } from "../client/components/XmlPreview";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { ClientAppConfig } from "../shared/appConfigTypes";
import type { DashboardSummary, DimensionRecord, ProjectRecord } from "../shared/types";
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

const disabledAuthContext: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  authEnabled: false,
  authStatus: null,
  login: async () => {},
  logout: async () => {}
};

function renderAppShell(props: Parameters<typeof AppShell>[0]) {
  return render(
    createElement(AuthContext.Provider, { value: disabledAuthContext },
      createElement(AppShell, props)
    )
  );
}

const importExportModalSource = readFileSync(new URL("../client/components/ImportExportModals.tsx", import.meta.url), "utf8");

function dashboardMarkup(
  appConfig: ClientAppConfig,
  summary: DashboardSummary | null = null,
  project: ProjectRecord | null = null,
  dimensions: DimensionRecord[] = []
) {
  return render(createElement(Dashboard, {
    dimensions,
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

    expect(markup).toContain("overview-page");
    expect(markup).toContain("overview-page-icon");
    expect(markup).toContain("overview-document");
    expect(markup).toContain("kpi-metric");
    expect(markup).toContain('<span class="kpi-metric-value">7</span>');
    expect(markup).toContain("Dimensions");
    expect(markup).toContain('<span class="kpi-metric-value">1200</span>');
    expect(markup).toContain("Members");
    expect(markup).toContain('<span class="kpi-metric-value">4500</span>');
    expect(markup).toContain("Relationships");
  });

  it("renders a dashboard snapshot manager for restore and branching", () => {
    const markup = dashboardMarkup(defaultAppConfig, summaryWithValidationCounts, sampleProject);

    expect(markup).toContain("snapshot-manager");
    expect(markup).toContain("Snapshots");
    expect(markup).toContain("Restore current project");
    expect(markup).toContain("Create branch");
    expect(markup).toContain("Restore replaces current metadata");
  });

  it("renders Blueprint Studio as a safe authoring aid on the dashboard", () => {
    const markup = dashboardMarkup(defaultAppConfig, summaryWithValidationCounts, sampleProject, [sampleScenarioDimension]);

    expect(markup).toContain("blueprint-studio");
    expect(markup).toContain("Blueprint Studio");
    expect(markup).toContain("Validate draft");
    expect(markup).toContain("Preview YAML");
    expect(markup).toContain("Generate from current dimension");
    expect(markup).toContain("does not write config automatically");
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
    expect(markup).not.toContain("Export blocked");
  });

  it("renders SR Onestream Dim Builder identity and generic lifecycle actions", () => {
    const markup = renderAppShell({ appConfig: defaultAppConfig });

    expect(markup).toContain(">SR Onestream Dim Builder<");
    expect(markup).toMatch(/<button[^>]*>[\s\S]*New Project<\/button>/);
    expect(markup).toMatch(/<button[^>]*>[\s\S]*Seed from file<\/button>/);
    expect(markup).toMatch(/<button[^>]*title="Create or open a project before validating"[^>]*disabled=""[^>]*>[\s\S]*Validate<\/button>/);
    expect(markup).not.toContain(">DimBuilder<");
    expect(markup).not.toContain("Import a workbook to begin.");
  });

  it("renders the Notion-inspired global workbench toolbar", () => {
    const markup = renderAppShell({ appConfig: defaultAppConfig });

    expect(markup).toContain("global-toolbar");
    expect(markup).toContain("brand-wordmark");
    expect(markup).toContain(">SR Onestream Dim Builder<");
    expect(markup).not.toContain("project-context");
    expect(markup).not.toContain("nav-project");
  });

  it("keeps the left rail focused on searchable dimensions", () => {
    const markup = renderAppShell({ appConfig: defaultAppConfig });

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

    expect(markup).toContain("workspace-page");
    expect(markup).toContain("workspace-page-icon");
    expect(markup).toContain("workspace-page-body");
    expect(markup).toContain("workspace-primary");
    expect(markup).toContain("workspace-document");
    expect(markup).toContain("workspace-tablist");
    expect(markup).toContain("workspace-facts");
    expect(markup).toContain("details-rail");
    expect(markup).not.toContain("workspace-grid--single");
    expect(markup).toContain("Scenario - SampleScenario");
    expect(markup).toContain(">Varying</button>");
    expect(markup).toContain(">Bulk Update</button>");
    expect(markup).toContain(">Compare</button>");
    expect(markup).toContain(">Change Sets</button>");
    expect(markup).toContain(">XML</button>");
    expect(markup).not.toContain("XML Preview</button>");
    expect(markup).not.toContain("section-kicker\">Scenario dimension");
  });

  it("uses a single-column workspace grid on the Issues tab", () => {
    const issuesTabConfig: ClientAppConfig = {
      ...defaultAppConfig,
      ui: { ...defaultAppConfig.ui, defaultWorkspaceTab: "Issues" }
    };
    const markup = render(createElement(DimensionWorkspace, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension,
      issues: [],
      onRefresh: () => undefined,
      appConfig: issuesTabConfig,
      exportAvailability: readyExportAvailability
    }));

    expect(markup).toContain("workspace-grid--single");
    expect(markup).toContain('aria-current="page">Issues</button>');
    expect(markup).toContain("issue-panel expanded");
    expect(markup).not.toContain("details-rail");
  });

  it("renders the validation rail as a compact details surface", () => {
    const markup = render(createElement(IssuePanel, {
      dimension: sampleScenarioDimension,
      issues: [],
      appConfig: defaultAppConfig
    }));

    expect(markup).toContain("details-rail");
    expect(markup).toContain("details-rail-page");
    expect(markup).toContain("rail-issue-summary");
    expect(markup).toContain("rail-property-section");
    expect(markup).toContain("rail-issues-section");
    expect(markup).toContain("Readiness");
    expect(markup).toContain("Dimension details");
    expect(markup).toContain("Validation profile");
    expect(markup).toContain("OneStream");
    expect(markup).not.toContain("Issue rail");
  });

  it("renders expanded validation issue filters", () => {
    const markup = render(createElement(IssuePanel, {
      dimension: sampleScenarioDimension,
      issues: [
        {
          id: "issue-1",
          projectId: sampleProject.id,
          dimensionId: sampleScenarioDimension.id,
          entityType: "member",
          entityId: "member-1",
          severity: "warning",
          code: "UNKNOWN_PROPERTY",
          message: "Legacy property is not in the dictionary.",
          fieldName: "Legacy Property",
          rowNumber: 12,
          createdAt: "2026-05-16T00:00:00.000Z"
        }
      ],
      appConfig: defaultAppConfig,
      expanded: true
    }));

    expect(markup).toContain("Filter by severity");
    expect(markup).toContain("Filter issue code");
    expect(markup).toContain("UNKNOWN_PROPERTY");
    expect(markup).toContain('class="issue-summary"');
    expect(markup).not.toContain("rail-issue-summary");
    expect(markup).toContain("<b>1</b> warnings");
  });

  it("renders metadata editing as a Notion-style property list", () => {
    const markup = render(createElement(MetadataEditor, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension,
      onSaved: () => undefined
    }));

    expect(markup).toContain("metadata-document");
    expect(markup).toContain("metadata-property-grid");
    expect(markup).toContain("metadata-property-row");
    expect(markup).toContain("metadata-property-label");
    expect(markup).toContain("metadata-property-input");
    expect(markup).toContain("metadata-save-bar");
    expect(markup).toContain("Dimension Type *");
    expect(markup).toContain("Dimension Name *");
  });

  it("renders a compact varying property editor surface", () => {
    const markup = render(createElement(VaryingPropertiesPanel, {
      projectId: sampleProject.id,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" }
    }));

    expect(markup).toContain("varying-properties-panel");
    expect(markup).toContain("Target");
    expect(markup).toContain("Property");
    expect(markup).toContain("Cube type");
    expect(markup).toContain("Scenario type");
    expect(markup).toContain("Time member");
    expect(markup).toContain("Default");
  });

  it("renders a compact change set lifecycle panel", () => {
    const markup = render(createElement(ChangeSetsPanel, {
      projectId: sampleProject.id,
      hasBlockingIssues: false
    }));

    expect(markup).toContain("change-sets-panel");
    expect(markup).toContain("Change Sets");
    expect(markup).toContain("Create from latest diff");
    expect(markup).toContain("Validate");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Package");
  });

  it("renders a safe bulk update wizard surface", () => {
    const markup = render(createElement(BulkUpdatePanel, {
      projectId: sampleProject.id,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      onApplied: () => undefined
    }));

    expect(markup).toContain("bulk-update-panel");
    expect(markup).toContain("Bulk Update");
    expect(markup).toContain("Target");
    expect(markup).toContain("Filters");
    expect(markup).toContain("Operation");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Apply");
    expect(markup).toContain("Run Validation");
  });

  it("renders grid actions as compact icon workbench controls", () => {
    const markup = render(createElement(EditableGrid, {
      projectId: sampleProject.id,
      kind: "members",
      dimension: sampleScenarioDimension,
      pageSize: 50
    }));

    expect(markup).toContain("grid-toolbar-title");
    expect(markup).toContain("grid-toolbar-tools");
    expect(markup).toContain("grid-selection-summary");
    expect(markup).toContain("grid-icon-button");
    expect(markup).toContain('aria-label="Add member"');
    expect(markup).toContain('title="Add member"');
    expect(markup).toContain('aria-label="Duplicate selected row"');
    expect(markup).toContain('aria-label="Delete selected row"');
    expect(markup).toContain('aria-label="Toggle columns"');
    expect(markup).not.toContain(">Duplicate</button>");
    expect(markup).not.toContain(">Columns</button>");
  });

  it("surfaces property dictionary help on grid column headers", () => {
    const markup = render(createElement(EditableGrid, {
      projectId: sampleProject.id,
      kind: "members",
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      pageSize: 50
    }));

    expect(markup).toContain('title="Account Type: Categorizes the account for OneStream consolidation and reporting behavior."');
  });

  it("renders hierarchy as a compact searchable tree workbench", () => {
    const markup = render(createElement(HierarchyTree, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension
    }));

    expect(markup).toContain("hierarchy-document");
    expect(markup).toContain("hierarchy-toolbar");
    expect(markup).toContain("hierarchy-search");
    expect(markup).toContain("hierarchy-tree");
    expect(markup).toContain("hierarchy-empty");
    expect(markup).toContain('role="tree"');
    expect(markup).toContain('aria-label="Search Scenarios hierarchy"');
    expect(markup).toContain("No local relationships found");
    expect(markup).not.toContain("panel-heading compact");
  });

  it("renders hierarchy analytics export controls beside the tree", () => {
    const markup = render(createElement(HierarchyTree, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension
    }));

    expect(markup).toContain("hierarchy-analytics-panel");
    expect(markup).toContain("Max depth");
    expect(markup).toContain("Orphans");
    expect(markup).toContain("Shared");
    expect(markup).toContain("Export levelized CSV");
    expect(markup).toContain("Export paths CSV");
    expect(markup).toContain("Export parent-child CSV");
  });

  it("renders generic no-project dashboard guidance", () => {
    const markup = dashboardMarkup(defaultAppConfig);

    expect(markup).toContain('<span class="status-badge neutral">No project</span>');
    expect(markup).toContain("Create a project or seed from a file.");
    expect(markup).not.toContain("Use the Import button in the top command bar to load an XF metadata workbook.");
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

  it("renders XML preview as a compact code workbench", () => {
    const markup = render(createElement(XmlPreview, {
      projectId: sampleProject.id,
      dimension: sampleScenarioDimension,
      exportAvailability: readyExportAvailability
    }));

    expect(markup).toContain("xml-document");
    expect(markup).toContain("xml-toolbar-title");
    expect(markup).toContain("xml-actions");
    expect(markup).toContain("xml-scope-control");
    expect(markup).toContain("xml-code-frame");
    expect(markup).toContain("OneStream XML");
    expect(markup).toContain('aria-label="XML preview scope"');
    expect(markup).toContain('aria-label="Copy XML preview"');
    expect(markup).toContain('title="Copy XML preview"');
  });

  it("labels import and export modals as dialogs", () => {
    const importMarkup = render(createElement(ImportModal, {
      open: true,
      onClose: () => undefined,
      onImported: () => undefined,
      projects: [],
      selectedProjectId: null,
      enabledDimensionTypes: defaultAppConfig.dimensions.enabledTypes
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

  it("renders relationship export load modes and pre-export impact summary affordance", () => {
    const exportMarkup = render(createElement(ExportModal, {
      open: true,
      onClose: () => undefined,
      projectId: sampleProject.id,
      appConfig: defaultAppConfig,
      exportAvailability: readyExportAvailability
    }));

    expect(exportMarkup).toContain("Relationship load mode");
    expect(exportMarkup).toContain("Full XML");
    expect(exportMarkup).toContain("Additive");
    expect(exportMarkup).toContain("Property update");
    expect(exportMarkup).toContain("Relationship delete");
    expect(exportMarkup).toContain("Move/copy");
    expect(exportMarkup).toContain("Break/build");
    expect(exportMarkup).toContain("Pre-export impact");
  });

  it("shows export validation bypass controls only when enabled by config", () => {
    const defaultMarkup = render(createElement(ExportModal, {
      open: true,
      onClose: () => undefined,
      projectId: sampleProject.id,
      appConfig: defaultAppConfig,
      exportAvailability: blockedExportAvailability
    }));
    const bypassMarkup = render(createElement(ExportModal, {
      open: true,
      onClose: () => undefined,
      projectId: sampleProject.id,
      appConfig: {
        ...defaultAppConfig,
        export: {
          ...defaultAppConfig.export,
          allowValidationBypass: true,
          validationBypassRequiresReason: true
        }
      },
      exportAvailability: blockedExportAvailability
    }));

    expect(defaultMarkup).not.toContain("Bypass validation block");
    expect(bypassMarkup).toContain("Bypass validation block");
  });

  it("labels the XLSX workflow as optional seeding", () => {
    const importMarkup = render(createElement(ImportModal, {
      open: true,
      onClose: () => undefined,
      onImported: () => undefined,
      projects: [],
      selectedProjectId: null,
      enabledDimensionTypes: defaultAppConfig.dimensions.enabledTypes
    }));

    expect(importMarkup).toContain("Seed from file");
    expect(importMarkup).toContain("Select an optional .xlsx OneStream metadata workbook to seed a project.");
    expect(importMarkup).toContain("Import XML");
    expect(importMarkup).toContain("Import CSV");
    expect(importMarkup).toContain("simple parent-child CSV");
    expect(importMarkup).not.toContain("Select an optional `.xlsx` OneStream metadata workbook to seed a project.");
    expect(importMarkup).not.toContain("Import workbook");
  });

  it("keeps XLSX seeding status and success copy generic", () => {
    expect(importExportModalSource).toContain('"Seeding project from file..."');
    expect(importExportModalSource).toContain('"Importing editable OneStream metadata XML..."');
    expect(importExportModalSource).not.toContain("Large UD3 sheets can take a few seconds");
    expect(importExportModalSource).toContain('importMode === "xlsx" ? "Seeded" : "Imported"');
  });
});
