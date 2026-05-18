# DimBuilder UI/UX Redesign Design

## Purpose

DimBuilder should feel like a professional OneStream metadata operations tool: clear enough for users who are replacing an Excel template workflow, dense enough for large member and relationship edits, and explicit enough about validation risk that users trust exports.

The approved direction is a hybrid:

- **Operations Command Center** for the application shell and project-level workflow.
- **Spreadsheet Power Tool** for member and relationship editing density.
- **Guided Validation Studio** for issue triage, export readiness, and row-level correction.

The redesign should improve comprehension and confidence without changing the underlying metadata engine, import/export behavior, dimension schema model, or runtime YAML configuration model.

## Current Context

The app is a React/Vite frontend with an Express backend. The current frontend contains:

- `AppShell` with a left dimension sidebar and top toolbar.
- `Dashboard` with a hero, metrics, and recently edited dimensions.
- `DimensionWorkspace` with tabs for Overview, Members, Relationships, Hierarchy, XML Preview, and Issues.
- `EditableGrid` using virtualization for members and relationships.
- `MetadataEditor`, `HierarchyTree`, `IssuePanel`, `XmlPreview`, and import/export modals.

The existing UI is functional but visually plain. The redesign should preserve familiar workflows while improving hierarchy, scannability, validation feedback, and app-level polish.

## Goals

- Make the current project, current dimension, health status, and next action obvious.
- Give large grids a more capable spreadsheet-like editing experience without overwhelming users.
- Keep validation visible and actionable, especially when errors block export.
- Make import and export flows explain what happened, what is blocked, and what users can do next.
- Keep the app compact, enterprise-appropriate, and accessible.
- Preserve configuration-driven toolbar, dashboard, XML preview, export, and dimension display behavior.

## Non-Goals

- No backend data model changes are required for this redesign.
- No new authentication, multi-user collaboration, or deployment features are part of this scope.
- No marketing landing page, hero-style website, decorative illustration system, or brand campaign treatment.
- No change to OneStream XML mapping semantics or workbook parsing rules.

## Product Information Architecture

### App Shell

The app shell becomes the stable command surface for the entire product.

The desktop layout should include:

- A left dimension rail with product identity, project context, grouped/scannable dimension items, active dimension state, and optional issue/count indicators.
- A top command bar with the app title, current project name or import state, and primary actions.
- A main content area that switches between the dashboard and active dimension workspace.
- Inline banners for configuration, store, validation, and action status messages.

Primary toolbar actions:

- `Import`: available when enabled by configuration.
- `Validate`: disabled until a project exists.
- `Export`: disabled until a project exists, export formats are enabled, and no configured blocking issues are present.

Secondary actions:

- `Save`, `Undo`, and `Redo` remain quieter and disabled when not implemented.

The shell should visually prioritize `Import`, `Validate`, and `Export` because they define the main lifecycle.

### Dashboard

The dashboard becomes a project command view instead of a generic welcome screen.

The first area should show:

- Current project name or an empty/import state.
- Source workbook or imported project context when available.
- Last known import, validation, and export readiness state when data is available.
- Primary actions for importing, validating, and exporting.

The metric area should show compact tiles for:

- Dimensions.
- Members.
- Relationships.
- Blocking errors.
- Warnings.
- Export readiness.

The recent dimensions area should show each dimension with:

- Display label and subtitle based on configuration.
- Member and relationship counts when available.
- Validation status.
- Direct open affordance.

The empty state should guide users to import a workbook in practical language. It should not read like marketing copy.

### Dimension Workspace

The dimension workspace is the core editing surface.

The workspace header should show:

- Dimension display label.
- Dimension display subtitle.
- Dimension type and sheet name when useful.
- Counts for members, relationships, errors, and warnings when available.
- Export-readiness indicator for the current dimension.

Tabs stay familiar:

- `Overview`
- `Members`
- `Relationships`
- `Hierarchy`
- `XML Preview` when enabled
- `Issues`

The tabs should be compact and scannable. Disabled or unavailable tabs should not appear, matching existing XML-preview behavior.

### Overview Tab

The overview tab should remain the metadata editor but present it as a structured dimension summary.

It should include:

- Dimension metadata fields with required markers.
- Save status that is visible but quiet.
- Read-only treatment for fields that cannot be edited, such as dimension type.
- Summary cards or compact facts for row counts, validation state, and inherited/source context.

Fields should validate on blur where practical, matching the current save-on-blur behavior while making status easier to understand.

### Members And Relationships Tabs

The grids should feel like purpose-built metadata spreadsheets.

Required behavior:

