# DimBuilder UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DimBuilder React UI into the approved Operations Command Center experience with dense metadata grids and clear validation/export readiness.

**Architecture:** Keep the existing React/Vite/Express app and current backend APIs. Add pure client-side view-model helpers for testable UI decisions, introduce a tiny set of reusable UI primitives, then update the existing shell, dashboard, workspace, grids, validation, hierarchy, XML, modal, and CSS files in place.

**Tech Stack:** React 18, TypeScript, Vite, Vitest in node environment, lucide-react, @tanstack/react-virtual, Playwright for browser verification.

---

## Scope Check

This plan covers one subsystem: the existing frontend UI/UX redesign. It does not change workbook parsing, XML generation, SQLite schema, API routes, YAML config schema, or deployment behavior.

## Files And Responsibilities

- Create `src/client/ui/viewModel.ts`: pure helper functions for issue summaries, export availability, enabled formats, tab availability, count formatting, and dimension navigation data.
- Create `src/test/clientUiViewModel.test.ts`: node-environment tests for the pure UI helper behavior.
- Create `src/client/components/ui.tsx`: compact presentational primitives used across the redesigned screens.
- Modify `src/client/components/AppShell.tsx`: operations layout, sidebar dimension rail, top command bar, status banners, dashboard/workspace orchestration, export availability.
- Modify `src/client/components/Dashboard.tsx`: project command dashboard, metric tiles, recent dimension list, empty state, primary actions.
- Modify `src/client/components/DimensionWorkspace.tsx`: richer workspace header, tab model via helper, validation rail placement.
- Modify `src/client/components/IssuePanel.tsx`: validation rail and expanded issue list styling/content.
- Modify `src/client/components/MetadataEditor.tsx`: structured overview form and save status.
- Modify `src/client/components/EditableGrid.tsx`: denser action bar, column drawer, row selection, save/error status, accessible action titles.
- Modify `src/client/components/HierarchyTree.tsx`: icon expand/collapse controls, compact issue indicators.
- Modify `src/client/components/XmlPreview.tsx`: redesigned XML action bar/status treatment.
- Modify `src/client/components/ImportExportModals.tsx`: import wizard states and export availability explanation.
- Modify `src/client/styles.css`: full visual-system and responsive redesign.
- Delete `public/redesign-directions.html`: temporary review artifact no longer needed after implementation starts.

---

### Task 1: Add Testable UI View-Model Helpers

**Files:**
- Create: `src/client/ui/viewModel.ts`
- Create: `src/test/clientUiViewModel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/clientUiViewModel.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: FAIL because `src/client/ui/viewModel.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/client/ui/viewModel.ts` with:

```typescript
import type { ClientAppConfig, ExportConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DimensionRecord, Severity, ValidationIssue } from "../../shared/types";

export interface IssueSummary {
  errors: number;
  warnings: number;
  infos: number;
  total: number;
  blocksExport: boolean;
}

export interface ExportAvailability {
  disabled: boolean;
  title: string;
  reason: string;
}

export interface ExportFormatLink {
  key: "xml" | "xlsx" | "csvMembers" | "csvRelationships" | "json";
  label: string;
  hrefSuffix: string;
}

export interface WorkspaceTabItem {
  label: "Overview" | "Members" | "Relationships" | "Hierarchy" | "XML Preview" | "Issues";
}

export interface DimensionNavItem {
  id: string;
  label: string;
  subtitle: string;
  dimension: DimensionRecord;
  issueSummary: IssueSummary;
}

export function buildIssueSummary(
  issues: ValidationIssue[],
  blockedSeverities: Severity[],
  dimensionId?: string
): IssueSummary {
  const scopedIssues = dimensionId ? issues.filter((issue) => issue.dimensionId === dimensionId) : issues;
  const errors = scopedIssues.filter((issue) => issue.severity === "error").length;
  const warnings = scopedIssues.filter((issue) => issue.severity === "warning").length;
  const infos = scopedIssues.filter((issue) => issue.severity === "info").length;

  return {
    errors,
    warnings,
    infos,
    total: scopedIssues.length,
    blocksExport: scopedIssues.some((issue) => blockedSeverities.includes(issue.severity))
  };
}

export function getEnabledExportFormats(exportConfig: ExportConfig): ExportFormatLink[] {
  const formats: ExportFormatLink[] = [];
  if (exportConfig.xml.enabled) formats.push({ key: "xml", label: "OneStream XML", hrefSuffix: "xml" });
  if (exportConfig.xlsx.enabled) formats.push({ key: "xlsx", label: "Workbook XLSX", hrefSuffix: "xlsx" });
  if (exportConfig.csv.enabled) {
    formats.push({ key: "csvMembers", label: "Members CSV", hrefSuffix: "members.csv" });
    formats.push({ key: "csvRelationships", label: "Relationships CSV", hrefSuffix: "relationships.csv" });
  }
  if (exportConfig.json.enabled) formats.push({ key: "json", label: "JSON Backup", hrefSuffix: "json" });
  return formats;
}

export function getExportAvailability({
  projectId,
  exportConfig,
  issues,
  blockedSeverities
}: {
  projectId: string | null;
  exportConfig: ExportConfig;
  issues: ValidationIssue[];
  blockedSeverities: Severity[];
}): ExportAvailability {
  if (!projectId) {
    return { disabled: true, title: "Import a project before exporting", reason: "No project imported" };
  }

  if (getEnabledExportFormats(exportConfig).length === 0) {
    return { disabled: true, title: "Exports are disabled by configuration", reason: "No export formats enabled" };
  }

  if (issues.some((issue) => blockedSeverities.includes(issue.severity))) {
    return { disabled: true, title: "Resolve blocking validation issues before exporting", reason: "Blocking validation issues" };
  }

  return { disabled: false, title: "Export metadata", reason: "Ready to export" };
}

