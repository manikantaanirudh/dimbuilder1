# API Reference

The Express app mounts API routes under `/api`. `src/client/api/client.ts` remains the compatibility barrel for client helper imports, while implementations are grouped by domain under `src/client/api/`. Existing imports through the barrel remain supported.

## Cross-Cutting Concerns

### Authentication

When `auth.enabled` is true in config, all `/api/*` routes except `/api/health` require HTTP Basic Authentication. See `security-model.md` for details.

### Rate Limiting

All `/api/*` routes are subject to a general rate limit of 100 requests per 60-second window per IP. Import and export routes (`/api/import/*`, `/api/export/*`) have a stricter limit of 10 requests per 60-second window.

Rate limit status is communicated via `draft-7` standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`). Exceeding the limit returns `429`:

```json
{ "error": "Too many requests, please try again later." }
```

### Request Body Validation

Mutation routes validate request bodies with Zod schemas via `validateBody()` middleware. Invalid payloads return `400`:

```json
{
  "error": "Validation failed",
  "details": [{ "path": "name", "message": "Project name is required" }]
}
```

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns `{ ok: true }`. Always unauthenticated. |

## Config

| Method | Path | Description |
|---|---|---|
| GET | `/api/config` | Returns client-safe app config with server paths omitted. |
| PUT | `/api/config` | Accepts a JSON body with the full config object. Writes the updated config to the YAML file and applies changes live without server restart. |

PUT `/api/config` body:

```json
{
  "application": { "productName": "..." },
  "validation": { "..." }
}
```

Returns `{ ok: true }` on success.

## Blueprint Studio

Blueprint Studio endpoints are safe authoring helpers for `dimensions.blueprints`. They validate drafts, generate YAML fragments, and derive drafts from existing project dimensions, but they do not write `config/dimbuilder.yaml`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/blueprints` | Return the effective configured dimension blueprints, supported dimension types, and config-write capability flags. |
| POST | `/api/blueprints/validate` | Validate and normalize a blueprint draft for a dimension type. |
| POST | `/api/blueprints/yaml` | Validate a draft and return a deterministic YAML fragment. |
| POST | `/api/projects/:projectId/dimensions/:dimensionId/blueprint` | Derive a blueprint draft and YAML fragment from persisted dimension, member, and relationship records. |

Validate/YAML body:

```json
{
  "dimensionType": "Account",
  "draft": {
    "defaultDimensionName": "Accounts",
    "rootMembers": ["Root"],
    "memberKeyField": "Account",
    "relationshipDefaults": { "aggregationWeight": 1 },
    "allowMultipleParents": true
  }
}
```

`POST /api/blueprints/yaml` returns `{ "dimensionType", "blueprint", "yaml" }`. Invalid drafts return `400` with the validation result.

## Schema

| Method | Path | Description |
|---|---|---|
| GET | `/api/schema/onestream` | Returns the current client-safe OneStream property dictionary grouped by dimension type and target level. |
| GET | `/api/schema/onestream/:version` | Returns the dictionary for a supported dictionary version. Current supported version is `9.2.0`. |

Dictionary responses include `version` plus `dimensions`, with each supported dimension type containing `dimension`, `member`, and `relationship` definition arrays. Definitions come from `src/shared/oneStreamPropertyDictionary.ts` and include display labels, XML names, aliases, value types, enum values, defaults, help text, and export-format metadata.

## Projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List projects ordered by updated time. |
| POST | `/api/projects` | Create a blank metadata project from YAML blueprints. |
| PATCH | `/api/projects/:projectId` | Rename or update a project's name and description. |
| GET | `/api/projects/:projectId/summary` | Return dashboard counts and recent dimensions. |
| GET | `/api/projects/:projectId/snapshots` | List saved project snapshots. |
| GET | `/api/projects/:projectId/snapshots/:snapshotId` | Read one saved project snapshot and its stored JSON state. |
| POST | `/api/projects/:projectId/snapshots/:snapshotId/restore` | Restore a snapshot into the current project metadata. |
| POST | `/api/projects/:projectId/snapshots/:snapshotId/branch` | Create a new project from a snapshot. |
| GET | `/api/projects/:projectId/dimensions` | List dimensions for a project. |
| PATCH | `/api/projects/:projectId/dimensions/:dimensionId` | Update dimension metadata fields. |
| GET | `/api/projects/:projectId/issues` | List persisted validation issues. |

