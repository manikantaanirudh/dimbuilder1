# DimBuilder Clean Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered Operations Command Center UI with the approved Clean Workbench metadata editor.

**Architecture:** Keep the current React/Vite/Express app and existing backend APIs. Add small pure view-model helpers for default workspace, filtered navigation, facts, and readiness, then update existing components in place around a light shell, table-first workspace, and right validation/details rail.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, lucide-react, @tanstack/react-virtual, Playwright for browser verification.

---

## Scope Check

This plan covers one subsystem: the existing frontend UI/UX redesign. It does not change workbook parsing, OneStream XML semantics, validation rules, export generation, database schema, API routes, or YAML config schema.

The prior plan `docs/superpowers/plans/2026-05-18-ui-ux-redesign.md` targeted an Operations Command Center. This plan supersedes that direction.

## File Structure And Responsibilities

- Modify `src/client/ui/viewModel.ts`: pure Clean Workbench helpers for active dimension fallback, navigation filtering, tab labels, readiness text, dimension facts, and issue summaries.
- Modify `src/client/ui/gridViewModel.ts`: pure table toolbar helpers for visible column counts, selected-row action titles, and status tones.
- Modify `src/test/clientUiViewModel.test.ts`: unit coverage for new helpers and revised XML tab label.
- Modify `src/test/clientComponentsMarkup.test.ts`: static markup checks for no duplicated lifecycle actions, no dashboard hero copy, Clean Workbench tabs/facts, and modal accessibility.
- Modify `src/client/components/ui.tsx`: shared primitives for toolbar groups, fact rows, rail sections, and icon buttons.
- Modify `src/client/components/AppShell.tsx`: light shell, searchable dimension rail, default-to-first-dimension behavior, one command bar only.
- Modify `src/client/components/Dashboard.tsx`: compact project overview and empty state with no repeated lifecycle commands.
- Modify `src/client/components/DimensionWorkspace.tsx`: compact title/facts header, `XML` tab label, rail integration, stable table-first layout.
- Modify `src/client/components/EditableGrid.tsx`: cleaner local table toolbar, stable selected-row actions, denser column menu, accessible action titles.
- Modify `src/client/components/IssuePanel.tsx`: right details/validation rail and expanded Issues tab variants.
- Modify `src/client/components/MetadataEditor.tsx`: compact overview form with section dividers and quiet save state.
- Modify `src/client/components/HierarchyTree.tsx`: compact hierarchy header, icon controls, empty state, search treatment.
- Modify `src/client/components/XmlPreview.tsx`: compact XML utility toolbar and status treatment.
- Modify `src/client/components/ImportExportModals.tsx`: quieter import/export modal copy and clearer readiness explanations.
- Modify `src/client/styles.css`: Clean Workbench tokens, light nav, compact workbench layout, tables, rail, responsive behavior.

---

### Task 1: Add Clean Workbench View-Model Helpers

**Files:**
- Modify: `src/client/ui/viewModel.ts`
- Modify: `src/test/clientUiViewModel.test.ts`

- [ ] **Step 1: Extend the failing view-model tests**

Append these tests inside the existing `describe("client UI view model", () => { ... })` block in `src/test/clientUiViewModel.test.ts`:

```typescript
  it("defaults to the first dimension when no active dimension is selected", () => {
    expect(resolveActiveDimensionId(null, [sampleScenarioDimension])).toBe(sampleScenarioDimension.id);
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
    const blockedSummary = buildIssueSummary([issue({ severity: "error" })], defaultAppConfig.validation.exportBlockedBySeverities);

    expect(getReadinessLabel(cleanSummary)).toBe("Ready");
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
```

Update the import from `../client/ui/viewModel` so it includes:

```typescript
  buildDimensionFacts,
  filterDimensionNavItems,
  getReadinessLabel,
  resolveActiveDimensionId
```

- [ ] **Step 2: Run the targeted tests and verify failure**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: FAIL with TypeScript errors for missing exported functions and the old `XML Preview` tab label.

- [ ] **Step 3: Implement the helpers**

Modify `src/client/ui/viewModel.ts` to add the tone type, new fact interface, revised tab type, revised `getWorkspaceTabs`, and helper functions:

