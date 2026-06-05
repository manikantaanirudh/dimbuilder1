# Migration Authoring

SQLite schema changes use a **baseline + migrations** model.

## Rules

1. **`src/server/db/schema.ts`** — Defines the shape for **new** databases (`CREATE TABLE IF NOT EXISTS`).
2. **`src/server/db/migrations.ts`** — Defines **upgrade steps** for existing databases. Each migration runs once and is recorded in `schema_migrations`.
3. **Never** use ad-hoc `ALTER TABLE` in `database.ts` at startup. Add a numbered migration instead.
4. **Keep `scripts/migration-registry.json` in sync** when adding migrations so `node scripts/migrate.mjs --pending` works without TypeScript.

## Adding a migration

1. Add a new entry to the `migrations` array in `migrations.ts` with a unique id (e.g. `003_example`).
2. Implement `up(db)` idempotently (`PRAGMA table_info` + `ALTER TABLE` only when a column is missing).
3. Mirror the new columns/tables in `schema.ts` for fresh installs.
4. Append the same id and description to `scripts/migration-registry.json`.
5. Add a test that applies the migration against a minimal legacy schema (see `src/test/migrationUpgrade.test.ts`).

## Rollback policy

SQLite cannot drop columns without a table rebuild. **Down migrations are not automated.** To roll back:

1. Restore from `npm run db:backup` before the upgrade, or
2. Manually rebuild affected tables (consult DBA / implementation team).

Document breaking migrations in release notes.

## Operator commands

```bash
node scripts/migrate.mjs --list
node scripts/migrate.mjs --pending
npx tsx scripts/migrate.mjs --pending --from-source
```

Migrations also run automatically on application startup via `createDatabase()`.