export function getWorkspaceTabs(xmlPreviewEnabled: boolean): WorkspaceTabItem[] {
  const tabs: WorkspaceTabItem[] = [
    { label: "Overview" },
    { label: "Members" },
    { label: "Relationships" },
    { label: "Hierarchy" }
  ];
  if (xmlPreviewEnabled) tabs.push({ label: "XML Preview" });
  tabs.push({ label: "Issues" });
  return tabs;
}

export function buildDimensionNavItems(
  dimensions: DimensionRecord[],
  issues: ValidationIssue[],
  displayConfig: ClientAppConfig["dimensions"]["display"],
  blockedSeverities: Severity[]
): DimensionNavItem[] {
  return dimensions.map((dimension) => ({
    id: dimension.id,
    label: getDimensionDisplayLabel(dimension, displayConfig),
    subtitle: getDimensionDisplaySubtitle(dimension, displayConfig),
    dimension,
    issueSummary: buildIssueSummary(issues, blockedSeverities, dimension.id)
  }));
}

export function formatCount(value: number): string {
  if (Math.abs(value) < 1000) return String(value);
  const rounded = Math.round((value / 1000) * 10) / 10;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)}k`;
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests**

Run:

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/client/ui/viewModel.ts src/test/clientUiViewModel.test.ts
git commit -m "feat: add ui view model helpers"
```

---

### Task 2: Add Reusable UI Primitives

**Files:**
- Create: `src/client/components/ui.tsx`

- [ ] **Step 1: Create the primitive components**

Create `src/client/components/ui.tsx` with:

```tsx
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import type { Severity } from "../../shared/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export function Panel({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function StatusBadge({
  tone = "neutral",
  children,
  title
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return <span className={`status-badge ${tone}`} title={title}>{children}</span>;
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const label = severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Info";
  const tone = severity === "error" ? "danger" : severity === "warning" ? "warning" : "info";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export function MetricTile({
  label,
  value,
  tone = "neutral",
  detail
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  detail?: ReactNode;
}) {
  return (
    <div className={`metric-tile ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state-block">
      <strong>{title}</strong>
      <p>{children}</p>
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}

export function ActionButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} className={`action-button ${variant} ${className}`.trim()}>
      {children}
    </button>
  );
}

