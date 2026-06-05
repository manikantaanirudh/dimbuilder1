import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";

describe("bulk update CSV routes", () => {
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
      body: JSON.stringify({ name: "CSV Bulk Update" })
    });
    projectId = (await projectRes.json() as { id: string }).id;
    const dims = await (await fetch(`${baseUrl}/api/projects/${projectId}/dimensions`)).json() as Array<{ id: string }>;
    dimensionId = dims[0].id;

    await fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberKey: "Revenue", properties: { Text1: "Before" } })
    });
  });

  afterEach(async () => {
    await closeServer();
  });

  it("previews and applies CSV member property updates", async () => {
    const csv = "Member,Text1\nRevenue,After\n";
    const mapping = { targetType: "member", dimensionId, keyColumn: "Member" };

    const previewRes = await fetch(`${baseUrl}/api/projects/${projectId}/bulk-updates/preview-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, mapping })
    });
    expect(previewRes.status).toBe(200);
    const preview = await previewRes.json() as { affectedCount: number };
    expect(preview.affectedCount).toBe(1);

    const applyRes = await fetch(`${baseUrl}/api/projects/${projectId}/bulk-updates/apply-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, mapping })
    });
    expect(applyRes.status).toBe(201);

    const membersRes = await fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/members`);
    const members = await membersRes.json() as { rows: Array<{ memberKey: string; properties: Record<string, string> }> };
    const revenue = members.rows.find((row) => row.memberKey === "Revenue");
    expect(revenue?.properties.Text1).toBe("After");
  });
});
