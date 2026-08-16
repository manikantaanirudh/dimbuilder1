# Security Model

SR Onestream Dim Builder is a local-first workbench with optional production-readiness controls for shared deployment.

## Current Posture

- The server binds to the configured host, defaulting to `127.0.0.1`.
- CORS is configurable via `server.corsOrigins`. When the array is set, only listed origins are allowed; when absent, CORS is open (`src/server/app.ts:25`).
- JWT-based multi-user authentication with local credentials and OIDC SSO (`src/server/auth/`, `src/server/middleware/authenticate.ts`). Disabled by default for backward compatibility.
- Role-based access control with four system roles and project-level permissions (`src/server/middleware/authorize.ts`).
- Rate limiting is applied to all API routes (100 req/min), stricter limits to import/export (10 req/min), and login attempts (5/email/min).
- Uploaded workbook and XML files are written to `paths.uploadsDirectory`.
- Exported files are written to `paths.exportsDirectory`.
- SQLite stores project data locally.
- Request bodies on mutation routes are validated with Zod schemas (`src/server/schemas.ts`, `src/server/middleware/validate.ts`).

## Authentication

Authentication is controlled by `config.auth`:

```yaml
auth:
  enabled: true
  strategy: local
  jwt:
    secret: "<random-secret>"
    accessTokenExpiry: 15m
    refreshTokenExpiry: 7d
  defaultRole: author
  allowSelfRegistration: false
```

When `auth.enabled` is false or `strategy` is `none`, the app operates in unauthenticated local mode and the middleware assigns a synthetic system/admin identity. With `strategy: local` or `strategy: oidc`, API routes below `/api` require a Bearer access token. `/api/health` and the auth status/login/registration endpoints have their own public behavior.

### Authentication Strategies

**Local credentials (email/password):**
- Users register with email and password via `POST /api/auth/register`
- The first registered user is automatically assigned the `admin` role
- Subsequent registration requires `selfRegistration: true` or an admin invite
- Passwords are hashed with bcrypt (12 salt rounds) before storage
- Login via `POST /api/auth/login` returns an access token and refresh token

**OIDC / SSO (Azure AD, Okta, any OpenID Connect provider):**
- When `auth.strategy` is `oidc` and `auth.oidc` is configured, the server exposes `GET /api/auth/oidc/authorize` to initiate the OIDC flow
- Callback at `GET /api/auth/oidc/callback` validates the ID token and creates or links the user
- OIDC users are auto-provisioned on first login with the `viewer` role
- Provider metadata is discovered from the `issuerUrl` (`.well-known/openid-configuration`)

### Token Lifecycle

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access token (JWT) | 15 minutes | Client memory only |
| Refresh token (signed JWT) | 7 days | Bcrypt hash in `user_sessions` table |

- Access tokens are signed with HS256 using `JWT_SECRET` when set, otherwise `auth.jwt.secret`
- Refresh tokens are verified against both their JWT signature/expiry and the stored bcrypt session hash
- `POST /api/auth/refresh` returns a new access token given a valid refresh token; the current implementation does not rotate the refresh token
- `POST /api/auth/logout` deletes the session server-side, invalidating the refresh token

### Password Requirements and Hashing

- Minimum 8 characters (enforced by Zod schema on registration)
- Hashed with bcrypt, cost factor 12
- Plaintext passwords are never stored or logged

### Login Rate Limiting

Login attempts are rate-limited to prevent brute-force attacks:

| Scope | Limit | Window |
|-------|-------|--------|
| Per email address | 5 failed attempts | 60 seconds |

Exceeding the limit returns `429 Too Many Requests`. The counter resets after the window expires. Successful logins do not count against the limit.

### Session Management

- Each login creates a session record in `user_sessions` with the hashed refresh token
- Sessions are scoped to a user and can be revoked individually or en masse
- Logout invalidates the specific session (refresh token family)
- Expired sessions are cleaned up on refresh attempts

## Rate Limiting

