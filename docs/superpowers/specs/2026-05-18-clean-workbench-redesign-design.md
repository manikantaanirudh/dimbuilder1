# DimBuilder Clean Workbench Redesign Design

## Approval

The Clean Workbench direction was approved from the visual companion on 2026-05-18 with choice `approve-clean-workbench`.

The approved concept is a focused metadata editor:

- One global command bar for `Import`, `Validate`, and `Export`.
- Light, compact dimension navigation instead of a dark application sidebar.
- The selected dimension workspace is the primary product surface.
- Members and relationships tables dominate the working area.
- Validation and dimension facts live in a slim right rail.
- Metrics become inline facts, not oversized dashboard cards.

## Purpose

DimBuilder should feel like a calm, professional OneStream metadata workbench. The current redesign is functional but still reads as cluttered because it combines a heavy navigation rail, dashboard-style summary areas, repeated command actions, and multiple competing panels.

The Clean Workbench redesign makes the app easier to understand by reducing the product to the everyday user workflow:

1. Import metadata.
2. Select a dimension.
3. Edit or inspect metadata in tables/forms.
4. Validate issues.
5. Export when ready.

The redesign keeps the existing metadata engine, workbook parsing, validation rules, export behavior, YAML-driven configuration, and React/Vite/Express architecture.

## Goals

- Make the selected dimension obvious within two seconds.
- Remove duplicate `Import`, `Validate`, and `Export` controls.
- Reduce dashboard visual weight and make the workbench the default mental model.
- Prioritize table editing and inspection over summary cards.
- Keep validation visible without making the whole page feel like an alerts dashboard.
- Preserve dense enterprise ergonomics for large dimensions.
- Improve readability, spacing, and hierarchy without adding decorative UI.
- Keep behavior configuration-driven through `config/dimbuilder.yaml` and existing app config defaults.

## Non-Goals

- No backend schema changes.
- No changes to OneStream XML semantics, workbook parsing, CSV/JSON/XLSX export rules, or validation logic.
- No marketing landing page, hero section, decorative illustration system, or brand campaign.
- No authentication, collaboration, deployment, or multi-project management expansion.
- No dark-mode redesign for this pass.
- No broad refactor unrelated to implementing the approved Clean Workbench UI.

## Information Architecture

### App Shell

The app shell becomes a quiet workbench frame:

- A slim top bar with product identity, project/source context, and one lifecycle command cluster.
- A light left navigation rail for dimensions.
- A central workspace for the selected dimension.
- A right validation/details rail on desktop.
- Small banners only for configuration, import, validation, export, and store state messages.

The shell should not feel like a dashboard homepage. It should feel like an editor with a clear current object.

### Command Bar

`Import`, `Validate`, and `Export` must appear once, in the top-right command cluster.

Rules:

- Do not repeat these actions in dashboard cards, workspace cards, empty-state panels, or validation panels.
- `Import` is primary when no project exists.
- `Validate` is enabled only when a project exists.
- `Export` is enabled only when a project exists, at least one configured format is enabled, and configured blocking validation severities are absent.
- Disabled actions must expose a useful `title` or accessible description.
- Save, undo, and redo remain visually secondary. They stay disabled unless real behavior already exists in the app.

### Dimension Navigation

The left rail should be light, compact, and searchable.

Required elements:

- Product mark/name in a small header.
- Project/source context as one concise line or compact block.
- Search/filter input for dimensions.
- Dimension rows grouped or visually sorted by configured display labels.
- Active dimension state.
- Compact issue badges for errors/warnings.
- No dark heavy sidebar treatment.
- No oversized project card.
- No duplicate command buttons.

Dimension rows should favor one-line scanning:

- Primary text: configured dimension label.
- Secondary text: configured subtitle, dimension type, or sheet name.
- Right-side badge only when useful.

### Dashboard

The dashboard should become a minimal project overview, not the main product event.

Use it only for:

- Empty/import state before a project exists.
- A concise project summary when no dimension is selected.
- A low-friction way to open a dimension.

Remove or heavily reduce:

- Large hero-style headings.
- Oversized KPI cards.
- Repeated lifecycle action buttons.
- Marketing-style explanatory sections.

When a project exists, the app should encourage opening or staying in a dimension workspace. If no active dimension is selected and at least one dimension exists, the default screen is the previous active dimension when known, otherwise the first dimension in the configured display order. A compact project overview remains reachable from navigation, but it is not the dominant default view after import.

### Dimension Workspace

