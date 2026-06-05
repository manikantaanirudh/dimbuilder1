# Pilot Deployment Guide

This guide describes how to run SR OneStream Dim Builder safely for a small internal pilot
(roughly 5-10 users on a trusted network). It is intentionally distinct from full production
readiness: see [production-readiness-checklist.md](production-readiness-checklist.md) for the
broader bar before treating the app as a production service.

For startup safety rules when binding to `0.0.0.0` and Docker Compose defaults, see also
[pilot-deployment.md](pilot-deployment.md).

## 1. Configure environment

1. Copy `.env.example` to `.env` and review every value.
2. If enabling authentication, set `AUTH_ENABLED=true` and a strong `JWT_SECRET`
   (generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`).
   The server logs a warning on startup if the JWT secret is still a default placeholder.
3. Change `ADMIN_PASSWORD` from the default before first run. The seeded admin password is never
   printed to logs.

## 2. Review operations config

In `config/dimbuilder.yaml` under `operations:`:

- `uploadMaxMb` — maximum import upload size (default 50 MB).
- `exportRetentionDays` — generated export files older than this are removed on startup and by the
  cleanup script (default 30; 0 disables).
- `corsAllowLocalhostByDefault` — when no `server.corsOrigins` are set, CORS is restricted to
  localhost origins (default true). Set explicit `server.corsOrigins` for a non-local pilot host.

## 3. Database, migrations, and backups

- The SQLite database runs in WAL mode with a busy timeout (`src/server/db/database.ts`).
- Schema migrations are tracked in the `schema_migrations` table and applied once on startup
  (`src/server/db/migrations.ts`). The baseline schema is recorded as `001_initial_schema`.
- Back up the database with:

  ```powershell
  npm.cmd run db:backup
  ```

  This copies `data/app.db` plus its `-wal`/`-shm` sidecars into `data/backups` with a timestamp.
  Schedule it (Windows Task Scheduler / cron) for regular pilot backups.

## 4. Upload safety

Import endpoints enforce:

- Extension allowlist (`.xlsx`, `.xls`, `.xml`, `.csv`) and MIME checks.
- Size limit from `operations.uploadMaxMb`.
- Temp upload files are removed after each import (success or failure).

## 5. Export retention

Run cleanup on demand or on a schedule:

```powershell
npm.cmd run exports:cleanup
```

It removes export artifacts older than `EXPORT_RETENTION_DAYS` (or the argument provided).

## 6. HTTP hardening

- Security headers are applied via Helmet.
- CORS is localhost-only by default; configure `server.corsOrigins` for a known pilot host.
- Rate limiting is applied to all `/api` routes, with stricter limits on import/export.

## 7. Health monitoring

- `GET /api/health` — liveness + basic DB check (unauthenticated).
- `GET /api/health/deep` — verifies DB read, DB write path, and exports directory writability.
  Returns HTTP 503 if any check fails. Point your monitor at this endpoint for the pilot.

## 8. Logs

Structured logs (Pino) include a request correlation id (`x-request-id`, echoed in responses) and
the authenticated user id when available. Collect logs centrally for the pilot if possible.

## Pilot vs production

This guide makes the app safe enough for a small, trusted pilot. It does NOT make the app a
hardened multi-tenant production service. Project-aware authorization, tested restore drills,
concurrency guarantees, and orchestration health checks remain on the production checklist.
