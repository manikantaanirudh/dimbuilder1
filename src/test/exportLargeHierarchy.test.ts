import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import type { AppConfig } from "../shared/appConfigTypes";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { createLargeHierarchyProject } from "./helpers/largeHierarchy";

function buildTestConfig(exportMaxMembers: number): AppConfig {
  return {
    ...defaultAppConfig,
    operations: {
      ...defaultAppConfig.operations!,
      exportMaxMembers
    },
    dimensions: {
      ...defaultAppConfig.dimensions,
      enabledTypes: ["Account"],
      displayOrder: ["Account"]
    }
  };
}

describe("large hierarchy XML export limits", () => {
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let baseUrl: string;
  let db: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    db = createDatabase(":memory:");
    const app = createApp(db, buildTestConfig(100));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    db.close();
  });

  it("returns 413 when memberCount exceeds exportMaxMembers", async () => {
    const repos = (await import("../server/db/repositories")).createRepositories(db);
    const { projectId } = await createLargeHierarchyProject(repos, buildTestConfig(100), { memberCount: 150 });

    const response = await fetch(`${baseUrl}/api/export/${projectId}/xml`);
    expect(response.status).toBe(413);
    const body = await response.json() as { memberCount: number; limit: number; suggestion: string };
    expect(body.memberCount).toBeGreaterThan(100);
    expect(body.limit).toBe(100);
    expect(body.suggestion).toContain("dimensionId");
  });

  it("succeeds when exportMaxMembers is 0 (disabled)", async () => {
    const localDb = createDatabase(":memory:");
    const app = createApp(localDb, buildTestConfig(0));
    const localServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => localServer.once("listening", resolve));
    const { port } = localServer.address() as AddressInfo;
    const localBase = `http://127.0.0.1:${port}`;

    try {
      const repos = (await import("../server/db/repositories")).createRepositories(localDb);
      const { projectId } = await createLargeHierarchyProject(repos, buildTestConfig(0), { memberCount: 150 });
      const response = await fetch(`${localBase}/api/export/${projectId}/xml`);
      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain("<OneStreamXF");
    } finally {
      await new Promise<void>((resolve, reject) => {
        localServer.close((error) => error ? reject(error) : resolve());
      });
      localDb.close();
    }
  }, 30_000);

  it("exports a normal-sized project", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Small export project", description: "" })
    });
    expect(createRes.status).toBe(201);
    const project = await createRes.json() as { id: string };

    const response = await fetch(`${baseUrl}/api/export/${project.id}/xml`);
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain("<OneStreamXF");
  });
});
