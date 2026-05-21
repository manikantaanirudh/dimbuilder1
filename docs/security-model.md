# Security Model

SR Onestream Dim Builder is a local-first workbench with optional production-readiness controls for shared deployment.

## Current Posture

- The server binds to the configured host, defaulting to `127.0.0.1`.
- CORS is configurable via `server.corsOrigins`. When the array is set, only listed origins are allowed; when absent, CORS is open (`src/server/app.ts:25`).
- HTTP Basic Authentication is available via the `auth` config section (`src/server/middleware/basicAuth.ts`). Disabled by default.
- Rate limiting is applied to all API routes (100 req/min) and stricter limits to import/export (10 req/min) via `src/server/middleware/rateLimiter.ts`.
- Route actions use `local-admin` as the user id.
- Uploaded workbook and XML files are written to `paths.uploadsDirectory`.
- Exported files are written to `paths.exportsDirectory`.
- SQLite stores project data locally.
- Request bodies on mutation routes are validated with Zod schemas (`src/server/schemas.ts`, `src/server/middleware/validate.ts`).

## Authentication

Basic Auth is controlled by `config.auth`:

```yaml
auth:
  enabled: true
  username: admin
  password: changeme
```

When enabled, all `/api/*` routes require a valid `Authorization: Basic <base64>` header. The `/api/health` endpoint is exempt and always unauthenticated (`src/server/app.ts:30`).

Invalid or missing credentials return `401` with a `WWW-Authenticate: Basic realm="Dim Builder"` challenge.

## Rate Limiting

Two rate limiters are applied (`src/server/middleware/rateLimiter.ts`):

| Scope | Limit | Window | Applies to |
|-------|-------|--------|-----------|
| General | 100 requests | 60 seconds | All `/api/*` routes |
| Heavy operations | 10 requests | 60 seconds | `/api/import/*`, `/api/export/*` |

Rate limit headers follow the `draft-7` standard. Legacy `X-RateLimit-*` headers are not sent.

In test environments (`NODE_ENV=test` or `VITEST=true`), limits are raised to 10,000 to avoid test flakiness.

## Request Validation

Mutation routes use Zod schemas via `validateBody()` middleware (`src/server/middleware/validate.ts`). Invalid payloads return `400` with structured error details:

```json
{
  "error": "Validation failed",
  "details": [{ "path": "name", "message": "Project name is required" }]
}
```

Defined schemas (`src/server/schemas.ts`):
- `createProjectSchema`: project creation
- `updateProjectSchema`: project rename/update
- `updateConfigSchema`: config PUT body

## Existing Safety Measures

- Config is validated at startup.
- Unknown dimension types and unsupported blueprint fields are rejected.
- Upload handling uses `multer` with the configured upload directory.
- XML output escapes attribute and property values.
- Validation detects XML-invalid control characters.
- Server export routes block file generation when stored validation issues match configured blocking severities.
- Optional export validation bypass is disabled by default and records an audit entry when enabled and used.
- Repository transactions prevent partial blueprint project creation and partial XML import persistence.
- Structured logging via Pino records all requests and errors (`src/server/logger.ts`, `src/server/middleware/requestLogger.ts`).
- Graceful shutdown on SIGTERM/SIGINT closes the HTTP server and database cleanly (`src/server/index.ts:13`).

## Known Gaps

- No CSRF protection.
- No upload file type or size policy beyond middleware defaults.
- No per-user project ownership enforcement.
- No database migration framework.
- No secrets management model.
- Basic Auth credentials are stored in plaintext YAML (use environment overrides or secrets management for production).

## Production Hardening Recommendations

Before shared or production use:

- Enable Basic Auth and change default credentials, or replace with a stronger auth mechanism.
- Add project-level authorization.
- Set `server.corsOrigins` to restrict allowed origins.
- Add CSRF protection or same-site deployment controls.
- Add upload extension, MIME, and size validation.
- Add audit user identity from the authenticated session.
- Keep export bypass disabled in shared environments unless an approval workflow records the reason.
- Add backup and restore procedures for SQLite or move to a managed database.
- Add migration tooling.
