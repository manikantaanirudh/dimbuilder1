import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";

describe("dimension delete and recreate", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, defaultAppConfig);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
  });

  it("deletes a dimension and all members/relationships", async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Delete Dim Test" })
    });
    const project = await projectRes.json() as { id: string };

    const dimensionsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dimensions = await dimensionsRes.json() as Array<{ id: string; dimensionType: string }>;
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
    expect(account).toBeDefined();

    await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberKey: "TestMember", properties: { Account: "TestMember" } })
    });

    const deleteRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}`, {
      method: "DELETE"
    });
    expect(deleteRes.status).toBe(200);
    const payload = await deleteRes.json() as { membersRemoved: number };
    expect(payload.membersRemoved).toBeGreaterThan(0);

    const afterRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const after = await afterRes.json() as Array<{ dimensionType: string }>;
    expect(after.some((dimension) => dimension.dimensionType === "Account")).toBe(false);
  });

  it("recreates a dimension from blueprint", async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Recreate Dim Test" })
    });
    const project = await projectRes.json() as { id: string };

    const dimensionsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dimensions = await dimensionsRes.json() as Array<{ id: string; dimensionType: string }>;
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
    expect(account).toBeDefined();

    await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}`, { method: "DELETE" });

    const createRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimensionType: "Account", dimensionName: "Fresh Accounts" })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { dimensionName: string; dimensionType: string };
    expect(created.dimensionName).toBe("Fresh Accounts");
    expect(created.dimensionType).toBe("Account");

    const membersRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${created.id}/members?limit=50`);
    const members = await membersRes.json() as { total: number };
    expect(members.total).toBeGreaterThan(0);
  });
});