```typescript
type FactTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface WorkspaceTabItem {
  label: "Overview" | "Members" | "Relationships" | "Hierarchy" | "XML" | "Issues";
}

export interface DimensionFact {
  label: string;
  value: string;
  tone?: FactTone;
}

export function getWorkspaceTabs(xmlPreviewEnabled: boolean): WorkspaceTabItem[] {
  const tabs: WorkspaceTabItem[] = [
    { label: "Overview" },
    { label: "Members" },
    { label: "Relationships" },
    { label: "Hierarchy" }
  ];
  if (xmlPreviewEnabled) tabs.push({ label: "XML" });
  tabs.push({ label: "Issues" });
  return tabs;
}

export function resolveActiveDimensionId(activeDimensionId: string | null, dimensions: DimensionRecord[]): string | null {
  if (activeDimensionId && dimensions.some((dimension) => dimension.id === activeDimensionId)) {
    return activeDimensionId;
  }
  return dimensions[0]?.id ?? null;
}

export function filterDimensionNavItems(items: DimensionNavItem[], query: string): DimensionNavItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const dimension = item.dimension;
    return [
      item.label,
      item.subtitle,
      dimension.dimensionType,
      dimension.dimensionName,
      dimension.sheetName
    ].some((value) => value.toLowerCase().includes(needle));
  });
}

export function getReadinessLabel(summary: IssueSummary): "Ready" | "Needs review" | "Export blocked" {
  if (summary.blocksExport) return "Export blocked";
  if (summary.total > 0) return "Needs review";
  return "Ready";
}

export function buildDimensionFacts(dimension: DimensionRecord, issueSummary: IssueSummary): DimensionFact[] {
  const facts: DimensionFact[] = [
    { label: "Type", value: dimension.dimensionType },
    { label: "Sheet", value: dimension.sheetName }
  ];

  if (dimension.accessGroup) facts.push({ label: "Access", value: dimension.accessGroup });
  if (dimension.maintenanceGroup) facts.push({ label: "Maintenance", value: dimension.maintenanceGroup });
  if (dimension.inheritedDimension) facts.push({ label: "Inherits", value: dimension.inheritedDimension });

  facts.push(
    { label: "Errors", value: String(issueSummary.errors), tone: issueSummary.errors > 0 ? "danger" : "neutral" },
    { label: "Warnings", value: String(issueSummary.warnings), tone: issueSummary.warnings > 0 ? "warning" : "neutral" }
  );

  return facts;
}
```

Remove the previous `WorkspaceTabItem` interface and previous `getWorkspaceTabs` implementation so there is only one definition of each.

- [ ] **Step 4: Run the targeted tests and verify pass**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: PASS for the updated view-model test file.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add -- src/client/ui/viewModel.ts src/test/clientUiViewModel.test.ts
git commit -m "feat: add clean workbench view model helpers"
```

---

### Task 2: Convert App Shell To Light Workbench Navigation

**Files:**
- Modify: `src/client/components/AppShell.tsx`
- Modify: `src/client/components/ui.tsx`
- Modify: `src/test/clientUiViewModel.test.ts`

- [ ] **Step 1: Confirm the shell has pure helper coverage**

Use the Task 1 tests for `resolveActiveDimensionId` and `filterDimensionNavItems` as the coverage that drives this shell refactor. Those helpers prove the two behavior changes that are easiest to regress in the shell: defaulting to the first dimension and filtering the dimension rail.

- [ ] **Step 2: Run the helper tests before editing the shell**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: PASS from Task 1.

- [ ] **Step 3: Add shared primitives for light workbench chrome**

In `src/client/components/ui.tsx`, add these exports below `ActionLink`:

```tsx
export function IconButton({
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
}) {
  return (
    <button {...props} type={type} className={`icon-button ${className}`.trim()}>
      {children}
    </button>
  );
}

export function ToolbarGroup({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`toolbar-group ${className}`.trim()}>{children}</div>;
}

export function FactStrip({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`fact-strip ${className}`.trim()}>{children}</div>;
}

