import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";

describe("graceful shutdown", () => {
  it("server.close() stops accepting new connections", async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, defaultAppConfig);
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Verify server is running
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);

    // Close server gracefully
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    // After close, new connections should fail
    await expect(fetch(`${baseUrl}/api/health`)).rejects.toThrow();

    db.close();
  });

  it("database is closeable after server shutdown", async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, defaultAppConfig);
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Use the DB through the server
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shutdown Test" })
    });
    expect(createRes.status).toBe(201);

    // Close server
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    // Close DB - should not throw
    expect(() => db.close()).not.toThrow();
  });

  it("server can handle multiple close calls gracefully", async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, defaultAppConfig);
    const server = app.listen(0);

    // First close succeeds
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    // Second close should error (server already closed) but not crash
    const secondClose = new Promise<string>((resolve) => {
      server.close((error) => resolve(error ? "error" : "ok"));
    });
    expect(await secondClose).toBe("error");

    db.close();
  });
});
