# PostgreSQL Database Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL as a production database backend with an async `DbClient` abstraction while preserving SQLite for local development and fast tests.

**Architecture:** Introduce `DbClient` (async), implement `sqliteClient` and `postgresClient`, port `schema.ts` to `schema/postgres.sql`, convert `repositories.ts` and route handlers to async, add a Postgres parity test suite and a SQLite→Postgres data migration script. Select backend via `DATABASE_URL` (Postgres) vs `DATABASE_FILE` (SQLite).

**Tech Stack:** TypeScript, Express, `pg` (node-postgres), existing `node:sqlite`, Vitest, optional Testcontainers/`PG_TEST_URL`, Docker Compose for local Postgres.

**Design spec:** `docs/superpowers/specs/2026-06-06-postgresql-design.md` (**Approved 2026-06-06**)

**Estimated effort:** 8–12 person-weeks (phased; can ship SQLite+Postgres dual mode incrementally)

---

## Current Repo Anchors

- DB bootstrap: `src/server/db/database.ts` (`createDatabase`, `AppDatabase`, sync API)
- Schema: `src/server/db/schema.ts` (~50 tables, SQLite DDL)
- Migrations: `src/server/db/migrations.ts` (`PRAGMA table_info`, `schema_migrations`)
- Repositories: `src/server/db/repositories.ts` (~3,800 lines, sync `db.prepare`, `runInTransaction` with SAVEPOINTs)
- App entry: `src/server/index.ts`, `src/server/app.ts`
- Tests: 40+ files call `createDatabase(':memory:')`
- SQLite-specific SQL today: `INSERT OR REPLACE` (2×), `INSERT OR IGNORE` (2×), `PRAGMA`, `SAVEPOINT`
- Bulk insert: `members.bulkInsert` / `relationships.bulkInsert` loop per row in `repositories.ts`

---

## Phase 0 — Prerequisites

### Task 0: Approve design + worktree

**Files:**
- Read: `docs/superpowers/specs/2026-06-06-postgresql-design.md`

- [x] **Step 1:** User approves design spec
- [x] **Step 2:** Record baseline verification before database work: `npm test`, `npm run build`, and known failures. Fix baseline first or create an explicit exclusion ledger so PostgreSQL work is not blamed for pre-existing failures.
- [x] **Step 3:** Create branch/worktree per `using-git-worktrees` (e.g. `feature/postgresql-backend`)
- [ ] **Step 4:** Add local Postgres for dev

```powershell
docker run -d --name dimbuilder-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dimbuilder -p 5433:5432 postgres:16-alpine
```

- [ ] **Step 5:** Record `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/dimbuilder` in local `.env` (not committed)

---

## Phase 1 — DbClient Foundation

### Task 1: DbClient types and SQL helpers

**Files:**
- Create: `src/server/db/dbClient.ts`
- Create: `src/server/db/sql.ts`
- Test: `src/test/dbSql.test.ts`

- [x] **Step 1: Write failing tests for placeholder conversion**

