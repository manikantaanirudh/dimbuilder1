# PostgreSQL Database Backend — Design Spec

**Status:** Approved (2026-06-06)  
**Date:** 2026-06-06  
**Authors:** dimbuilder delivery team

## Problem

SR Onestream Dim Builder persists all application state in a **single SQLite file** (`data/app.db`) through a **synchronous** `AppDatabase` wrapper (`node:sqlite` `DatabaseSync`) and a monolithic `repositories.ts` (~3,800 lines, ~100 prepared statements).

This works for local/solo use but limits:

- **Concurrent writers** (multi-consultant pilot/production)
- **Horizontal scaling** (multiple app instances behind a load balancer)
- **Managed backups / HA** expected for Azure or shared deployment
- **Large hierarchy imports** (100k+ rows) under write contention

## Goal

Add **PostgreSQL** as a first-class production database while **keeping SQLite** for fast local development and the majority of unit tests until parity is proven.

## Non-Goals (v1)

- Removing SQLite support in the first release
- Rewriting on Drizzle/Prisma/Kysely (stay on raw SQL + repository pattern)
- Storing uploads/exports in Postgres (files remain on disk/blob)
- Snowflake-native tables as the OLTP store
- Multi-tenant row-level isolation beyond existing project ACL

## Recommended Architecture

### 1. Async database client abstraction

Introduce `DbClient` with **async** methods:

```ts
interface DbClient {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

Implementations:

| Driver | File | When used |
|--------|------|-----------|
| SQLite | `src/server/db/sqliteClient.ts` | `DATABASE_FILE` set, no `DATABASE_URL` |
| PostgreSQL | `src/server/db/postgresClient.ts` | `DATABASE_URL` set |

SQLite adapter wraps existing sync `DatabaseSync` and returns Promises (`Promise.resolve`) so route handlers and repositories share one async call style.

PostgreSQL adapter uses `pg` `Pool` with parameterized queries (`$1`, `$2`, ...).
Transactions must run on one checked-out pool client for the full callback. Nested
repository transactions must use savepoints in both dialects because the current
repository API already supports nested `repos.transaction()` calls.

### 2. SQL dialect helper

Create `src/server/db/sql.ts`:

- `toPostgresParams(sql, params)` — converts repository-authored `?` placeholders to `$1...$n` for Postgres, with parameter-count validation
- `upsert(table, columns, conflictTarget, updateColumns)` — `INSERT OR REPLACE` → `ON CONFLICT … DO UPDATE`
- `insertIgnore(table, columns, conflictTarget)` — `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`
- `booleanValue(v: boolean)` — `1/0` for SQLite, `true/false` for Postgres

Repositories call helpers instead of embedding dialect-specific SQL inline where possible.
Do not run arbitrary SQL files or SQL containing literal `?` characters through the
placeholder converter.

### 3. Schema strategy

| Artifact | Purpose |
|----------|---------|
| `src/server/db/schema.ts` | Existing SQLite bootstrap (`schemaSql`) — unchanged for dev |
| `src/server/db/schema/postgres.sql` | Full PostgreSQL DDL (port of current tables/indexes/FKs) |
| `src/server/db/migrations/postgres/` | Numbered `.sql` files applied by `scripts/migrate-pg.mjs` |
| `schema_migrations` table | Shared migration ledger (dialect-neutral ids) |

Type mapping (initial, minimal change):

- `TEXT` primary keys and ISO timestamps → `TEXT` (or `TIMESTAMPTZ` in a later cleanup)
- `INTEGER` boolean flags (`is_active`, `enabled`) → `BOOLEAN` in Postgres, keep `0/1` in SQLite
- `REAL` → `DOUBLE PRECISION`
- JSON in `*_json` columns → `TEXT` initially (optional `JSONB` later)

Startup bootstrap must be dialect-neutral: schema/migrations, property default catalog,
security seed user, and default workflow seed must all run on both SQLite and Postgres.
Repository row mappers should normalize booleans and write-result metadata so route code
does not care whether the driver returned `0/1` or `true/false`.

### 4. Repository layer

**Phase 1:** Change `createRepositories(db: DbClient)` so every method is `async` and returns Promises.

**Phase 2:** Replace `runInTransaction` savepoints with `client.transaction(async (tx) => …)` — real `BEGIN`/`COMMIT` on Postgres.

**Phase 3:** Optimize `members.bulkInsert` / `relationships.bulkInsert` for Postgres using batched multi-row `INSERT` (chunk size 500–1000); keep loop insert for SQLite v1.

`repositories.ts` remains one file for v1 (match existing convention); split only if a task becomes unreviewable.

The async conversion affects more than Express routes. Server helpers, workflow engines,
VCS/template/scheduler modules, auth/OIDC code, shared export guard helpers, and test
fixtures call repositories synchronously today. These call sites must be inventoried and
ported with the repository methods they consume.

### 5. Application wiring

- `src/server/index.ts` — `await createDbClient(config)` before `createApp`
- `src/server/app.ts` — accept `DbClient`, pass to `createRepositories`
- Express routes — convert handlers that touch repos to `async` + `try/catch` + `next(error)` (pattern already used in some routes)
- `createApp()` for tests — `await createDbClient({ dialect: 'sqlite', filename: ':memory:' })`

### 6. Configuration

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dimbuilder` — selects Postgres |
| `DATABASE_FILE` | SQLite path (default `data/app.db`) when `DATABASE_URL` unset |
| `DATABASE_POOL_MAX` | Optional pool size (default 10) |