Two rate limiters are applied (`src/server/middleware/rateLimiter.ts`):

| Scope | Limit | Window | Applies to |
|-------|-------|--------|-----------|
| General | 100 requests | 60 seconds | All `/api/*` routes |
| Heavy operations | 10 requests | 60 seconds | `/api/import/*`, `/api/export/*` |

Rate limit headers follow the `draft-7` standard. Legacy `X-RateLimit-*` headers are not sent.

In test environments (`NODE_ENV=test` or `VITEST=true`), limits are raised to 10,000 to avoid test flakiness.

## Role-Based Access Control (RBAC)

When auth is enabled, every user is assigned a system role. Routes are protected by the `authorize(...permissions)` middleware which checks the authenticated user's role against the required permissions.

### System Roles

| Role | Description |
|------|-------------|
| `admin` | Full system access, user management, config changes |
| `author` | Create and edit projects, import/export |
| `reviewer` | Read projects, run validation, approve change sets |
| `viewer` | Read-only access to projects and exports |

### Permission Matrix

| Permission | admin | author | reviewer | viewer |
|-----------|:-----:|:------:|:--------:|:------:|
| `users.list` | x | | | |
| `users.manage` | x | | | |
| `projects.create` | x | x | | |
| `projects.read` | x | x | x | x |
| `projects.update` | x | x | | |
| `projects.delete` | x | | | |
| `dimensions.write` | x | x | | |
| `export.run` | x | x | | |
| `import.run` | x | x | | |
| `validation.run` | x | x | x | |
| `changeset.approve` | x | | x | |
| `config.read` | x | x | x | x |
| `config.write` | x | | | |
| `admin.panel` | x | | | |

### Project-Level Permissions

Projects support granular permission grants beyond system roles:

| Project Role | Capabilities |
|-------------|-------------|
| `owner` | Full control, can manage project permissions |
| `editor` | Read/write access to project data |
| `reviewer` | Read access, can approve change sets |
| `viewer` | Read-only access |

Project permissions are stored in the `project_permissions` table and checked by the authorize middleware when a `projectId` route parameter is present.

### Legacy Basic Auth Compatibility

When `auth.enabled` is true, `auth.strategy` is `none`, and legacy `auth.username` is configured, the app applies HTTP Basic Auth to API routes below `/api`. This is a compatibility path implemented by `src/server/middleware/basicAuth.ts`; it is not the primary local/OIDC authentication flow. When auth is disabled, no credentials are required and the synthetic system/admin identity is used.

### Startup Safety

`src/server/startupSafety.ts` rejects unsafe shared or production startup configurations:

- non-localhost binding without authentication;
- shared/production `appMode` without authentication;
- placeholder JWT secrets on non-localhost/shared/production deployments;
- first-admin bootstrap with missing or default credentials.

Experimental platform modules are also forced off in shared and production modes unless `UNSAFE_ALLOW_EXPERIMENTAL=true` is explicitly supplied.

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
- Upload validation is limited to the configured multipart handling and application checks; deployment-specific file type policy remains an operational concern.
- Secret management is external to the repository; use environment variables or a deployment secret store for `JWT_SECRET`, OIDC client secrets, and admin bootstrap credentials.

## Production Hardening Recommendations

Before shared or production use:

- Enable auth (`auth.enabled: true`) with `strategy: local` or `strategy: oidc`, and configure a strong JWT secret (32+ random bytes).
- Configure OIDC for enterprise SSO rather than relying solely on local credentials.
- Set `server.corsOrigins` to restrict allowed origins.
- Add CSRF protection or same-site deployment controls.
- Add upload extension, MIME, and size validation.
- Keep export bypass disabled in shared environments unless an approval workflow records the reason.
- Add backup and restore procedures for SQLite or move to a managed database.
- Add migration tooling.
- Store `JWT_SECRET`, OIDC client secrets, and admin bootstrap credentials via environment or deployment secret management rather than plaintext YAML.
