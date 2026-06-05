import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { resolveModulesConfig } from "../shared/modulesConfig";
import { withModules } from "./helpers/modules";

describe("modules feature flags", () => {
  it("defaults platform modules off for conservative local workbench", () => {
    expect(resolveModulesConfig(defaultAppConfig)).toMatchObject({
      chatAssistant: false,
      environmentManagement: false,
      multiTenancy: false,
      platformExtras: false
    });
  });

  it("does not mount tier4 routes when multiTenancy is disabled", async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, withModules(defaultAppConfig, { multiTenancy: false }));
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/api/tenants`);
    server.close();
    db.close();
    expect(response.status).toBe(404);
  });

  it("mounts tier4 routes when multiTenancy is enabled", async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, withModules(defaultAppConfig, { multiTenancy: true }));
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/api/tenants`);
    server.close();
    db.close();
    expect(response.status).toBe(200);
  });
});
