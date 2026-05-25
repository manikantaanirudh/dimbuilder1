# Security Model — Current State Assessment

**Project:** SR Onestream Dim Builder  
**Date:** 2026-05-25  
**Reviewer:** Enterprise Application Security Review  

---

## Executive Summary

The application has a **complete security framework implemented** covering authentication (JWT + OIDC), authorization (RBAC + project ACL), rate limiting, and audit logging. However, **authentication is disabled by default** in the shipping configuration, the JWT secret is a placeholder, and there are no security headers (Helmet). The application is **safe for localhost use today** and can be made network-safe with configuration changes.

---

## 1. Authentication

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| Auth middleware exists | **Implemented** | `src/server/middleware/authenticate.ts:15-59` | — |
| Multiple strategies | **Implemented** | `none`, `local`, `oidc` — `src/shared/appConfigTypes.ts:33` | — |
| Auth enabled by default | **No — disabled** | `config/dimbuilder.yaml:23` (`enabled: false`) | **HIGH** if exposed to network |
| Bypass when disabled | **By design** | `authenticate.ts:16-28` — assigns `admin` role to all requests | Expected for local dev |

**Strategies available:**
- **none** — No auth, all requests get admin identity (current default)
- **local** — Email/password with JWT tokens
- **oidc** — OpenID Connect with PKCE (Entra ID, Okta, etc.)
- **basic** — Legacy HTTP Basic Auth (fallback when strategy=none with credentials set)

**Finding:** When `auth.enabled: false`, every request is treated as admin. This is intentional for single-developer localhost use but must be changed before any network deployment.

---

## 2. JWT Token System

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| Access token signing | **Implemented** | `src/server/auth/tokens.ts:16-22` (jsonwebtoken) | — |
| Refresh token signing | **Implemented** | `src/server/auth/tokens.ts:24-29` | — |
| Token verification | **Implemented** | `src/server/auth/tokens.ts:32-38` | — |
| Refresh token verification | **Implemented** | `src/server/auth/tokens.ts:40-44` | — |
| Expiry configured | **Implemented** | Access: 15m, Refresh: 7d — `config/dimbuilder.yaml:27-28` | — |
| Session stored server-side | **Implemented** | Refresh token hash stored in `sessions` table — `src/server/routes/auth.ts:160-171` | — |
| Session invalidation on logout | **Implemented** | `src/server/routes/auth.ts:244-257` | — |
| JWT secret is safe | **NOT SAFE** | Default: `"change-me-in-production"` — `config/dimbuilder.yaml:26` | **CRITICAL** if auth enabled without override |
| JWT secret env override | **Implemented** | `process.env.JWT_SECRET` — `src/server/middleware/authenticate.ts:31`, `src/server/config/loadAppConfig.ts:38` | — |

**Finding:** JWT infrastructure is fully functional. The default secret is a known-insecure placeholder. Production deployments MUST set `JWT_SECRET` environment variable.

---

## 3. OIDC / SSO

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| OIDC discovery | **Implemented** | `src/server/auth/oidcStrategy.ts:36-41` (openid-client v6) | — |
| PKCE (S256) | **Implemented** | `oidcStrategy.ts:46-47` — code_verifier + code_challenge | — |
| State parameter | **Implemented** | `oidcStrategy.ts:48-53` — stored in memory with 10min TTL | — |
| Token exchange | **Implemented** | `oidcStrategy.ts:85-92` — authorizationCodeGrant | — |
| UserInfo fetch | **Implemented** | `oidcStrategy.ts:99-103` | — |
| User provisioning (JIT) | **Implemented** | `oidcStrategy.ts:110-128` — find-or-create user | — |
| JWT issued after OIDC | **Implemented** | `oidcStrategy.ts:137-147` — app JWT issued from OIDC claims | — |
| OIDC config structure | **Implemented** | `src/shared/appConfigTypes.ts:39-45` | — |
| Lazy initialization | **Implemented** | `src/server/routes/auth.ts:324-328` | — |
| State flow cleanup | **Implemented** | 10-minute TTL, `oidcStrategy.ts:15-19` | — |

**Finding:** OIDC/SSO is production-ready. Uses PKCE (recommended for SPA/BFF patterns), proper state validation, and secure token exchange. State is in-memory (not clusterable, but acceptable for single-instance).

---