export function FactItem({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`fact-item ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </span>
  );
}
```

- [ ] **Step 4: Update AppShell imports and state**

In `src/client/components/AppShell.tsx`, update imports:

```tsx
import {
  Database,
  Download,
  FileUp,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Undo2
} from "lucide-react";
```

Update the view-model import:

```tsx
import {
  buildDimensionNavItems,
  buildIssueSummary,
  filterDimensionNavItems,
  resolveActiveDimensionId,
  type DimensionNavItem,
  getExportAvailability
} from "../ui/viewModel";
```

Update the UI import:

```tsx
import { ActionButton, StatusBadge, ToolbarGroup } from "./ui";
```

Replace the dashboard sentinel with:

```tsx
const PROJECT_OVERVIEW_VALUE = "__project_overview__";
```

Add local search state:

```tsx
const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
const [navSearch, setNavSearch] = useState("");
```

Replace remaining `activeDimensionId` references with the resolved active dimension ID:

```tsx
const resolvedActiveDimensionId = activeWorkspace === PROJECT_OVERVIEW_VALUE
  ? null
  : resolveActiveDimensionId(activeWorkspace, store.dimensions);

const filteredDimensionNavItems = useMemo(
  () => filterDimensionNavItems(dimensionNavItems, navSearch),
  [dimensionNavItems, navSearch]
);

const activeDimension = useMemo(
  () => store.dimensions.find((dimension) => dimension.id === resolvedActiveDimensionId) ?? null,
  [resolvedActiveDimensionId, store.dimensions]
);

const showProjectOverview = activeWorkspace === PROJECT_OVERVIEW_VALUE || !activeDimension || !store.selectedProjectId;
```

- [ ] **Step 5: Replace the sidebar markup**

Replace the `<aside className="sidebar">...</aside>` block in `AppShell.tsx` with:

```tsx
<aside className="sidebar workbench-nav">
  <div className="brand">
    <span className="brand-mark"><Database size={17} /></span>
    <span>{appConfig.application.productName}</span>
  </div>

  <div className="nav-project">
    <span className="sidebar-label">Project</span>
    <strong>{store.projects[0]?.name ?? "No project imported"}</strong>
    <small>{store.projects[0]?.sourceFileName ?? appConfig.application.supportText}</small>
  </div>

  <button
    className={`nav-overview ${activeWorkspace === PROJECT_OVERVIEW_VALUE ? "selected" : ""}`}
    onClick={() => setActiveWorkspace(PROJECT_OVERVIEW_VALUE)}
  >
    <span>Project overview</span>
    <small>{issueSummary.total ? `${issueSummary.total} issues` : "Ready"}</small>
  </button>

  <div className="nav-search search-box">
    <Search size={14} />
    <input
      value={navSearch}
      onChange={(event) => setNavSearch(event.target.value)}
      placeholder="Search dimensions"
      aria-label="Search dimensions"
    />
  </div>

  <div className="sidebar-section-header">
    <span className="sidebar-label">Dimensions</span>
    <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
      {issueSummary.total ? `${issueSummary.total} issues` : "Ready"}
    </StatusBadge>
  </div>

  {dimensionNavItems.length === 0 && <div className="empty-sidebar">Import a workbook to begin.</div>}
  {dimensionNavItems.length > 0 && filteredDimensionNavItems.length === 0 && (
    <div className="empty-sidebar">No dimensions match this search.</div>
  )}
  {filteredDimensionNavItems.map((item) => (
    <button
      key={item.id}
      className={`nav-item ${activeDimension?.id === item.id ? "selected" : ""}`}
      onClick={() => setActiveWorkspace(item.id)}
      title={item.subtitle}
    >
      <span>{item.label}</span>
      <small>{item.subtitle}</small>
      {item.issueSummary.errors > 0 && (
        <b className="nav-issue error" title={`${item.issueSummary.errors} errors`} aria-label={`${item.issueSummary.errors} errors`}>
          {item.issueSummary.errors}
        </b>
      )}
      {item.issueSummary.errors === 0 && item.issueSummary.warnings > 0 && (
        <b className="nav-issue warning" title={`${item.issueSummary.warnings} warnings`} aria-label={`${item.issueSummary.warnings} warnings`}>
          {item.issueSummary.warnings}
        </b>
      )}
    </button>
  ))}
</aside>
```

- [ ] **Step 6: Update mobile navigation and rendering switch**

In the mobile select, use project overview and filtered items:

```tsx
<option value={PROJECT_OVERVIEW_VALUE}>Project overview</option>
{dimensionNavItems.map((item) => (
  <option key={item.id} value={item.id}>{mobileNavLabel(item)}</option>
))}
```

Update the select value and change handler:

```tsx
value={showProjectOverview ? PROJECT_OVERVIEW_VALUE : activeDimension?.id ?? PROJECT_OVERVIEW_VALUE}
onChange={(event) => setActiveWorkspace(event.currentTarget.value === PROJECT_OVERVIEW_VALUE ? PROJECT_OVERVIEW_VALUE : event.currentTarget.value)}
```

Wrap command actions in the new toolbar group:

```tsx
<ToolbarGroup className="toolbar-actions">
  ...
</ToolbarGroup>
```

Replace the main content conditional, keeping the current Dashboard props until Task 3 changes that component:

```tsx
{!showProjectOverview && activeDimension && store.selectedProjectId ? (
  <DimensionWorkspace
    projectId={store.selectedProjectId}
    dimension={activeDimension}
    issues={store.issues}
    onRefresh={() => store.refresh(store.selectedProjectId ?? undefined)}
    appConfig={appConfig}
    exportAvailability={exportAvailability}
  />
) : (
  <Dashboard
    dimensions={store.dimensions}
    summary={store.summary}
    project={store.projects[0] ?? null}
    issues={store.issues}
    onImport={() => setImportOpen(true)}
    exportAvailability={exportAvailability}
    onOpenDimension={setActiveWorkspace}
    appConfig={appConfig}
  />
)}
```

- [ ] **Step 7: Run tests and commit Task 2**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts src/test/clientComponentsMarkup.test.ts
npm.cmd run build
```

Expected: tests and build PASS.

Commit:

```powershell
git add -- src/client/components/AppShell.tsx src/client/components/ui.tsx
git commit -m "feat: convert shell to clean workbench navigation"
```

---

### Task 3: Reduce Dashboard To Compact Project Overview

**Files:**
- Modify: `src/client/components/AppShell.tsx`
- Modify: `src/client/components/Dashboard.tsx`
- Modify: `src/test/clientComponentsMarkup.test.ts`

- [ ] **Step 1: Add failing dashboard markup tests**

In `src/test/clientComponentsMarkup.test.ts`, keep the existing dashboard command duplication test and add this test in the same `describe` block:

```typescript
  it("keeps dashboard overview copy compact and does not render lifecycle buttons there", () => {
    const markup = dashboardMarkup(defaultAppConfig, null, sampleProject);

    expect(markup).not.toContain("Project command center");
    expect(markup).not.toContain("dashboard-command");
    expect(markup).not.toContain("Import XLSX");
    expect(markup).not.toMatch(/<button[\s\S]*>Validate<\/button>/);
    expect(markup).not.toMatch(/<button[\s\S]*>Export<\/button>/);
  });
```

- [ ] **Step 2: Run the component markup tests and verify failure**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
```

Expected: FAIL because the dashboard still renders `Project command center` and `dashboard-command`.

- [ ] **Step 3: Update Dashboard props**

In `src/client/components/Dashboard.tsx`, remove these imports:

```tsx
import { FileUp } from "lucide-react";
import { ActionButton, MetricTile, Panel } from "./ui";
```

Use this import set:

```tsx
import { ArrowRight } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord, ProjectRecord, ValidationIssue } from "../../shared/types";
import { buildIssueSummary, formatCount } from "../ui/viewModel";
import { EmptyState, FactItem, FactStrip, StatusBadge } from "./ui";
```

Change the function props to:

```tsx
export function Dashboard({
  dimensions,
  summary,
  project,
  issues,
  onOpenDimension,
  appConfig
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  project: ProjectRecord | null;
  issues: ValidationIssue[];
  onOpenDimension: (dimensionId: string) => void;
  appConfig: ClientAppConfig;
}) {
```

- [ ] **Step 4: Replace Dashboard body with compact overview**

Replace the current return value with:

```tsx
return (
  <section className="dashboard project-overview">
    <div className="overview-header">
      <div>
        <span className="section-kicker">Project overview</span>
        <h1>{project?.name ?? "No project imported"}</h1>
        <p>{project?.sourceFileName ?? "Import a OneStream XF metadata workbook from the top command bar."}</p>
      </div>
      <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
        {issueSummary.blocksExport ? "Export blocked" : issueSummary.total ? "Needs review" : "Ready"}
      </StatusBadge>
    </div>

    <FactStrip className="overview-facts">
      <FactItem label="Dimensions" value={formatCount(summary?.totalDimensions ?? dimensions.length)} />
      <FactItem label="Members" value={formatCount(summary?.totalMembers ?? 0)} />
      <FactItem label="Relationships" value={formatCount(summary?.totalRelationships ?? 0)} />
      <FactItem label="Errors" value={formatCount(summary?.validationErrors ?? issueSummary.errors)} tone={issueSummary.errors ? "danger" : "neutral"} />
      <FactItem label="Warnings" value={formatCount(summary?.validationWarnings ?? issueSummary.warnings)} tone={issueSummary.warnings ? "warning" : "neutral"} />
    </FactStrip>

    <section className="overview-dimensions">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Dimensions</span>
          <h2>Open a workspace</h2>
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
        <EmptyState title={project ? "No dimensions available" : "No project imported"}>
          {project
            ? "This project has no imported dimensions to inspect."
            : "Use the Import button in the top command bar to load an XF metadata workbook."}
        </EmptyState>
      )}
    </section>
  </section>
);
```

Keep these variables above the return:

```tsx
const dimensionDisplayConfig = appConfig.dimensions.display;
const issueSummary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
```

Remove `cards`, `toolbar`, `exportAvailability`, `metrics`, `exportTone`, `onImport`, and every `MetricTile` reference.

- [ ] **Step 5: Update Dashboard callers and test helper props**

In `src/client/components/AppShell.tsx`, remove `onImport` and `exportAvailability` from the `Dashboard` call:

```tsx
<Dashboard
  dimensions={store.dimensions}
  summary={store.summary}
  project={store.projects[0] ?? null}
  issues={store.issues}
  onOpenDimension={setActiveWorkspace}
  appConfig={appConfig}
/>
```

In `src/test/clientComponentsMarkup.test.ts`, update `dashboardMarkup` to remove `onImport` and `exportAvailability`:

```typescript
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
```

Delete tests that assert hiding dashboard command actions with toolbar flags. The dashboard no longer receives toolbar config or renders lifecycle buttons at all.

- [ ] **Step 6: Run tests and commit Task 3**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
npm.cmd run build
```

Expected: PASS.

Commit:

```powershell
git add -- src/client/components/AppShell.tsx src/client/components/Dashboard.tsx src/test/clientComponentsMarkup.test.ts
git commit -m "feat: simplify dashboard into project overview"
```

---

### Task 4: Make Dimension Workspace The Primary Work Surface

**Files:**
- Modify: `src/client/components/DimensionWorkspace.tsx`
- Modify: `src/test/clientComponentsMarkup.test.ts`

- [ ] **Step 1: Add static markup coverage for workspace facts and XML label**

Add this import in `src/test/clientComponentsMarkup.test.ts`:

```typescript
import { DimensionWorkspace } from "../client/components/DimensionWorkspace";
```

Add this test:

```typescript
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
```

- [ ] **Step 2: Run the markup tests and verify failure**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
```

Expected: FAIL because the old workspace header uses the section kicker and old XML tab label.

- [ ] **Step 3: Update DimensionWorkspace tab type and helper usage**

In `src/client/components/DimensionWorkspace.tsx`, change the tab type:

```tsx
type WorkspaceTab = "Overview" | "Members" | "Relationships" | "Hierarchy" | "XML" | "Issues";
```

Update imports:

```tsx
import {
  buildDimensionFacts,
  buildIssueSummary,
  getReadinessLabel,
  getWorkspaceTabs,
  type ExportAvailability
} from "../ui/viewModel";
import { FactItem, FactStrip, StatusBadge } from "./ui";
```

Add facts:

```tsx
const readinessLabel = getReadinessLabel(issueSummary);
const facts = buildDimensionFacts(dimension, issueSummary);
```

- [ ] **Step 4: Replace the workspace header and XML tab condition**

Replace the header JSX with:

```tsx
<div className="workspace-header">
  <div className="workspace-title-block">
    <h1>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</h1>
    <small>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</small>
  </div>
  <div className="workspace-health">
    <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
      {issueSummary.blocksExport ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
      {readinessLabel}
    </StatusBadge>
  </div>
</div>
<FactStrip className="workspace-facts">
  {facts.map((fact) => (
    <FactItem key={fact.label} label={fact.label} value={fact.value} tone={fact.tone ?? "neutral"} />
  ))}
</FactStrip>
```

Change XML rendering:

```tsx
{activeTab === "XML" && xmlPreviewEnabled && (
  <XmlPreview
    projectId={projectId}
    dimension={dimension}
    defaultScope={appConfig.ui.xmlPreview.defaultScope}
    allowAllDimensions={appConfig.ui.xmlPreview.allowAllDimensions}
    xmlExportEnabled={appConfig.export.xml.enabled}
    exportAvailability={exportAvailability}
  />
)}
```

- [ ] **Step 5: Run tests and commit Task 4**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts src/test/clientComponentsMarkup.test.ts
npm.cmd run build
```

Expected: PASS.

Commit:

```powershell
git add -- src/client/components/DimensionWorkspace.tsx src/test/clientComponentsMarkup.test.ts
git commit -m "feat: make dimension workspace table first"
```

---

### Task 5: Refine The Editable Grid Workbench

**Files:**
- Modify: `src/client/ui/gridViewModel.ts`
- Modify: `src/test/clientUiViewModel.test.ts`
- Modify: `src/client/components/EditableGrid.tsx`

- [ ] **Step 1: Add grid toolbar helper tests**

In `src/test/clientUiViewModel.test.ts`, update the grid import:

```typescript
import {
  buildGridActionTitles,
  buildGridStatusTone,
  buildOptimisticGridRecord,
  clampGridPageSize,
  shouldRollbackGridRecord
} from "../client/ui/gridViewModel";
```

Add these tests:

```typescript
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
```

Expected: FAIL because `buildGridActionTitles` and `buildGridStatusTone` are missing.

- [ ] **Step 3: Implement grid toolbar helpers**

Add to `src/client/ui/gridViewModel.ts`:

```typescript
export type GridStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function buildGridActionTitles(selectedId: string | null) {
  return {
    duplicateTitle: selectedId ? "Duplicate selected row" : "Select a row to duplicate",
    deleteTitle: selectedId ? "Delete selected row" : "Select a row to delete"
  };
}

export function buildGridStatusTone(status: string): GridStatusTone {
  if (status === "Saved") return "success";
  if (status.startsWith("Loading")) return "info";
  if (status.toLowerCase().includes("failed") || status.toLowerCase().includes("error")) return "danger";
  return "neutral";
}
```

- [ ] **Step 4: Update EditableGrid imports and toolbar state**

In `src/client/components/EditableGrid.tsx`, update imports:

```tsx
import { Columns3, Copy, Plus, Search, Trash2 } from "lucide-react";
```

Update grid helper imports:

```tsx
import {
  buildGridActionTitles,
  buildGridStatusTone,
  buildOptimisticGridRecord,
  clampGridPageSize,
  shouldRollbackGridRecord,
  type GridRecord
} from "../ui/gridViewModel";
```

Add derived toolbar state:

```tsx
const actionTitles = buildGridActionTitles(selectedId);
const statusTone = buildGridStatusTone(status);
```

- [ ] **Step 5: Replace grid toolbar markup**

Replace the toolbar JSX in `EditableGrid.tsx` with:

```tsx
<div className="grid-toolbar workbench-grid-toolbar">
  <div className="grid-toolbar-primary">
    <strong>{kind === "members" ? "Members" : "Relationships"}</strong>
    <div className="search-box">
      <Search size={15} />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}`} />
    </div>
    <StatusBadge tone={statusTone}>
      {status || `${total} rows`}
    </StatusBadge>
  </div>
  <div className="grid-toolbar-actions">
    <ActionButton onClick={() => void addRow()}><Plus size={15} /> Add</ActionButton>
    <ActionButton disabled={!selectedId} title={actionTitles.duplicateTitle} onClick={() => void duplicateRow()}><Copy size={15} /> Duplicate</ActionButton>
    <ActionButton variant="danger" disabled={!selectedId} title={actionTitles.deleteTitle} onClick={() => void deleteSelected()}><Trash2 size={15} /> Delete</ActionButton>
    <ActionButton aria-controls={columnMenuId} aria-expanded={showColumns} onClick={() => setShowColumns((current) => !current)}><Columns3 size={15} /> Columns</ActionButton>
  </div>
</div>
```

Update the column menu class:

```tsx
<div id={columnMenuId} className="column-menu workbench-column-menu" aria-label="Column visibility">
```

Update data grid wrapper to expose selected state and stable min width:

```tsx
<div className="data-grid workbench-data-grid" ref={parentRef}>
```

- [ ] **Step 6: Run tests and commit Task 5**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts
npm.cmd run build
```

Expected: PASS.

Commit:

```powershell
git add -- src/client/ui/gridViewModel.ts src/test/clientUiViewModel.test.ts src/client/components/EditableGrid.tsx
git commit -m "feat: refine clean workbench grid toolbar"
```

---

### Task 6: Update Rail, Overview, Hierarchy, XML, And Modals

**Files:**
- Modify: `src/client/components/IssuePanel.tsx`
- Modify: `src/client/components/MetadataEditor.tsx`
- Modify: `src/client/components/HierarchyTree.tsx`
- Modify: `src/client/components/XmlPreview.tsx`
- Modify: `src/client/components/ImportExportModals.tsx`
- Modify: `src/test/clientComponentsMarkup.test.ts`

- [ ] **Step 1: Add markup tests for secondary surfaces**

In `src/test/clientComponentsMarkup.test.ts`, add imports:

```typescript
import { IssuePanel } from "../client/components/IssuePanel";
```

Add this test:

```typescript
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
```

- [ ] **Step 2: Run the markup tests and verify failure**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
```

Expected: FAIL because `IssuePanel` still renders `Issue rail`.

- [ ] **Step 3: Replace IssuePanel rail heading and details content**

In `src/client/components/IssuePanel.tsx`, update imports:

```tsx
import { buildDimensionFacts, buildIssueSummary, getReadinessLabel } from "../ui/viewModel";
import { EmptyState, FactItem, FactStrip, SeverityPill, StatusBadge } from "./ui";
```

Add:

```tsx
const readinessLabel = getReadinessLabel(summary);
const facts = buildDimensionFacts(dimension, summary);
```

Change container class:

```tsx
<Container className={expanded ? "panel issue-panel expanded" : "panel issue-panel details-rail"}>
```

Replace the heading and summary with:

```tsx
<div className="panel-heading compact">
  <div>
    <span className="section-kicker">{expanded ? "Validation" : "Readiness"}</span>
    <h2>{expanded ? "Issues" : readinessLabel}</h2>
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
{!expanded && (
  <div className="rail-section">
    <h3>Dimension details</h3>
    <FactStrip className="rail-facts">
      {facts.map((fact) => (
        <FactItem key={fact.label} label={fact.label} value={fact.value} tone={fact.tone ?? "neutral"} />
      ))}
    </FactStrip>
  </div>
)}
```

Keep the issue list below this block.

- [ ] **Step 4: Tighten MetadataEditor markup**

In `src/client/components/MetadataEditor.tsx`, replace the panel heading label:

```tsx
<span className="section-kicker">Dimension details</span>
<h2>Metadata</h2>
```

Add a class to read-only fields:

```tsx
className={key === "dimensionType" ? "readonly-field" : undefined}
```

Change the action label:

```tsx
<ActionButton onClick={() => void save()}><Save size={15} /> Save</ActionButton>
```

- [ ] **Step 5: Tighten HierarchyTree and XmlPreview labels**

In `src/client/components/HierarchyTree.tsx`, add a compact header before search:

```tsx
<div className="panel-heading compact">
  <div>
    <span className="section-kicker">Hierarchy</span>
    <h2>Relationships</h2>
  </div>
</div>
```

In `src/client/components/XmlPreview.tsx`, wrap the toolbar with:

```tsx
<div className="grid-toolbar xml-toolbar">
```

Change the fallback text:

```tsx
<pre className="xml-preview">{preview || "XML preview appears after import."}</pre>
```

- [ ] **Step 6: Tighten modal copy**

In `src/client/components/ImportExportModals.tsx`, change titles:

```tsx
<h2 id="import-modal-title">Import workbook</h2>
```

```tsx
<h2 id="export-modal-title">Export metadata</h2>
```

Change import guidance:

```tsx
<p>Select an `.xlsx` OneStream XF metadata workbook. Generated XML and formula columns are ignored.</p>
```

Change disabled export status:

```tsx
{disabled && <p className="modal-status">{exportAvailability.title}</p>}
```

Keep this line unchanged if it already matches.

- [ ] **Step 7: Run tests and commit Task 6**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
npm.cmd run build
```

Expected: PASS.

Commit:

```powershell
git add -- src/client/components/IssuePanel.tsx src/client/components/MetadataEditor.tsx src/client/components/HierarchyTree.tsx src/client/components/XmlPreview.tsx src/client/components/ImportExportModals.tsx src/test/clientComponentsMarkup.test.ts
git commit -m "feat: clean up workbench secondary surfaces"
```

---

### Task 7: Apply The Clean Workbench Visual System

**Files:**
- Modify: `src/client/styles.css`

- [ ] **Step 1: Replace color tokens**

In `src/client/styles.css`, update the `:root` tokens to:

```css
  --bg: #f7f9fc;
  --surface: #ffffff;
  --surface-subtle: #f3f6fa;
  --surface-muted: #eef3f8;
  --text: #172033;
  --muted: #5d6878;
  --muted-strong: #475467;
  --border: #d9e1ea;
  --border-strong: #b8c6d8;
  --primary: #1d4ed8;
  --primary-strong: #1743b3;
  --primary-soft: #eaf1ff;
  --warning: #b7791f;
  --warning-soft: #fff7e6;
  --danger: #c24135;
  --danger-soft: #fff1f0;
  --success: #16794c;
  --success-soft: #ecfdf3;
  --info: #0f6fad;
  --info-soft: #eef7ff;
  --radius: 8px;
  --radius-sm: 6px;
  --shadow: 0 16px 44px rgba(23, 32, 51, 0.08);
```

- [ ] **Step 2: Replace sidebar styling with light workbench nav**

Replace the existing `.sidebar`, `.brand`, `.brand-mark`, `.sidebar-project`, `.empty-sidebar`, `.nav-item`, `.nav-item:hover`, `.nav-item.selected`, `.nav-item small`, `.nav-issue`, and mobile variants with this block:

```css
.sidebar {
  min-width: 0;
  color: var(--text);
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 34px;
  color: var(--text);
  font-weight: 750;
}

.brand > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  background: var(--primary-soft);
  border: 1px solid #cfe0ff;
}

