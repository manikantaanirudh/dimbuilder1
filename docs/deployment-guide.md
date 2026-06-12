# Deployment Guide

The app is designed as a local-first TypeScript application with Docker support for shared or production deployment.

## Build

```powershell
npm.cmd run build
```

The build runs:

1. `tsc -p tsconfig.json`
2. `vite build`

## Development Server

```powershell
npm.cmd run dev
```

This runs:

- `tsx watch src/server/index.ts`
- `vite --host 127.0.0.1`

## Docker

A multi-stage Dockerfile is provided for production deployment.

### Build the image

```powershell
docker build -t dimbuilder .
```

### Run with Docker Compose (PostgreSQL)

`docker-compose.yml` runs the app with PostgreSQL 16:

```powershell
docker compose up --build
```

The stack includes:

- `postgres` — `postgres:16-alpine`, published as `localhost:5433` → container `5432`
- `app` — API on port `8787`, `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/dimbuilder`

**Port expectations:**

- **Inside Compose:** the app connects to `postgres:5432`.
- **On the host:** use `localhost:5433` for `psql`, `PG_TEST_URL`, `scripts/migrate-pg.mjs`, and other local tools so you do not collide with a system Postgres on `5432`.

Copy `.env.example` to `.env` and set `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` before shared deployment.

### Run a single SQLite container

```powershell
docker run -p 8787:8787 -v dimbuilder-data:/app/data dimbuilder
```

The Dockerfile:
1. Builds the app in a `node:22-alpine` builder stage.
2. Copies built artifacts and source into a production stage with only production dependencies.
3. Creates writable `data/uploads` and `data/exports` directories.
4. Exposes port 8787 and runs with `tsx`.

Mount a volume at `/app/data` to persist the SQLite database, uploads, and exports across container restarts.

To override configuration, mount a custom YAML file:

```powershell
docker run -p 8787:8787 -v ./my-config.yaml:/app/config/dimbuilder.yaml dimbuilder
```

## Azure Container Apps + PostgreSQL Flexible Server

Reference production stack (documented; not automated in v1):

1. **Container image** — build from the repo `Dockerfile` and push to Azure Container Registry.
2. **Azure Database for PostgreSQL Flexible Server** — create a database named `dimbuilder`, enable TLS, and restrict firewall rules to the Container Apps environment.
3. **Connection string** — store in Azure Key Vault as `DATABASE_URL`, for example:
   `postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/dimbuilder?sslmode=require`
4. **Container Apps** — deploy the image with:
   - `DATABASE_URL` from Key Vault secret reference
   - `JWT_SECRET` from Key Vault
   - `AUTH_ENABLED=true`
   - `HOST=0.0.0.0`
   - Azure Files mount for `/app/data/uploads` and `/app/data/exports` (PostgreSQL holds OLTP data; file shares hold uploads and exports)
5. **Migrations** — run `node scripts/migrate-pg.mjs` against the target `DATABASE_URL` before or during rollout.
6. **Smoke test** — after deploy, run `node scripts/smoke-test.mjs https://<your-app-url>` (set `SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` when auth is enabled).

Review `DATABASE_POOL_MAX` and SSL mode (`sslmode=require` for Azure) in the production readiness checklist before go-live.

## CI Pipeline

GitHub Actions CI (`.github/workflows/ci.yml`) runs on push and PR to `main`:

1. Checks out the repository.
2. Sets up Node.js 22 with npm cache.
3. Installs dependencies (`npm ci`).
4. Runs type checking (`npx tsc --noEmit`).
5. Runs tests (`npm test`).
6. Builds the application (`npm run build`).

## Runtime Config

Default config:

```text
config/dimbuilder.yaml
```

Environment overrides:

- `DIMBUILDER_CONFIG_FILE`
- `METADATA_DIRECTORY`
- `DATABASE_URL`: PostgreSQL connection string (selects Postgres backend)
- `DATABASE_FILE`: SQLite path when `DATABASE_URL` is unset
- `DATABASE_POOL_MAX`: optional PostgreSQL pool size (default `10`)
- `PORT`
- `LOG_LEVEL`: controls Pino log verbosity (default `info`).

## Runtime Data

Important writable paths:

- `data/app.db`
- `data/uploads`
- `data/exports`

Important optional input path:

- `metadata`

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals (`src/server/index.ts:13`):

1. Stops accepting new connections.
2. Closes the HTTP server.
3. Closes the SQLite database.
4. Exits cleanly.

If graceful shutdown does not complete within 10 seconds, the process force-exits with code 1.

## Local Deployment Notes

For local use:

- Keep host bound to `127.0.0.1`.
- Keep database and exports under the project `data` directory.
- Back up `data/app.db` before schema changes or major edits.
- Keep `config/dimbuilder.yaml` under source control if it represents the canonical app blueprint.

## Shared Deployment Notes

Before shared deployment:

- Enable Basic Auth (`auth.enabled: true`) and change default credentials.
- Set `server.corsOrigins` to restrict allowed origins.
- Add upload controls.
- Add database backup and migration process.
- Move static client serving behind a configured production server.
- Use PostgreSQL (`DATABASE_URL`) for shared or production deployments; keep SQLite for single-user local use.

## Operational Smoke Test

After deployment:

1. Load `/api/health` (unauthenticated).
2. Load `/api/config` (requires auth if enabled).
3. Open the UI.
4. Create a blank metadata project.
5. Add a member and relationship.
6. Run validation.
7. Export XML.
8. Run `npm.cmd run docs:check` in the source workspace before handoff.

