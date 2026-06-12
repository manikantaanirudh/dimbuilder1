# Developer Quickstart

## Requirements

- Node.js 22 or compatible.
- npm.
- Windows PowerShell commands are used in this repo's current workflow.

## Install

```powershell
npm.cmd install
```

## Run In Development

```powershell
npm.cmd run dev
```

The server defaults to `127.0.0.1:8787` and Vite defaults to `127.0.0.1:5173`, both configured in `config/dimbuilder.yaml`.

## Test

```powershell
npm.cmd test
```

Run focused tests by passing paths:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

### PostgreSQL parity tests

Start a local Postgres instance (Docker Compose or standalone):

```powershell
docker compose up -d postgres
```

Host tools connect on port **5433** (mapped from container `5432`):

```powershell
$env:PG_TEST_URL = "postgresql://postgres:postgres@127.0.0.1:5433/dimbuilder"
npm.cmd run test:postgres
```

`PG_TEST_URL` is optional. Tests that require Postgres skip automatically when it is unset. Use the same URL pattern for `DATABASE_URL` when running the API against Postgres locally.

Apply PostgreSQL schema migrations manually when needed:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5433/dimbuilder"
node scripts/migrate-pg.mjs
```

### Watch Mode

```powershell
npm.cmd run test:watch
```

### Coverage

```powershell
npm.cmd run test:coverage
```

Coverage uses `@vitest/coverage-v8` with thresholds of 60% lines and 50% branches. Configuration is in `vitest.config.ts`.

## Build

```powershell
npm.cmd run build
```

The build command runs TypeScript and then Vite.

## Documentation Check

```powershell
npm.cmd run docs:check
```

Run this after source changes. If a source change affects behavior, APIs, configuration, persistence, exports, validation, or the UI workflow, update the relevant docs in `docs/` and the docs-maintainer skill if the maintenance rule itself changes.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Run server + Vite client concurrently in watch mode |
| `server` | Run server only in watch mode |
| `build` | TypeScript compile + Vite production build |
| `test` | Run Vitest once |
| `test:postgres` | Run PostgreSQL parity and schema tests (requires `PG_TEST_URL`) |
| `test:watch` | Run Vitest in watch mode |
| `test:coverage` | Run Vitest with V8 coverage |
| `docs:check` | Validate documentation freshness |
| `preview` | Vite production preview server |
| `benchmark` | Run autoresearch benchmark |

## Runtime Configuration

Default configuration file:

```text
config/dimbuilder.yaml
```

Supported environment overrides:

- `DIMBUILDER_CONFIG_FILE`: alternate YAML configuration file.
- `METADATA_DIRECTORY`: overrides `paths.metadataDirectory`.
- `DATABASE_URL`: PostgreSQL connection string; selects Postgres when set.
- `DATABASE_FILE`: SQLite path when `DATABASE_URL` is unset.
- `DATABASE_POOL_MAX`: optional PostgreSQL pool size (default `10`).
- `PG_TEST_URL`: connection string for optional Postgres parity tests (typically `localhost:5433` with Docker Compose).
- `PORT`: overrides `server.port`.
- `LOG_LEVEL`: controls Pino log verbosity (default `info`).

## Useful Paths

- `src/client`: React app.
- `src/server`: Express API, middleware, and database access.
- `src/server/middleware`: auth, rate limiting, request logging, Zod validation.
- `src/shared`: shared domain logic.
- `src/test`: Vitest tests.
- `config/dimbuilder.yaml`: central app and dimension configuration.
- `metadata`: optional metadata XML reference files.
- `data/uploads`: uploaded workbook storage.
- `data/exports`: generated export files.