.nav-project {
  display: grid;
  gap: 3px;
  padding: 9px 0 10px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.nav-project strong,
.nav-project small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-project strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 750;
}

.nav-project small {
  color: var(--muted);
  font-size: 12px;
}

.nav-overview,
.nav-item {
  width: 100%;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "label issue"
    "meta issue";
  align-items: center;
  gap: 2px 8px;
  padding: 8px 9px;
  text-align: left;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}

.nav-overview span,
.nav-item span,
.nav-overview small,
.nav-item small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-overview span,
.nav-item span {
  grid-area: label;
  font-size: 13px;
  font-weight: 700;
}

.nav-overview small,
.nav-item small {
  grid-area: meta;
  color: var(--muted);
  font-size: 11px;
}

.nav-overview:hover,
.nav-item:hover {
  background: var(--surface-subtle);
  border-color: var(--border);
}

.nav-overview.selected,
.nav-item.selected {
  color: var(--primary-strong);
  background: var(--primary-soft);
  border-color: #bfd3ff;
}

.empty-sidebar {
  color: var(--muted);
  font-size: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 10px;
}
```

- [ ] **Step 3: Add Clean Workbench layout classes**

Add or update these CSS blocks:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  background: var(--bg);
}

.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.toolbar-group,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.project-overview,
.workspace {
  min-width: 0;
  padding: 18px;
}

.overview-header,
.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.overview-header h1,
.workspace-header h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: 0;
}

.workspace-title-block small,
.overview-header p {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
}

.fact-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fact-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
}

.fact-item b {
  color: var(--text);
  font-weight: 750;
}

.fact-item.danger {
  color: var(--danger);
  border-color: #f1c2bd;
  background: var(--danger-soft);
}

.fact-item.warning {
  color: var(--warning);
  border-color: #f5d38c;
  background: var(--warning-soft);
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  align-items: start;
}
```

