# Pilot Deployment Guide

SR Onestream Dim Builder is a **local-first consultant workbench**. Use this guide for shared pilot hosting; keep day-to-day modeling on localhost when possible.

## Deployment modes

| Mode | Host | Auth | Typical use |
|------|------|------|-------------|
| Local dev | `127.0.0.1` | Off (default) | Consultant laptop |
| Shared pilot | `0.0.0.0` | On + strong secrets | Small team server |
| Docker pilot | `0.0.0.0` in container | On (compose default) | VM / container host |

The server **refuses to start** when binding to a non-localhost address without authentication, placeholder JWT secrets, or default admin credentials on first bootstrap. See `src/server/startupSafety.ts`.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (Vite) with API on `http://127.0.0.1:8787`.

## Shared pilot (process)

1. Copy `.env.example` to `.env`.
2. Set:
   - `HOST=0.0.0.0`
   - `AUTH_ENABLED=true`
   - `JWT_SECRET` — 32+ random bytes
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — non-default values
3. Set `server.corsOrigins` in `config/dimbuilder.yaml` to your front-end origin(s).
4. Build and run:

```bash
npm run build
npm start
```

5. Verify:

```bash
curl http://127.0.0.1:8787/api/health
SMOKE_TEST_EMAIL=you@example.com SMOKE_TEST_PASSWORD=secret node scripts/smoke-test.mjs http://127.0.0.1:8787
```

## Docker pilot

1. Create `.env` with `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
2. `docker compose up --build`
3. Health check hits `http://127.0.0.1:8787/api/health` inside the container.

Compose defaults: `AUTH_ENABLED=true`, published port `8787`, persistent volume `app-data` for SQLite.

## Operations

| Task | Command |
|------|---------|
| List applied migrations | `npm run db:migrate` |
| Pending migrations | `node scripts/migrate.mjs --pending` |
| Backup SQLite | `npm run db:backup` |
| Clean old exports | `npm run exports:cleanup` |
| Smoke test | `npm run smoke-test` |

Optional `operations.artifactRetentionDays` in config removes old baselines and metadata diff runs on startup (0 = disabled).

## Security checklist

- [ ] Auth enabled for non-localhost binds
- [ ] Strong `JWT_SECRET` in environment (not YAML placeholder)
- [ ] Non-default admin password on first run
- [ ] CORS origins restricted for pilot URL
- [ ] Export validation bypass disabled unless approved
- [ ] Database and `data/` directory backed up

## Optional platform modules

Experimental features are off by default in `config/dimbuilder.yaml` under `modules:`. Enable only when a pilot explicitly needs them. The UI hides Chat / Smart Insights when `chatAssistant` is false.
