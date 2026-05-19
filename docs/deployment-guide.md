# Deployment Guide

The current app is designed as a local-first TypeScript application. Deployment requires deciding whether it remains a local tool or becomes a shared web service.

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

## Runtime Data

Important writable paths:

- `data/app.db`
- `data/uploads`
- `data/exports`

Important optional input path:

- `metadata`

## Local Deployment Notes

For local use:

- Keep host bound to `127.0.0.1`.
- Keep database and exports under the project `data` directory.
- Back up `data/app.db` before schema changes or major edits.
- Keep `config/dimbuilder.yaml` under source control if it represents the canonical app blueprint.

## Shared Deployment Notes

Before shared deployment:

- Add authentication and authorization.
- Restrict CORS.
- Add upload controls.
- Add database backup and migration process.
- Move static client serving behind a configured production server.
- Decide whether SQLite is acceptable or a managed database is required.
- Add server-side validation export blocking.

## Operational Smoke Test

After deployment:

1. Load `/api/health`.
2. Load `/api/config`.
3. Open the UI.
4. Create a blank metadata project.
5. Add a member and relationship.
6. Run validation.
7. Export XML.
8. Run `npm.cmd run docs:check` in the source workspace before handoff.