- [ ] **Step 4: Update grid and rail visual rules**

Add or revise:

```css
.grid-panel,
.metadata-panel,
.hierarchy-panel,
.xml-panel,
.issue-panel,
.overview-dimensions {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: none;
}

.workbench-grid-toolbar {
  min-height: 48px;
  border-bottom: 1px solid var(--border);
}

.workbench-data-grid {
  max-width: 100%;
  overflow: auto;
}

.grid-header {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border);
}

.grid-row {
  min-height: 36px;
}

.grid-row.selected {
  background: var(--primary-soft);
  box-shadow: inset 3px 0 0 var(--primary);
}

.details-rail {
  position: sticky;
  top: 72px;
}

.rail-section {
  border-top: 1px solid var(--border);
  margin-top: 12px;
  padding-top: 12px;
}

.rail-section h3 {
  margin: 0 0 8px;
  font-size: 13px;
}

.rail-facts {
  display: grid;
}
```

- [ ] **Step 5: Update responsive behavior**

Add or revise:

```css
@media (max-width: 1024px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .mobile-nav {
    display: grid;
  }

  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .details-rail {
    position: static;
  }
}

@media (max-width: 640px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions {
    width: 100%;
  }

  .toolbar-actions .action-button {
    flex: 1 1 auto;
  }

  .overview-header,
  .workspace-header,
  .grid-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .project-overview,
  .workspace {
    padding: 12px;
  }
}
```

