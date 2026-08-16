# Architecture

The application is a Vite React client backed by an Express API and a runtime-selected SQLite or PostgreSQL database. Shared TypeScript modules hold the domain model, configuration types, validation rules, parsing logic, and exporters.

## Runtime Shape

```text
React client
  -> fetch /api/*
Express server
  -> repositories
SQLite database

or, when `DATABASE_URL` is set:

PostgreSQL database

Shared modules
  -> config validation
  -> dimension schemas
  -> OneStream property dictionary
  -> workbook parser
  -> validation engine
  -> metadata diff engine
  -> bulk update preview engine
  -> release package renderer
  -> XML/XLSX/CSV/JSON exporters
```

## Client Layer

The client lives under `src/client`.

- `App.tsx` loads configuration with `useAppConfig` and renders `AppShell`.
- `components/AppShell.tsx` owns the top command bar, project context, sidebar navigation, modal orchestration, and active workspace routing.
- `components/DimensionWorkspace.tsx` hosts members, relationships, hierarchy, metadata, varying properties, bulk updates, compare, change sets, issues, and XML preview tabs.
- `components/EditableGrid.tsx` handles editable members and relationships.
- `api/client.ts` remains the compatibility barrel for browser API helpers; domain implementations are organized in `api/core.ts`, `auth.ts`, `reports.ts`, `workflows.ts`, and the other domain modules.
- `state/useProjectStore.ts` loads projects, dimensions, summaries, and issues.
- `ui/viewModel.ts` keeps UI derivation logic testable outside React.

## Server Layer

The server lives under `src/server`.

- `index.ts` loads app config, starts Express, and registers graceful shutdown handlers for SIGTERM/SIGINT.
- `app.ts` creates the Express app, repositories, middleware pipeline, and route modules.
- `logger.ts` exports a Pino structured logger (level controlled by `LOG_LEVEL` env var).
- `schemas.ts` defines Zod schemas for request body validation.
- `middleware/authenticate.ts` implements JWT Bearer authentication for local/OIDC strategies; `middleware/basicAuth.ts` remains the legacy `strategy: none` compatibility path.
- `middleware/rateLimiter.ts` provides general (100/min) and heavy-operation (10/min) rate limiters.
- `middleware/requestLogger.ts` logs method, path, status, and duration for every request.
- `middleware/validate.ts` validates request bodies against Zod schemas, returning structured errors on failure.
- `routes/projects.ts` handles project CRUD-adjacent operations, dimension edits, members, relationships, varying properties, bulk updates, baselines, metadata diff runs, change sets, release package creation, and issue listing.
- `routes/import.ts` handles optional workbook seeding (**Seed from file**), XML import, and CSV preview/commit.
- `routes/propertyDefaults.ts` serves project property default catalog rows for the Property Defaults workspace tab.
- `routes/export.ts` handles XML, XLSX, CSV, JSON, and snapshots.
- `routes/validation.ts` runs validation and persists issues.
- `routes/config.ts` returns the client-safe config.
- `projectBlueprints.ts` creates app-authored projects from YAML blueprints.
- `metadataReference.ts` reads existing metadata XML to help align imports.

`registerApiRoutes.ts` mounts core routes unconditionally and gates optional route groups using `modules`. The client applies the same policy in `src/client/ui/moduleNav.ts`; Vitest uses an explicit all-modules configuration for route coverage unless module gating is requested.

### Middleware Pipeline

The Express middleware is applied in this order (`src/server/app.ts`):

1. CORS (configurable origins)
2. JSON body parser (25 MB limit)
3. Request logger (all routes)
4. Health check (`/api/health` — unauthenticated)
5. Conditional authentication (legacy Basic Auth or JWT Bearer, all `/api/*` below health)
6. General rate limiter (all `/api/*`)
7. Heavy-operation rate limiter (`/api/import`, `/api/export`)
8. Route handlers

## Shared Domain Layer

Shared modules live under `src/shared`.

- `types.ts` defines project, dimension, member, relationship, issue, and summary records.
- `appConfigTypes.ts`, `appConfigDefaults.ts`, and `appConfigValidation.ts` define the central configuration contract.
- `dimensionSchemas.ts` describes supported OneStream dimension fields.
- `oneStreamPropertyDictionary.ts` describes versioned OneStream property metadata by dimension type and target level.
- `relationshipDefaults.ts` maps blueprint defaults to relationship properties.
- `workbookParser.ts` parses XLSX workbook sheets into records.
- `metadataDiff.ts` normalizes project state and compares members, relationships, properties, moves, copies, and high-risk warnings.
- `bulkUpdate.ts` previews filtered member and relationship property changes before transactional server apply.
- `releasePackage.ts` renders change set summaries, release notes, manifests, CSV reports, rollback notes, and package mode selection.
- `validationEngine.ts` validates dimensions, members, relationships, and hierarchy health.
- `xmlExport.ts`, `xlsxExport.ts`, and `csvJsonExport.ts` render export formats.

## Persistence

SQLite uses Node's built-in `node:sqlite` through `src/server/db/sqliteClient.ts`; PostgreSQL uses `pg` through `src/server/db/postgresClient.ts`. Both are accessed through `src/server/db/repositories.ts`. Startup applies the base schema, named migrations, and catalog/workflow/security seeds.

The repository layer exposes an async interface over both database clients. `createRepositories().transaction()` wraps SQLite transactions/savepoints or PostgreSQL transactions and rejects async callbacks or thenables where the repository contract requires synchronous completion.

## Data Flow: Blank Project

1. Client opens Create Project modal.
2. `createProject()` posts to `/api/projects`.
3. `routes/projects.ts` calls `createProjectFromBlueprints()`.
4. `projectBlueprints.ts` reads `config.dimensions.displayOrder`, `enabledTypes`, and `blueprints`.
5. Repositories insert project, dimensions, root members, optional blueprint members, optional blueprint relationships, and an audit log.
6. Client refreshes the selected project and renders the seeded dimensions.

## Data Flow: XLSX Seed

1. Client uploads a workbook as multipart form data.
2. `routes/import.ts` optionally parses metadata XML reference data.
3. `workbookParser.ts` maps workbook sheets to dimension schemas.
4. Parsed records are persisted through repositories.
5. Validation runs immediately after import.
6. Import summary and validation count return to the client.

## Data Flow: Bulk Update

1. Client opens the Bulk Update tab for a dimension.
2. `BulkUpdatePanel` posts a request to `/api/projects/:projectId/bulk-updates/preview`.
3. `routes/projects.ts` loads current project state and calls `previewBulkUpdate()`.
4. The user reviews exact old/new values and warnings.
5. Apply posts the same request to `/api/projects/:projectId/bulk-updates/apply`.
6. The server recomputes preview, updates member or relationship rows, writes bulk update job/item records, stores rollback JSON, and records `bulkUpdate.apply` inside one repository transaction.
