# Feature Catalog

## App Identity

The UI, workbook exports, and config identify the app as SR Onestream Dim Builder.

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

## Audit Logging

Major actions are written to `audit_logs`.

Source:

- `src/server/db/repositories.ts`
- route modules under `src/server/routes`
