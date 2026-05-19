# Export Modes

Export routes live in `src/server/routes/export.ts`. Export rendering logic lives in shared modules so it can be tested without HTTP.

## XML

Endpoint:

```text
GET /api/export/:projectId/xml
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

XML export reads persisted project, dimensions, members, and relationships. It works for both blueprint-created projects and XLSX-seeded projects.

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

Snapshots are currently direct server-side persistence, not a background export job.

## Export Blocking

The UI disables export when:

- no project is open
- all export formats are disabled
- validation issues contain severities listed in `validation.exportBlockedBySeverities`

The server export endpoints do not currently enforce validation blocking. That behavior is UI-side today and should be hardened before production.