## 4. RBAC (Role-Based Access Control)

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| System roles defined | **Implemented** | `admin`, `author`, `reviewer`, `viewer` — `src/shared/authTypes.ts:1` | — |
| Permission matrix | **Implemented** | 14 permissions mapped to 4 roles — `authTypes.ts:23-42` | — |
| requirePermission middleware | **Implemented** | `src/server/middleware/authorize.ts:8-19` | — |
| requireRole middleware | **Implemented** | `authorize.ts:22-32` | — |
| Role enforcement on routes | **Implemented** | `src/server/app.ts:66` (users=admin), `:76-79` (environments, connectors, sync) | — |
| Default role for new users | **Implemented** | `config/dimbuilder.yaml:29` (`author`) | — |

**Permission Matrix:**

| Permission | admin | author | reviewer | viewer |
|-----------|-------|--------|----------|--------|
| projects.create | ✓ | ✓ | — | — |
| projects.delete | ✓ | ✓ | — | — |
| projects.edit | ✓ | ✓ | — | — |
| projects.view | ✓ | ✓ | ✓ | ✓ |
| members.edit | ✓ | ✓ | — | — |
| relationships.edit | ✓ | ✓ | — | — |
| validation.run | ✓ | ✓ | ✓ | ✓ |
| export.xml | ✓ | ✓ | ✓ | — |
| export.all | ✓ | ✓ | — | — |
| changeSets.approve | ✓ | — | ✓ | — |
| changeSets.reject | ✓ | — | ✓ | — |
| deploy | ✓ | — | — | — |
| users.manage | ✓ | — | — | — |
| config.manage | ✓ | — | — | — |

**Finding:** RBAC is well-designed with least-privilege principle. Admin-only routes are protected in app.ts wiring. Some routes (projects, imports, exports) rely on general auth but don't enforce per-operation permissions at the route level — the permission matrix exists but isn't uniformly applied to every endpoint.

---

## 5. Project-Level Permissions

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| Project roles defined | **Implemented** | `viewer`, `editor`, `manager`, `owner` — `src/server/acl/projectACL.ts:19-26` | — |
| requireProjectRole middleware | **Implemented** | `projectACL.ts:32-57` | — |
| Role hierarchy | **Implemented** | Numeric hierarchy 1-4, checks `>=` minimum — `projectACL.ts:21-26` | — |
| List/add/remove members | **Implemented** | REST endpoints at `projectACL.ts:62-129` | — |
| Owner-only management | **Implemented** | Only owners can add/remove members — `projectACL.ts:90-91, 112-113` | — |
| Backwards compatibility | **Implemented** | If no ACL entries exist, all authenticated users have full access — `projectACL.ts:43` | — |
| DB schema | **Implemented** | `project_permissions` table — `src/server/db/schema.ts:261-269` | — |

**Finding:** Project ACL is implemented but the `requireProjectRole` middleware is not visibly applied to main project routes in `app.ts`. The router is mounted but enforcement may be opt-in per route rather than blanket. The backwards-compatible "no ACL = full access" policy is appropriate during transition but should be documented for operators.

---

## 6. Rate Limiting

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| General API rate limit | **Implemented** | 100 req/min/IP — `src/server/middleware/rateLimiter.ts:6-12` | — |
| Heavy operation limit | **Implemented** | 10 req/min/IP (import/export) — `rateLimiter.ts:14-21` | — |
| Applied in app.ts | **Implemented** | `src/server/app.ts:61-63` | — |
| Login brute-force protection | **Implemented** | 5 attempts/min/email — `src/server/routes/auth.ts:37-113` | — |
| Standard headers | **Implemented** | `draft-7` standard rate limit headers — `rateLimiter.ts:9` | — |
| Test bypass | **Implemented** | 10,000 limit in test mode — `rateLimiter.ts:8` | — |

**Finding:** Rate limiting is well-configured. The in-memory approach works for single-instance deployments. Would need Redis-backed store for multi-instance scaling.

---

## 7. Audit Logs Tied to User Identity

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| Audit log table | **Implemented** | `audit_logs` + `audit_log` tables — `src/server/db/schema.ts:105, 865` | — |
| User ID in audit records | **Partial** | `req.user?.id ?? "system"` pattern used — multiple files | **MEDIUM** — fallback to "system" when auth disabled |
| Actions recorded | **Implemented** | import, export, CRUD on projects/members/relationships — 25+ audit calls found | — |
| IP address captured | **Implemented** | `ipAddress` field in audit_log table — `schema.ts:876` | — |
| Indexed for querying | **Implemented** | Indexes on project_id+timestamp, user_id+timestamp — `schema.ts:889-890` | — |

