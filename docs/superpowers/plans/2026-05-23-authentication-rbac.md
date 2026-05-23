# Authentication & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace basic HTTP auth with JWT-based authentication supporting local credentials and OIDC (Azure AD/Okta), plus role-based access control with project-level permissions.

**Architecture:** Express middleware strategy pattern — a central `authenticate` middleware dispatches to local (bcrypt + JWT) or OIDC (passport-openidconnect) based on config. A separate `authorize` middleware checks role/permission requirements per route. Client uses React context with token storage in memory (access) and httpOnly cookie (refresh).

**Tech Stack:** jsonwebtoken, bcrypt, openid-client (certified OIDC RP library), Zod for validation, existing better-sqlite3 for persistence.

---

## File Structure

### New Files (Server)
- `src/server/auth/types.ts` — Auth-related TypeScript interfaces
- `src/server/auth/passwords.ts` — bcrypt hash/verify helpers
- `src/server/auth/tokens.ts` — JWT sign/verify/refresh logic
- `src/server/auth/localStrategy.ts` — Local login handler
- `src/server/auth/oidcStrategy.ts` — OIDC login/callback handler
- `src/server/auth/sessionStore.ts` — Refresh token DB persistence
- `src/server/middleware/authenticate.ts` — JWT verification middleware (replaces basicAuth)
- `src/server/middleware/authorize.ts` — RBAC permission enforcement
- `src/server/routes/auth.ts` — Auth endpoints (login, refresh, logout, me, oidc)
- `src/server/routes/users.ts` — User CRUD endpoints

### New Files (Client)
- `src/client/auth/AuthProvider.tsx` — React auth context
- `src/client/auth/useAuth.ts` — Auth hook
- `src/client/auth/LoginPage.tsx` — Login form component
- `src/client/auth/ProtectedRoute.tsx` — Route wrapper requiring auth

### New Files (Shared)
- `src/shared/authTypes.ts` — Shared auth types (roles, permissions)

### New Files (Tests)
- `src/test/auth.test.ts` — Auth route integration tests
- `src/test/authorize.test.ts` — RBAC middleware unit tests
- `src/test/passwords.test.ts` — Password hashing tests
- `src/test/tokens.test.ts` — JWT token tests

### Modified Files
- `src/server/db/schema.ts` — Extend users/roles/sessions tables
- `src/server/app.ts` — Replace basicAuth with new authenticate middleware
- `src/server/db/repositories.ts` — Add user/session repository methods
- `src/shared/appConfigTypes.ts` — Extend AuthConfig interface
- `src/shared/appConfigDefaults.ts` — Update auth defaults
- `config/dimbuilder.yaml` — Add JWT/OIDC config sections
- `src/client/api/client.ts` — Add auth header injection, token refresh interceptor
- `src/client/App.tsx` — Wrap in AuthProvider
- `src/client/components/AppShell.tsx` — Add user menu, conditional rendering
- `package.json` — Add dependencies

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install auth packages**

Run:
```powershell
cd C:\Naga\projects\dimbuilder
npx --yes npm-check-updates --target minor
npm install jsonwebtoken bcrypt openid-client uuid
npm install -D @types/jsonwebtoken @types/bcrypt
```

- [ ] **Step 2: Verify installation**

Run: `npx vitest run --exclude 'src/test/workbookParser.test.ts'`
Expected: All existing tests still pass.

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json
git commit -m "feat(auth): add authentication dependencies (jsonwebtoken, bcrypt, openid-client)"
```

---

## Task 2: Define Shared Auth Types

**Files:**
- Create: `src/shared/authTypes.ts`

- [ ] **Step 1: Create shared auth types**

```typescript
// src/shared/authTypes.ts

export type SystemRole = "admin" | "author" | "reviewer" | "viewer";
export type ProjectRole = "owner" | "editor" | "reviewer" | "viewer";

export const SYSTEM_ROLES: SystemRole[] = ["admin", "author", "reviewer", "viewer"];
export const PROJECT_ROLES: ProjectRole[] = ["owner", "editor", "reviewer", "viewer"];