export function ActionLink({
  variant = "secondary",
  className = "",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <a {...props} className={`action-button link ${variant} ${className}`.trim()}>
      {children}
    </a>
  );
}
```

- [ ] **Step 2: Run TypeScript build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```powershell
git add src/client/components/ui.tsx
git commit -m "feat: add shared ui primitives"
```

---

### Task 3: Redesign App Shell And Dimension Rail

**Files:**
- Modify: `src/client/components/AppShell.tsx`

- [ ] **Step 1: Update imports**

Change the imports at the top of `src/client/components/AppShell.tsx` to include the helper and UI primitives:

```tsx
import {
  Database,
  Download,
  FileUp,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import {
  buildDimensionNavItems,
  buildIssueSummary,
  getExportAvailability
} from "../ui/viewModel";
import { validateProject } from "../api/client";
import { useProjectStore } from "../state/useProjectStore";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { ExportModal, ImportModal } from "./ImportExportModals";
import { ActionButton, StatusBadge } from "./ui";
```

- [ ] **Step 2: Replace local export booleans with helper-backed state**

Inside `AppShell`, after `const dimensionDisplayConfig = appConfig.dimensions.display;`, replace the current export status constants with:

```tsx
  const issueSummary = buildIssueSummary(store.issues, appConfig.validation.exportBlockedBySeverities);
  const exportAvailability = getExportAvailability({
    projectId: store.selectedProjectId,
    exportConfig: appConfig.export,
    issues: store.issues,
    blockedSeverities: appConfig.validation.exportBlockedBySeverities
  });
  const dimensionNavItems = useMemo(
    () => buildDimensionNavItems(
      store.dimensions,
      store.issues,
      dimensionDisplayConfig,
      appConfig.validation.exportBlockedBySeverities
    ),
    [appConfig.validation.exportBlockedBySeverities, dimensionDisplayConfig, store.dimensions, store.issues]
  );
```

Remove the old `hasEnabledExportFormats`, `hasExportBlockingIssues`, `exportDisabled`, and `exportTitle` constants.

- [ ] **Step 3: Replace the sidebar markup**

Replace the `<aside className="sidebar">...</aside>` block with:

```tsx
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Database size={18} /></span>
          <span>{appConfig.application.productName}</span>
        </div>

        <div className="sidebar-project">
          <span className="sidebar-label">Project</span>
          <strong>{store.projects[0]?.name ?? "No project imported"}</strong>
          <small>{store.projects[0]?.sourceFileName ?? appConfig.application.supportText}</small>
        </div>

        <div className="sidebar-section-header">
          <span className="sidebar-label">Dimensions</span>
          <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
            {issueSummary.total ? `${issueSummary.total} issues` : "Ready"}
          </StatusBadge>
        </div>

        {dimensionNavItems.length === 0 && <div className="empty-sidebar">Import a workbook to begin.</div>}
        {dimensionNavItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeDimension?.id === item.id ? "selected" : ""}`}
            onClick={() => setActiveDimensionId(item.id)}
            title={item.subtitle}
          >
            <span>{item.label}</span>
            <small>{item.subtitle}</small>
            {item.issueSummary.errors > 0 && <b className="nav-issue error">{item.issueSummary.errors}</b>}
            {item.issueSummary.errors === 0 && item.issueSummary.warnings > 0 && <b className="nav-issue warning">{item.issueSummary.warnings}</b>}
          </button>
        ))}
      </aside>
```

- [ ] **Step 4: Replace toolbar buttons with `ActionButton`**

Inside `.toolbar-actions`, use:

```tsx
            {toolbar.showImport && (
              <ActionButton variant="primary" onClick={() => setImportOpen(true)}>
                <FileUp size={16} /> Import
              </ActionButton>
            )}
            {toolbar.showValidate && (
              <ActionButton disabled={!store.selectedProjectId} onClick={runValidation}>
                <ShieldCheck size={16} /> Validate
              </ActionButton>
            )}
            {toolbar.showExport && (
              <ActionButton
                disabled={exportAvailability.disabled}
                title={exportAvailability.title}
                onClick={() => setExportOpen(true)}
              >
                <Download size={16} /> Export
              </ActionButton>
            )}
            {toolbar.showSave && <ActionButton disabled><Save size={16} /> Save</ActionButton>}
            {toolbar.showUndoRedo && <ActionButton disabled title="Undo" aria-label="Undo"><Undo2 size={16} /></ActionButton>}
            {toolbar.showUndoRedo && <ActionButton disabled title="Redo" aria-label="Redo"><RotateCcw size={16} /></ActionButton>}
```

- [ ] **Step 5: Pass new props to dashboard and export modal**

Replace the `Dashboard` usage with:

```tsx
          <Dashboard
            dimensions={store.dimensions}
            summary={store.summary}
            project={store.projects[0] ?? null}
            issues={store.issues}
            onImport={() => setImportOpen(true)}
            onValidate={() => void runValidation()}
            validateDisabled={!store.selectedProjectId}
            onExport={() => setExportOpen(true)}
            exportAvailability={exportAvailability}
            onOpenDimension={setActiveDimensionId}
            appConfig={appConfig}
          />
```

Replace the `ExportModal` usage with:

```tsx
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectId={store.selectedProjectId}
        appConfig={appConfig}
        exportAvailability={exportAvailability}
      />
```

- [ ] **Step 6: Run build and tests**

Run:

```powershell
npm.cmd run build
npm.cmd test
```

Expected: both PASS after downstream components are updated in the next task. If this task is implemented independently, TypeScript may fail until Task 4 and Task 7 add the new props; commit after those prop consumers compile.

---

### Task 4: Redesign Dashboard

**Files:**
- Modify: `src/client/components/Dashboard.tsx`

- [ ] **Step 1: Replace imports**

Use:

```tsx
import { ArrowRight, Download, FileUp, ShieldCheck } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord, ProjectRecord, ValidationIssue } from "../../shared/types";
import { buildIssueSummary, type ExportAvailability, formatCount } from "../ui/viewModel";
import { ActionButton, EmptyState, MetricTile, Panel, StatusBadge } from "./ui";
```

- [ ] **Step 2: Replace the component signature**

Use:

```tsx
export function Dashboard({
  dimensions,
  summary,
  project,
  issues,
  onImport,
  onValidate,
  validateDisabled,
  onExport,
  exportAvailability,
  onOpenDimension,
  appConfig
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  project: ProjectRecord | null;
  issues: ValidationIssue[];
  onImport: () => void;
  onValidate: () => void;
  validateDisabled: boolean;
  onExport: () => void;
  exportAvailability: ExportAvailability;
  onOpenDimension: (dimensionId: string) => void;
  appConfig: ClientAppConfig;
}) {
```

- [ ] **Step 3: Replace dashboard body**

Inside the component body, use:

```tsx
  const cards = appConfig.dashboard.cards;
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const issueSummary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const exportTone = exportAvailability.disabled ? "warning" : "success";
  const metrics = [
    { key: "totalDimensions", label: "Dimensions", value: summary?.totalDimensions ?? dimensions.length, enabled: cards.totalDimensions, tone: "neutral" as const },
    { key: "totalMembers", label: "Members", value: summary?.totalMembers ?? 0, enabled: cards.totalMembers, tone: "neutral" as const },
    { key: "totalRelationships", label: "Relationships", value: summary?.totalRelationships ?? 0, enabled: cards.totalRelationships, tone: "neutral" as const },
    { key: "validationErrors", label: "Blocking errors", value: summary?.validationErrors ?? issueSummary.errors, enabled: cards.validationErrors, tone: issueSummary.errors ? "danger" as const : "success" as const },
    { key: "validationWarnings", label: "Warnings", value: summary?.validationWarnings ?? issueSummary.warnings, enabled: cards.validationWarnings, tone: issueSummary.warnings ? "warning" as const : "success" as const },
    { key: "exportStatus", label: "Export readiness", value: exportAvailability.disabled ? "Blocked" : "Ready", enabled: cards.exportStatus, tone: exportTone as "warning" | "success", detail: exportAvailability.reason }
  ];
```

Return:

```tsx
  return (
    <section className="dashboard">
      <Panel className="dashboard-command">
        <div className="dashboard-command-copy">
          <span className="section-kicker">Project command center</span>
          <h1>{project?.name ?? appConfig.application.title}</h1>
          <p>{project?.sourceFileName ?? appConfig.application.description}</p>
          <div className="dashboard-status-row">
            <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
              {issueSummary.blocksExport ? "Export blocked" : issueSummary.total ? "Review issues" : "Ready"}
            </StatusBadge>
            <span>{exportAvailability.reason}</span>
          </div>
        </div>
        <div className="dashboard-command-actions">
          <ActionButton variant="primary" onClick={onImport}><FileUp size={16} /> Import</ActionButton>
          <ActionButton disabled={validateDisabled} onClick={onValidate}><ShieldCheck size={16} /> Validate</ActionButton>
          <ActionButton disabled={exportAvailability.disabled} title={exportAvailability.title} onClick={onExport}><Download size={16} /> Export</ActionButton>
        </div>
      </Panel>

      <div className="metric-grid">
        {metrics.filter((metric) => metric.enabled).map((metric) => (
          <MetricTile
            key={metric.key}
            label={metric.label}
            value={typeof metric.value === "number" ? formatCount(metric.value) : metric.value}
            tone={metric.tone}
            detail={metric.detail}
          />
        ))}
      </div>

      {cards.recentDimensions && (
        <Panel className="recent-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Workspace</span>
              <h2>Dimensions</h2>
            </div>
            <span>{dimensions.length} available</span>
          </div>
          {dimensions.length ? (
            <div className="dimension-list">
              {dimensions.map((dimension) => {
                const dimensionIssues = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities, dimension.id);
                return (
                  <button className="dimension-row" key={dimension.id} onClick={() => onOpenDimension(dimension.id)}>
                    <span>
                      <b>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</b>
                      <small>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</small>
                    </span>
                    <StatusBadge tone={dimensionIssues.errors ? "danger" : dimensionIssues.warnings ? "warning" : "success"}>
                      {dimensionIssues.total ? `${dimensionIssues.total} issues` : "Clean"}
                    </StatusBadge>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No project imported"
              action={<ActionButton variant="primary" onClick={onImport}><FileUp size={16} /> Import XLSX</ActionButton>}
            >
              Import the OneStream XF metadata workbook to inspect dimensions, validate hierarchy issues, and export controlled metadata files.
            </EmptyState>
          )}
        </Panel>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS after Task 3 prop changes are present.

- [ ] **Step 5: Commit Task 3 and Task 4 together if Task 3 could not compile alone**

Run:

```powershell
git add src/client/components/AppShell.tsx src/client/components/Dashboard.tsx
git commit -m "feat: redesign app shell and dashboard"
```

---

### Task 5: Redesign Workspace, Metadata Overview, And Validation Rail

**Files:**
- Modify: `src/client/components/DimensionWorkspace.tsx`
- Modify: `src/client/components/IssuePanel.tsx`
- Modify: `src/client/components/MetadataEditor.tsx`

- [ ] **Step 1: Update workspace tabs to use the helper**

In `DimensionWorkspace.tsx`, remove the local `allTabs`, `tabsWithoutXml`, `isWorkspaceTab`, and `getAvailableTabs` declarations.

Import:

```tsx
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { buildIssueSummary, getWorkspaceTabs } from "../ui/viewModel";
import { StatusBadge } from "./ui";
```

Keep this type:

```tsx
type WorkspaceTab = "Overview" | "Members" | "Relationships" | "Hierarchy" | "XML Preview" | "Issues";
```

Add this helper:

```tsx
function getFallbackTab(defaultWorkspaceTab: string, xmlPreviewEnabled: boolean): WorkspaceTab {
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map((item) => item.label);
  return availableTabs.includes(defaultWorkspaceTab as WorkspaceTab) ? defaultWorkspaceTab as WorkspaceTab : "Overview";
}
```

- [ ] **Step 2: Add summary data in `DimensionWorkspace`**

Inside `DimensionWorkspace`, after `const dimensionIssues = ...`, add:

```tsx
  const issueSummary = buildIssueSummary(dimensionIssues, appConfig.validation.exportBlockedBySeverities);
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map((item) => item.label);
  const activeTab = availableTabs.includes(tab) ? tab : getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled);
