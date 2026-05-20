# Feature Catalog

## App Identity

The UI, workbook exports, and config identify the app as Spaulding Ridge Onestream Dim Builder.

Source:

- `config/dimbuilder.yaml`
- `src/shared/appConfigDefaults.ts`
- `index.html`

## Blank Project Creation

Users can create a new metadata project without XLSX input.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/projectBlueprints.ts`

## Central Dimension Blueprints

YAML config defines enabled dimensions, display order, dimension names, roots, members, relationships, and relationship defaults.

Source:

- `config/dimbuilder.yaml`
- `src/shared/appConfigTypes.ts`
- `src/shared/appConfigValidation.ts`
- `src/server/projectBlueprints.ts`

## Blueprint Studio

Admins can inspect effective dimension blueprints, validate JSON drafts, generate deterministic YAML fragments, and derive a blueprint draft from an existing project dimension. The Studio is an authoring aid only; it does not write `config/dimbuilder.yaml` automatically.

Source:

- `src/shared/blueprintStudio.ts`
- `src/server/routes/blueprints.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/BlueprintStudio.tsx`
- `src/client/components/Dashboard.tsx`

## Optional XLSX Seeding

Users can seed a project from an existing OneStream workbook.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/server/routes/import.ts`
- `src/shared/workbookParser.ts`

## Editable XML Import

Users can import OneStream metadata XML directly as an editable project. Known attributes and property nodes become app records, and unknown attributes, property nodes, and unsupported elements are preserved for round-trip export.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`
- `src/server/routes/import.ts`
- `src/shared/xmlImport.ts`
- `src/shared/xmlExport.ts`

## Metadata Reference Alignment

Import can align workbook dimensions to existing metadata XML reference data.

Source:

- `src/server/metadataReference.ts`
- `src/shared/workbookParser.ts`

## Workbench Editing

Users can edit dimension metadata, members, and relationships.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/client/components/EditableGrid.tsx`
- `src/client/components/MetadataEditor.tsx`
- `src/server/routes/projects.ts`

## Bulk Property Updates

Users can preview and apply filtered member or relationship property updates from the workspace. Supported operations include set, clear, replace text, append, prepend, copy from property, derive from parent, and regex replace. Apply recomputes the preview server-side, writes all row changes in one repository transaction, records `bulkUpdate.apply`, and stores rollback JSON plus item-level old/new values.

Source:

- `src/shared/bulkUpdate.ts`
- `src/client/components/BulkUpdatePanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/db/repositories.ts`

## Varying Property Editing

Users can define default or contextual property values by dimension, member, or relationship target. Context axes are cube type, scenario type, and time member. The workspace exposes a Varying tab backed by CRUD endpoints and repository methods.

Source:

- `src/client/components/VaryingPropertiesPanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/db/repositories.ts`
- `src/shared/varyingProperties.ts`

## Metadata Baselines And Diff

Users can create a baseline from the current project, run a comparison, and review persisted diff items. The diff engine reports member adds/updates/deletes, relationship adds/deletes/moves/copies, property updates, and warning-level high-risk changes.

Source:

- `src/shared/metadataDiff.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/MetadataDiffPanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`

## Relationship Operation Planning

Users can select an XML relationship load mode, request a pre-export impact plan, and export XML with a deterministic operation block for review. Supported modes include full, additive, property update, relationship delete, move/copy, and break/build. Planning detects moves, copies, deletes, potential orphans, and blueprint single-parent conflicts.

Source:

- `src/shared/relationshipOperations.ts`
- `src/shared/xmlExport.ts`
- `src/server/routes/projects.ts`
- `src/server/routes/export.ts`
- `src/client/api/client.ts`
- `src/client/components/ImportExportModals.tsx`

## Change Sets And Release Packages

Users can create a named change set from the latest or selected metadata diff run, validate it, approve or reject it with comments, and generate a release package directory containing release notes, JSON, CSV reports, full XML, rollback notes, and a manifest.

Source:

- `src/shared/releasePackage.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/ChangeSetsPanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`

## OneStream Property Dictionary

The app exposes a versioned OneStream-aware property dictionary for dimension, member, and relationship metadata. It powers API schema responses, grid header help text, property validation, and XML property-name mapping.

Source:

- `src/shared/oneStreamPropertyDictionary.ts`
- `src/server/routes/schema.ts`
- `src/client/api/client.ts`
- `src/client/components/EditableGrid.tsx`

## Hierarchy Visualization

Relationships can be inspected as a hierarchy tree. The Hierarchy tab also shows analytics for max depth, members, relationships, leaves, parents, orphan members, and shared members, plus CSV exports for levelized rows, paths, parent-child rows, shared members, and orphans.

