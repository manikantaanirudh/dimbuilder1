import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";

describe("property defaults routes", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let projectId = "";
  let config: AppConfig;

  beforeEach(async () => {
    config = defaultAppConfig;
    const db = createDatabase(":memory:");
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Defaults Test", description: "" })
    });
    const project = await projectRes.json() as { id: string };
    projectId = project.id;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
  });

  it("returns database catalog defaults for a new project without XML", async () => {
    const getRes = await fetch(`${baseUrl}/api/projects/${projectId}/property-defaults?dimensionType=Account`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as {
      values: Record<string, Array<{ id: string; propertyName: string; defaultValue: string }>>;
    };
    expect(body.values.Account?.length).toBeGreaterThan(0);
    const accountType = body.values.Account?.find((value) => value.propertyName === "Account Type");
    expect(accountType?.defaultValue).toBe("Expense");
    expect(accountType?.id).toBeTruthy();
  });

  it("updates a catalog row in the database", async () => {
    const getRes = await fetch(`${baseUrl}/api/projects/${projectId}/property-defaults?dimensionType=Account`);
    const body = await getRes.json() as {
      values: Record<string, Array<{ id: string; propertyName: string }>>;
    };
    const accountType = body.values.Account?.find((value) => value.propertyName === "Account Type");
    expect(accountType?.id).toBeTruthy();

    const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}/property-defaults/${accountType!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultValue: "Asset" })
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json() as { value: { defaultValue: string } };
    expect(patched.value.defaultValue).toBe("Asset");
  });
});
