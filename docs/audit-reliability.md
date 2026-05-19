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
- `validation.run`
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

## Transactions

`createRepositories().transaction()` wraps SQLite savepoints.

Important constraints:

- transactions are synchronous only
- async callbacks are rejected
- thenables are rejected
- rollback is attempted if the action throws

Blueprint project creation uses this transaction boundary to avoid partially seeded projects.

## Reliability Boundaries

Current behavior is safe for local development and controlled use, but these gaps remain:

- no database migration/versioning layer
- no retry policy for file writes
- no export job lifecycle even though `export_jobs` exists
- no backup automation
- no health checks beyond `/api/health`
- no structured log transport
- no concurrent edit conflict strategy

## Recommended Next Steps

- Add migration tooling before changing schema repeatedly.
- Add backup and restore docs for `data/app.db`.
- Add server-side export-blocking enforcement.
- Add snapshot restore.
- Add export job tracking if exports become long-running.
- Add before-state capture for audit updates.

