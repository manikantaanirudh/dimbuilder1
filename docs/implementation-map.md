# Implementation Map

This map links behavior to source files.

## App Startup

- `src/server/index.ts`: loads app config and starts the server.
- `src/server/app.ts`: builds the Express app and mounts route modules.
- `src/client/main.tsx`: mounts the React app.
- `src/client/App.tsx`: loads client config and renders app shell.

## Configuration

- `config/dimbuilder.yaml`: central runtime configuration.
- `src/shared/appConfigTypes.ts`: config contract.
- `src/shared/appConfigDefaults.ts`: defaults.
- `src/shared/appConfigValidation.ts`: validation and client-safe config projection.
- `src/server/config/loadAppConfig.ts`: YAML loading and environment overrides.

## Domain Model

- `src/shared/types.ts`: records and shared types.
- `src/shared/dimensionSchemas.ts`: supported dimension types and fields.
- `src/shared/oneStreamPropertyDictionary.ts`: versioned OneStream property metadata, aliases, XML names, value types, enum values, and grouped client-safe schema output.
- `src/shared/relationshipDefaults.ts`: relationship default mappings.
- `src/shared/text.ts`: normalization and XML escaping helpers.

## Persistence

- `src/server/db/database.ts`: SQLite database creation.
- `src/server/db/schema.ts`: SQL schema.
- `src/server/db/repositories.ts`: data access layer and transaction wrapper.

## Project Creation

- `src/server/projectBlueprints.ts`: blank project creation from blueprints.
- `src/server/routes/projects.ts`: `POST /api/projects`.
- `src/client/components/ImportExportModals.tsx`: Create Project modal.
- `src/client/api/client.ts`: `createProject()`.

## OneStream Schema Dictionary

- `src/shared/oneStreamPropertyDictionary.ts`: source of truth for supported dimension, member, and relationship properties.
- `src/server/routes/schema.ts`: exposes `GET /api/schema/onestream` and `GET /api/schema/onestream/:version`.
- `src/client/api/client.ts`: `fetchOneStreamPropertyDictionary()`.
- `src/client/components/EditableGrid.tsx`: uses dictionary display/help metadata for grid header tooltips.

## Import

- `src/server/routes/import.ts`: upload route and persistence.
- `src/shared/workbookParser.ts`: XLSX parsing.
- `src/server/metadataReference.ts`: metadata XML reference parsing.

## Validation

- `src/server/routes/validation.ts`: validation route.
- `src/shared/validationEngine.ts`: validation rules.
- `src/shared/hierarchy.ts`: hierarchy analysis.

## Export

- `src/server/routes/export.ts`: export endpoints.
- `src/shared/xmlExport.ts`: OneStream XML renderer.
- `src/shared/xlsxExport.ts`: XLSX renderer.
- `src/shared/csvJsonExport.ts`: CSV and JSON renderers.

## Client Workbench

- `src/client/components/AppShell.tsx`: shell, toolbar, navigation, modals.
- `src/client/components/Dashboard.tsx`: project overview.
- `src/client/components/DimensionWorkspace.tsx`: dimension workspace tabs.
- `src/client/components/EditableGrid.tsx`: editable grid.
- `src/client/components/HierarchyTree.tsx`: relationship tree.
- `src/client/components/MetadataEditor.tsx`: dimension metadata.
- `src/client/components/IssuePanel.tsx`: issues.
- `src/client/components/XmlPreview.tsx`: XML preview.
- `src/client/components/ui.tsx`: shared UI primitives.
- `src/client/styles.css`: app styling.

## Client State And View Models

- `src/client/state/useProjectStore.ts`: project data loading and refresh.
- `src/client/ui/viewModel.ts`: issue summaries, export availability, nav items, tabs.
- `src/client/ui/gridViewModel.ts`: grid helper behavior.
- `src/client/config/useAppConfig.ts`: client config hook.

## Tests

- `src/test`: Vitest test suite.
