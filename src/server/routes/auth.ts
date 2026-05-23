import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { AuthUser, SystemRole } from "../../shared/authTypes";
import type { Repositories, UserRow } from "../db/repositories";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, type TokenConfig } from "../auth/tokens";
import { createAuthenticateMiddleware } from "../middleware/authenticate";

// --- Zod Schemas ---

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required").max(255)
});

// --- Rate limiting (in-memory) ---

interface FailedAttempt {
  count: number;
  firstAttemptAt: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

// --- Helpers ---

function userRowToAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    authProvider: row.auth_provider as "local" | "oidc",
    role: row.role as SystemRole,
    isActive: row.is_active === 1,
    avatarUrl: row.avatar_url ?? undefined
  };
}

function getTokenConfig(config: AppConfig): TokenConfig {
  return {
    secret: process.env.JWT_SECRET || config.auth.jwt.secret,
    accessTokenExpiry: config.auth.jwt.accessTokenExpiry,
    refreshTokenExpiry: config.auth.jwt.refreshTokenExpiry
  };
}

function parseRefreshTokenExpiryMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

// --- Router Factory ---

export function createAuthRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();
  const tokenConfig = getTokenConfig(config);

  // Per-instance rate limiting state
  const failedAttempts = new Map<string, FailedAttempt>();

  function checkRateLimit(email: string): boolean {
    const now = Date.now();
    const record = failedAttempts.get(email);
    if (!record) return true;
    if (now - record.firstAttemptAt > WINDOW_MS) {
      failedAttempts.delete(email);
      return true;
    }
    return record.count < MAX_FAILED_ATTEMPTS;
  }

  function recordFailedAttempt(email: string): void {
    const now = Date.now();
    const record = failedAttempts.get(email);
    if (!record || now - record.firstAttemptAt > WINDOW_MS) {
      failedAttempts.set(email, { count: 1, firstAttemptAt: now });
    } else {
      record.count++;
    }
  }

  // POST /login
  router.post("/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
        });
      }

      const { email, password } = parsed.data;

      // Rate limit check
      if (!checkRateLimit(email)) {
        return res.status(429).json({ error: "Too many failed login attempts. Please try again later." });
      }

      const user = repos.users.findUserByEmail(email);
      if (!user || !user.password_hash) {
        recordFailedAttempt(email);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (user.is_active === 0) {
        recordFailedAttempt(email);
        return res.status(401).json({ error: "Account is deactivated" });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        recordFailedAttempt(email);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Success — clear rate limit
      failedAttempts.delete(email);

      // Sign tokens
      const accessToken = signAccessToken(
        { sub: user.id, email: user.email, role: user.role as SystemRole },
        tokenConfig
      );
      const refreshToken = signRefreshToken(user.id, tokenConfig);

      // Hash refresh token and store session
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      const expiresAt = new Date(Date.now() + parseRefreshTokenExpiryMs(tokenConfig.refreshTokenExpiry)).toISOString();

      // Delete old sessions and create new one
      repos.sessions.deleteSessionsByUserId(user.id);
      repos.sessions.createSession({
        id: nanoid(),
        userId: user.id,
        refreshTokenHash,
        expiresAt
      });

      // Update last login
      repos.users.updateUser(user.id, { lastLoginAt: new Date().toISOString() });

      return res.json({
        accessToken,
        refreshToken,
        user: userRowToAuthUser(user)
      });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /refresh
  router.post("/refresh", async (req, res) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
        });
      }

      const { refreshToken } = parsed.data;

      // Verify JWT
      let payload: { sub: string };
      try {
        payload = verifyRefreshToken(refreshToken, tokenConfig);
      } catch {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      // Find session
      const session = repos.sessions.findSessionByUserId(payload.sub);
      if (!session) {
        return res.status(401).json({ error: "Session not found" });
      }

      // Check expiry
      if (new Date(session.expires_at) < new Date()) {
        repos.sessions.deleteSessionsByUserId(payload.sub);
        return res.status(401).json({ error: "Session expired" });
      }

      // Verify refresh token hash
      const hashValid = await bcrypt.compare(refreshToken, session.refresh_token_hash);
      if (!hashValid) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      // Get user to populate new access token
      const user = repos.users.findUserById(payload.sub);
      if (!user || user.is_active === 0) {
        return res.status(401).json({ error: "User not found or deactivated" });
      }

      // Sign new access token
      const accessToken = signAccessToken(
        { sub: user.id, email: user.email, role: user.role as SystemRole },
        tokenConfig
      );

      return res.json({ accessToken });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /logout
  router.post("/logout", (req, res) => {
    // Parse Bearer token but don't fail if missing
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      const token = header.slice(7);
      try {
        const payload = verifyAccessToken(token, tokenConfig);
        repos.sessions.deleteSessionsByUserId(payload.sub);
      } catch {
        // Token invalid or expired, nothing to do
      }
    }
    return res.status(204).send();
  });

  // GET /me
  router.get("/me", createAuthenticateMiddleware(config), (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return res.json(req.user);
  });

  // POST /register
  router.post("/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
        });
      }

      const { email, password, displayName } = parsed.data;
      const allUsers = repos.users.listUsers();
      // Treat the seeded system user (local-admin) as not a real user for first-user detection
      const realUsers = allUsers.filter(u => u.id !== "local-admin");
      const isFirstUser = realUsers.length === 0;

      if (!isFirstUser && !config.auth.allowSelfRegistration) {
        return res.status(403).json({ error: "Self-registration is not allowed" });
      }

      // Check if email already exists
      const existing = repos.users.findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }

      const passwordHash = await hashPassword(password);
      const role: SystemRole = isFirstUser ? "admin" : config.auth.defaultRole;
      const id = nanoid();

      repos.users.createUser({
        id,
        email,
        displayName,
        passwordHash,
        authProvider: "local",
        role
      });

      const created = repos.users.findUserById(id);
      if (!created) {
        return res.status(500).json({ error: "Failed to create user" });
      }

      return res.status(201).json(userRowToAuthUser(created));
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
