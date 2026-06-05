import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import type { AppConfig } from "../shared/appConfigTypes";
import { defaultAppConfig } from "../shared/appConfigDefaults";

const testExportsDir = join(tmpdir(), `dimbuilder-e2e-core-${Date.now()}`);

const testConfig: AppConfig = {
  ...defaultAppConfig,
  paths: {
    ...defaultAppConfig.paths,
    exportsDirectory: testExportsDir,
    uploadsDirectory: join(testExportsDir, "uploads")
  },
  dimensions: {
    ...defaultAppConfig.dimensions,
    enabledTypes: ["Account"],
    displayOrder: ["Account"]
  }
};

describe("core workflow E2E — extended", () => {
  let app: ReturnType<typeof createApp>;
  let baseUrl: string;
  let server: ReturnType<typeof app.listen>;

  beforeAll(async () => {
    mkdirSync(testExportsDir, { recursive: true });
    const db = createDatabase(":memory:");
    app = createApp(db, testConfig);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected bound port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(testExportsDir, { recursive: true, force: true });
  });

  it("edit member -> export XML -> verify edit in output", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Round Trip Test" })
    });
    expect(createRes.status).toBe(201);
    const project = await createRes.json() as { id: string };

    const dimsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dims = await dimsRes.json() as Array<{ id: string }>;
    expect(dims.length).toBeGreaterThan(0);
    const dim = dims[0];

    const addRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${dim.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberKey: "TestMember_E2E", properties: { Description: "E2E test member", Account: "TestMember_E2E" } })
    });
    expect(addRes.status).toBe(201);
    const member = await addRes.json() as { id: string };

    const editRes = await fetch(`${baseUrl}/api/projects/${project.id}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Edited in E2E" })
    });
    expect(editRes.status).toBe(200);

    const xmlRes = await fetch(`${baseUrl}/api/export/${project.id}/xml`);
    expect(xmlRes.status).toBe(200);
    const xml = await xmlRes.text();
    expect(xml).toContain("TestMember_E2E");
    expect(xml).toContain("Edited in E2E");
  });

  it("export is blocked when validation errors exist at blocking severity", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Block Test" })
    });
    const project = await createRes.json() as { id: string };
    const dimsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dims = await dimsRes.json() as Array<{ id: string }>;
    if (dims.length === 0) return;

    await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${dims[0].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimensionName: "" })
    });

    await fetch(`${baseUrl}/api/validation/${project.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const xmlRes = await fetch(`${baseUrl}/api/export/${project.id}/xml`);
    if (testConfig.validation.exportBlockedBySeverities.includes("error")) {
      expect(xmlRes.status).toBe(409);
    }
  });
});
