# SR Onestream Dim Builder

A local-first metadata workbench for building, validating, previewing, and exporting OneStream dimension metadata.

## What It Does

- Create blank OneStream metadata projects from central YAML blueprints
- Import existing OneStream metadata XML as editable project data (round-trip safe)
- Optionally seed projects from a file (`.xlsx` workbook) via **Seed from file**
- Edit dimensions, members, and relationships in a dense workbench UI
- Manage varying property values by cube type, scenario type, and time context
- Validate metadata against configurable rules and a OneStream design-quality profile
- Compare project state against saved baselines
- Build auditable change sets and release packages from diffs
- Bulk-update member and relationship properties with preview, audit, and rollback
- Analyze hierarchies (paths, levels, shared members, orphans)
- Export to OneStream XML, XLSX, CSV, JSON, and snapshots

## Quick Start

```powershell
# Install dependencies
npm install

# Run in development (server + client)
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

The server defaults to `http://127.0.0.1:8787` and Vite to `http://127.0.0.1:5173`.

## Configuration

All application behavior is driven by `config/dimbuilder.yaml`. This includes:

- Application identity and product branding
- Enabled dimension types and display order
- Dimension blueprints (root members, relationship defaults, seeded data)
- Validation severities and OneStream profile rules
- Export modes and validation gates
- UI controls and feature flags
- Authentication and server settings

Environment overrides: `DIMBUILDER_CONFIG_FILE`, `METADATA_DIRECTORY`, `DATABASE_FILE`, `PORT`, `LOG_LEVEL`.

See [docs/configuration-guide.md](docs/configuration-guide.md) for details.

## Architecture

```
React Client (Vite)
  -> fetch /api/*
Express Server (middleware pipeline)
  -> CORS, auth, rate limiting, request logging, Zod validation
  -> route handlers
  -> repositories
SQLite Database

Shared Modules
  -> config, dimension schemas, property dictionary
  -> workbook parser, validation engine, metadata diff
  -> bulk update, release packages, XML/XLSX/CSV/JSON exporters
```

See [docs/architecture.md](docs/architecture.md) for the full breakdown.

## Production Readiness

The app includes optional production-readiness features:

| Feature | Status |
|---------|--------|
| JWT local credentials / OIDC authentication | Available, disabled by default |
| Legacy HTTP Basic Authentication | Compatibility path for enabled `strategy: none` |
| CORS origin restriction | Configurable via `server.corsOrigins` |
| Rate limiting | 100 req/min general, 10 req/min import/export |
| Request body validation | Zod schemas on mutation routes |
| Structured logging | Pino with configurable `LOG_LEVEL` |
| Graceful shutdown | SIGTERM/SIGINT with 10s timeout |
| Docker | Multi-stage Dockerfile included |
| CI | GitHub Actions (type-check, test, build) |
| Coverage | V8 provider, 60% lines / 50% branches thresholds |

See [docs/production-readiness-checklist.md](docs/production-readiness-checklist.md) for deployment readiness.

## Docker

```powershell
docker build -t dimbuilder .
docker run -p 8787:8787 -v dimbuilder-data:/app/data dimbuilder
```

## Testing

```powershell
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With V8 coverage
```

## Documentation

Full documentation lives in [`docs/`](docs/README.md). Validate freshness with:

```powershell
npm run docs:check
```

Key docs:

- [Developer Quickstart](docs/developer-quickstart.md)
- [Configuration Guide](docs/configuration-guide.md)
- [API Reference](docs/api-reference.md)
- [Security Model](docs/security-model.md)
- [Deployment Guide](docs/deployment-guide.md)
- [Testing Strategy](docs/testing-strategy.md)

## License

Private. Internal use only.
