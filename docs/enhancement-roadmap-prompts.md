# Enhancement Roadmap Prompts

Use these prompts to start future work with the right context.

## Blueprint Authoring

Prompt:

```text
Add a blueprint authoring UI for config/dimbuilder.yaml. It should let a user manage enabled dimension types, dimension names, root members, seeded members, seeded relationships, and relationship defaults with validation before saving.
```

## Server-Side Export Blocking

Prompt:

```text
Enforce validation export blocking on the server. Export endpoints should refuse export only when the project has registered locked hard-error findings from the shared validation catalog, unless an explicit audited bypass is supplied.
```

## Snapshot Restore

Prompt:

```text
Implement snapshot restore from project_snapshots. Restoring should be transactional, audited, and should either create a new project from the snapshot or overwrite the current project through an explicit confirmation flow.
```

## Authentication And Authorization

Prompt:

```text
Add authentication and project-level authorization. Replace local-admin audit identity with authenticated user identity and document the security model changes.
```

## Database Migrations

Prompt:

```text
Introduce a database migration system for SQLite. Existing schema creation should become an initial migration, and future schema changes should be versioned and tested.
```

## Config Lint Command

Prompt:

```text
Add npm run config:check to load, merge, and validate config/dimbuilder.yaml without starting the server. The command should produce clear errors for invalid blueprint or dimension configuration.
```

## Import Review Workflow

Prompt:

```text
Add an import review step before persisting XLSX-seeded projects. The user should see detected dimensions, warnings, skipped sheets, metadata reference alignment, and validation preview before committing the import.
```

## Export Job Tracking

Prompt:

```text
Use the export_jobs table for export lifecycle tracking. Long-running exports should create a job, update status, capture validation summary, and expose job status through the API.
```

## Production Operations

Prompt:

```text
Create an operations guide and implement health checks for database access, upload directory writeability, export directory writeability, and metadata reference availability.
```