Source:

- `src/client/components/HierarchyTree.tsx`
- `src/client/components/HierarchyAnalyticsPanel.tsx`
- `src/shared/hierarchy.ts`
- `src/shared/hierarchyAnalytics.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`

## Validation

Users can run validation and see issue counts. Validation includes generic metadata integrity checks plus the configurable OneStream validation profile for naming conventions, aliases, Root/None casing, sort order, shared members, parent input risks, missing dimension-specific properties, relationship weight gaps, and Entity ownership range checks.

Source:

- `src/client/components/IssuePanel.tsx`
- `src/client/ui/viewModel.ts`
- `src/server/routes/validation.ts`
- `src/shared/validationEngine.ts`
- `src/shared/oneStreamValidation.ts`

## XML Preview

Users can preview XML for the current dimension or all dimensions when enabled.

Source:

- `src/client/components/XmlPreview.tsx`
- `src/shared/xmlExport.ts`

## Export

Users can export XML, XLSX, CSV, JSON, and snapshots when enabled.
Server routes enforce validation-based export blocking across every export format. Optional validation bypass is disabled by default and records an audit entry when enabled and used with a reason.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/server/exportGuards.ts`
- `src/server/routes/export.ts`
- `src/shared/xmlExport.ts`
- `src/shared/xlsxExport.ts`
- `src/shared/csvJsonExport.ts`

## Snapshot Restore And Branching

Users can list saved project snapshots from the dashboard, restore one into the current project, or create a new project branch from a snapshot. Restore creates a safety snapshot first and runs transactionally. Branching remaps dimension, member, relationship, and varying-property IDs into the new project.

Source:

- `src/client/components/SnapshotManager.tsx`
- `src/client/components/Dashboard.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/db/repositories.ts`

## Project Rename

Users can rename a project and update its description from the dashboard via inline click-to-edit on the project name. Backed by `PATCH /api/projects/:projectId`.

Source:

- `src/client/components/Dashboard.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`

## Admin Panel

A dedicated Admin Panel page is accessible from the sidebar. It displays all validation rules, their severities, categories, and whether they block export. This gives administrators a single-pane view of the validation configuration in effect. The panel also includes per-project validation rule toggle switches with a severity dropdown. Rules can be set to "off" to disable them for the current project.

Source:

- `src/client/components/AdminPanel.tsx`
- `src/client/components/Sidebar.tsx`
- `src/server/routes/validation.ts`
- `src/server/db/schema.ts` (`project_validation_overrides` table)

## Save As

Users can create a named snapshot with a description from a "Save As" toolbar button. This opens a modal that persists the current project state as a reusable snapshot without navigating away from the workspace.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`
- `src/server/routes/export.ts`

## Per-Dimension XML Export

Individual dimensions can be exported to XML even when the project has validation errors on other dimensions. The export uses `?dimensionId=` query param with a dimension-scoped validation guard that only checks issues for the targeted dimension. A "Download XML" button appears on each dimension workspace.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/server/routes/export.ts`
- `src/server/exportGuards.ts`

## Issue-Filtered Grid

Clicking error or warning counts in the dimension workspace filters the grid to show only rows with matching validation issues. Filtering uses server-side ID-based lookups (sends `?ids=` param to members/relationships endpoints) so all matching records appear regardless of pagination. An "All" state restores the full unfiltered view.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/client/components/EditableGrid.tsx`
- `src/client/ui/viewModel.ts`

## Validation Dashboard

A project-wide validation summary page accessible from the sidebar. Displays total error, warning, and info count cards, issues grouped by dimension, and a table of most frequent rule codes. Clickable rows navigate to the corresponding dimension workspace.

Source:

- `src/client/components/ValidationDashboard.tsx`
- `src/client/components/Sidebar.tsx`
- `src/server/routes/validation.ts`

## Frontend Config Editor

A "Config" section in the sidebar displays the current application config as JSON in a textarea. Users can edit and save changes, which writes the updated config to the YAML file and applies it live without a server restart. Uses `PUT /api/config`.

Source:

- `src/client/components/ConfigEditor.tsx`
- `src/client/components/Sidebar.tsx`
- `src/client/api/client.ts`
- `src/server/routes/config.ts`

## Spaulding Ridge Branding

Navy (#1B2A4A), Gold (#C5A961), and White color scheme applied throughout the UI. CSS variables define the palette. Toolbar background is navy with gold accent on hover. SR logo favicon (navy rectangle with gold "SR" text). Updated `index.html` title.

Source:

- `src/client/styles/variables.css`
- `index.html`

## Audit Logging

Major actions are written to `audit_logs`.

Source:

- `src/server/db/repositories.ts`
- route modules under `src/server/routes`
