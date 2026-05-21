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

### Run the container

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
- `DATABASE_FILE`
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
- Decide whether SQLite is acceptable or a managed database is required.

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

