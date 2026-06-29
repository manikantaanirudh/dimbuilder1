import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { withModules } from "./helpers/modules";

describe("module-gated API routes", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const db = createDatabase(":memory:");
    const config = {
      ...withModules(defaultAppConfig, {
        environmentManagement: false,
        chatAssistant: false,
        offlineSync: false,
        apiPlatform: false,
        multiTenancy: false,
        platformExtras: false
      }),
      operations: { ...defaultAppConfig.operations!, respectModuleGating: true }
    };
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
  });

  it("does not mount environment routes when environmentManagement is disabled", async () => {
    const res = await fetch(`${baseUrl}/api/environments`);
    expect(res.status).toBe(404);
  });

  it("does not mount AI routes when chatAssistant is disabled", async () => {
    const res = await fetch(`${baseUrl}/api/ai/config`);
    expect(res.status).toBe(404);
  });

  it("does not mount tier4 tenant routes when multiTenancy is disabled", async () => {
    const res = await fetch(`${baseUrl}/api/tenants`);
    expect(res.status).toBe(404);
  });

  it("keeps quality score routes available when tier3 modules are disabled", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Quality Route Project" })
    });
    expect(createRes.status).toBe(201);
    const project = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/projects/${project.id}/quality/scores`);
    expect(res.status).toBe(200);
    const body = await res.json() as { overallScore: number; metadataScore: number; validationScore: number };
    expect(body.overallScore).toBeGreaterThanOrEqual(0);
    expect(body.metadataScore).toBeGreaterThanOrEqual(0);
    expect(body.validationScore).toBeGreaterThanOrEqual(0);
  });

  it("keeps reporting routes available when platformExtras is disabled", async () => {
    const res = await fetch(`${baseUrl}/api/reports/definitions`);
    expect(res.status).toBe(200);
  });
});

describe("module-gated API routes when enabled", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const db = createDatabase(":memory:");
    const config = {
      ...withModules(
        { ...defaultAppConfig, ai: { ...defaultAppConfig.ai!, enabled: true } },
        {
          environmentManagement: true,
          chatAssistant: true,
          multiTenancy: true,
          platformExtras: true
        }
      ),
      operations: { ...defaultAppConfig.operations!, respectModuleGating: true }
    };
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
  });

  it("mounts AI config when chatAssistant is enabled", async () => {
    const res = await fetch(`${baseUrl}/api/ai/config`);
    expect(res.status).toBe(200);
  });
});