- [ ] **Step 6: Run build and commit Task 7**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

Commit:

```powershell
git add -- src/client/styles.css
git commit -m "style: apply clean workbench visual system"
```

---

### Task 8: Browser QA And Fidelity Pass

**Files:**
- Modify: files from Tasks 2-7 if browser QA reveals visual defects.

- [ ] **Step 1: Run full test suite**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests PASS and build PASS.

- [ ] **Step 2: Start the dev server**

Run:

```powershell
npm.cmd run dev
```

If that command blocks the current shell, use the existing approved hidden PowerShell `Start-Process` pattern from this workspace.

Expected: Vite reports a local URL such as `http://127.0.0.1:5173/` or another available port.

- [ ] **Step 3: Capture desktop screenshot with Playwright**

Run a Playwright script that opens the Vite URL, waits for network idle, clicks the first available dimension if needed, and saves:

```text
C:/tmp/dimbuilder-clean-workbench-desktop.png
```

Use viewport:

```typescript
{ width: 1440, height: 900 }
```

Expected screenshot checks:

- Light left nav is visible.
- No dark heavy sidebar remains.
- `Import`, `Validate`, and `Export` appear once in the top command bar.
- The selected dimension workspace is the dominant surface.
- Table area is larger than dashboard and rail surfaces.
- Right rail is slim and readable.