- Virtualized rows remain in place for performance.
- Sticky column header.
- Compact row height around the existing 36px rhythm.
- Search field grouped with row controls.
- Add, duplicate, delete, and column visibility controls grouped in an action bar.
- Selected row state that is clear and stable.
- Disabled actions should clearly explain why they are disabled through title text or accessible descriptions.
- Required columns should be marked in headers.
- Boolean and number fields should keep type-aware controls.
- Save status should distinguish loading, saved, and error states when available.

Column visibility should be easier to scan:

- Column menu should feel like a compact drawer or popover, not a raw checkbox grid.
- Checked state should be obvious.
- Wide field names should not overflow their containers.

The grid should keep horizontal overflow inside the grid viewport. The page itself should not become horizontally unstable.

### Validation Rail And Issues

The validation rail stays visible on desktop and becomes more actionable.

It should show:

- Error and warning counts.
- Export-blocking status.
- Top current-dimension issues.
- Severity styling: red for blocking errors, amber for warnings, blue or slate for informational notes.
- Row number and field context when present.
- Links or clear affordances to navigate to the relevant tab, row, or issue list when that behavior is implemented.

The full Issues tab should support larger issue lists and keep the same visual language as the rail.

On smaller screens, the rail should collapse below the workspace or behind an `Issues` control so the grid remains usable.

### Hierarchy Tab

The hierarchy tab should present relationships as an operational tree.

It should include:

- Search input with clear hint text.
- Expand and collapse controls that use icons rather than raw text glyphs.
- Highlighted search matches.
- Issue codes shown as compact severity indicators.
- Empty state for dimensions without local relationships.

The visual treatment should support large hierarchies by keeping spacing compact and avoiding heavy card nesting.

### XML Preview Tab

The XML preview tab should remain a code-oriented view.

It should include:

- Scope selector for all dimensions or current dimension, respecting configuration.
- Copy and download actions.
- Status text for loading, unavailable, copied, and disabled states.
- A dark code block with readable monospaced text.

The preview should not add decorative chrome that reduces visible XML space.

## Import Flow

Import should feel like a short wizard even if implemented as a modal.

States:

1. File selection with supported file type and practical guidance.
2. Importing/progress state with a message that large UD3-style sheets can take a few seconds.
3. Success state showing dimensions imported and any warnings returned by the backend.
4. Failure state showing the error in plain language and preserving the ability to choose another file.

The user should understand what workbook was imported and what to do next after import completes.

## Export Flow

Export should explain availability instead of only disabling actions.

The export modal should show:

- Enabled formats from configuration: XML, XLSX, CSV, JSON.
- Disabled formats hidden or clearly marked according to current config conventions.
- Whether the current project is export-ready.
- If export is blocked, the blocking reason and a path back to validation issues.
- Download links for enabled formats when export is allowed.

The main export button should remain disabled when configured blocking issue severities are present, but the UI should make the reason visible.

## Visual Design System

The approved visual system is data-dense enterprise SaaS.

### Color

- App background: light smoke, approximately `#F8FAFC` or nearby neutral.
- Primary surfaces: white.
- Primary text: deep slate/navy, approximately `#0F172A` or `#1E293B`.
- Muted text: slate, approximately `#475569` or `#64748B`.
- Primary action and active state: blue, approximately `#2563EB`.
- Secondary blue accents: `#3B82F6`.
- Warning/attention: amber, approximately `#F59E0B`.
- Blocking/error: red, approximately `#DC2626` or `#EF4444`.
- Success/export-ready: green, approximately `#16A34A` or `#22C55E`.
- Borders: crisp slate-gray, approximately `#CBD5E1` or `#D8DEE7`.

Avoid one-note palettes, heavy dark mode, purple-dominant gradients, decorative glows, and marketing-style color effects.

### Typography

Use the existing system font or a close enterprise sans-serif style unless a dedicated font pass is approved later.

Guidelines:

- Dashboard and workspace headings should be clear but not hero-sized.
- UI chrome, tabs, buttons, labels, grid headers, grid cells, status text, and modal text need deliberate sizing.
- Use compact weights: medium for labels, semibold for actions and key metrics, bold sparingly.
- Letter spacing should remain zero except for small uppercase section labels where already appropriate.

### Spacing And Containers

- Keep radii modest, generally `6px` to `8px`.
- Use crisp borders and restrained shadows.
- Do not nest cards inside cards.
- Use panels, rails, lists, tables, and full-width workspace bands instead of decorative floating cards.
- Keep dense work areas compact but not cramped.

### Icons And Controls

Use lucide-react icons consistently.

Expected icon roles:

- Import/upload.
- Validate/shield/check.
- Export/download.
- Search.
- Columns/visibility.
- Add.
- Duplicate/copy.
- Delete.
- Copy XML.
- Download XML.
- Expand/collapse hierarchy.
- Error/warning/info severity.