export type Permission =
  | "projects.create"
  | "projects.delete"
  | "projects.edit"
  | "projects.view"
  | "members.edit"
  | "relationships.edit"
  | "validation.run"
  | "export.xml"
  | "export.all"
  | "changeSets.approve"
  | "changeSets.reject"
  | "deploy"
  | "users.manage"
  | "config.manage";

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  admin: [
    "projects.create", "projects.delete", "projects.edit", "projects.view",
    "members.edit", "relationships.edit", "validation.run",
    "export.xml", "export.all", "changeSets.approve", "changeSets.reject",
    "deploy", "users.manage", "config.manage"
  ],
  author: [
    "projects.create", "projects.delete", "projects.edit", "projects.view",
    "members.edit", "relationships.edit", "validation.run",
    "export.xml", "export.all"
  ],
  reviewer: [
    "projects.view", "validation.run", "export.xml",
    "changeSets.approve", "changeSets.reject"
  ],
  viewer: [
    "projects.view", "validation.run"
  ]
};

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  authProvider: "local" | "oidc";
  role: SystemRole;
  isActive: boolean;
  avatarUrl?: string;
}

export interface AuthTokenPayload {
  sub: string;          // user.id
  email: string;
  role: SystemRole;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/shared/authTypes.ts
git commit -m "feat(auth): define shared auth types, roles, and permissions"
```

---

## Task 3: Extend Database Schema

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Replace minimal user/role tables with full auth schema**

In `src/server/db/schema.ts`, replace the existing `users`, `roles`, and `user_roles` table definitions with:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  auth_provider_id TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  granted_by TEXT REFERENCES users(id),
  granted_at TEXT NOT NULL,
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_project_permissions_project ON project_permissions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_permissions_user ON project_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(auth_provider, auth_provider_id);
```

Also remove the old `roles` and `user_roles` tables since we're using a simpler single-role-per-user model.

- [ ] **Step 2: Verify schema loads correctly**

Run: `npx vitest run src/test/database.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/server/db/schema.ts
git commit -m "feat(auth): extend database schema with full user, session, and permission tables"
```

---

## Task 4: Extend AppConfig Types

**Files:**
- Modify: `src/shared/appConfigTypes.ts`
- Modify: `src/shared/appConfigDefaults.ts`
- Modify: `config/dimbuilder.yaml`

- [ ] **Step 1: Replace AuthConfig interface**

In `src/shared/appConfigTypes.ts`, replace the `AuthConfig` interface:

```typescript
export interface AuthConfig {
  enabled: boolean;
  strategy: "local" | "oidc" | "none";
  jwt: {
    secret: string;
    accessTokenExpiry: string;   // e.g., "15m"
    refreshTokenExpiry: string;  // e.g., "7d"
  };
  oidc?: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scopes: string[];
  };
  defaultRole: "admin" | "author" | "reviewer" | "viewer";
  allowSelfRegistration: boolean;
  // Legacy fields for backward compat with basic auth
  username?: string;
  password?: string;
}
```

- [ ] **Step 2: Update defaults**

In `src/shared/appConfigDefaults.ts`, update the auth section:

```typescript
auth: {
  enabled: false,
  strategy: "none",
  jwt: {
    secret: "change-me-in-production-use-env-var",
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d"
  },
  defaultRole: "author",
  allowSelfRegistration: false,
  username: "admin",
  password: "changeme"
}
```

- [ ] **Step 3: Update YAML config**

In `config/dimbuilder.yaml`, update the auth section:

```yaml
auth:
  enabled: false
  strategy: none
  jwt:
    secret: change-me-in-production
    accessTokenExpiry: 15m
    refreshTokenExpiry: 7d
  defaultRole: author
  allowSelfRegistration: false
```

- [ ] **Step 4: Run tests to verify backward compat**

Run: `npx vitest run src/test/appConfig.test.ts`
Expected: Existing tests may need minor adjustments. Fix any that reference the old `username`/`password` fields.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/appConfigTypes.ts src/shared/appConfigDefaults.ts config/dimbuilder.yaml
git commit -m "feat(auth): extend AppConfig with JWT and OIDC configuration"
```

---

## Task 5: Implement Password Helpers

**Files:**
- Create: `src/server/auth/passwords.ts`
- Create: `src/test/passwords.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/passwords.test.ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/auth/passwords";

describe("password helpers", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("SecureP@ss123");
    expect(hash).not.toBe("SecureP@ss123");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("SecureP@ss123", hash)).toBe(true);
  });

  it("rejects incorrect passwords", async () => {
    const hash = await hashPassword("SecureP@ss123");
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("produces different hashes for the same password", async () => {
    const hash1 = await hashPassword("SamePassword");
    const hash2 = await hashPassword("SamePassword");
    expect(hash1).not.toBe(hash2);
  });
});
```

- [ ] **Step 2: Implement passwords module**

```typescript
// src/server/auth/passwords.ts
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/test/passwords.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/server/auth/passwords.ts src/test/passwords.test.ts
git commit -m "feat(auth): implement bcrypt password hashing helpers"
```

---

## Task 6: Implement JWT Token Helpers

**Files:**
- Create: `src/server/auth/tokens.ts`
- Create: `src/test/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/tokens.test.ts
import { describe, expect, it } from "vitest";
import { signAccessToken, signRefreshToken, verifyAccessToken } from "../server/auth/tokens";
import type { SystemRole } from "../shared/authTypes";

