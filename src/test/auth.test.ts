import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";

function authEnabledConfig(overrides: Partial<AppConfig["auth"]> = {}): AppConfig {
  return {
    ...defaultAppConfig,
    auth: {
      ...defaultAppConfig.auth,
      enabled: true,
      strategy: "local",
      jwt: {
        secret: "test-secret-key-for-integration-tests",
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      },
      allowSelfRegistration: false,
      ...overrides
    }
  };
}

describe("auth routes", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let closeDb: () => void;

  beforeEach(async () => {
    const config = authEnabledConfig();
    const db = createDatabase(":memory:");
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    closeDb = () => db.close();
  });

  afterEach(async () => {
    await closeServer();
    closeDb();
  });

  async function registerAdmin(email = "admin@test.com", password = "Password123!", displayName = "Admin User") {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName })
    });
    return res;
  }

  async function login(email = "admin@test.com", password = "Password123!") {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    return res;
  }

  describe("POST /api/auth/register", () => {
    it("allows first user to register as admin without auth", async () => {
      const res = await registerAdmin();
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.email).toBe("admin@test.com");
      expect(body.displayName).toBe("Admin User");
      expect(body.role).toBe("admin");
      expect(body.isActive).toBe(true);
      expect(body).not.toHaveProperty("password_hash");
    });

    it("rejects registration when users exist and self-registration is disabled", async () => {
      await registerAdmin();
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user2@test.com", password: "Password456!", displayName: "User 2" })
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("not allowed");
    });

    it("rejects invalid registration body", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "short", displayName: "" })
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("rejects duplicate email", async () => {
      await registerAdmin();
      // Need self-reg enabled for this test — recreate server
      await closeServer();
      closeDb();

      const config = authEnabledConfig({ allowSelfRegistration: true });
      const db = createDatabase(":memory:");
      const app = createApp(db, config);
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      closeDb = () => db.close();

      await registerAdmin();
      const res = await registerAdmin();
      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns tokens and user on valid credentials", async () => {
      await registerAdmin();
      const res = await login();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe("admin@test.com");
      expect(body.user.role).toBe("admin");
    });

    it("returns 401 on wrong password", async () => {
      await registerAdmin();
      const res = await login("admin@test.com", "WrongPassword!");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Invalid");
    });

    it("returns 401 on non-existent email", async () => {
      await registerAdmin();
      const res = await login("nobody@test.com", "Password123!");
      expect(res.status).toBe(401);
    });

    it("returns 429 after too many failed attempts", async () => {
      await registerAdmin();
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await login("admin@test.com", "wrong");
      }
      // 6th attempt should be rate limited
      const res = await login("admin@test.com", "wrong");
      expect(res.status).toBe(429);
    }, 15_000);
  });

  describe("GET /api/auth/me", () => {
    it("returns user info with valid token", async () => {
      await registerAdmin();
      const loginRes = await login();
      const { accessToken } = await loginRes.json();

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe("admin@test.com");
      expect(body.role).toBe("admin");
    });

    it("returns 401 without token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: "Bearer invalid-token" }
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("returns new access token with valid refresh token", async () => {
      await registerAdmin();
      const loginRes = await login();
      const { refreshToken } = await loginRes.json();

      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.accessToken.length).toBeGreaterThan(0);
    });

    it("returns 401 with invalid refresh token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "invalid-token" })
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears session and returns 204", async () => {
      await registerAdmin();
      const loginRes = await login();
      const { accessToken, refreshToken } = await loginRes.json();

      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(204);

      // Refresh token should no longer work
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
      expect(refreshRes.status).toBe(401);
    });

    it("returns 204 even without auth header", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST"
      });
      expect(res.status).toBe(204);
    });
  });
});
