# Metadata Diff Guide

The metadata diff feature lets implementation teams compare the current project against a saved baseline before exporting XML or release artifacts.

## What A Baseline Is

A baseline is a normalized snapshot of project metadata stored in `project_baselines`.

Supported source types:

- `snapshot`: current project state captured through the Compare tab or API.
- `json`: caller-provided project metadata JSON.
- `manual`: caller-provided manual baseline JSON.
- `xml`: XML text parsed through `src/shared/xmlImport.ts` and normalized for comparison.

The baseline stores comparable JSON produced by `src/shared/metadataDiff.ts`, not raw table rows. This keeps future diff runs stable even as current project records continue to change.

## What The Diff Engine Compares

The shared engine in `src/shared/metadataDiff.ts` compares:

- members matched by dimension type, dimension name, and member key
- relationships matched by dimension, parent, and child
- relationship moves where a child loses one parent and gains another
- relationship copies where a child gains an additional parent while retaining an existing parent
- member and relationship properties after scalar normalization
- preserved unknown XML property nodes when a property name is available

High-risk changes are marked as warnings:

- member delete
- relationship delete
- branch move
- Account Type change
- Entity ownership or consolidation property change

## API Workflow

Create a snapshot baseline:

```http
POST /api/projects/:projectId/baselines
```

```json
{
  "name": "Before release changes",
  "sourceType": "snapshot"
}
```

Run a diff:

```http
POST /api/projects/:projectId/diff
```

```json
{
  "baselineId": "baseline-id",
  "options": {}
}
```

Read results:

```http
GET /api/projects/:projectId/diff/:diffRunId
GET /api/projects/:projectId/diff/:diffRunId/items
```

## UI Workflow

Open a dimension workspace and select the Compare tab.

1. Enter a baseline name.
2. Click Create baseline.
3. Select a baseline.
4. Click Run comparison.
5. Review summary counts and filterable diff items.
6. Use CSV when a lightweight review extract is needed.

The UI shows a warning when the current project has blocking validation issues, but diff remains available. Diff is review infrastructure; it does not replace validation and does not block exports by itself.

## Persistence

Tables:

- `project_baselines`
- `metadata_diff_runs`
- `metadata_diff_items`

Repository methods live in `src/server/db/repositories.ts`; route handlers do not issue SQL directly.

## Current Limits

- The Compare tab creates baselines from the current project snapshot.
- XML baselines can be created through API XML text, not multipart upload yet.
- Diff items are persisted for review and CSV export; release package generation and rollback scripting are future workflows.