The dimension workspace is the core screen.

Header contents:

- Dimension label as the main title, for example `Account - GLAccounts`.
- Small readiness badge: `Ready`, `Needs review`, or `Export blocked`.
- Inline facts for dimension type, sheet/source, access group, maintenance group, inherited dimension, member count, relationship count, errors, and warnings when data is available.

The header should be compact. It must not become a card-heavy summary area.

Tabs:

- `Overview`
- `Members`
- `Relationships`
- `Hierarchy`
- `XML`
- `Issues`

Tab visibility should continue to respect existing XML preview configuration. Tabs should be compact and stable, with no layout shift when labels are selected.

### Members And Relationships

The table is the hero of the product.

Required behavior and visual treatment:

- Preserve virtualization for performance.
- Keep sticky column headers.
- Keep row height dense and predictable, around the current 34-38px rhythm.
- Put table-specific actions in one local toolbar above the grid.
- Use icon buttons where the meaning is familiar, with accessible labels/titles.
- Keep search, filters, column visibility, and selected-row actions near the table.
- Use clear selected, hover, focus, disabled, dirty, saved, and error states.
- Keep horizontal overflow inside the grid surface; the whole page must not become horizontally unstable.
- Required columns should be visually marked without noisy badges.
- Boolean and numeric fields should retain type-appropriate editors.

The local table toolbar may include actions such as add member, duplicate, delete, bulk edit, and column visibility. It must not include project-level `Import`, `Validate`, or `Export`.

### Overview

The overview tab should be a compact form for dimension metadata.

Rules:

- Treat dimension type and other immutable fields as read-only.
- Group fields with light section dividers, not nested cards.
- Save-on-blur behavior can remain.
- Save/error status should be visible but quiet.
- Empty optional fields should remain easy to distinguish from missing required data.

### Validation And Details Rail

The right rail combines readiness, issue counts, top issues, and dimension details.

Desktop behavior:

- Rail is visible beside the workspace.
- Rail width should be stable and slim.
- Top area shows readiness, errors, warnings, and export blocking state.
- Middle area shows the most relevant current-dimension issues.
- Bottom/details area shows selected dimension facts.

Responsive behavior:

- On medium screens, the rail may collapse below the workspace.
- On small screens, issue details should be reachable through the `Issues` tab or a compact control so the grid remains usable.

The rail should not duplicate the full issue list. It is a preview and status surface.

### Issues Tab

The full Issues tab handles larger issue lists.

It should:

- Use the same severity language as the rail.
- Show row number, field, entity, severity, code, and message when available.
- Provide clear empty states.
- Row navigation from issues is out of scope for this pass, but the layout should not prevent it later.

### Hierarchy

The hierarchy tab should remain compact and operational.

Required treatment:

- Search input at the top.
- Expand/collapse controls with icons.
- Compact indentation and row rhythm.
- Severity indicators where relationships have issues.
- Empty state for dimensions without local relationships.

### XML

The XML preview is a code-oriented utility view.

Required treatment:

- Compact scope selector.
- Copy/download controls.
- Clear unavailable/loading/copied state.
- High readable contrast in the code area.
- Maximize visible XML; avoid decorative wrappers.

### Import Flow

Import remains modal-based for this pass, but it should be quieter and clearer.

States:

- File selection with supported file type guidance.
- Importing/progress state.
- Success state with imported dimension count and any warnings.
- Failure state with plain-language error and a path to choose another file.

After import, the app should make the next action obvious: open the first relevant dimension or validate.

### Export Flow

Export should explain availability without adding another command surface.

The export modal should show:

- Enabled formats from configuration.
- Export readiness.
- Blocking reason when export is unavailable.
- Download links only when allowed.

The main command bar remains the only place where the project-level export action is launched.

## Visual Design System

### Design Character

The approved character is clean enterprise workbench:

- Quiet, light, data-first.
- Minimal shadows.
- Crisp borders.
- Small radius.
- Compact controls.
- High readability.
- No visual drama.

Avoid:

- Dark heavy sidebar.
- Oversized KPI cards.
- Nested cards.
- Dashboard hero layout.
- Decorative gradients, blobs, glows, or marketing-style panels.
- Repeated command buttons.
- One-note blue surfaces.

### Color

Use a light neutral system:

