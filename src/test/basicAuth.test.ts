import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";

function authConfig(overrides: Partial<AppConfig["auth"]> = {}): AppConfig {
  return {
    ...defaultAppConfig,
    auth: { ...defaultAppConfig.auth, ...overrides }
  };
}

async function withServer(config: AppConfig, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const db = createDatabase(":memory:");
  const server = createApp(db, config).listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
  }
}

describe("basic auth middleware", () => {
  it("passes requests through when auth is disabled", async () => {
    await withServer(authConfig({ enabled: false }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/projects`);
      expect(response.status).toBe(200);
    });
  });

  it("health endpoint is accessible without auth even when auth is enabled", async () => {
    await withServer(authConfig({ enabled: true, username: "admin", password: "secret" }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  });

  it("returns 401 when auth is enabled and no Authorization header is provided", async () => {
    await withServer(authConfig({ enabled: true, username: "admin", password: "secret" }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/projects`);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Basic");
      const body = await response.json();
      expect(body.error).toBe("Authentication required");
    });
  });

  it("returns 401 for invalid credentials", async () => {
    await withServer(authConfig({ enabled: true, username: "admin", password: "secret" }), async (baseUrl) => {
      const wrongCreds = Buffer.from("admin:wrongpassword").toString("base64");
      const response = await fetch(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Basic ${wrongCreds}` }
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Invalid credentials");
    });
  });

  it("allows access with valid credentials", async () => {
    await withServer(authConfig({ enabled: true, username: "admin", password: "secret" }), async (baseUrl) => {
      const validCreds = Buffer.from("admin:secret").toString("base64");
      const response = await fetch(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Basic ${validCreds}` }
      });
      expect(response.status).toBe(200);
    });
  });

  it("rejects malformed Authorization header (missing Basic prefix)", async () => {
    await withServer(authConfig({ enabled: true, username: "admin", password: "secret" }), async (baseUrl) => {
      const validCreds = Buffer.from("admin:secret").toString("base64");
      const response = await fetch(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${validCreds}` }
      });
      expect(response.status).toBe(401);
    });
  });
});
