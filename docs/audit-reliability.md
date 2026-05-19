# Audit And Reliability

The app includes lightweight audit and reliability mechanisms suitable for local-first use. Production-grade reliability still needs additional hardening.

## Audit Log

Audit entries are written to `audit_logs` through `repos.audit.record()`.

Current recorded actions include:

- `project.create`
- `project.import`
- `dimension.update`
- `member.create`
- `member.update`
- `member.delete`
- `relationship.create`
- `relationship.update`
- `relationship.delete`
- `snapshot.restore`
- `snapshot.branch`
- `baseline.create`
- `diff.run`
- `changeSet.create`
- `changeSet.validate`
- `changeSet.approve`
- `changeSet.reject`
- `changeSet.package`
- `bulkUpdate.apply`
- `validation.run`
- `export.validationBypass`
- `export.xml`

Audit rows include:

- project id
- user id
- action
- entity type
- entity id
- optional before JSON
- optional after JSON
- created timestamp

## Snapshots

Snapshots are created through:

```text
POST /api/export/:projectId/snapshot
```

The server writes:

- a `project_snapshots` table row
- a JSON file under `paths.exportsDirectory`

Saved snapshots are managed through:

```text
GET /api/projects/:projectId/snapshots
GET /api/projects/:projectId/snapshots/:snapshotId
POST /api/projects/:projectId/snapshots/:snapshotId/restore
POST /api/projects/:projectId/snapshots/:snapshotId/branch
```

Restore creates an automatic safety snapshot before replacing dimensions, members, relationships, and varying property values. Branch creates a new project from the snapshot and remaps internal IDs. Both writes run inside repository transactions and record audit actions.

## Baselines And Diff Runs

Project baselines are created through `POST /api/projects/:projectId/baselines` and stored in `project_baselines`. Diff runs are created through `POST /api/projects/:projectId/diff`, with summaries in `metadata_diff_runs` and line items in `metadata_diff_items`.

Baseline creation and diff execution write audit actions so release-review activity is visible in the local audit trail.

## Change Sets And Release Packages

Change sets are created through `/api/projects/:projectId/change-sets` and stored with copied diff items, approvals, and package records. Package generation writes a local directory under `paths.exportsDirectory/release-packages`.

Lifecycle actions write audit entries so creation, validation, approval, rejection, and package export remain visible in the local audit trail.

## Bulk Updates

Bulk updates are previewed through `POST /api/projects/:projectId/bulk-updates/preview` and applied through `POST /api/projects/:projectId/bulk-updates/apply`.

Apply recomputes preview on the server, writes member or relationship edits, stores `bulk_update_jobs` and `bulk_update_items`, stores rollback JSON, and records `bulkUpdate.apply` in one synchronous repository transaction.

## Transactions

`createRepositories().transaction()` wraps SQLite savepoints.

Important constraints:

- transactions are synchronous only
- async callbacks are rejected
- thenables are rejected
- rollback is attempted if the action throws

Blueprint project creation, bulk update apply, snapshot restore, and snapshot branch creation use this transaction boundary to avoid partially seeded projects or partially applied metadata changes.

## Reliability Boundaries

Current behavior is safe for local development and controlled use, but these gaps remain:

- no database migration/versioning layer
- no baseline, diff, change set, approval, package, or bulk update job retention policy
- no exposed bulk update rollback endpoint yet, even though rollback JSON is stored
- no retry policy for file writes
- no export job lifecycle even though `export_jobs` exists
- no backup automation
- no health checks beyond `/api/health`
- no structured log transport
- no concurrent edit conflict strategy

## Recommended Next Steps

- Add migration tooling before changing schema repeatedly.
- Add backup and restore docs for `data/app.db`.
- Add export job tracking if exports become long-running.
- Add before-state capture for audit updates.