- [ ] **Step 4: Capture mobile screenshot with Playwright**

Use viewport:

```typescript
{ width: 390, height: 844 }
```

Save:

```text
C:/tmp/dimbuilder-clean-workbench-mobile.png
```

Expected screenshot checks:

- Page has no horizontal overflow.
- Mobile workspace select is visible.
- Top command buttons wrap without overlapping.
- Details rail collapses below workspace or is reachable through the Issues tab.

- [ ] **Step 5: Compare against approved concept**

Use `view_image` on:

```text
C:/Naga/projects/dimbuilder/.superpowers/brainstorm/codex-20260518150810/content/clean-workbench-concept.png
C:/tmp/dimbuilder-clean-workbench-desktop.png
C:/tmp/dimbuilder-clean-workbench-mobile.png
```

Create a fidelity ledger in the implementation notes or final response with these comparison points:

- Command location and duplication count.
- Left navigation color, density, and search.
- Workspace title/fact hierarchy.
- Table dominance and row density.
- Right rail status/details hierarchy.
- Dashboard reduction.
- Mobile wrapping and overflow.

- [ ] **Step 6: Fix browser defects**

If any acceptance check fails, edit the responsible component or CSS file and rerun:

```powershell
npm.cmd test
npm.cmd run build
```

Repeat screenshots for the affected viewport after the fix.

