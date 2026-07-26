# Implementation Map

## Client API Organization

src/client/api/client.ts is the compatibility barrel. New client API implementations are grouped by domain in src/client/api/; existing feature code may continue importing through the barrel.

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
- `src/shared/varyingProperties.ts`: varying-property context normalization, duplicate detection, and effective value selection.
- `src/shared/metadataDiff.ts`: normalized comparable project state, member/relationship/property diffing, move/copy detection, risk warnings, and diff summaries.
- `src/shared/relationshipOperations.ts`: relationship load-mode planning, operation inference, move/copy impact, break/build planning, orphan detection, and summaries.
- `src/shared/releasePackage.ts`: change set summaries, release notes, manifests, report CSVs, rollback notes, and package mode selection.
- `src/shared/bulkUpdate.ts`: pure bulk-update preview engine, target/filter/operation types, and dictionary-backed value warnings.
- `src/shared/hierarchyAnalytics.ts`: cycle-safe hierarchy paths, levelized rows, leaf/parent classification, shared/orphan reports, depth stats, and hierarchy CSV rendering.
- `src/shared/blueprintStudio.ts`: blueprint draft normalization, config-backed validation, YAML fragment rendering, blueprint derivation from project dimensions, and blueprint comparison.
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

## Blueprint Studio

- `src/shared/blueprintStudio.ts`: shared authoring helpers.
- `src/server/routes/blueprints.ts`: `GET /api/blueprints`, validation, and YAML-fragment endpoints.
- `src/server/routes/projects.ts`: project-dimension blueprint derivation endpoint.
- `src/client/api/client.ts`: Blueprint Studio API helpers.
- `src/client/components/BlueprintStudio.tsx`: dashboard panel for draft validation, YAML preview, and generation from current dimensions.
- `src/client/components/Dashboard.tsx`: hosts Blueprint Studio.

## OneStream Schema Dictionary

- `src/shared/oneStreamPropertyDictionary.ts`: source of truth for supported dimension, member, and relationship properties.
- `src/server/routes/schema.ts`: exposes `GET /api/schema/onestream` and `GET /api/schema/onestream/:version`.
- `src/client/api/client.ts`: `fetchOneStreamPropertyDictionary()`.
- `src/client/components/EditableGrid.tsx`: uses dictionary display/help metadata for grid header tooltips.

## Import

- `src/server/routes/import.ts`: upload route and persistence.
- `src/shared/workbookParser.ts`: XLSX parsing.
- `src/shared/xmlImport.ts`: OneStream metadata XML parsing and unknown XML preservation shape.
- `src/server/metadataReference.ts`: metadata XML reference parsing.

## Validation

- `src/server/routes/validation.ts`: validation route.
- `src/shared/validationEngine.ts`: generic validation orchestration, dictionary-backed property checks, varying-property checks, XML preservation notes, relationship operation checks, and OneStream profile invocation.
- `src/shared/oneStreamValidation.ts`: OneStream-specific design-quality profile rules for naming, aliases, sort order, shared members, parent input, dimension-specific properties, and duplicate varying contexts.
- `src/shared/hierarchy.ts`: hierarchy analysis.

## Varying Properties

- `src/server/db/schema.ts`: `varying_property_values` table and indexes.
- `src/server/db/repositories.ts`: varying-property CRUD, replace-for-target, and effective-value methods.
- `src/server/routes/projects.ts`: `/api/projects/:projectId/varying-properties` CRUD endpoints.
- `src/client/api/client.ts`: varying-property API helpers.
- `src/client/components/VaryingPropertiesPanel.tsx`: workspace editor for default and contextual property values.

## Metadata Baselines And Diff

- `src/shared/metadataDiff.ts`: pure diff engine and summary helpers.
- `src/server/db/schema.ts`: `project_baselines`, `metadata_diff_runs`, and `metadata_diff_items`.
- `src/server/db/repositories.ts`: baseline creation/list/get and diff run/item persistence.
- `src/server/routes/projects.ts`: baseline and diff HTTP endpoints.
- `src/client/api/client.ts`: baseline and diff API helpers.
- `src/client/components/MetadataDiffPanel.tsx`: Compare tab UI for baseline creation, comparison, filtering, summary, and CSV download.
- `src/client/components/DimensionWorkspace.tsx`: hosts the Compare tab.

## Relationship Operation Planning

