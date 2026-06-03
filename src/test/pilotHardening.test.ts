import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import type { AppConfig } from "../shared/appConfigTypes";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { createLargeHierarchyProject } from "./helpers/largeHierarchy";

const limitedConfig: AppConfig = {
  ...defaultAppConfig,
  operations: {
    ...defaultAppConfig.operations!,
    exportMaxMembers: 50
  },
  dimensions: {
    ...defaultAppConfig.dimensions,
    enabledTypes: ["Account"],
    displayOrder: ["Account"]
  }
};

describe("pilot export hardening", () => {
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let baseUrl: string;
  let db: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    db = createDatabase(":memory:");
    const app = createApp(db, limitedConfig);
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

  it("blocks large projects with 413 and structured error payload", async () => {
    const repos = (await import("../server/db/repositories")).createRepositories(db);
    const { projectId } = createLargeHierarchyProject(repos, limitedConfig, { memberCount: 80 });

    const response = await fetch(`${baseUrl}/api/export/${projectId}/xml`);
    expect(response.status).toBe(413);
    const body = await response.json() as {
      error: string;
      memberCount: number;
      limit: number;
      suggestion: string;
    };
    expect(body.memberCount).toBeGreaterThan(50);
    expect(body.limit).toBe(50);
    expect(body.suggestion.length).toBeGreaterThan(0);
    expect(body.error).toContain("xml");
  });

  it("exports clean XML for a normal-sized project", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pilot normal project", description: "" })
    });
    expect(createRes.status).toBe(201);
    const project = await createRes.json() as { id: string };

    const response = await fetch(`${baseUrl}/api/export/${project.id}/xml`);
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toMatch(/<\?xml version="1\.0"/);
    expect(xml).toContain("<OneStreamXF");
    expect(xml).toContain("</OneStreamXF>");
  });
});
