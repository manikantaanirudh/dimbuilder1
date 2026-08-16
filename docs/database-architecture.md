# Database Architecture

The app supports two OLTP backends selected at runtime:

| Backend | Client | Selection |
|---------|--------|-----------|
| SQLite (default) | Node.js `node:sqlite` `DatabaseSync` via `src/server/db/sqliteClient.ts` | `DATABASE_FILE` when `DATABASE_URL` is unset |
| PostgreSQL | `pg` via `src/server/db/postgresClient.ts` | `DATABASE_URL` set (takes precedence) |

Use SQLite for local development and the default Vitest suite. Use PostgreSQL for shared pilots, Docker Compose stacks, and production deployments. Both backends share one repository layer in `src/server/db/repositories.ts`; SQLite adapts its synchronous driver to the same async-facing interface.

## Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://postgres:postgres@localhost:5433/dimbuilder`. When set, the app ignores `DATABASE_FILE` for persistence. |
| `DATABASE_FILE` | SQLite file path (default `data/app.db`). Used only when `DATABASE_URL` is unset. |
| `DATABASE_POOL_MAX` | Optional PostgreSQL pool size (default `10`). |

Schema creation for SQLite lives in `src/server/db/schema.ts`. PostgreSQL DDL lives in `src/server/db/schema/postgres.sql`. Legacy SQLite bootstrap also lives in `src/server/db/database.ts`.

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

`metadata_json` stores source details such as blueprint metadata, metadata reference alignment, OneStream version, source sheet names, and XML-import unknown dimension data under `__unknownXml`.

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

`properties_json` can contain XML-import unknown member attributes, unknown property nodes, and unsupported elements under `__unknownXml`.

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
- `operation`
- `operation_source`
- `operation_notes`
- `row_order`
- `source_row_number`

Relationship defaults are materialized into both typed columns and `properties_json` where supported.

`properties_json` can contain XML-import unknown relationship attributes, unknown property nodes, and unsupported elements under `__unknownXml`.

`operation`, `operation_source`, and `operation_notes` are optional planning metadata for relationship load modes. They support add/update/delete/move/copy/break/rebuild planning without forcing route handlers to embed operation state in ad hoc JSON.

### `varying_property_values`

Default and contextual OneStream property values for dimensions, members, and relationships.

Key columns:

- `project_id`
- `dimension_id`
- `target_type`
- `target_id`
- `property_name`
- `value`
- `cube_type`
- `scenario_type`
- `time_member`
- `is_default`
- `source`
- `metadata_json`

`target_type` is `dimension`, `member`, or `relationship`. Blank context columns represent all cube/scenario/time contexts. A unique index prevents duplicate rows for the same project, target, property, and context combination. Repository helpers in `src/server/db/repositories.ts` expose list, target-list, upsert, update, delete, replace-for-target, and effective-value behavior.

### `validation_issues`

Latest validation results for a project.

Issues are replaced as a set when validation runs.
Export guards read these rows through repository helpers to count blocking severities before any export renderer runs.

### `export_jobs`

Reserved for export job tracking. Current export endpoints mostly stream directly and do not rely on this table.

### `audit_logs`

Append-only action log for project creation, imports, edits, validation, and exports.

### `project_snapshots`

Named JSON snapshots of full project state.

Key columns:

- `project_id`
- `name`
- `description`
- `snapshot_json`
- `created_by`
- `created_at`

`snapshot_json` stores project, dimensions, members, relationships, varying property values, and optional validation issues. `repos.snapshots.restoreSnapshotIntoProject()` creates a safety snapshot, deletes current metadata, reinserts snapshot records, and updates the project timestamp inside one repository transaction. `repos.snapshots.createProjectFromSnapshot()` creates a new project and remaps dimension, member, relationship, and varying-property target IDs so the branch does not collide with the source project.

### `project_baselines`

Normalized metadata baselines used for compare/diff workflows.

Key columns:

- `project_id`
- `name`
- `source_type`
- `source_file_name`
- `baseline_json`
- `created_by`
- `created_at`

`source_type` is `xml`, `snapshot`, `json`, or `manual`. `baseline_json` stores the comparable state produced by `src/shared/metadataDiff.ts`, so future diff runs are stable even if the current project keeps changing.

### `metadata_diff_runs`

Persisted executions of a baseline comparison.

Key columns:

- `project_id`
- `baseline_id`
- `status`
- `summary_json`
- `created_by`
- `created_at`

`summary_json` stores member, relationship, property, severity, and change-type counts returned by the shared diff engine.

### `metadata_diff_items`

Line-level diff records for one run.

Key columns:

- `diff_run_id`
- `dimension_type`
- `dimension_name`
- `target_type`
- `change_type`
- `severity`
- `object_key`
- `parent_key`
- `child_key`
- `property_name`
- `old_value`
- `new_value`
- `details_json`

Rows can represent member adds/updates/deletes, relationship adds/deletes/moves/copies, property updates, and warnings.

### `change_sets`

Named release-control records created from diff runs.

Key columns:

- `project_id`
- `baseline_id`
- `diff_run_id`
- `name`
- `description`
- `status`
- `target_environment`
- `created_by`
- `created_at`
- `updated_at`

