# Rebuild Prompts — features/v2enhance

These two prompts recreate the work from the `features/v2enhance` branch on `main`.
Apply them in order: Prompt 1 first, then Prompt 2 after tests pass.

---

## Prompt 1 — Route Consolidation Refactor

I need to refactor `src/server/routes/projects.ts` which has grown to ~1,300 lines.
The goal is to split it into focused domain sub-routers while keeping all existing
behaviour 100% identical. Do not change any business logic, only reorganise.

### What to create

#### Two shared helpers (new files)

**src/server/helpers/projectState.ts**
- Export `loadProjectState(repos, projectId)` — loads project, dimensions,
  members, and relationships from repos and returns them as a ProjectMetadataState
- Export `isRecord(value)` — type guard returning `value is Record<string, unknown>`

**src/server/helpers/runValidation.ts**
- Export `runProjectValidation(repos, config, projectId)` — runs validateDimension
  for every dimension in the project, adds two project-level rules:
    1. DIMENSION_MISSING_FROM_PROJECT: warn if any of Account, Entity, Scenario,
       Flow dimension types are absent
    2. CROSS_DIMENSION_CURRENCY_INVALID: warn if an Entity member's "Default Currency"
       or "Currency" property is longer than 5 chars and doesn't match a known Account
       member key
  Calls repos.issues.replaceForProject and returns the issues array.

#### Seven new sub-router files (extract from projects.ts)

- **src/server/routes/snapshots.ts** — all snapshot routes
- **src/server/routes/dimensions.ts** — all dimension CRUD routes
- **src/server/routes/hierarchy.ts** — all hierarchy tree routes
- **src/server/routes/varyingProperties.ts** — all varying-property routes
- **src/server/routes/baselines.ts** — all baseline routes
- **src/server/routes/bulkUpdates.ts** — all bulk-update routes
- **src/server/routes/changeSets.ts** — all change-set routes

Each sub-router must:
- Accept `{ repos, config, getAI? }` as constructor arguments (same pattern as
  the existing file)
- Export a single default Express Router
- Import helpers from `../helpers/projectState` and `../helpers/runValidation`
  where they are currently inlined

#### Update src/server/routes/validation.ts
Add validation-config and validation-issues routes that are currently in projects.ts.

#### Shrink src/server/routes/projects.ts to ~70 lines
Keep only:
1. Project CRUD (list, get, create, update, delete)
2. Mount each sub-router with appropriate path prefix, e.g.:
   router.use('/:projectId/snapshots', snapshotsRouter)
   router.use('/:projectId/dimensions', dimensionsRouter)
   etc.

#### Update src/server/ai/projectContext.ts
If it imports anything from helpers that moved, update the import path.

### Constraints
- No new dependencies
- All existing API endpoint paths must stay the same (sub-router mounts must
  produce identical URL patterns)
- All TypeScript must compile with zero errors
- Do not change any shared/ logic

---

## Prompt 2 — Large Export Safety

I need to add a fail-fast member-count guard to all XML export paths to prevent
out-of-memory crashes on large projects.

### New files to create

**src/shared/exportLimits.ts**

Create the following exports:

- `ExportLimitResponse` interface: `{ error, exportType, memberCount, limit, suggestion }`
- `ExportLimitError` class extending Error:
  - `readonly status = 413`
  - `readonly payload: ExportLimitResponse`
- `resolveExportMaxMembers(config: AppConfig): number`
  — returns `config.operations?.exportMaxMembers ?? 100_000`
- `formatExportLimitSuggestion(exportType: string): string`
  — for xml/dimension exports: advise raising exportMaxMembers or exporting a
    single dimension with `?dimensionId=`
  — otherwise: advise raising exportMaxMembers or using XML/CSV for large handoffs
- `formatExportLimitMessage(exportType, memberCount, limit): string`
  — returns: `Export "${exportType}" exceeds the configured member limit (X members, limit Y).`
- `assertExportWithinMemberLimit({ memberCount, exportType, limit }): void`
  — throws ExportLimitError if limit > 0 and memberCount > limit
- `assertProjectExportWithinMemberLimit(repos, projectId, exportType, config): void`
  — resolves limit, calls `repos.members.countByProject(projectId)`, then asserts
- `assertDimensionExportWithinMemberLimit(repos, dimensionId, exportType, config): void`
  — resolves limit, calls `repos.members.countByDimension(dimensionId)`, then asserts

### Changes to existing files

**src/server/db/repositories.ts**

Add two count methods to the members repository:
- `countByProject(projectId: string): number`
  — `SELECT COUNT(*) AS count FROM dimension_members m JOIN dimensions d ON d.id = m.dimension_id WHERE d.project_id = ?`
- `countByDimension(dimensionId: string): number`
  — `SELECT COUNT(*) AS count FROM dimension_members WHERE dimension_id = ?`

**src/server/exportGuards.ts**

Add a new export:
- `sendExportLimitError(res: Response, error: unknown): boolean`
  — if `!(error instanceof ExportLimitError)` return false
  — `res.status(error.status).json(error.payload); return true`

**src/server/routes/export.ts**

In every export handler (XML full project, XML single dimension, change-set XML,
environment XML):
1. Call `assertProjectExportWithinMemberLimit` (or `assertDimensionExportWithinMemberLimit`
   for single-dimension paths) BEFORE loading the project snapshot from the DB
2. Wrap in try/catch; call `sendExportLimitError(res, e)` first, then
   `sendExportGuardError(res, e)` as fallback
3. Switch all XML HTTP responses to streaming (pipe or write chunks) instead of
   building the full string in memory before responding

**src/shared/appConfigTypes.ts**

Add to the AppConfig interface if not already present:

```ts
operations?: {
  uploadMaxMb: number;
  exportRetentionDays: number;
  artifactRetentionDays: number;
  corsAllowLocalhostByDefault: boolean;
  exportMaxMembers: number; // 0 = unlimited
  appMode?: 'local' | 'shared' | 'production';
}
```

**src/shared/appConfigDefaults.ts**

Set `operations.exportMaxMembers` default to `100_000`.

**config/dimbuilder.yaml**

Add under `operations`:
```yaml
operations:
  exportMaxMembers: 100000  # set to 0 to disable the limit
```

**.env.example**

Add:
```
EXPORT_MAX_MEMBERS=100000
```

### Tests to write

**src/test/exportLimits.test.ts**

Unit tests for `assertExportWithinMemberLimit`:
- Does not throw when memberCount is under the limit
- Throws ExportLimitError with status 413 when memberCount exceeds limit
- Does not throw when limit is 0 (unlimited)

**src/test/exportLargeHierarchy.test.ts**

Integration tests using a generated large hierarchy:
- Export returns 413 when memberCount > exportMaxMembers
- Export succeeds when exportMaxMembers = 0 (disabled)
- Export succeeds for a normal-sized project

**src/test/helpers/largeHierarchy.ts**

Helper that generates a project with N members spread across dimensions for use
in integration tests. Must not require a running server (use in-process repos).

**src/test/pilotHardening.test.ts**

Smoke tests for the full export pipeline under constrained config:
- Large project blocked correctly with 413
- Normal project exports clean XML
- Error payload includes memberCount, limit, and suggestion fields

### Constraints
- Member count check must happen BEFORE any DB snapshot load (fail fast)
- HTTP status for limit exceeded must be 413 (not 400, not 500)
- Streaming must not break the existing XML format
- All TypeScript must compile with zero errors
- Do not remove or change any existing export guard logic