```

Remove the old `availableTabs`, `activeTab`, and `blockingErrors` constants.

- [ ] **Step 3: Replace workspace header and tabs**

Use:

```tsx
      <div className="workspace-header">
        <div>
          <span className="section-kicker">{dimension.dimensionType} dimension</span>
          <h1>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</h1>
          <small>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</small>
        </div>
        <div className="workspace-health">
          <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
            {issueSummary.blocksExport ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {issueSummary.blocksExport ? "Export blocked" : issueSummary.total ? "Needs review" : "Ready"}
          </StatusBadge>
          <span><b>{issueSummary.errors}</b> errors</span>
          <span><b>{issueSummary.warnings}</b> warnings</span>
        </div>
      </div>
      <nav className="tabs" aria-label="Dimension workspace tabs">
        {availableTabs.map((item) => (
          <button key={item} className={activeTab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
```

- [ ] **Step 4: Pass `appConfig` to `IssuePanel`**

Change both `IssuePanel` usages:

```tsx
          {activeTab === "Issues" && <IssuePanel dimension={dimension} issues={dimensionIssues} appConfig={appConfig} expanded />}
```

and:

```tsx
        <IssuePanel dimension={dimension} issues={dimensionIssues} appConfig={appConfig} />
```

- [ ] **Step 5: Redesign `IssuePanel`**

Change imports in `IssuePanel.tsx`:

```tsx
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, Severity, ValidationIssue } from "../../shared/types";
import { buildIssueSummary } from "../ui/viewModel";
import { EmptyState, SeverityPill, StatusBadge } from "./ui";
```

Replace the component with:

```tsx
export function IssuePanel({
  dimension,
  issues,
  appConfig,
  expanded = false
}: {
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  appConfig: ClientAppConfig;
  expanded?: boolean;
}) {
  const summary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const visibleIssues = issues.slice(0, expanded ? 500 : 8);

  return (
    <aside className={expanded ? "panel issue-panel expanded" : "panel issue-panel"}>
      <div className="panel-heading compact">
        <div>
          <span className="section-kicker">Validation</span>
          <h2>{expanded ? "Issues" : "Issue rail"}</h2>
        </div>
        <StatusBadge tone={summary.blocksExport ? "danger" : summary.total ? "warning" : "success"}>
          {summary.blocksExport ? "Blocked" : summary.total ? "Review" : "Clean"}
        </StatusBadge>
      </div>
      <div className="issue-summary">
        <span><b>{summary.errors}</b> errors</span>
        <span><b>{summary.warnings}</b> warnings</span>
        {summary.infos > 0 && <span><b>{summary.infos}</b> info</span>}
      </div>
      {visibleIssues.length === 0 ? (
        <EmptyState title="No issues recorded">
          {dimension.sheetName} has no recorded validation issues.
        </EmptyState>
      ) : (
        <div className="issue-list">
          {visibleIssues.map((issue) => <IssueCard issue={issue} key={issue.id} />)}
        </div>
      )}
    </aside>
  );
}

function IssueCard({ issue }: { issue: ValidationIssue }) {
  return (
    <div className={`issue ${issue.severity}`}>
      <div className="issue-icon">{iconForSeverity(issue.severity)}</div>
      <div>
        <div className="issue-title">
          <b>{issue.code}</b>
          <SeverityPill severity={issue.severity} />
        </div>
        <span>{issue.message}</span>
        <small>{[issue.fieldName, issue.rowNumber ? `Row ${issue.rowNumber}` : ""].filter(Boolean).join(" • ")}</small>
      </div>
    </div>
  );
}

function iconForSeverity(severity: Severity) {
  if (severity === "error") return <AlertTriangle size={16} />;
  if (severity === "warning") return <TriangleAlert size={16} />;
  if (severity === "info") return <Info size={16} />;
  return <CheckCircle2 size={16} />;
}
```

- [ ] **Step 6: Redesign `MetadataEditor` markup**

In `MetadataEditor.tsx`, import `ActionButton` and `Panel`:

```tsx
import { Save } from "lucide-react";
import { ActionButton, Panel, StatusBadge } from "./ui";
```

Replace the return block with:

```tsx
  return (
    <Panel className="metadata-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Overview</span>
          <h2>Dimension metadata</h2>
        </div>
        <StatusBadge tone={status === "Saved" ? "success" : status ? "info" : "neutral"}>
          {status || "Idle"}
        </StatusBadge>
      </div>
      <div className="form-panel">
        {fields.map(([key, label, required]) => (
          <label key={key}>
            <span>{label}{required ? " *" : ""}</span>
            <input
              value={String(draft[key] ?? "")}
              readOnly={key === "dimensionType"}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              onBlur={() => void save()}
            />
          </label>
        ))}
      </div>
      <div className="metadata-actions">
        <ActionButton onClick={() => void save()}><Save size={15} /> Save metadata</ActionButton>
      </div>
    </Panel>
  );
```

- [ ] **Step 7: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/client/components/DimensionWorkspace.tsx src/client/components/IssuePanel.tsx src/client/components/MetadataEditor.tsx
git commit -m "feat: redesign workspace and validation rail"
```

---

### Task 6: Redesign Editable Grid Controls

**Files:**
- Modify: `src/client/components/EditableGrid.tsx`

- [ ] **Step 1: Export and test grid page size clamp**

Change:

```tsx
function clampGridPageSize(pageSize: number) {
```

to:

```tsx
export function clampGridPageSize(pageSize: number) {
```

Create or update a focused test in `src/test/clientUiViewModel.test.ts`:

```typescript
import { clampGridPageSize } from "../client/components/EditableGrid";

it("clamps grid page size for stable paged editing", () => {
  expect(clampGridPageSize(0)).toBe(1);
  expect(clampGridPageSize(600)).toBe(600);
  expect(clampGridPageSize(5000)).toBe(1000);
  expect(clampGridPageSize(Number.NaN)).toBe(1);
});
```

- [ ] **Step 2: Run the focused test and expect it to pass after export**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Update imports**

In `EditableGrid.tsx`, add:

```tsx
import { ActionButton, StatusBadge } from "./ui";
```

- [ ] **Step 4: Replace grid toolbar markup**

Replace the `.grid-toolbar` block with:

```tsx
      <div className="grid-toolbar">
        <div className="grid-toolbar-primary">
          <div className="search-box">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}`} />
          </div>
          <StatusBadge tone={status === "Saved" ? "success" : status.startsWith("Loading") ? "info" : "neutral"}>
            {status || `${total} rows`}
          </StatusBadge>
        </div>
        <div className="grid-toolbar-actions">
          <ActionButton onClick={() => void addRow()}><Plus size={15} /> Add</ActionButton>
          <ActionButton disabled={!selectedId} title={selectedId ? "Duplicate selected row" : "Select a row to duplicate"} onClick={() => void duplicateRow()}><Copy size={15} /> Duplicate</ActionButton>
          <ActionButton variant="danger" disabled={!selectedId} title={selectedId ? "Delete selected row" : "Select a row to delete"} onClick={() => void deleteSelected()}><Trash2 size={15} /> Delete</ActionButton>
          <ActionButton onClick={() => setShowColumns((current) => !current)}><EyeOff size={15} /> Columns</ActionButton>
        </div>
      </div>
```

- [ ] **Step 5: Replace column menu markup**

Use:

```tsx
      {showColumns && (
        <div className="column-menu" aria-label="Column visibility">
          {columns.map((column) => (
            <label key={column.name}>
              <input
                type="checkbox"
                checked={!hiddenColumns.has(column.name)}
                onChange={() => setHiddenColumns((current) => {
                  const next = new Set(current);
                  if (next.has(column.name)) next.delete(column.name);
                  else next.add(column.name);
                  return next;
                })}
              />
              <span>{column.name}{column.required ? " *" : ""}</span>
            </label>
          ))}
        </div>
      )}
```

- [ ] **Step 6: Add save error handling**

Wrap `saveCell` API calls in try/catch:

```tsx
  async function saveCell(record: GridRecord, field: FieldDefinition, value: string) {
    const properties = { ...record.properties, [field.name]: value };
    setRecords((current) => current.map((candidate) => candidate.id === record.id ? { ...candidate, properties } as GridRecord : candidate));
    setStatus("Saving...");

    try {
      if (kind === "members") {
        const member = record as DimensionMemberRecord;
        const memberKey = field.name === schema.memberKeyField ? value : member.memberKey;
        await patchMember(projectId, member.id, { memberKey, properties });
      } else {
        const relationship = record as DimensionRelationshipRecord;
        const parentKey = field.name === "Parent" ? value : relationship.parentKey;
        const childKey = field.name === "Child" ? value : relationship.childKey;
        await patchRelationship(projectId, relationship.id, { parentKey, childKey, properties });
      }
      setStatus("Saved");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Save failed");
    }
  }
```

- [ ] **Step 7: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/client/components/EditableGrid.tsx src/test/clientUiViewModel.test.ts
git commit -m "feat: refine editable grid controls"
```

---

### Task 7: Redesign Hierarchy, XML Preview, Import, And Export Modals

**Files:**
- Modify: `src/client/components/HierarchyTree.tsx`
- Modify: `src/client/components/XmlPreview.tsx`
- Modify: `src/client/components/ImportExportModals.tsx`

- [ ] **Step 1: Use icons in hierarchy tree**

Update `HierarchyTree.tsx` imports:

```tsx
import { ChevronDown, ChevronRight, Search } from "lucide-react";
```

Change the top search input to:

```tsx
      <div className="search-box hierarchy-search">
        <Search size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${dimension.sheetName} hierarchy`} />
      </div>
```

Replace the tree button contents with:

```tsx
        {node.children.length ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="tree-spacer" />}
        <span>{node.key}</span>
        {node.issueCodes.map((issue) => <em key={issue}>{issue}</em>)}
```

- [ ] **Step 2: Update XML preview action controls**

In `XmlPreview.tsx`, import:

```tsx
import { ActionButton, ActionLink, StatusBadge } from "./ui";
```

Replace buttons and status in the toolbar with:

```tsx
        <select value={scope} onChange={(event) => setScope(event.target.value as XmlPreviewScope)}>
          {allowAllDimensions && <option value="all">All dimensions</option>}
          <option value="dimension">Current dimension</option>
        </select>
        <ActionButton onClick={() => void copy()}><Copy size={15} /> Copy</ActionButton>
        {xmlExportEnabled && (
          <ActionLink href={`/api/export/${projectId}/xml`} target="_blank" rel="noreferrer"><Download size={15} /> Download XML</ActionLink>
        )}
        <StatusBadge tone={status ? "info" : "neutral"}>{status || "Preview ready"}</StatusBadge>
```

- [ ] **Step 3: Update import/export modal imports**

Use:

```tsx
import { CheckCircle2, Download, FileUp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { ProjectRecord } from "../../shared/types";
import { getEnabledExportFormats, type ExportAvailability } from "../ui/viewModel";
import { uploadWorkbook } from "../api/client";
import { ActionButton, ActionLink, StatusBadge } from "./ui";
```

- [ ] **Step 4: Keep import modal open after success**

In `ImportModal`, add state:

```tsx
  const [importedProject, setImportedProject] = useState<ProjectRecord | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
```

Replace `importWorkbook` with:

```tsx
  async function importWorkbook() {
    if (!file) return;
    setStatus("Importing workbook. Large UD3 sheets can take a few seconds...");
    try {
      const result = await uploadWorkbook(file, file.name.replace(/\.xlsx$/i, ""));
      setImportedProject(result.project);
      setSummary(result.importSummary);
      setStatus(`Imported ${String(result.importSummary.dimensionsImported)} dimensions`);
      onImported(result.project.id);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Import failed");
    }
  }
```

Replace modal body with:

```tsx
        <div className="modal-heading">
          <h2>Import XLSX Template</h2>
          {importedProject ? <StatusBadge tone="success"><CheckCircle2 size={14} /> Imported</StatusBadge> : null}
        </div>
        <p>Select the OneStream XF metadata workbook. Generated XML/formula columns are ignored.</p>
        {!importedProject && <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />}
        {summary && (
          <div className="import-summary">
            <span><b>{String(summary.dimensionsImported ?? 0)}</b> dimensions</span>
            <span><b>{String(summary.membersImported ?? 0)}</b> members</span>
            <span><b>{String(summary.relationshipsImported ?? 0)}</b> relationships</span>
          </div>
        )}
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>{importedProject ? "Done" : "Cancel"}</ActionButton>
          {!importedProject && <ActionButton variant="primary" disabled={!file} onClick={() => void importWorkbook()}><FileUp size={15} /> Import</ActionButton>}
        </div>
```

- [ ] **Step 5: Redesign export modal**

Change `ExportModal` signature:

```tsx
export function ExportModal({
  open,
  onClose,
  projectId,
  appConfig,
  exportAvailability
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  appConfig: ClientAppConfig;
  exportAvailability: ExportAvailability;
}) {
```

Replace body after `if (!open) return null;` with:

```tsx
  const prefix = projectId ? `/api/export/${projectId}` : "#";
  const formats = getEnabledExportFormats(appConfig.export);
  const disabled = exportAvailability.disabled;
```

Use this modal content:

```tsx
      <div className="modal">
        <div className="modal-heading">
          <h2>Export Metadata</h2>
          <StatusBadge tone={disabled ? "warning" : "success"}>
            {disabled ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}
            {exportAvailability.reason}
          </StatusBadge>
        </div>
        {formats.length ? (
          <div className="export-list">
            {formats.map((format) => (
              <ActionLink
                key={format.key}
                aria-disabled={disabled}
                href={disabled ? "#" : `${prefix}/${format.hrefSuffix}`}
                target={disabled ? undefined : "_blank"}
                rel={disabled ? undefined : "noreferrer"}
              >
                <Download size={15} /> {format.label}
              </ActionLink>
            ))}
          </div>
        ) : (
          <div className="empty-state">Exports are disabled by configuration.</div>
        )}
        {disabled && <p className="modal-status">{exportAvailability.title}</p>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>
```

- [ ] **Step 6: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/client/components/HierarchyTree.tsx src/client/components/XmlPreview.tsx src/client/components/ImportExportModals.tsx
git commit -m "feat: polish hierarchy xml and modal flows"
```

---

### Task 8: Apply Full Visual System And Responsive CSS

**Files:**
- Modify: `src/client/styles.css`

- [ ] **Step 1: Replace root tokens and global control rules**

At the top of `styles.css`, replace `:root` and base button/input rules with tokenized styling:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0f172a;
  background: #f8fafc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-subtle: #f1f5f9;
  --text: #0f172a;
  --muted: #64748b;
  --border: #d8dee7;
  --border-strong: #cbd5e1;
  --primary: #2563eb;
  --primary-strong: #1d4ed8;
  --warning: #f59e0b;
  --danger: #dc2626;
  --success: #16a34a;
  --info: #2563eb;
  --radius: 8px;
  --radius-sm: 6px;
  --shadow: 0 14px 36px rgba(15, 23, 42, 0.08);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--bg);
}

button,
input,
select {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

button {
  cursor: pointer;
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.22);
  outline-offset: 2px;
}

button:disabled,
a[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.48;
  pointer-events: none;
}
```

- [ ] **Step 2: Rework app shell layout classes**

Replace `.app-shell`, `.sidebar`, `.brand`, `.nav-item`, `.main`, `.toolbar`, `.toolbar-title`, `.toolbar-actions`, and `.banner` sections with styles that support:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  background: var(--bg);
}

.sidebar {
  background: #0f172a;
  color: #e2e8f0;
  padding: 18px 14px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 760;
  min-width: 0;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--primary);
  display: grid;
  place-items: center;
  color: #fff;
  flex: 0 0 auto;
}

.sidebar-project {
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.38);
  border-radius: var(--radius);
  padding: 12px;
  display: grid;
  gap: 5px;
}

.sidebar-project strong,
.sidebar-project small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-project small,
.sidebar-label {
  color: #94a3b8;
  font-size: 12px;
}

.sidebar-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 750;
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.nav-item {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: #dbeafe;
  text-align: left;
  padding: 10px;
  border-radius: var(--radius-sm);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 8px;
  transition: background 160ms ease, border-color 160ms ease;
}

.nav-item span,
.nav-item small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.nav-item small {
  color: #93c5fd;
  font-size: 11px;
}

.nav-item.selected,
.nav-item:hover {
  background: #1e293b;
  border-color: rgba(147, 197, 253, 0.32);
}

.nav-issue {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  color: #fff;
  font-size: 11px;
}

.nav-issue.error { background: var(--danger); }
.nav-issue.warning { background: var(--warning); }

.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.toolbar {
  min-height: 62px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  gap: 12px;
}
```

Keep existing selectors that still apply, but update their color values to use tokens.

- [ ] **Step 3: Add primitive component styles**

Add:

```css
.action-button {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  text-decoration: none;
  font-weight: 700;
  font-size: 13px;
  line-height: 1.2;
  min-height: 34px;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.action-button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.action-button.primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.action-button.primary:hover {
  background: var(--primary-strong);
  border-color: var(--primary-strong);
}

.action-button.danger {
  color: var(--danger);
}

.action-button.ghost {
  background: transparent;
}

.status-badge {
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--muted);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 750;
  white-space: nowrap;
}

.status-badge.primary,
.status-badge.info {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.status-badge.success {
  background: #ecfdf5;
  border-color: #bbf7d0;
  color: #047857;
}

.status-badge.warning {
  background: #fffbeb;
  border-color: #fde68a;
  color: #b45309;
}

.status-badge.danger {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.panel-heading h2 {
  margin: 0;
  font-size: 16px;
}

.section-kicker {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 750;
}
```

- [ ] **Step 4: Rework dashboard, workspace, grid, issue, modal, hierarchy, and XML styles**

Update the remaining CSS sections so these class groups exist and match the new markup:

```css
.dashboard-command,
.recent-panel,
.metadata-panel,
.hierarchy-panel,
.xml-panel,
.issue-panel {
  padding: 14px;
}

.dashboard-command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.dashboard-command h1,
.workspace-header h1 {
  margin: 0;
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: 0;
}

.dashboard-command p,
.workspace-header small,
.modal p,
.modal-status {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.dashboard-command-actions,
.toolbar-actions,
.grid-toolbar-actions,
.modal-actions,
.metadata-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.dashboard-status-row,
.workspace-health,
.issue-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.metric-tile {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  display: grid;
  gap: 5px;
  min-height: 86px;
}

.metric-tile strong {
  font-size: 24px;
  line-height: 1.05;
}

.metric-tile span,
.metric-tile small {
  color: var(--muted);
  font-size: 12px;
}

.dimension-list {
  display: grid;
  gap: 8px;
}

.dimension-row {
  width: 100%;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: var(--radius-sm);
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  color: var(--text);
  text-align: left;
}

.dimension-row:hover {
  border-color: #93c5fd;
  background: #f8fbff;
}
```

Preserve existing virtualization sizing rules for `.data-grid`, `.grid-header`, and `.grid-row`, but update colors, borders, and toolbar layout to match tokens.

- [ ] **Step 5: Replace responsive rules**

At the bottom of `styles.css`, keep breakpoints but update them:

```css
@media (max-width: 1180px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .toolbar,
  .dashboard-command,
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions,
  .dashboard-command-actions,
  .grid-toolbar-actions {
    justify-content: flex-start;
  }

  .metric-grid,
  .form-panel {
    grid-template-columns: 1fr;
  }

  .data-grid {
    max-width: calc(100vw - 28px);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 6: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/client/styles.css
git commit -m "style: apply operations ui visual system"
```

---

### Task 9: Final Cleanup And Verification

**Files:**
- Delete: `public/redesign-directions.html`

- [ ] **Step 1: Delete the temporary redesign review page**

Use `apply_patch` to delete:

```text
public/redesign-directions.html
```

- [ ] **Step 2: Run the full automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: both PASS.

- [ ] **Step 3: Start or reuse the dev server**

Run:

```powershell
npm.cmd run dev
```

Expected output includes:

```text
VITE v6
Local: http://127.0.0.1:5173/
OneStream XF Dimension Builder API listening on http://127.0.0.1:8787
```

If port `5173` is busy, use the Vite URL printed by the command.

- [ ] **Step 4: Capture desktop and mobile browser screenshots with Playwright**

Run this command after the dev server is available:

```powershell
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.launch({ channel: 'msedge', headless: true }); const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await desktop.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' }); await desktop.screenshot({ path: 'C:/tmp/dimbuilder-redesign-desktop.png', fullPage: false }); const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } }); await mobile.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' }); await mobile.screenshot({ path: 'C:/tmp/dimbuilder-redesign-mobile.png', fullPage: false }); await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

Expected: screenshots are written to:

```text
C:/tmp/dimbuilder-redesign-desktop.png
C:/tmp/dimbuilder-redesign-mobile.png
```

- [ ] **Step 5: Verify core interaction path in browser**

Run:

```powershell
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.launch({ channel: 'msedge', headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const logs = []; page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(msg.type()+': '+msg.text()); }); await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' }); const title = await page.locator('.toolbar-title strong').textContent(); const importVisible = await page.getByRole('button', { name: /Import/i }).first().isVisible(); await page.getByRole('button', { name: /Import/i }).first().click(); const modalTitle = await page.locator('.modal h2').textContent(); await page.getByRole('button', { name: /Cancel|Done|Close/i }).first().click(); console.log(JSON.stringify({ title, importVisible, modalTitle, logs }, null, 2)); await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

Expected JSON:

```json
{
  "importVisible": true,
  "modalTitle": "Import XLSX Template",
  "logs": []
}
```

The `title` value should match the configured application title.

- [ ] **Step 6: Inspect visual quality**

Open or inspect the screenshots and verify:

- No text overlaps in the dashboard, toolbar, sidebar, or modal.
- Mobile has no page-level horizontal scroll.
- Sidebar is hidden on mobile.
- Metrics stack cleanly on mobile.
- Buttons have stable sizing.
- Validation/status pills are readable.
- The UI looks like a compact enterprise operations tool.

- [ ] **Step 7: Commit cleanup**

Run:

```powershell
git add public/redesign-directions.html
git commit -m "chore: remove redesign review page"
```

If the file was never tracked, this command will have nothing to commit; record that in the final handoff.

---

## Self-Review Checklist For Implementers

- [ ] Spec coverage: app shell, dashboard, workspace, grids, validation rail, hierarchy, XML, import/export, visual system, responsive behavior, accessibility, error states, and verification are covered by tasks above.
- [ ] Type consistency: use `ClientAppConfig`, `ExportConfig`, `DimensionRecord`, `ValidationIssue`, and `Severity` exactly as imported in each task.
- [ ] Config preservation: toolbar, dashboard cards, XML Preview tab, export formats, dimension display, and export blocking severities remain driven by `appConfig`.
- [ ] No backend dependency: no API route, database, parser, validation engine, XML mapper, or YAML schema changes are introduced.
- [ ] Test discipline: write and run failing helper tests before implementing helper behavior, then keep all existing tests passing.
- [ ] Verification discipline: run `npm.cmd test`, `npm.cmd run build`, and browser checks before final handoff.