POST `/api/projects` body:

```json
{
  "name": "New Metadata Project",
  "description": "Optional description"
}
```

PATCH `/api/projects/:projectId` body:

```json
{
  "name": "Updated Project Name",
  "description": "Updated description"
}
```

Both fields are optional. Returns the updated project record.

## Project Snapshots

Project snapshots are created through `POST /api/export/:projectId/snapshot` and managed through project routes. Restore and branch writes go through `src/server/db/repositories.ts` transactions.

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/snapshots` | List snapshot metadata newest first. The list response does not include full `snapshot` JSON. |
| GET | `/api/projects/:projectId/snapshots/:snapshotId` | Read snapshot metadata plus `snapshot` JSON. |
| POST | `/api/projects/:projectId/snapshots/:snapshotId/restore` | Replace current dimensions, members, relationships, and varying properties from the snapshot. A safety snapshot is created first. |
| POST | `/api/projects/:projectId/snapshots/:snapshotId/branch` | Create a new project from the snapshot with remapped dimension, member, relationship, and varying-property IDs. |

Restore body:

```json
{
  "restoreValidationIssues": false
}
```

Restore response:

```json
{
  "mode": "replaceCurrent",
  "projectId": "project-id",
  "snapshotId": "snapshot-id",
  "safetySnapshotId": "safety-snapshot-id",
  "dimensionsRestored": 1,
  "membersRestored": 12,
  "relationshipsRestored": 11,
  "varyingPropertiesRestored": 2
}
```

Branch body:

```json
{
  "name": "Release branch",
  "description": "Optional branch description"
}
```

Branch response returns `{ "project": ProjectRecord, "summary": SnapshotRestoreSummary }`.

## Members

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/dimensions/:dimensionId/members?offset=0&limit=300&ids=` | Page active members for a dimension. Supports `?ids=` param to fetch specific records by ID (comma-separated), bypassing pagination. |
| POST | `/api/projects/:projectId/dimensions/:dimensionId/members` | Create a member. |
| PATCH | `/api/projects/:projectId/members/:memberId` | Partial-update a member. Accepts `memberKey`, `properties`, and/or `description`. Missing fields are merged from the existing record (`src/server/routes/projects.ts:243`). |
| DELETE | `/api/projects/:projectId/members/:memberId` | Soft-delete a member. |

Create member body:

```json
{
  "memberKey": "Revenue",
  "properties": {
    "Account": "Revenue",
    "Description": "Revenue"
  }
}
```

## Relationships

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/dimensions/:dimensionId/relationships?offset=0&limit=300&ids=` | Page relationships for a dimension. Supports `?ids=` param to fetch specific records by ID (comma-separated), bypassing pagination. |
| POST | `/api/projects/:projectId/dimensions/:dimensionId/relationships` | Create a relationship with configured defaults. |
| PATCH | `/api/projects/:projectId/relationships/:relationshipId` | Update a relationship. |
| DELETE | `/api/projects/:projectId/relationships/:relationshipId` | Delete a relationship. |

Create relationship body:

```json
{
  "parentKey": "Root",
  "childKey": "Revenue",
  "properties": {
    "Parent": "Root",
    "Child": "Revenue"
  }
}
```

## Hierarchy Analytics

Hierarchy analytics endpoints return cycle-safe, business-friendly hierarchy outputs for one dimension. Shared logic lives in `src/shared/hierarchyAnalytics.ts`; route handlers load dimension records through repositories and do not issue SQL directly.

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/analytics` | Return hierarchy health counts, path rows, member leaf/parent classification, shared members, and orphan members. |
| GET | `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/levelized.csv` | Return levelized hierarchy rows with dynamic `level0...levelN` columns. |
| GET | `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/paths.csv` | Return root-to-leaf path rows. |
| GET | `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/parent-child.csv` | Return deterministic parent-child relationship rows. |
| GET | `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/shared-members.csv` | Return shared member report rows. |
| GET | `/api/projects/:projectId/dimensions/:dimensionId/hierarchy/orphans.csv` | Return orphan member report rows. |

Analytics response shape:

```json
{
  "summary": {
    "dimensionType": "Account",
    "dimensionName": "Accounts",
    "memberCount": 120,
    "relationshipCount": 140,
    "maxDepth": 5,
    "pathCount": 84,
    "orphanCount": 0,
    "sharedMemberCount": 2,
    "leafCount": 72,
    "parentCount": 48,
    "hasCycle": false,
    "warnings": []
  },
  "sharedMembers": [
    {
      "memberKey": "SharedLeaf",
      "parentCount": 2,
      "parents": ["AltRoot", "Root"]
    }
  ],
  "orphanMembers": [],
  "paths": []
}
```

Levelized CSV headers are deterministic:

```text
dimensionType,dimensionName,path,level0,level1,...,memberKey,description,isLeaf,parentCount,aggregationWeight,warnings
```

## Varying Properties

Varying-property endpoints manage default and contextual property values stored in `varying_property_values`. They are backed by `src/server/db/repositories.ts`; route handlers do not issue SQL directly.

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/varying-properties?dimensionId=&targetType=&targetId=` | List varying property values for a project, optionally filtered by dimension, target type, target id, or property name. |
| POST | `/api/projects/:projectId/varying-properties` | Create or upsert a varying property value for a target/context combination. |
| PATCH | `/api/projects/:projectId/varying-properties/:valueId` | Update an existing varying property value. |
| DELETE | `/api/projects/:projectId/varying-properties/:valueId` | Delete a varying property value. |

Create body:

```json
{
  "dimensionId": "dimension-id",
  "targetType": "member",
  "targetId": "member-id",
  "propertyName": "Text1",
  "value": "Finance actual note",
  "cubeType": "Finance",
  "scenarioType": "Actual",
  "timeMember": "2026M1",
  "isDefault": false
}
```

`targetType` is one of `dimension`, `member`, or `relationship`. Blank `cubeType`, `scenarioType`, and `timeMember` represent all contexts. The unique context is project, target type, target id, property name, cube type, scenario type, and time member.

## Bulk Updates

Bulk update endpoints preview and apply member or relationship property updates. Preview is read-only and returns exact old/new values. Apply recomputes preview on the server, writes row edits, stores rollback data in `bulk_update_jobs`, stores item details in `bulk_update_items`, and records `bulkUpdate.apply`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/projects/:projectId/bulk-updates/preview` | Preview member or relationship property updates without writing data. |
| POST | `/api/projects/:projectId/bulk-updates/apply` | Recompute and apply a bulk update in one repository transaction. |
| GET | `/api/projects/:projectId/bulk-updates` | List bulk update jobs for a project. |
| GET | `/api/projects/:projectId/bulk-updates/:jobId` | Read one job with item-level old/new values. |

Preview/apply body:

```json
{
  "targetType": "member",
  "operation": "set",
  "propertyName": "Text1",
  "value": "Reviewed",
  "filter": {
    "dimensionId": "dimension-id",
    "activeOnly": true,
    "memberKeyStartsWith": "Rev"
  }
}
```

Supported `targetType` values are `member` and `relationship`. Supported operations are `set`, `clear`, `replaceText`, `append`, `prepend`, `copyFromProperty`, `deriveFromParent`, and `regexReplace`. Filters can scope by dimension, member key contains/starts-with/regex, relationship parent/child contains/starts-with/regex, and property filter rows.

Preview response:

```json
{
  "targetType": "member",
  "operation": "set",
  "propertyName": "Text1",
  "affectedCount": 1,
  "skippedCount": 3,
  "previewItems": [
    {
      "targetId": "member-id",
      "targetKey": "Revenue",
      "propertyName": "Text1",
      "oldValue": "Before",
      "newValue": "Reviewed",
      "warnings": []
    }
  ],
  "warnings": []
}
```

## Baselines And Metadata Diff

