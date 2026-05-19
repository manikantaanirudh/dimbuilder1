# Application Summary

SR Onestream Dim Builder is a local-first metadata workbench for building, validating, previewing, and exporting OneStream dimension metadata. The app is intentionally generic: it can create a blank project from central dimension blueprints in `config/dimbuilder.yaml`, and XLSX import remains an optional way to seed a project.

## Primary Goals

- Create app-authored OneStream metadata projects without depending on an Excel workbook.
- Import existing OneStream metadata XML as editable project data while preserving unknown XML fields for round-trip export.
- Configure the dimension inventory, display order, root members, member fields, relationship defaults, and seeded member data from one central YAML file.
- Author and validate blueprint YAML fragments safely without mutating the central config automatically.
- Let users edit dimensions, members, and relationships in a dense workbench UI.
- Maintain a shared OneStream property dictionary so UI labels, validation, XML export, and future bulk tools understand property aliases, XML names, and value types consistently.
- Support default and contextual property values that can vary by cube type, scenario type, and time member.
- Compare current project metadata against a saved baseline before export or release packaging.
- Convert reviewed diffs into auditable change sets and release packages.
- Apply safe bulk updates to member and relationship properties through previewed, audited jobs.
- Analyze hierarchies with levelized, path, parent-child, shared-member, and orphan outputs.
- Restore saved project snapshots or branch a snapshot into a new project.
- Validate metadata before export.
- Export XML that can represent app-authored project data, plus workbook, CSV, and JSON backup formats.

## Main Workflows

1. Create a blank project.
   The client opens the New Project modal, posts to `POST /api/projects`, and the server seeds dimensions from configured blueprints.

2. Seed from XLSX.
   The client uploads an optional OneStream metadata workbook to `POST /api/import/workbook`. The parser reads supported sheets, merges duplicate dimension sheets when configured, aligns to metadata XML reference data when enabled, and persists the imported records.

3. Import XML.
   The client uploads OneStream metadata XML to `POST /api/import/xml`. The shared XML parser creates editable dimensions, members, and relationships, stores unknown XML data in JSON fields, validates the project, and records `project.importXml`.

4. Edit metadata.
   The React workbench edits dimensions, members, and relationships through `/api/projects/:projectId/...` endpoints.

5. Add varying properties.
   The Varying workspace tab uses `/api/projects/:projectId/varying-properties` to manage default and contextual property values for dimensions, members, and relationships.

6. Bulk update metadata.
   The Bulk Update workspace tab previews member or relationship property changes, shows exact old/new values, and applies the update through `/api/projects/:projectId/bulk-updates/apply` with rollback data stored in SQLite.

7. Validate.
   The client posts to `/api/validation/:projectId/run`. The server runs dimension-level validation, writes issues to SQLite, and returns the issue set.

8. Compare metadata.
   The Compare workspace tab creates project baselines, runs `/api/projects/:projectId/diff`, and displays persisted member, relationship, property, move/copy, and warning items.

9. Build a change set.
   The Change Sets workspace tab creates a draft from a diff run, re-runs validation, records approval or rejection comments, and packages approved changes.

10. Export.
   The client calls export endpoints for XML, XLSX, members CSV, relationships CSV, JSON backup, or snapshots. XML export reads persisted project records and renders OneStream metadata XML.

11. Analyze hierarchy.
   The Hierarchy tab calls `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/analytics`, displays max depth, leaf/parent, shared-member, and orphan counts, and links to deterministic CSV exports for levelized, paths, parent-child, shared, and orphan reports.

12. Restore or branch from snapshot.
   The Project overview Snapshot Manager lists saved snapshots, restores one into the current project after creating a safety snapshot, or creates a new project branch with remapped internal IDs.

13. Author blueprint changes.
   The Project overview Blueprint Studio validates blueprint drafts, previews deterministic YAML fragments, and can derive a draft from an existing dimension while leaving `config/dimbuilder.yaml` unchanged.

## Core Concepts

- Project: Top-level workspace stored in `projects`.
- Dimension: One OneStream dimension type and dimension name, stored in `dimensions`.
- Member: A row in a dimension's member table, stored in `dimension_members`.
- Relationship: A parent-child link, stored in `dimension_relationships`.
- Varying property value: A default or context-specific property value stored in `varying_property_values`.
- Baseline: A normalized metadata snapshot stored in `project_baselines`.
- Diff run: A persisted comparison stored in `metadata_diff_runs` with detail rows in `metadata_diff_items`.
- Change set: A named release-control record with copied diff items, approvals, and package history.
- Release package: A directory export containing release notes, change set JSON, diff CSV, validation CSV, XML, rollback notes, and manifest JSON.
- Bulk update job: An audited property update execution with request, summary, item rows, and rollback JSON.
- Project snapshot: A persisted JSON capture of project metadata that can be restored or branched.
- Blueprint: YAML configuration that seeds a dimension, root members, optional members, optional relationships, and default relationship properties.
- Blueprint Studio: Dashboard authoring aid that validates drafts, renders YAML fragments, and derives drafts from project dimensions without writing the config file.
- Metadata reference: Optional XML file used to align imported workbook dimensions to existing OneStream metadata.
- Unknown XML data: Preserved attributes/elements from XML import, stored under `__unknownXml` in metadata/properties JSON and re-emitted on export.
- Property dictionary: Versioned shared metadata in `src/shared/oneStreamPropertyDictionary.ts` that describes supported OneStream properties by dimension type and target level.

## Source Anchors

- App identity and blueprint config: `config/dimbuilder.yaml`
- Runtime config loading: `src/server/config/loadAppConfig.ts`
- Config types and validation: `src/shared/appConfigTypes.ts`, `src/shared/appConfigValidation.ts`
- Project creation from blueprints: `src/server/projectBlueprints.ts`
- Blueprint Studio: `src/shared/blueprintStudio.ts`, `src/server/routes/blueprints.ts`, `src/client/components/BlueprintStudio.tsx`
- API routes: `src/server/routes/*.ts`
- XML import: `src/shared/xmlImport.ts`
- Metadata diff: `src/shared/metadataDiff.ts`
- Hierarchy analytics: `src/shared/hierarchyAnalytics.ts`
- Bulk update preview: `src/shared/bulkUpdate.ts`
- Release packages: `src/shared/releasePackage.ts`
- Snapshot restore and branching: `src/server/db/repositories.ts`, `src/client/components/SnapshotManager.tsx`
- Client workbench shell: `src/client/components/AppShell.tsx`
- XML export: `src/shared/xmlExport.ts`