Add typed config support (`AppConfig`, defaults, validation, and environment overrides),
then update `.env.example`, `config/dimbuilder.yaml` paths section comment, and
`docs/deployment-guide.md`.

### 7. Testing strategy

| Layer | SQLite | PostgreSQL |
|-------|--------|------------|
| Unit / most integration | `:memory:` (fast, default) | — |
| Postgres parity suite | — | `PG_TEST_URL` or Testcontainers in CI |
| E2E workflow | optional both | `src/test/e2eCoreWorkflow.test.ts` on PG in CI nightly |

Add `npm run test:postgres` gated on `PG_TEST_URL`.

### 8. Data migration (SQLite → Postgres)

`scripts/sqlite-to-postgres.mjs`:

1. Open source SQLite `data/app.db`
2. Connect to target `DATABASE_URL`
3. Truncate target (or fresh DB)
4. Copy tables in FK order (projects → dimensions → members → …)
5. Verify row counts per table
6. Exit non-zero on mismatch

One-time operator tool; not run on every app startup.

### 9. Deployment target (Azure)

Production reference stack (documented, not coded in v1):

- Azure Container Apps or App Service (Docker image)
- Azure Database for PostgreSQL Flexible Server
- Azure Key Vault for `DATABASE_URL` and `JWT_SECRET`
- Azure Files mount for `/app/data/uploads` and `/app/data/exports`

SPCS remains SQLite-on-block-volume; Postgres migration is **Azure-agnostic** and benefits any hosted deployment.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Large async refactor breaks routes | Port repos + routes in batches; CI on every task |
| Subtle SQL dialect bugs | Postgres parity test suite; grep for `INSERT OR`, `PRAGMA`, `SAVEPOINT` |
| Slow 180k-row import on PG | Batched inserts + single transaction per dimension |
| Dual-schema drift | Single migration id registry; port new migrations to both dialects in same PR |
| Test runtime regression | Default `npm test` stays SQLite; PG suite optional/CI |

## Success Criteria

- [ ] Pre-migration baseline is documented: existing build/test failures are fixed or explicitly excluded before PostgreSQL refactor work starts
- [ ] App starts with `DATABASE_URL` and serves `/api/health`
- [ ] Core workflow passes on Postgres: create project → import CSV → validate → export XML
- [ ] `npm test` green on SQLite (no regression)
- [ ] Postgres parity suite green when `PG_TEST_URL` set
- [ ] `scripts/sqlite-to-postgres.mjs` migrates a real pilot `app.db` with matching counts
- [ ] Docs updated: `database-architecture.md`, `deployment-guide.md`, `developer-quickstart.md`, `decisions.md`

## Approval

Approve this spec to proceed with `docs/superpowers/plans/2026-06-06-postgresql.md`.