Baseline and diff endpoints support release review before export. Baselines store normalized comparable project state in `project_baselines`; diff runs and items are persisted in `metadata_diff_runs` and `metadata_diff_items`. Shared comparison logic lives in `src/shared/metadataDiff.ts`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/projects/:projectId/baselines` | Create a baseline from the current project snapshot, JSON body, manual JSON body, or XML text body. |
| GET | `/api/projects/:projectId/baselines` | List baselines for the project. |
| GET | `/api/projects/:projectId/baselines/:baselineId` | Read one baseline, including normalized baseline JSON. |
| POST | `/api/projects/:projectId/diff` | Compare the current project against a baseline and persist a diff run plus items. |
| GET | `/api/projects/:projectId/diff/:diffRunId` | Read one persisted diff run and summary. |
| GET | `/api/projects/:projectId/diff/:diffRunId/items` | List persisted diff items for a run. |
| POST | `/api/projects/:projectId/relationship-plan` | Plan relationship operations for an export mode using an optional baseline. |

Create snapshot baseline body:

```json
{
  "name": "Before release changes",
  "sourceType": "snapshot"
}
```

Run diff body:

```json
{
  "baselineId": "baseline-id",
  "options": {}
}
```

Diff items include dimension, target type, change type, severity, object key, parent/child keys, property name, old value, new value, and details JSON. High-risk changes such as member deletes, relationship deletes, moves, Account Type changes, and Entity ownership/consolidation property changes are marked as warnings.

Relationship plan body:

```json
{
  "baselineId": "baseline-id",
  "mode": "moveCopy",
  "dimensionId": "dimension-id"
}
```

`mode` is one of `full`, `additive`, `propertyUpdate`, `relationshipDelete`, `moveCopy`, or `breakBuild`. `baselineId` is optional for `full` and additive-style planning, but break/build returns a `BREAK_BUILD_HAS_NO_BASELINE` error in the plan when no baseline is supplied. The response includes planned operation rows plus summary counts for adds, updates, deletes, moves, copies, potential orphans, warnings, and errors.

## Change Sets And Release Packages

Change set endpoints convert a persisted diff run into a named release workflow. Change set rows, copied diff items, approvals, and release package records are persisted through repository methods in `src/server/db/repositories.ts`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/change-sets` | List change sets for a project. |
| POST | `/api/projects/:projectId/change-sets` | Create a draft change set from a specified diff run or the latest diff run. |
| GET | `/api/projects/:projectId/change-sets/:changeSetId` | Read a change set with items, approvals, and latest package. |
| PATCH | `/api/projects/:projectId/change-sets/:changeSetId` | Update name, description, status, or target environment. |
| POST | `/api/projects/:projectId/change-sets/:changeSetId/validate` | Re-run project validation and mark the change set `validated` when no blocking issues exist. |
| POST | `/api/projects/:projectId/change-sets/:changeSetId/approve` | Approve a change set. Blocking validation issues return `409` unless `bypassValidation` is true. |
| POST | `/api/projects/:projectId/change-sets/:changeSetId/reject` | Reject a change set and record a rejection comment. |
| POST | `/api/projects/:projectId/change-sets/:changeSetId/package` | Create a directory-based release package under `paths.exportsDirectory`. |
| GET | `/api/projects/:projectId/change-sets/:changeSetId/package` | Return the latest package record and manifest for the change set. |

Create body:

```json
{
  "diffRunId": "diff-run-id",
  "selectedItemIds": ["diff-item-id"],
  "name": "Revenue release",
  "description": "Promote reviewed account metadata.",
  "targetEnvironment": "Production"
}
```

Approve body:

```json
{
  "comment": "Approved for package.",
  "bypassValidation": false
}
```

Package body:

```json
{
  "mode": "breakBuild",
  "packageName": "revenue-release"
}
```

Supported package modes are `full`, `additive`, `propertyUpdate`, `relationshipDelete`, `moveCopy`, and `breakBuild`. The initial package exports full current XML plus reports for every mode; the mode is recorded in the manifest for future mode-specific XML generation.

## Import

| Method | Path | Description |
|---|---|---|
| POST | `/api/import/workbook` | Multipart `.xlsx` upload used to seed a project (**Seed from file** in the UI). |
| POST | `/api/import/xml` | Multipart OneStream metadata XML upload used to create an editable project while preserving unknown XML fields. |
| POST | `/api/import/csv/preview` | Parse a metadata CSV and return counts, warnings, and blocking errors without writing records. |
| POST | `/api/import/csv/commit` | Re-parse and commit a metadata CSV when preview is clean; creates a new project or appends/updates an existing one. |

Workbook form fields:

- `file`: required XLSX file.
- `projectName`: optional project name.

XML form fields:

- `file`: required XML file.
- `projectName`: optional project name.

XML import response:

```json
{
  "project": {
    "id": "project-id",
    "name": "Imported XML Project"
  },
  "importSummary": {
    "dimensionsImported": 1,
    "membersImported": 10,
    "relationshipsImported": 9,
    "unknownAttributesPreserved": 3,
    "unknownPropertiesPreserved": 2,
    "unknownElementsPreserved": 1,
    "validationIssues": 4
  }
}
```