- `src/shared/relationshipOperations.ts`: pure planning functions and summary helpers.
- `src/server/db/schema.ts`: optional operation metadata columns on `dimension_relationships`.
- `src/server/db/repositories.ts`: maps relationship operation metadata through repository methods.
- `src/server/routes/projects.ts`: `POST /api/projects/:projectId/relationship-plan`.
- `src/server/routes/export.ts`: parses XML export load-mode query parameters.
- `src/shared/xmlExport.ts`: emits conservative relationship operation plan blocks for non-full XML modes.
- `src/client/api/client.ts`: `planRelationshipExport()`.
- `src/client/components/ImportExportModals.tsx`: export mode selector and impact summary.

## Hierarchy Analytics

- `src/shared/hierarchyAnalytics.ts`: pure analytics and deterministic CSV helpers.
- `src/server/routes/projects.ts`: `/hierarchy/analytics`, `/hierarchy/levelized.csv`, `/hierarchy/paths.csv`, `/hierarchy/parent-child.csv`, `/hierarchy/shared-members.csv`, and `/hierarchy/orphans.csv`.
- `src/client/api/client.ts`: hierarchy analytics fetcher and CSV URL helpers.
- `src/client/components/HierarchyAnalyticsPanel.tsx`: hierarchy health counts and CSV export actions.
- `src/client/components/HierarchyTree.tsx`: hosts the analytics panel beside the relationship tree.

## Change Sets And Release Packages

- `src/shared/releasePackage.ts`: pure rendering helpers for release notes, manifests, diff reports, validation reports, rollback notes, and package-mode selection.
- `src/server/db/schema.ts`: `change_sets`, `change_set_items`, `change_set_approvals`, and `release_packages`.
- `src/server/db/repositories.ts`: change set CRUD, approval recording, and release package persistence.
- `src/server/routes/projects.ts`: change set lifecycle and package endpoints.
- `src/client/api/client.ts`: change set and package API helpers.
- `src/client/components/ChangeSetsPanel.tsx`: workspace UI for create, validate, approve/reject, and package actions.
- `src/client/components/DimensionWorkspace.tsx`: hosts the Change Sets tab.

## Bulk Updates

- `src/shared/bulkUpdate.ts`: target filtering, set/clear/replace/append/prepend/copy/derive/regex preview, and warning generation.
- `src/server/db/schema.ts`: `bulk_update_jobs` and `bulk_update_items`.
- `src/server/db/repositories.ts`: bulk update job/item persistence and transactional apply support.
- `src/server/routes/projects.ts`: `/api/projects/:projectId/bulk-updates/*` preview, apply, list, and detail endpoints.
- `src/client/api/client.ts`: bulk update API helpers.
- `src/client/components/BulkUpdatePanel.tsx`: Bulk Update workspace wizard.
- `src/client/components/DimensionWorkspace.tsx`: hosts the Bulk Update tab.

## Snapshot Restore And Branching

- `src/shared/types.ts`: snapshot state, snapshot record, and restore summary contracts.
- `src/server/db/schema.ts`: `project_snapshots`.
- `src/server/db/repositories.ts`: snapshot list/get/create, transactional restore, safety snapshot creation, and branch creation with ID remapping.
- `src/server/routes/projects.ts`: snapshot list/read/restore/branch endpoints.
- `src/server/routes/export.ts`: snapshot creation endpoint.
- `src/client/api/client.ts`: snapshot API helpers.
- `src/client/components/SnapshotManager.tsx`: dashboard restore and branch UI.
- `src/client/components/Dashboard.tsx`: hosts the Snapshot Manager.

## Export

- `src/server/routes/export.ts`: export endpoints.
- `src/server/exportGuards.ts`: server-side validation gate and optional audited bypass for export endpoints.
- `src/shared/xmlExport.ts`: OneStream XML renderer.
- `src/shared/xlsxExport.ts`: XLSX renderer.
- `src/shared/csvJsonExport.ts`: CSV and JSON renderers.

## Client Workbench

- `src/client/components/AppShell.tsx`: shell, toolbar, navigation, modals.
- `src/client/components/Dashboard.tsx`: project overview.
- `src/client/components/DimensionWorkspace.tsx`: dimension workspace tabs.
- `src/client/components/EditableGrid.tsx`: editable grid.
- `src/client/components/HierarchyTree.tsx`: relationship tree.
- `src/client/components/HierarchyAnalyticsPanel.tsx`: hierarchy analytics and CSV export controls.
- `src/client/components/MetadataEditor.tsx`: dimension metadata.
- `src/client/components/VaryingPropertiesPanel.tsx`: varying-property editor.
- `src/client/components/MetadataDiffPanel.tsx`: metadata baseline comparison.
- `src/client/components/ChangeSetsPanel.tsx`: change set lifecycle and package workflow.
- `src/client/components/BlueprintStudio.tsx`: blueprint authoring aid.
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
