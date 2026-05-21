import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";

function corsConfig(corsOrigins?: string[]): AppConfig {
  return {
    ...defaultAppConfig,
    server: { ...defaultAppConfig.server, corsOrigins }
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

describe("CORS configuration", () => {
  it("allows all origins when corsOrigins is not configured", async () => {
    await withServer(corsConfig(undefined), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: "http://example.com" }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  it("allows all origins when corsOrigins is empty array", async () => {
    await withServer(corsConfig([]), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: "http://example.com" }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  it("restricts to configured origins when corsOrigins is set", async () => {
    await withServer(corsConfig(["http://allowed.com"]), async (baseUrl) => {
      // Request from allowed origin
      const allowed = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: "http://allowed.com" }
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("access-control-allow-origin")).toBe("http://allowed.com");

      // Request from disallowed origin - CORS middleware doesn't block requests,
      // it just doesn't set the allow-origin header for non-matching origins
      const disallowed = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: "http://evil.com" }
      });
      expect(disallowed.status).toBe(200);
      expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  it("handles preflight OPTIONS requests", async () => {
    await withServer(corsConfig(["http://allowed.com"]), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://allowed.com",
          "Access-Control-Request-Method": "POST"
        }
      });
      // OPTIONS preflight should succeed
      expect(response.status).toBeLessThan(400);
      expect(response.headers.get("access-control-allow-origin")).toBe("http://allowed.com");
    });
  });
});
