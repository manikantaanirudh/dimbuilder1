import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";

describe("bulk update rollback", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let projectId = "";
  let dimensionId = "";

  beforeEach(async () => {
    const db = createDatabase(":memory:");
    const app = createApp(db, defaultAppConfig);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rollback Test" })
    });
    const project = await projectRes.json() as { id: string };
    projectId = project.id;
    const dimsRes = await fetch(`${baseUrl}/api/projects/${projectId}/dimensions`);
    const dims = await dimsRes.json() as Array<{ id: string }>;
    dimensionId = dims[0].id;

    await fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberKey: "TestMember", properties: { Description: "Before", Text1: "Before" } })
    });
  });

  afterEach(async () => {
    await closeServer();
  });

  it("restores prior property values from a recorded rollback payload", async () => {
    const applyRes = await fetch(`${baseUrl}/api/projects/${projectId}/bulk-updates/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "member",
        operation: "set",
        propertyName: "Text1",
        value: "After",
        filter: { dimensionId, memberKeyContains: "TestMember" }
      })
    });
    expect(applyRes.status).toBe(201);
    const applied = await applyRes.json() as { job: { id: string; status: string } };
    expect(applied.job.status).toBe("applied");

    const membersAfter = await fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/members`);
    const rowsAfter = await membersAfter.json() as { rows: Array<{ memberKey: string; properties: Record<string, string> }> };
    const memberAfter = rowsAfter.rows.find((row) => row.memberKey === "TestMember");
    expect(memberAfter?.properties.Text1).toBe("After");

    const rollbackRes = await fetch(`${baseUrl}/api/projects/${projectId}/bulk-updates/${applied.job.id}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(rollbackRes.status).toBe(200);
    const rolledBack = await rollbackRes.json() as { job: { status: string } };
    expect(rolledBack.job.status).toBe("rolledBack");

    const membersRestored = await fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/members`);
    const rowsRestored = await membersRestored.json() as { rows: Array<{ memberKey: string; properties: Record<string, string> }> };
    const memberRestored = rowsRestored.rows.find((row) => row.memberKey === "TestMember");
    expect(memberRestored?.properties.Text1).toBe("Before");
  });
});
