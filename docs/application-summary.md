# Application Summary

SR Onestream Dim Builder is a local-first metadata workbench for building, validating, previewing, and exporting OneStream dimension metadata. The app is intentionally generic: it can create a blank project from central dimension blueprints in `config/dimbuilder.yaml`, and XLSX import remains an optional way to seed a project.

## Primary Goals

- Create app-authored OneStream metadata projects without depending on an Excel workbook.
- Configure the dimension inventory, display order, root members, member fields, relationship defaults, and seeded member data from one central YAML file.
- Let users edit dimensions, members, and relationships in a dense workbench UI.
- Maintain a shared OneStream property dictionary so UI labels, validation, XML export, and future bulk tools understand property aliases, XML names, and value types consistently.
- Validate metadata before export.
- Export XML that can represent app-authored project data, plus workbook, CSV, and JSON backup formats.

## Main Workflows

1. Create a blank project.
   The client opens the New Project modal, posts to `POST /api/projects`, and the server seeds dimensions from configured blueprints.

2. Seed from XLSX.
   The client uploads an optional OneStream metadata workbook to `POST /api/import/workbook`. The parser reads supported sheets, merges duplicate dimension sheets when configured, aligns to metadata XML reference data when enabled, and persists the imported records.

3. Edit metadata.
   The React workbench edits dimensions, members, and relationships through `/api/projects/:projectId/...` endpoints.

4. Validate.
   The client posts to `/api/validation/:projectId/run`. The server runs dimension-level validation, writes issues to SQLite, and returns the issue set.

5. Export.
   The client calls export endpoints for XML, XLSX, members CSV, relationships CSV, JSON backup, or snapshots. XML export reads persisted project records and renders OneStream metadata XML.

## Core Concepts

- Project: Top-level workspace stored in `projects`.
- Dimension: One OneStream dimension type and dimension name, stored in `dimensions`.
- Member: A row in a dimension's member table, stored in `dimension_members`.
- Relationship: A parent-child link, stored in `dimension_relationships`.
- Blueprint: YAML configuration that seeds a dimension, root members, optional members, optional relationships, and default relationship properties.
- Metadata reference: Optional XML file used to align imported workbook dimensions to existing OneStream metadata.
- Property dictionary: Versioned shared metadata in `src/shared/oneStreamPropertyDictionary.ts` that describes supported OneStream properties by dimension type and target level.

## Source Anchors

- App identity and blueprint config: `config/dimbuilder.yaml`
- Runtime config loading: `src/server/config/loadAppConfig.ts`
- Config types and validation: `src/shared/appConfigTypes.ts`, `src/shared/appConfigValidation.ts`
- Project creation from blueprints: `src/server/projectBlueprints.ts`
- API routes: `src/server/routes/*.ts`
- Client workbench shell: `src/client/components/AppShell.tsx`
- XML export: `src/shared/xmlExport.ts`