Buttons should have visible hover, disabled, and focus states. Icon-only buttons need accessible names or titles.

## Responsive Behavior

### Desktop

Desktop gets the full operations layout:

- Persistent dimension sidebar.
- Top command bar.
- Workspace tabs.
- Main work area.
- Right validation rail.

### Tablet

Tablet should preserve the editing workflow:

- Sidebar may narrow or collapse.
- Validation rail may move below the workspace or become toggleable.
- Toolbar actions can wrap but must remain legible.

### Mobile

Mobile should remain a compact operations tool:

- Hide the persistent sidebar.
- Provide a top dimension selector or compact navigation affordance.
- Keep wide grids horizontally scrollable inside their own viewport.
- Avoid horizontal page scroll.
- Stack dashboard metrics and modal content cleanly.

## Accessibility

- All clickable elements should have pointer cursor, hover feedback, and visible focus states.
- Form inputs should keep accessible labels.
- Icon-only controls require accessible names.
- Color should not be the only issue-status indicator; include severity text or icons.
- Text contrast must meet WCAG AA for normal body and control text.
- Motion should be minimal and respect `prefers-reduced-motion`.

## Error Handling And Status Feedback

The redesign should make system state explicit:

- Configuration load errors appear as prominent but contained banners.
- Store/API errors remain visible and readable.
- Validation completion status should show issue count.
- Import and export failures should remain in the relevant modal until dismissed.
- Save-on-blur status in metadata and grid cells should be quiet but trustworthy.
- Disabled export should explain the exact reason: no project, no enabled formats, or blocking validation issues.

## Component Architecture

The implementation should keep current boundaries but may add focused UI primitives.

Recommended structure:

- `AppShell`: app-level layout, sidebar, toolbar, banners, modal orchestration.
- `Dashboard`: project command view and metrics.
- `DimensionWorkspace`: workspace header, tabs, responsive validation rail placement.
- `EditableGrid`: grid state, toolbar, column menu, virtualized table.
- `IssuePanel`: validation rail and expanded issue list variants.
- `MetadataEditor`: overview form and save status.
- `HierarchyTree`: hierarchy search and tree.
- `XmlPreview`: XML status, scope, copy, download.
- `ImportExportModals`: import/export flow states.

If repeated styling or behavior becomes noisy, introduce small shared primitives such as:

- `StatusBadge`
- `MetricTile`
- `ActionButton`
- `Panel`
- `SeverityPill`
- `EmptyState`

These primitives should reduce duplication without turning the app into a generic component library.

## Data Flow

The redesign should use existing API and store flow:

- `useAppConfig` loads configuration and controls UI visibility.
- `useProjectStore` loads projects, selected project, dimensions, summary, and issues.
- `AppShell` owns import/export modal state and validation execution.
- `DimensionWorkspace` receives active dimension, project id, issues, and app config.
- `EditableGrid` loads and edits members or relationships through existing API client calls.
- `IssuePanel` consumes issues already loaded by the store.

No new backend endpoints are required for the first redesign pass. If better dashboard counts or issue links require new data later, that should be handled as a separate enhancement.

## Testing And Verification

### Automated Tests

Existing unit tests must continue to pass.

Add focused tests where practical for:

- Configuration-driven toolbar visibility.
- XML Preview tab availability.
- Export disabled state and reason.
- Dimension display labels and subtitles.
- Grid row selection enabling duplicate/delete.
- Import modal states.
- Export modal enabled and blocked states.

Tests should exercise behavior and state, not CSS internals.

### Browser Verification

Browser verification should cover:

- Dashboard empty state.
- Dashboard with imported project.
- Active dimension workspace.
- Overview metadata editor.
- Members grid.
- Relationships grid.
- Hierarchy tab.
- XML Preview tab when enabled.
- Issues rail and expanded Issues tab.
- Import modal.
- Export modal blocked and available states.
- Desktop, tablet, and mobile widths.

Visual checks should confirm:

- No text overlap.
- No mobile horizontal page scroll.
- Grid overflow stays inside grid containers.
- Buttons, tabs, and labels remain legible.
- Validation/error states are obvious.
- The interface reads as a serious operations tool, not a marketing page.

## Acceptance Criteria

The redesign is complete when:

- The app shell, dashboard, workspace, grids, validation rail, hierarchy, XML preview, and modals share one polished visual system.
- Primary workflows remain discoverable: import, validate, edit, inspect issues, preview XML, export.
- Export blocking reasons are visible and understandable.
- Large grids remain compact and usable.
- The UI respects YAML-driven configuration.
- Desktop and mobile layouts are usable.
- Existing tests pass and targeted UI behavior tests are added where practical.
- Browser verification confirms no obvious visual regressions or layout breakage.