const secret = "test-secret-key-for-unit-tests";
const tokenConfig = { secret, accessTokenExpiry: "15m", refreshTokenExpiry: "7d" };

describe("JWT token helpers", () => {
  it("signs and verifies an access token", () => {
    const token = signAccessToken({ sub: "user-1", email: "test@example.com", role: "author" as SystemRole }, tokenConfig);
    const payload = verifyAccessToken(token, tokenConfig);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("test@example.com");
    expect(payload.role).toBe("author");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects an expired token", () => {
    const expiredConfig = { ...tokenConfig, accessTokenExpiry: "0s" };
    const token = signAccessToken({ sub: "user-1", email: "test@example.com", role: "viewer" as SystemRole }, expiredConfig);
    expect(() => verifyAccessToken(token, tokenConfig)).toThrow();
  });

  it("rejects a token with wrong secret", () => {
    const token = signAccessToken({ sub: "user-1", email: "test@example.com", role: "admin" as SystemRole }, tokenConfig);
    expect(() => verifyAccessToken(token, { ...tokenConfig, secret: "wrong-secret" })).toThrow();
  });

  it("signs a refresh token", () => {
    const token = signRefreshToken("user-1", tokenConfig);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });
});
```

- [ ] **Step 2: Implement token module**

```typescript
// src/server/auth/tokens.ts
import jwt from "jsonwebtoken";
import type { AuthTokenPayload, SystemRole } from "../../shared/authTypes";

export interface TokenConfig {
  secret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
}

interface SignPayload {
  sub: string;
  email: string;
  role: SystemRole;
}

export function signAccessToken(payload: SignPayload, config: TokenConfig): string {
  return jwt.sign(
    { sub: payload.sub, email: payload.email, role: payload.role },
    config.secret,
    { expiresIn: config.accessTokenExpiry }
  );
}

export function signRefreshToken(userId: string, config: TokenConfig): string {
  return jwt.sign(
    { sub: userId, type: "refresh" },
    config.secret,
    { expiresIn: config.refreshTokenExpiry }
  );
}

export function verifyAccessToken(token: string, config: TokenConfig): AuthTokenPayload {
  const payload = jwt.verify(token, config.secret) as AuthTokenPayload;
  if (!payload.sub || !payload.email || !payload.role) {
    throw new Error("Invalid token payload");
  }
  return payload;
}

