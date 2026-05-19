# Export Modes

Export routes live in `src/server/routes/export.ts`. Export rendering logic lives in shared modules so it can be tested without HTTP.

## XML

Endpoint:

```text
GET /api/export/:projectId/xml?mode=full&baselineId=&dimensionId=
```

Renderer:

```text
src/shared/xmlExport.ts
```

Config:

- `export.xml.enabled`
- `export.xml.prettyPrint`
- `export.xml.skipBlankMemberRows`
- `export.xml.skipFormulaErrors`
- `export.xml.includeDimensionSourceAttributes`
- `application.oneStreamVersionFallback`

All export endpoints are guarded by `src/server/exportGuards.ts` before rendering or writing files. Stored validation issues with severities in `validation.exportBlockedBySeverities` return `409` unless validation bypass is enabled and explicitly requested with a reason.

XML export reads persisted project, dimensions, members, relationships, and varying property values. It works for blueprint-created projects, XLSX-seeded projects, and XML-imported projects.

Property name mapping is now dictionary-aware through `src/shared/oneStreamPropertyDictionary.ts`. Existing explicit XML mappings are preserved, known aliases resolve to canonical XML names, and unknown non-empty properties are retained with fallback XML-name conversion.

When a project was created through `POST /api/import/xml`, preserved unknown XML attributes, unknown property nodes, and unsupported child elements are stored under `__unknownXml` in JSON fields. XML export writes known fields first, then re-emits preserved unknown XML when an edited known value has not replaced that XML name.

Varying properties are appended as deterministic property nodes with explicit context attributes such as `cubeType`, `scenarioType`, and `timeMember`. Base flat property output remains unchanged.

### Relationship Load Modes

The XML endpoint accepts `mode`:

- `full`: current backward-compatible XML output. No relationship operation block is emitted.
- `additive`: plans relationship adds, copies, and relationship property updates without delete rows.
- `propertyUpdate`: plans relationship property update rows only.
- `relationshipDelete`: plans relationship deletes only.
- `moveCopy`: plans moves, copies, and supporting adds.
- `breakBuild`: plans baseline relationship breaks followed by target relationship rebuilds.

`baselineId` lets the app infer operations from a persisted comparable baseline. `dimensionId` scopes the plan to one dimension. Non-full exports preserve the normal XML payload and append a conservative `<relationshipOperations>` block with explicit operation rows and warnings. Delete/move/break syntax is intentionally represented as an app-authored planning structure until the exact OneStream import shape is confirmed by the implementation team.

## XLSX

Endpoint:

```text
GET /api/export/:projectId/xlsx
```

Renderer:

```text
src/shared/xlsxExport.ts
```

Config:

- `export.xlsx.enabled`
- `export.xlsx.creator`
- `paths.exportsDirectory`

The server writes an XLSX file to the exports directory, reads it back, and streams it as an Office workbook attachment.

## CSV

Endpoints:

```text
GET /api/export/:projectId/members.csv
GET /api/export/:projectId/relationships.csv
```

Renderer:

```text
src/shared/csvJsonExport.ts
```

CSV export is controlled by `export.csv.enabled`.

## Hierarchy CSV

Per-dimension hierarchy exports live under project dimension routes rather than the global export router:

```text
GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/levelized.csv
GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/paths.csv
GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/parent-child.csv
GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/shared-members.csv
GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/orphans.csv
```

Renderer:

```text
src/shared/hierarchyAnalytics.ts
```

Hierarchy CSV output is deterministic and cycle-safe. Levelized exports create dynamic `level0...levelN` columns based on the deepest path in the selected dimension. If traversal encounters a cycle, the row includes `CYCLE_DETECTED` in the `warnings` column and traversal stops on that branch instead of recursing indefinitely.

## JSON Backup

Endpoint:

```text
GET /api/export/:projectId/json
```

Renderer:

```text
src/shared/csvJsonExport.ts
```

The JSON backup includes project data with an empty import summary for app-authored snapshots.

## Snapshot

Endpoint:

```text
POST /api/export/:projectId/snapshot
```

Snapshot creation:

- reads project state
- writes a `project_snapshots` record
- writes a JSON file under `paths.exportsDirectory`

Snapshots are direct server-side persistence, not a background export job. Saved snapshots can also be managed from the Project overview Snapshot Manager:

- `GET /api/projects/:projectId/snapshots` lists saved snapshots.
- `POST /api/projects/:projectId/snapshots/:snapshotId/restore` restores snapshot metadata into the current project after creating a safety snapshot.
- `POST /api/projects/:projectId/snapshots/:snapshotId/branch` creates a new project from the snapshot and remaps internal IDs.

Restore does not restore validation issues by default. Users should run validation after restore or branch unless they explicitly request validation issue restore through the API.

## Release Packages

Endpoint:

```text
POST /api/projects/:projectId/change-sets/:changeSetId/package
```

Shared package rendering:

```text
src/shared/releasePackage.ts
```

Release packages are created as directories under `paths.exportsDirectory/release-packages`. A package contains:

- `01-summary.md`
- `02-change-set.json`
- `03-diff-report.csv`
- `04-validation-report.csv`
- `05-metadata.xml`
- `06-rollback-notes.md`
- `manifest.json`

The first package implementation writes full current XML in `05-metadata.xml` and records the requested mode in `manifest.json`. Supported modes are `full`, `additive`, `propertyUpdate`, `relationshipDelete`, `moveCopy`, and `breakBuild`; mode-specific XML subsets remain conservative and should be reviewed before downstream OneStream import.

Package creation re-runs validation and includes the validation report in the package. Change set approval is blocked by server-side validation errors unless `bypassValidation` is explicitly sent and recorded during approval.

## Export Blocking

The UI disables export when:

- no project is open
- all export formats are disabled
- validation issues contain severities listed in `validation.exportBlockedBySeverities`

The server also enforces the same validation gate for XML, JSON, member CSV, relationship CSV, XLSX, and snapshot exports. Blocking responses use HTTP `409` with issue counts by severity.

Optional config:

- `export.allowValidationBypass`: default `false`.
- `export.validationBypassRequiresReason`: default `true`.
- `export.requireValidationBeforeExport`: default `false` for backward compatibility.

When bypass is enabled, callers can send `validationBypass=true` plus `validationBypassReason` as query parameters for GET exports or in the snapshot POST body. Successful bypasses write `export.validationBypass` audit entries before the export continues.
