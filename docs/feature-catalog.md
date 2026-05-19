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

## Optional XLSX Seeding

Users can seed a project from an existing OneStream workbook.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/server/routes/import.ts`
- `src/shared/workbookParser.ts`

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

## Hierarchy Visualization

Relationships can be inspected as a hierarchy tree.

Source:

- `src/client/components/HierarchyTree.tsx`
- `src/shared/hierarchy.ts`

## Validation

Users can run validation and see issue counts.

Source:

- `src/client/components/IssuePanel.tsx`
- `src/client/ui/viewModel.ts`
- `src/server/routes/validation.ts`
- `src/shared/validationEngine.ts`

## XML Preview

Users can preview XML for the current dimension or all dimensions when enabled.

Source:

- `src/client/components/XmlPreview.tsx`
- `src/shared/xmlExport.ts`

## Export

Users can export XML, XLSX, CSV, JSON, and snapshots when enabled.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/server/routes/export.ts`
- `src/shared/xmlExport.ts`
- `src/shared/xlsxExport.ts`
- `src/shared/csvJsonExport.ts`

## Audit Logging

Major actions are written to `audit_logs`.

Source:

- `src/server/db/repositories.ts`
- route modules under `src/server/routes`