export function verifyRefreshToken(token: string, config: TokenConfig): { sub: string } {
  const payload = jwt.verify(token, config.secret) as { sub: string; type: string };
  if (payload.type !== "refresh") throw new Error("Not a refresh token");
  return { sub: payload.sub };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/test/tokens.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/server/auth/tokens.ts src/test/tokens.test.ts
git commit -m "feat(auth): implement JWT sign/verify helpers for access and refresh tokens"
```

---

## Task 7: Implement User Repository Methods

**Files:**
- Modify: `src/server/db/repositories.ts`

- [ ] **Step 1: Add user and session repository methods**

Add to the `createRepositories` function return object:

```typescript
// User methods
findUserByEmail(email: string): UserRow | undefined
findUserById(id: string): UserRow | undefined
findUserByProviderId(provider: string, providerId: string): UserRow | undefined
createUser(user: NewUserInput): UserRow
updateUser(id: string, updates: Partial<UserUpdateInput>): UserRow | undefined
listUsers(): UserRow[]
updateLastLogin(userId: string): void

// Session methods
createSession(session: NewSessionInput): void
findSessionByUserId(userId: string): SessionRow | undefined
deleteSessionByUserId(userId: string): void
deleteExpiredSessions(): number

// Project permission methods
getProjectPermissions(projectId: string): ProjectPermissionRow[]
getUserProjectPermission(projectId: string, userId: string): ProjectPermissionRow | undefined
setProjectPermission(input: SetProjectPermissionInput): ProjectPermissionRow
removeProjectPermission(id: string): void
```

Include the corresponding `UserRow`, `SessionRow`, `ProjectPermissionRow` interfaces and SQL statements. The exact SQL uses the schema from Task 3.

- [ ] **Step 2: Commit**

```powershell
git add src/server/db/repositories.ts
git commit -m "feat(auth): add user, session, and project permission repository methods"
```

---

## Task 8: Implement Authenticate Middleware

**Files:**
- Create: `src/server/middleware/authenticate.ts`

- [ ] **Step 1: Create authentication middleware**

```typescript
// src/server/middleware/authenticate.ts
import type { RequestHandler, Request } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { AuthTokenPayload, AuthUser, SystemRole } from "../../shared/authTypes";
import { verifyAccessToken, type TokenConfig } from "../auth/tokens";

// Extend Express Request to carry user info
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tokenPayload?: AuthTokenPayload;
    }
  }
}

export function createAuthenticateMiddleware(config: AppConfig): RequestHandler {
  // If auth is disabled, attach a default admin user
  if (!config.auth.enabled || config.auth.strategy === "none") {
    return (req, _res, next) => {
      req.user = {
        id: "system",
        email: "admin@local",
        displayName: "Local Admin",
        authProvider: "local",
        role: "admin",
        isActive: true
      };
      next();
    };
  }

  // Legacy basic auth backward compatibility
  if (config.auth.username && config.auth.password && config.auth.strategy === "local") {
    // Will be handled by JWT below — basic auth is deprecated
  }

  const tokenConfig: TokenConfig = {
    secret: process.env.JWT_SECRET || config.auth.jwt.secret,
    accessTokenExpiry: config.auth.jwt.accessTokenExpiry,
    refreshTokenExpiry: config.auth.jwt.refreshTokenExpiry
  };

  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required", code: "NO_TOKEN" });
    }

    const token = header.slice(7);
    try {
      const payload = verifyAccessToken(token, tokenConfig);
      req.tokenPayload = payload;
      req.user = {
        id: payload.sub,
        email: payload.email,
        displayName: payload.email.split("@")[0],
        authProvider: "local",
        role: payload.role,
        isActive: true
      };
      next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
    }
  };
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/server/middleware/authenticate.ts
git commit -m "feat(auth): implement JWT authenticate middleware with backward compat"
```

---

## Task 9: Implement Authorize Middleware

**Files:**
- Create: `src/server/middleware/authorize.ts`
- Create: `src/test/authorize.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/authorize.test.ts
import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission } from "../server/middleware/authorize";
import type { SystemRole } from "../shared/authTypes";