XML import is implemented in `src/shared/xmlImport.ts` and persisted by `src/server/routes/import.ts`. Unknown XML data is stored in existing metadata/properties JSON fields and is re-emitted by XML export when not overwritten by known edited fields.

CSV import is implemented in `src/shared/metadataCsvImport.ts` and `src/server/metadataCsvCommit.ts`.

## Property Defaults

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/property-defaults` | List property default display rows grouped by dimension type. Optional query: `dimensionType`. |
| PATCH | `/api/projects/:projectId/property-defaults/:defaultId` | Update a catalog default `defaultValue` and/or `enabled` flag. |

PATCH body:

```json
{
  "defaultValue": "Local",
  "enabled": true
}
```

Effective defaults are applied during XML export through `repos.propertyDefaults.getEffectiveDefaultsForExport()` in `src/server/routes/export.ts`.

## Validation Config (Per-Project Overrides)

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/validation-config` | Return the per-project validation rule overrides. Each override specifies a rule code and its project-level severity (including `"off"` to disable). |
| POST | `/api/projects/:projectId/validation-config` | Create or update per-project validation rule overrides. |

POST body:

```json
{
  "overrides": [
    { "ruleCode": "DUPLICATE_MEMBER", "severity": "info" },
    { "ruleCode": "SHARED_MEMBER_DETECTED", "severity": "off" }
  ]
}
```

Setting severity to `"off"` disables the rule for the project. Overrides are stored in the `project_validation_overrides` table.

## Validation

| Method | Path | Description |
|---|---|---|
| POST | `/api/validation/:projectId/run` | Run validation, replace stored issues, and return issues. |

Body:

```json
{
  "duplicateSeverity": "warning",
  "profile": "onestream",
  "options": {
    "unknownPropertySeverity": "warning",
    "invalidEnumSeverity": "error",
    "invalidPropertyTypeSeverity": "error"
  }
}
```

`profile` is optional. When omitted, validation uses the configured default: generic validation plus the OneStream profile when `validation.oneStreamProfile.enabled` is true. Use `"default"` to run generic validation only or `"onestream"` to force the OneStream design-quality profile for that run. `options` can override OneStream profile settings for the run.

## Export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/:projectId/xml?mode=full&baselineId=&dimensionId=` | Return OneStream metadata XML. Non-full modes include a deterministic relationship operation plan block. |
| GET | `/api/export/:projectId/json` | Return JSON backup. |
| GET | `/api/export/:projectId/members.csv` | Return members CSV. |
| GET | `/api/export/:projectId/relationships.csv` | Return relationships CSV. |
| GET | `/api/export/:projectId/xlsx` | Return workbook export. |
| POST | `/api/export/:projectId/snapshot` | Persist a project snapshot and write JSON to exports directory. |

XML export query parameters:

- `mode`: `full`, `additive`, `propertyUpdate`, `relationshipDelete`, `moveCopy`, or `breakBuild`; defaults to `full`.
- `baselineId`: optional metadata baseline used to infer adds, deletes, moves, copies, and break/build rows.
- `dimensionId`: optional dimension scope for relationship operation planning.

Validation blocking:

All export endpoints check stored validation issues before producing files. If any issue severity is listed in `validation.exportBlockedBySeverities`, the server returns `409`:

```json
{
  "error": "Export blocked by validation issues",
  "blocked": true,
  "blockedSeverities": ["error"],
  "issueCounts": {
    "error": 1,
    "warning": 0,
    "info": 0
  },
  "bypassAllowed": false
}
```

If `export.requireValidationBeforeExport` is true and no validation run is recorded, export returns:

```json
{
  "error": "Validation must run before export",
  "blocked": true,
  "validationRequired": true
}
```

Bypass parameters are accepted only when `export.allowValidationBypass` is true:

- `validationBypass=true`
- `validationBypassReason=reason text`

For `POST /api/export/:projectId/snapshot`, send the same fields in the JSON body. If `export.validationBypassRequiresReason` is true, missing reasons return `409` with `error: "Validation bypass reason is required"`.

## Error Shape

Unhandled route errors are normalized by `src/server/app.ts`:

```json
{
  "error": "message"
}
```
