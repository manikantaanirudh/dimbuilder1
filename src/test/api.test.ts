import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";

describe("api", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const app = createApp(createDatabase(":memory:"));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind to a port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
  });

  it("reports health and lists projects", async () => {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    const projects = await fetch(`${baseUrl}/api/projects`).then((response) => response.json());

    expect(health).toEqual({ ok: true });
    expect(projects).toEqual([]);
  });
});