- App background: `#F7F9FC` or nearby cool neutral.
- Main surfaces: `#FFFFFF`.
- Subtle surfaces: `#F3F6FA`.
- Primary text: `#172033` or `#0F172A`.
- Secondary text: `#5D6878` or `#64748B`.
- Borders: `#D9E1EA` and stronger `#B8C6D8`.
- Primary action/accent: `#1D4ED8` or `#2563EB`.
- Warning: amber around `#B7791F` / `#F59E0B`.
- Error: red around `#C24135` / `#DC2626`.
- Success: green around `#16794C` / `#16A34A`.

Use blue mainly for active states and primary commands. Do not flood the interface with blue-tinted cards.

### Typography

Use the existing Inter/system sans-serif stack unless a later font pass is approved.

Rules:

- No viewport-scaled typography.
- Letter spacing stays zero except tiny uppercase utility labels where already established.
- Workspace title should be strong but not hero-sized.
- Table headers, cells, tabs, toolbar buttons, form labels, rail text, modal text, and empty states need deliberate sizes.
- Dense UI text should remain readable at 1440px desktop and 375px mobile widths.

### Spacing And Shape

- Prefer 4px and 8px increments.
- Cards and panels use radius 6-8px maximum.
- Use borders before shadows for containment.
- Use shadows only for modals, popovers, and elevated menus.
- Avoid cards inside cards.
- Page sections are not floating cards.
- Fixed-format controls must have stable dimensions so labels/icons do not resize the layout.

## Component Architecture

Keep the existing React/Vite app and Express API.

Implementation should be organized around these frontend units:

- App shell and command bar.
- Dimension navigation rail.
- Workspace header and tabs.
- Grid workbench for members/relationships.
- Details/validation rail.
- Import/export modals.
- Shared UI primitives for buttons, badges, fields, toolbar groups, tabs, rail sections, and empty states.
- Pure view-model helpers for issue summaries, export availability, tab availability, dimension nav rows, and grid toolbar state.

Avoid a monolithic component rewrite. Keep each unit understandable and testable.

## Data Flow

Use the existing data flow:

- `useProjectStore` owns projects, dimensions, summary, issues, loading, and errors.
- Client API functions continue to call the current backend routes.
- App configuration continues to come from the existing client config path and defaults.
- UI view-model helpers derive display state from existing store data and config.

No new persistent client state is required beyond UI selections such as active dimension, tab, search query, column visibility, and selected rows.

## Error Handling

Error states should be specific and calm:

- Config load errors remain visible as a banner.
- Store/API errors remain visible as a banner near the top of the workbench.
- Import errors stay inside the import modal and do not destroy the selected workspace.
- Validation errors appear in the rail and Issues tab.
- Export blocking state is explained in the command button title and export modal.
- Grid save errors should appear near the affected table or row when available.

Never use color alone to communicate severity. Include text labels and accessible names.

## Accessibility And Responsive Requirements

Required checks:

- Keyboard focus visible for all interactive controls.
- Buttons and icon controls have accessible names.
- Disabled controls explain why where practical.
- Text contrast meets WCAG AA for normal UI text.
- Main layout works at 1440px, 1024px, 768px, and 375px.
- No horizontal page overflow on mobile.
- Grid overflow remains inside the grid area.
- Long dimension names and field values truncate or wrap intentionally.
- Reduced motion preferences are respected for any transitions.

## Testing And Verification

Implementation should include:

- Unit tests for pure UI helpers that determine export availability, issue summaries, tab visibility, dimension nav rows, and count formatting.
- Component or integration-level checks for no duplicate lifecycle commands.
- Existing parser, validation, and export tests must continue passing.
- Browser verification with Playwright or the available browser tool.
- Desktop and mobile screenshots.
- Visual comparison against the approved Clean Workbench concept before completion.

Specific acceptance checks:

- `Import`, `Validate`, and `Export` appear only once in the main UI.
- The left nav is light, compact, and searchable.
- The selected dimension workspace is visually dominant.
- Members and relationships grids occupy the main work area.
- Dashboard/KPI treatment is reduced and no longer competes with the workspace.
- Right rail shows validation/details without duplicating the full Issues tab.
- No dark heavy sidebar remains.
- No giant hero or marketing copy remains.
- App build and tests pass.

## Migration Notes

The previous UI/UX redesign spec and plan targeted an Operations Command Center. This new Clean Workbench spec supersedes that direction for the next implementation pass.

Existing helper files and components from the prior redesign may be reused only if they serve the Clean Workbench outcome. Any code that preserves dashboard-first weight, duplicated actions, or a heavy dark sidebar should be simplified or replaced.