describe("authorize middleware", () => {
  it("admin has all permissions", () => {
    expect(hasPermission("admin", "users.manage")).toBe(true);
    expect(hasPermission("admin", "projects.create")).toBe(true);
    expect(hasPermission("admin", "deploy")).toBe(true);
  });

  it("viewer cannot edit", () => {
    expect(hasPermission("viewer", "projects.edit")).toBe(false);
    expect(hasPermission("viewer", "members.edit")).toBe(false);
    expect(hasPermission("viewer", "export.xml")).toBe(false);
  });

  it("reviewer can approve but not edit", () => {
    expect(hasPermission("reviewer", "changeSets.approve")).toBe(true);
    expect(hasPermission("reviewer", "members.edit")).toBe(false);
  });

  it("author can edit but not approve", () => {
    expect(hasPermission("author", "members.edit")).toBe(true);
    expect(hasPermission("author", "changeSets.approve")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement authorize module**

```typescript
// src/server/middleware/authorize.ts
import type { RequestHandler } from "express";
import { ROLE_PERMISSIONS, type Permission, type SystemRole } from "../../shared/authTypes";

export function hasPermission(role: SystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRole = req.user.role;
    const hasAll = permissions.every((perm) => hasPermission(userRole, perm));

    if (!hasAll) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: permissions,
        userRole
      });
    }

    next();
  };
}

export function requireRole(...roles: SystemRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role", required: roles, userRole: req.user.role });
    }
    next();
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/test/authorize.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/server/middleware/authorize.ts src/test/authorize.test.ts
git commit -m "feat(auth): implement RBAC authorize middleware with permission checks"
```

---

## Task 10: Implement Auth Routes

**Files:**
- Create: `src/server/routes/auth.ts`
- Create: `src/test/auth.test.ts`

- [ ] **Step 1: Create auth router with login, refresh, logout, and me endpoints**

The router handles:
- `POST /api/auth/login` — email + password → JWT tokens
- `POST /api/auth/refresh` — refresh token → new access token
- `POST /api/auth/logout` — invalidate session
- `GET /api/auth/me` — return current user info
- `POST /api/auth/register` — create first admin or self-register if enabled

Include proper error handling, rate limiting on login (5 attempts per minute per email), and input validation via Zod.

- [ ] **Step 2: Write integration tests**

Test the full flow: register → login → access protected route → refresh → logout → 401.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/test/auth.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/server/routes/auth.ts src/test/auth.test.ts
git commit -m "feat(auth): implement auth routes (login, refresh, logout, me, register)"
```

---

## Task 11: Implement User Management Routes

**Files:**
- Create: `src/server/routes/users.ts`

- [ ] **Step 1: Create user management router**

Endpoints (admin-only):
- `GET /api/users` — list all users
- `POST /api/users` — create user (admin invites)
- `PATCH /api/users/:id` — update user role, active status
- `DELETE /api/users/:id` — deactivate user

- [ ] **Step 2: Commit**

```powershell
git add src/server/routes/users.ts
git commit -m "feat(auth): implement user management routes (admin-only CRUD)"
```

---

## Task 12: Implement OIDC Strategy

**Files:**
- Create: `src/server/auth/oidcStrategy.ts`

- [ ] **Step 1: Implement OIDC client**

Using `openid-client` library:
- Discover OIDC provider metadata from `issuerUrl`
- Generate authorization URL
- Handle callback with code exchange
- Extract user info (email, name, sub)
- Auto-create user on first login
- Sign JWT tokens for authenticated OIDC user

Endpoints added to auth router:
- `GET /api/auth/oidc/authorize` — redirect to IdP
- `GET /api/auth/oidc/callback` — handle IdP response

- [ ] **Step 2: Commit**

```powershell
git add src/server/auth/oidcStrategy.ts
git commit -m "feat(auth): implement OIDC strategy for Azure AD / Okta SSO"
```

---

## Task 13: Wire Authentication into App

**Files:**
- Modify: `src/server/app.ts`

- [ ] **Step 1: Replace basicAuth with new auth middleware**

In `src/server/app.ts`:
- Import `createAuthenticateMiddleware` and auth router
- Mount auth routes BEFORE the authenticate middleware (login must be unauthenticated)
- Replace `createBasicAuthMiddleware(config.auth)` with `createAuthenticateMiddleware(config)`
- Mount user routes with `requireRole("admin")`

```typescript
// Auth routes are unauthenticated
app.use("/api/auth", createAuthRouter(repos, config));

// Everything below requires authentication
app.use("/api", createAuthenticateMiddleware(config));

// User management requires admin role
app.use("/api/users", requireRole("admin"), createUserRouter(repos));
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --exclude 'src/test/workbookParser.test.ts'`
Expected: All tests pass. Some existing tests (basicAuth.test.ts) may need updates.

- [ ] **Step 3: Commit**

```powershell
git add src/server/app.ts
git commit -m "feat(auth): wire JWT authenticate middleware into Express app"
```

---

## Task 14: Update Client API Client

**Files:**
- Modify: `src/client/api/client.ts`

- [ ] **Step 1: Add auth token management**

Add token storage and injection to all API calls:
- Store access token in module-level variable (memory only)
- Add `Authorization: Bearer <token>` header to all requests
- Intercept 401 responses → attempt refresh → retry original request
- If refresh fails → redirect to login

- [ ] **Step 2: Commit**

```powershell
git add src/client/api/client.ts
git commit -m "feat(auth): add token injection and refresh interceptor to API client"
```

---

## Task 15: Implement Client Auth UI

**Files:**
- Create: `src/client/auth/AuthProvider.tsx`
- Create: `src/client/auth/useAuth.ts`
- Create: `src/client/auth/LoginPage.tsx`
- Create: `src/client/auth/ProtectedRoute.tsx`
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Create AuthProvider context**

Manages auth state: user, isAuthenticated, login(), logout(), loading.

- [ ] **Step 2: Create LoginPage component**

Simple form: email, password, submit button, error display, "Sign in with SSO" button (when OIDC configured).

- [ ] **Step 3: Create ProtectedRoute wrapper**

Redirects to LoginPage if not authenticated.

- [ ] **Step 4: Wrap App in AuthProvider**

In `App.tsx`, wrap content in `<AuthProvider>` and gate `<AppShell>` behind `<ProtectedRoute>`.

- [ ] **Step 5: Commit**

```powershell
git add src/client/auth/ src/client/App.tsx
git commit -m "feat(auth): implement client auth UI (login page, auth provider, protected routes)"
```

---

## Task 16: Add User Menu to AppShell

**Files:**
- Modify: `src/client/components/AppShell.tsx`

- [ ] **Step 1: Add user avatar/menu to top bar**

Show current user name and role in the header. Dropdown with:
- Profile info (read-only)
- Logout button

- [ ] **Step 2: Commit**

```powershell
git add src/client/components/AppShell.tsx
git commit -m "feat(auth): add user menu and logout to AppShell header"
```

---

## Task 17: Seed Default Admin User

**Files:**
- Modify: `src/server/index.ts` or `src/server/app.ts`

- [ ] **Step 1: Auto-create admin user on first startup**

When the users table is empty (fresh install), create a default admin:
- Email: `admin@local` (or from env var `ADMIN_EMAIL`)
- Password: `ChangeMe123!` (or from env var `ADMIN_PASSWORD`)
- Role: `admin`
- Log the credentials to console on first run only

- [ ] **Step 2: Commit**

```powershell
git add src/server/index.ts
git commit -m "feat(auth): seed default admin user on first startup"
```

---

## Task 18: Update Existing Tests for Auth Compatibility

**Files:**
- Modify: `src/test/basicAuth.test.ts`
- Modify: `src/test/api.test.ts`
- Modify: various test files that call API endpoints

- [ ] **Step 1: Update test helpers to inject auth**

Since auth is disabled in test mode (`auth.enabled: false`), the authenticate middleware attaches a default admin user. Verify existing tests still pass without modification by ensuring the test app config has `auth.enabled: false`.

- [ ] **Step 2: Add new tests for auth-enabled mode**

In `src/test/auth.test.ts`, test the full lifecycle with `auth.enabled: true`.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --exclude 'src/test/workbookParser.test.ts'`
Expected: All tests pass (236+ including new auth tests).

- [ ] **Step 4: Commit**

```powershell
git add src/test/
git commit -m "feat(auth): update test suite for auth compatibility, add auth integration tests"
```

---

## Task 19: Final Integration Test & Documentation

**Files:**
- Modify: `docs/feature-catalog.md`
- Modify: `docs/security-model.md`

- [ ] **Step 1: Update feature catalog**

Add "Authentication & RBAC" section describing:
- Local login with JWT tokens
- OIDC SSO (Azure AD, Okta)
- Role-based access control
- Project-level permissions
- Session management

- [ ] **Step 2: Run full test suite one final time**

Run: `npx vitest run --exclude 'src/test/workbookParser.test.ts'`
Expected: ALL tests pass.

- [ ] **Step 3: Final commit**

```powershell
git add docs/
git commit -m "docs: update feature catalog and security model for authentication"
```

---

## Summary

19 tasks implementing:
- JWT-based local authentication with bcrypt password hashing
- OIDC integration for Azure AD / Okta SSO
- Role-based access control (admin, author, reviewer, viewer)
- Project-level permissions
- Token refresh mechanism with session persistence
- Client-side auth provider, login page, and protected routes
- Backward compatibility (auth.enabled=false preserves current behavior)
- Full test coverage
