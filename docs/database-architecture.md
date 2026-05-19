# Database Architecture

The app uses SQLite through `better-sqlite3`. Schema creation lives in `src/server/db/schema.ts`, database creation lives in `src/server/db/database.ts`, and all access should go through `src/server/db/repositories.ts`.

## Tables

### `projects`

Top-level workspaces.

Key columns:

- `id`
- `name`
- `description`
- `source_file_name`
- `created_by`
- `created_at`
- `updated_at`

Blank blueprint-created projects use an empty `source_file_name`.

### `dimensions`

OneStream dimensions inside a project.

Key columns:

- `project_id`
- `sheet_name`
- `dimension_type`
- `dimension_name`
- `description`
- `access_group`
- `maintenance_group`
- `inherited_dimension`
- `sort_order`
- `metadata_json`

`metadata_json` stores source details such as blueprint metadata, metadata reference alignment, OneStream version, and source sheet names.

### `dimension_members`

Members inside one dimension.

Key columns:

- `dimension_id`
- `member_key`
- `description`
- `properties_json`
- `row_order`
- `source_row_number`
- `is_active`

Deletes are soft deletes through `is_active = 0`.

### `dimension_relationships`

Parent-child relationships inside one dimension.

Key columns:

- `dimension_id`
- `parent_key`
- `child_key`
- `aggregation_weight`
- `percent_consol`
- `percent_ownership`
- `ownership_type`
- `properties_json`
- `row_order`
- `source_row_number`

Relationship defaults are materialized into both typed columns and `properties_json` where supported.

### `validation_issues`

Latest validation results for a project.

Issues are replaced as a set when validation runs.

### `export_jobs`

Reserved for export job tracking. Current export endpoints mostly stream directly and do not rely on this table.

### `audit_logs`

Append-only action log for project creation, imports, edits, validation, and exports.

### `project_snapshots`

Named JSON snapshots of full project state.

### `users`, `roles`, `user_roles`

Reserved identity and role tables. The current app uses `local-admin` rather than full authentication.

## Referential Behavior

Project-owned records use `ON DELETE CASCADE` so deleting a project removes dimensions, members, relationships, issues, audit logs, and snapshots.

## Repository Rules

- Use repository methods instead of direct SQL in route handlers.
- Keep repository transactions synchronous.
- Use `repos.transaction()` when a workflow inserts multiple related records.
- Do not pass async callbacks into `repos.transaction()`. It rejects async functions and thenables.

## Indexes

Indexes support common lookups:

- dimensions by project and sort order
- members by dimension and row order
- members by dimension and key
- relationships by dimension and row order
- relationships by parent-child pair
- issues by project and severity