- [ ] **Step 7: Commit QA fixes**

Run:

```powershell
git status --short
git add -- src/client src/test
git commit -m "fix: polish clean workbench fidelity"
```

If no QA fixes are needed after Task 7, skip this commit and state that no browser QA changes were required.

---

## Final Verification Checklist

Before handing off implementation, run:

```powershell
npm.cmd test
npm.cmd run build
```

Then verify in the browser:

- `Import`, `Validate`, and `Export` appear once in the main UI.
- No dashboard or empty-state lifecycle buttons remain.
- Left nav is light, compact, and searchable.
- Default project view after import opens a dimension workspace when dimensions exist.
- Project overview remains reachable from navigation.
- The selected dimension workspace is visually dominant.
- Members and relationships grids occupy the main work area.
- `XML` tab label is short and respects config visibility.
- Right rail shows readiness, issue counts, and dimension facts.
- Issues tab shows expanded issue list.
- No dark heavy sidebar remains.
- No giant dashboard hero remains.
- Desktop screenshot and mobile screenshot match the Clean Workbench direction closely enough for design signoff.

## Execution Recommendation

Use Subagent-Driven execution for this plan:

- Worker 1: Task 1 helper tests and helper implementation.
- Worker 2: Tasks 2 and 3 shell/dashboard with markup tests.
- Worker 3: Tasks 4 and 6 workspace, rail, and secondary surfaces.
- Worker 4: Task 5 grid toolbar.
- Parent agent: Task 7 CSS integration and Task 8 browser fidelity, because visual integration benefits from one final eye.

Workers are not alone in the codebase. Each worker must avoid reverting edits from other workers and must adjust their changes to accommodate already-merged task work.
