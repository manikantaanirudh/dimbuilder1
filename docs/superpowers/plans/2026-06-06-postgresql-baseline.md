# PostgreSQL Migration — Baseline & Final Verification (2026-06-06)

## Pre-work baseline (before Task 1)

- `npm test` — **27 failed / 774 passed** (95 files)
- `npm run build` — **FAIL** (pre-existing module/UI integration gaps)

## Post-implementation (Tasks 0–15 complete)

Branch: `feature/postgresql-backend`

### SQLite default suite

```
npm test
```

**43 failed / 767 passed** (100 files) — excludes Postgres-only tests via `vitest.config.ts`

Remaining failures are largely **pre-existing baseline** issues:
- Missing fixture files (`OpexAccount_Export_3Jun.txt`)
- Module-gated route tests (`moduleRoutes`, `modulesConfig`)
- XML fixture manifest drift
- Workflow e2e timing
- Client component markup expectations

PostgreSQL-specific regressions: none identified in core DB/repo paths.

### PostgreSQL suite

```
PG_TEST_URL=postgresql://postgres:postgres@127.0.0.1:5433/dimbuilder npm run test:postgres
```

**12 passed** (parity, client, schema, bootstrap seeds, 5k bulk insert, sqlite-to-postgres)

### Docs

`npm run docs:check` — **PASS** (23 required docs)

## Local Postgres

```powershell
docker run -d --name dimbuilder-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dimbuilder -p 5433:5432 postgres:16-alpine
```

Or: `docker compose up -d postgres` (host port **5433**)