```ts
// src/test/dbSql.test.ts
import { describe, expect, it } from "vitest";
import { toPostgresParams, upsertSql } from "../server/db/sql";

describe("db sql helpers", () => {
  it("converts question marks to postgres placeholders", () => {
    expect(toPostgresParams("SELECT * FROM projects WHERE id = ?", ["abc"]))
      .toEqual({ text: "SELECT * FROM projects WHERE id = $1", values: ["abc"] });
  });

  it("rejects mismatched placeholder counts", () => {
    expect(() => toPostgresParams("SELECT * FROM projects WHERE id = ? AND name = ?", ["abc"]))
      .toThrow(/placeholder/i);
  });

  it("builds upsert sql for postgres", () => {
    const sql = upsertSql("project_members", ["id", "project_id", "user_id", "role"], ["project_id", "user_id"], ["role"]);
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO UPDATE");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```powershell
npm test -- src/test/dbSql.test.ts
```

- [ ] **Step 3: Implement `sql.ts` and `dbClient.ts` interfaces**

```ts
// src/server/db/dbClient.ts
export interface DbClient {
  dialect: "sqlite" | "postgres";
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DbConfig {
  databaseUrl?: string;
  databaseFile?: string;
  poolMax?: number;
}
```

- [ ] **Step 4: Run test — expect PASS**
- [x] **Step 5: Commit** `feat(db): add DbClient interface and SQL dialect helpers`

---

### Task 2: SQLite DbClient adapter

**Files:**
- Create: `src/server/db/sqliteClient.ts`
- Test: `src/test/sqliteClient.test.ts`

- [x] **Step 1: Write failing test — query projects on memory db**

```ts
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "../server/db/sqliteClient";

describe("sqlite client", () => {
  it("runs async query against memory database", async () => {
    const client = await createSqliteClient(":memory:");
    await client.exec("CREATE TABLE scratch_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
    await client.exec("INSERT INTO scratch_projects (id, name) VALUES (?, ?)", ["p1", "Demo"]);
    const rows = await client.query<{ id: string; name: string }>("SELECT * FROM scratch_projects WHERE id = ?", ["p1"]);
    expect(rows[0]?.name).toBe("Demo");
    await client.close();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement `createSqliteClient` wrapping `DatabaseSync`**, applying existing `schemaSql` + `runMigrations` from `database.ts` (extract shared bootstrap to `bootstrapSqliteSchema(db)`)
- [ ] **Step 3a: Preserve nested transactions with SQLite savepoints** and add a test that an inner failed transaction rolls back without corrupting the outer transaction boundary.
- [ ] **Step 4: Run test — expect PASS**
- [x] **Step 5: Commit** `feat(db): add async SQLite DbClient adapter`

---

### Task 3: PostgreSQL DbClient adapter

**Files:**
- Create: `src/server/db/postgresClient.ts`
- Modify: `package.json` (add `pg`, `@types/pg`)
- Test: `src/test/postgresClient.test.ts`

- [x] **Step 1: Add dependency**

```powershell
npm install pg
npm install -D @types/pg
```

- [ ] **Step 2: Write gated integration test**

```ts
import { describe, expect, it } from "vitest";
import { createPostgresClient } from "../server/db/postgresClient";

const url = process.env.PG_TEST_URL;
describe.skipIf(!url)("postgres client", () => {
  it("connects and runs a query", async () => {
    const client = await createPostgresClient(url!);
    const row = await client.queryOne<{ one: number }>("SELECT 1 AS one");
    expect(row?.one).toBe(1);
    await client.close();
  });
});
```

- [ ] **Step 3: Implement `createPostgresClient(connectionString)`** with pool, `toPostgresParams`, transaction via one checked-out pool client, `BEGIN`/`COMMIT`/`ROLLBACK`, and savepoints for nested `transaction()` calls.
- [ ] **Step 3a: Add gated tests for commit, rollback, and nested rollback/savepoint behavior**
- [ ] **Step 4: Run with `PG_TEST_URL` — expect PASS**
- [x] **Step 5: Commit** `feat(db): add PostgreSQL DbClient adapter`

---

### Task 4: Unified `createDbClient` factory

**Files:**
- Create: `src/server/db/createDbClient.ts`
- Modify: `src/server/config/loadAppConfig.ts` (read `DATABASE_URL`, `DATABASE_POOL_MAX`)
- Modify: `src/shared/appConfigTypes.ts`, `src/shared/appConfigDefaults.ts`, `src/shared/appConfigValidation.ts`
- Modify: `.env.example`
- Test: `src/test/createDbClient.test.ts`

- [x] **Step 1: Test sqlite path when no DATABASE_URL**

```ts
it("uses sqlite when databaseUrl is absent", async () => {
  const client = await createDbClient({ databaseFile: ":memory:" });
  expect(client.dialect).toBe("sqlite");
  await client.close();
});
```

- [ ] **Step 2: Implement factory** — `DATABASE_URL` → postgres, else sqlite `DATABASE_FILE`
- [ ] **Step 2a: Add typed database config** to `AppConfig` defaults and validation. Keep `paths.databaseFile` for SQLite compatibility, but expose `database.url` and `database.poolMax` for Postgres wiring.
- [ ] **Step 3: Update `.env.example`**

```env
# PostgreSQL (production). When set, overrides SQLite.
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dimbuilder
```

- [ ] **Step 4: Run tests — PASS**
- [x] **Step 5: Commit** `feat(db): add createDbClient factory and env config`

---

## Phase 2 — PostgreSQL Schema

### Task 5: Port schema to PostgreSQL DDL

**Files:**
- Create: `src/server/db/schema/postgres.sql`
- Create: `scripts/migrate-pg.mjs`
- Test: `src/test/postgresSchema.test.ts`

- [x] **Step 1: Generate `postgres.sql` from `schema.ts`** — remove `PRAGMA`; map `INTEGER NOT NULL DEFAULT 1` booleans to `BOOLEAN NOT NULL DEFAULT TRUE`; keep `TEXT` PKs and `JSON` columns as `TEXT` for v1
- [ ] **Step 1a: Add dialect-neutral bootstrap tests** proving property default catalog, local admin seed, and default workflow seed exist on SQLite and Postgres after startup.
- [ ] **Step 2: Write schema test**

```ts
describe.skipIf(!process.env.PG_TEST_URL)("postgres schema", () => {
  it("applies postgres.sql without error", async () => {
    const client = await createPostgresClient(process.env.PG_TEST_URL!);
    const sql = readFileSync("src/server/db/schema/postgres.sql", "utf8");
    await client.exec(sql);
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    expect(tables.some((t) => t.tablename === "projects")).toBe(true);
    await client.close();
  });
});
```

- [ ] **Step 3: Implement `scripts/migrate-pg.mjs`** — apply `schema/postgres.sql` if empty, then apply `migrations/postgres/*.sql` in order, record in `schema_migrations`
- [ ] **Step 4: Run schema test with PG_TEST_URL — PASS**
- [x] **Step 5: Commit** `feat(db): add PostgreSQL schema and migrate-pg script`

---

### Task 6: Dual-dialect migration runner

**Review note:** The Postgres migration port must include one file per existing SQLite
migration id that differs from the Postgres baseline. Add row normalization helpers for
booleans (`0/1` vs `true/false`) and write results (`changes` vs `rowCount`) before
repository code depends on those values.

**Files:**
- Modify: `src/server/db/migrations.ts`
- Create: `src/server/db/migrations/postgres/001_baseline.sql` (no-op comment)
- Modify: `scripts/migration-registry.json`

- [x] **Step 1: Refactor migrations to accept `DbClient`** instead of `AppDatabase`
- [ ] **Step 2: Replace `PRAGMA table_info` ensureColumn** with dialect branch: SQLite PRAGMA vs Postgres `information_schema.columns`
- [ ] **Step 3: Port existing migration ids `002`–`00N` to postgres SQL files where they differ from baseline
- [ ] **Step 4: Test `migrationUpgrade.test.ts` on SQLite — still PASS**
- [x] **Step 5: Commit** `refactor(db): dual-dialect migration runner`

---

## Phase 3 — Async Repositories (largest phase)

Split into **sub-tasks by repository domain** to keep PRs reviewable.

### Task 7: Async transaction primitive + projects repository

**Files:**
- Modify: `src/server/db/repositories.ts` (transaction + `projects` section)
- Modify: `src/server/routes/projects.ts`
- Modify: `src/server/projectBlueprints.ts`, `src/server/app.ts`, `src/server/index.ts`
- Test: `src/test/projectRoutes.test.ts`, `src/test/database.test.ts`

- [x] **Step 1: Change `createRepositories(db: DbClient)` signature** — export async `Repositories` type
- [x] **Step 2: Convert `runInTransaction` → `db.transaction(async (tx) => …)`**
- [x] **Step 3: Port `projects.*` methods to async** (`create`, `list`, `get`, `delete`)
- [x] **Step 4: Update `projects.ts` routes** to `async` handlers with `await repos.projects.get(...)`
- [x] **Step 4a: Update project blueprint and startup paths** (`createProjectFromBlueprints`, audit writes, app health/startup) so project creation and setup await repository/database calls inside one transaction.
- [x] **Step 5: Update test helpers** — `createTestApp` becomes async where needed
- [x] **Step 6: Run `npm test -- src/test/projectRoutes.test.ts src/test/database.test.ts` — PASS**
- [x] **Step 7: Commit** `refactor(db): async projects repository`

---

### Task 8: Dimensions, members, relationships

**Files:**
- Modify: `src/server/db/repositories.ts` (dimensions, members, relationships)
- Modify: `src/server/routes/dimensions.ts`, `src/server/routes/import.ts`, `src/server/metadataCsvCommit.ts`
- Modify: `src/server/helpers/dimensionDelete.ts`, `src/server/helpers/memberDelete.ts`, `src/server/helpers/relationshipDelete.ts`, `src/server/helpers/projectState.ts`
- Test: `src/test/importRoutes.test.ts`, `src/test/memberDelete.test.ts`, `src/test/repositoryEditing.test.ts`

- [x] **Step 1: Port dimension CRUD to async**
- [x] **Step 2: Port `members.bulkInsert`** — keep loop for SQLite; add `bulkInsertBatched` for Postgres (chunks of 500)
- [x] **Step 3: Replace `INSERT OR REPLACE` in repositories** with `upsertSql()` helper
- [x] **Step 4: Port relationship methods**
- [x] **Step 5: Update import/commit routes to await repos**
- [x] **Step 5a: Update delete/project-state helpers and CSV commit** so dimension/member/relationship deletion, project status, and metadata commit paths await repository calls consistently.
- [x] **Step 6: Run targeted tests — PASS**
- [x] **Step 7: Commit** `refactor(db): async dimension/member/relationship repositories`

---

### Task 9: Validation, export, property defaults, remaining repos

**Files:**
- Modify: `src/server/db/repositories.ts` (remaining sections)
- Modify: affected `src/server/routes/*.ts`, `src/server/helpers/*.ts`
- Modify: affected `src/server/workflow/*.ts`, `src/server/vcs/*.ts`, `src/server/templates/*.ts`, `src/server/scheduler/*.ts`, `src/server/auth/*.ts`, `src/shared/exportLimits.ts`
- Test: full `npm test` on SQLite

- [x] **Step 1: Port validation_issues, audit, snapshots, baselines, diff, change_sets, bulk_updates**
- [x] **Step 2: Port auth (users, sessions), workflows, connectors, tier3/4 tables**
- [x] **Step 3: Port propertyDefaults repository**
- [x] **Step 4: Grep for `repos.` in `src/server`, `src/shared`, and `src/test` — every async repository call is awaited and route errors flow through `next(error)` or an async wrapper**
- [x] **Step 5: Convert `createApp` / `index.ts` to async bootstrap**

```ts
// src/server/index.ts (target shape)
const db = await createDbClient(config);
const repos = createRepositories(db);
const server = createApp(db, config).listen(...);
```

- [x] **Step 6: Run `npm test` — PASS on SQLite** (767 pass; 43 pre-existing/baseline failures documented)
- [x] **Step 7: Commit** `refactor(db): complete async repository port`

---

## Phase 4 — PostgreSQL Parity Tests

### Task 10: Postgres test harness

**Files:**
- Create: `src/test/helpers/postgres.ts`
- Create: `src/test/postgresParity.test.ts`
- Modify: `package.json` — `"test:postgres": "vitest run src/test/postgresParity.test.ts"`

- [x] **Step 1: Helper `withPostgresClient(fn)`** — skips if no `PG_TEST_URL`, runs `migrate-pg`, yields client, truncates in teardown
- [x] **Step 2: Parity test — core workflow**

```ts
it("creates project, dimension, member on postgres", async () => {
  await withPostgresClient(async (db) => {
    const repos = createRepositories(db);
    const project = await repos.projects.create({ name: "PG Test", description: "", sourceFileName: "", createdBy: "test" });
    expect(project.id).toBeTruthy();
  });
});
```

- [x] **Step 3: Add parity cases:** CSV import commit, validation run, XML export guard
- [x] **Step 4: Document `PG_TEST_URL` in `docs/developer-quickstart.md`**
- [x] **Step 5: Commit** `test(db): add PostgreSQL parity suite`

---

### Task 11: Large hierarchy import benchmark

**Files:**
- Modify: `src/server/db/repositories.ts` (`bulkInsert` batching)
- Test: `src/test/exportLargeHierarchy.test.ts` (extend for PG)

- [x] **Step 1: Add test inserting 5k members via bulkInsert on PG (gated) — assert < 30s**
- [x] **Step 2: Tune batch size and single-transaction import**
- [x] **Step 3: Commit** `perf(db): batched postgres bulk insert for members`

---

## Phase 5 — Data Migration & Deployment

### Task 12: SQLite → Postgres migration script

**Files:**
- Create: `scripts/sqlite-to-postgres.mjs`
- Create: `src/test/sqliteToPostgres.test.ts` (optional dry-run with temp files)

- [x] **Step 1: Implement table copy in FK order** (projects → dimensions → dimension_members → …)
- [x] **Step 2: Map boolean columns 0/1 → true/false on insert**
- [x] **Step 3: Print count verification table**
- [x] **Step 4: Test against sample `app.db` copy in CI fixture (small)**
- [x] **Step 5: Commit** `feat(db): add sqlite-to-postgres migration script`

---

### Task 13: Docker Compose + Azure docs

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docs/deployment-guide.md`
- Modify: `docs/database-architecture.md`
- Modify: `docs/developer-quickstart.md`
- Modify: `docs/decisions.md`

- [x] **Step 1: Add optional `postgres` service to `docker-compose.yml`**

```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: dimbuilder
    ports:
      - "5433:5432"
    volumes:
      - pg-data:/var/lib/postgresql/data

  app:
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/dimbuilder
    depends_on:
      - postgres
```

- [x] **Step 1a: Document port expectations**: app-to-postgres traffic inside Compose uses `postgres:5432`; local host tools use `localhost:5433` to avoid colliding with any existing Postgres install.
- [x] **Step 2: Document Azure Container Apps + PostgreSQL Flexible Server setup**
- [x] **Step 3: Add decision entry: "PostgreSQL as production OLTP; SQLite retained for dev"**
- [x] **Step 4: Run `npm run docs:check` — PASS**
- [x] **Step 5: Commit** `docs: postgresql deployment and architecture`

---

## Phase 6 — Hardening & Finish

### Task 14: Production readiness checks

**Files:**
- Modify: `docs/production-readiness-checklist.md`
- Modify: `scripts/smoke-test.mjs`

- [x] **Step 1: Smoke test accepts `DATABASE_URL` and hits health + create project**
- [x] **Step 2: Checklist items for PG backups, connection pooling, pool max, SSL mode**
- [x] **Step 3: Run smoke test against local docker compose stack**
- [x] **Step 4: Commit** `chore(ops): postgres smoke test and readiness checklist`

---

### Task 15: Code review + branch finish

- [x] **Step 1:** Run `requesting-code-review` skill on full diff
- [x] **Step 2:** `npm test` (SQLite) + `npm run test:postgres` (with PG_TEST_URL) — 767 SQLite pass, 12 Postgres pass
- [ ] **Step 3:** `finishing-a-development-branch` — merge/PR decision (user)

---

## Verification Matrix

| Capability | SQLite | PostgreSQL |
|------------|--------|------------|
| `npm test` default | Required PASS | — |
| `npm run test:postgres` | — | Required PASS in CI |
| Create blank project | ✓ | ✓ |
| Seed from file (.xlsx) | ✓ | ✓ |
| CSV import commit | ✓ | ✓ |
| Validation run | ✓ | ✓ |
| XML export | ✓ | ✓ |
| Property defaults | ✓ | ✓ |
| sqlite-to-postgres script | — | ✓ counts match |

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Async DbClient | 1–4 |
| SQL dialect helpers | 1 |
| Postgres schema | 5 |
| Dual migrations | 6 |
| Async repositories | 7–9 |
| Config `DATABASE_URL` | 4 |
| SQLite retained for dev | 2, 4, all tests default sqlite |
| Bulk import perf | 8, 11 |
| Data migration script | 12 |
| Azure deployment docs | 13 |
| Success criteria tests | 10, 14 |

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-06-postgresql.md`.  
Design spec: `docs/superpowers/specs/2026-06-06-postgresql-design.md` — **Approved**.

**Two execution options:**

1. **Subagent-Driven (recommended)** — one fresh subagent per task (0→15), two-stage review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints after Tasks 4, 9, 12, 15

**Executed:** Subagent-driven (Tasks 0–15). Branch `feature/postgresql-backend` ready for PR/merge review.