`status` is one of `draft`, `validated`, `approved`, `exported`, or `rejected`. `baseline_id` and `diff_run_id` are nullable so manually assembled change sets can be supported later.

### `change_set_items`

Copied diff items scoped to one change set.

Key columns:

- `change_set_id`
- `diff_item_id`
- `item_type`
- `change_type`
- `severity`
- `dimension_type`
- `object_key`
- `property_name`
- `old_value`
- `new_value`
- `details_json`

The rows are copied from `metadata_diff_items` so a release can be reviewed and packaged even if later diff runs are created.

### `change_set_approvals`

Approval, rejection, and comment events for one change set.

Key columns:

- `change_set_id`
- `action`
- `comment`
- `created_by`
- `created_at`

`action` is `approve`, `reject`, or `comment`.

### `release_packages`

Records for generated release package directories.

Key columns:

- `change_set_id`
- `package_name`
- `package_path`
- `manifest_json`
- `created_by`
- `created_at`

The first implementation creates a directory under `paths.exportsDirectory/release-packages` rather than a zip archive.

### `bulk_update_jobs`

Auditable bulk-update executions for member and relationship property changes.

Key columns:

- `project_id`
- `target_type`
- `operation`
- `request_json`
- `summary_json`
- `rollback_json`
- `status`
- `created_by`
- `created_at`

`request_json` stores the filter and operation request used for the server-side apply. `summary_json` stores affected/skipped/warning counts. `rollback_json` stores target id, property name, old value, and new value for every applied item so a future rollback endpoint can restore changed values.

### `bulk_update_items`

Item-level results for a bulk update job.

Key columns:

- `job_id`
- `target_id`
- `target_key`
- `property_name`
- `old_value`
- `new_value`
- `status`
- `message`

Rows preserve the exact preview values that were applied. The apply route writes these rows in the same synchronous repository transaction as member or relationship updates.

### `users`, `roles`, `user_roles`, and sessions

The `users` table stores local and OIDC identities and system roles. Startup seeds a `local-admin` system row for unauthenticated local mode; when JWT/OIDC authentication is enabled, registered or provisioned users and refresh sessions are persisted in the user/session tables. Passwords are stored as bcrypt hashes and refresh tokens are stored as hashes, not plaintext.

### `schema_migrations`

Named migration IDs and application timestamps are recorded here. SQLite applies the TypeScript migration registry through `runMigrationsSync`; PostgreSQL applies the shared registry plus SQL files in `src/server/db/migrations/postgres/`. Current named migrations cover relationship operation columns, validation waivers, XML-derived property default profiles, project default overrides, and the property default catalog.

### Project Query workbench tables

`project_query_sessions` and `project_query_entries` keep private 90-day query history. `project_query_entry_rows` stores immutable typed result rows for pagination and export. `validation_snapshots` records project version and validation results, including zero-issue runs, so Project Query can distinguish current, stale, and missing evidence. `project_query_playbook_runs` and `project_query_playbook_steps` store versioned diagnostic progress and result snapshots. `project_query_templates` stores private parameterized commands. All tables exist in SQLite and PostgreSQL migrations, use ownership indexes, and cascade dependent records.

## Referential Behavior

Project-owned records use `ON DELETE CASCADE` so deleting a project removes dimensions, members, relationships, varying property values, issues, audit logs, snapshots, baselines, diff runs/items, change sets, related release records, and bulk update jobs/items.

### `property_default_catalog`

Built-in default property catalog seeded from `config/builtInPropertyDefaults.json` on database startup through `src/server/db/seedPropertyDefaultCatalog.ts`.

### `property_default_profiles` and `property_default_values`

Project-scoped profiles created from analyzed OneStream XML uploads. `property_default_values` stores inferred defaults per dimension type, target level, and property name with confidence metadata.

### `property_default_overrides`

Project-level overrides that adjust effective defaults without replacing the entire profile.

Property default resolution for export and validation is implemented in `src/shared/propertyDefaultResolver.ts` and `src/shared/effectiveProperties.ts`.

## Repository Rules

- Use repository methods instead of direct SQL in route handlers.
- Repository methods and `repos.transaction()` are async for both dialects.
- Use `repos.transaction()` when a workflow inserts multiple related records.

## Indexes

Indexes support common lookups:

- dimensions by project and sort order
- members by dimension and row order
- members by dimension and key
- relationships by dimension and row order
- relationships by parent-child pair
- varying properties by project, dimension, target, property name, and unique target/property/context
- issues by project and severity
- baselines by project and created time
- diff runs by project/baseline and created time
- diff items by run and change/target type
- change sets by project and diff run
- change set items, approvals, and release packages by owning change set
- bulk update jobs by project, target type, operation, and created time
- bulk update items by job and target/property

## Schema Evolution

`src/server/db/database.ts` applies the idempotent SQLite base schema on startup, runs additive `evolveSchema()` helpers, records named migrations from `src/server/db/migrations.ts`, and seeds the property-default catalog and default workflow/security rows. PostgreSQL uses `src/server/db/schema/postgres.sql` plus the PostgreSQL migration files and records the same migration IDs. Migration `002_relationship_operation_columns` adds relationship operation metadata columns when missing from older local databases; later migrations add waivers and property-default tables/catalog data.