**Finding:** Audit logging is comprehensive for data operations. When auth is disabled, user_id falls back to "system" or "local-admin", which means audit logs cannot distinguish between users in unauthenticated mode. When auth is enabled, real user IDs are tracked.

---

## 8. Upload Protection

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| Multer configured | **Implemented** | `src/server/routes/import.ts:13` | — |
| File type validation | **NOT IMPLEMENTED** | No `fileFilter`, no mimetype check, no extension validation | **MEDIUM** |
| File size limit | **NOT IMPLEMENTED** | No `limits` option on multer — relies on express json limit (25MB) | **MEDIUM** |
| Upload directory | **Implemented** | `data/uploads/` — configurable via `config.paths.uploadsDirectory` | — |
| File cleanup after processing | **NOT IMPLEMENTED** | Uploaded files remain on disk indefinitely | **LOW** |

**Finding:** Multer accepts any file without type or size validation. An attacker (if authenticated) could upload arbitrary files. The application only processes .xlsx and .xml files, so other file types would cause parse errors but still consume disk space. No file cleanup mechanism exists.

---

## 9. Deployment Safety Assessment

| Aspect | Status | Evidence | Risk |
|--------|--------|----------|------|
| Bound to localhost | **Yes (default)** | `server.host: 127.0.0.1` — `config/dimbuilder.yaml:18` | Safe |
| Security headers (Helmet) | **NOT IMPLEMENTED** | No helmet, no CSP, no X-Frame-Options | **HIGH** for network |
| CORS restriction | **NOT CONFIGURED** | Wide-open when `corsOrigins` is empty — `src/server/app.ts:42` | **HIGH** for network |
| HTTPS/TLS | **NOT IMPLEMENTED** | Plain HTTP only, expects reverse proxy for TLS | Expected |
| Input sanitization | **Partial** | Zod validation on auth routes; no XSS protection | **MEDIUM** |

---

## Deployment Safety Matrix

| Deployment Target | Safe? | Required Changes |
|-------------------|-------|------------------|
| **Localhost (developer)** | ✅ **YES** | None — bound to 127.0.0.1, auth optional |
| **Internal network (pilot)** | ⚠️ **WITH CHANGES** | Enable auth, set JWT_SECRET, configure CORS, add reverse proxy |
| **Public internet** | ❌ **NO** | All pilot changes + Helmet, TLS termination, file validation, session store, production DB |

---

## Required Changes Before Internal Pilot (5-10 users)

1. **Set `auth.enabled: true`** with strategy `local` or `oidc`
2. **Set `JWT_SECRET`** environment variable (32+ random bytes, base64-encoded)
3. **Configure `CORS_ORIGINS`** to restrict to known client URLs
4. **Deploy behind reverse proxy** (nginx/Caddy) with TLS termination
5. **Change default admin password** (or use OIDC exclusively)
6. **Bind to `0.0.0.0`** if needed, but only behind proxy

## Required Changes Before Production (50+ users)

All pilot changes, plus:

1. **Add Helmet middleware** for security headers (CSP, X-Frame-Options, HSTS)
2. **Add multer file validation** — whitelist `.xlsx` and `.xml` extensions, set 50MB size limit
3. **Implement upload cleanup** — delete processed files after import
4. **Move to PostgreSQL/MySQL** — SQLite has write-lock limitations under concurrency
5. **Add WAL mode** at minimum if staying on SQLite for pilot
6. **Implement session cleanup** — cron job to delete expired sessions
7. **Add CSRF protection** for cookie-based auth (if applicable)
8. **Rate limit by user ID** in addition to IP (behind proxy all IPs may be same)
9. **Externalize OIDC state** to Redis for multi-instance deployability
10. **Add request body size limits** per-route (import vs. normal API)

---

## Vulnerability Summary

| # | Vulnerability | Severity | Status | Mitigation |
|---|--------------|----------|--------|------------|
| 1 | JWT secret is hardcoded placeholder | Critical | Known | Set JWT_SECRET env var |
| 2 | Auth disabled by default | High | By design | Enable for any non-localhost deploy |
| 3 | No security headers | High | Not implemented | Add Helmet |
| 4 | CORS unrestricted | High | Not configured | Set corsOrigins in config |
| 5 | No file upload validation | Medium | Not implemented | Add multer fileFilter + limits |
| 6 | No upload cleanup | Low | Not implemented | Add post-import unlink |
| 7 | Audit logs show "system" when unauthed | Medium | By design | Enable auth |
| 8 | Default admin credentials logged | Medium | By design | Use env vars, disable logging of password |
| 9 | SQLite single-writer | Low | Architecture | Acceptable for pilot |
