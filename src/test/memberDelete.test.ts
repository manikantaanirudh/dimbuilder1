import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";

describe("member delete cascade", () => {
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

  it("deletes relationships when a member is removed", async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cascade Test" })
    });
    const project = await projectRes.json() as { id: string };

    const dimensionsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dimensions = await dimensionsRes.json() as Array<{ id: string; dimensionType: string }>;
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
    expect(account).toBeDefined();

    const parent = await (
      await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "ParentA", properties: { Account: "ParentA" } })
      })
    ).json() as { id: string };

    const child = await (
      await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "ChildB", properties: { Account: "ChildB" } })
      })
    ).json() as { id: string };

    await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentKey: "ParentA", childKey: "ChildB", properties: { Parent: "ParentA", Child: "ChildB" } })
    });

    const deleteRes = await fetch(`${baseUrl}/api/projects/${project.id}/members/${child.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json() as { relationshipsDeleted: number };
    expect(deleteBody.relationshipsDeleted).toBe(1);

    const relationshipsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/relationships`);
    const relationships = await relationshipsRes.json() as { rows: unknown[] };
    expect(relationships.rows).toHaveLength(0);
  });

  it("bulk-deletes members and their relationships", async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bulk Delete Test" })
    });
    const project = await projectRes.json() as { id: string };

    const dimensionsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dimensions = await dimensionsRes.json() as Array<{ id: string; dimensionType: string }>;
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
    expect(account).toBeDefined();

    const created = await Promise.all(["M1", "M2", "M3"].map(async (memberKey) =>
      (
        await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberKey, properties: { Account: memberKey } })
        })
      ).json() as { id: string }
    ));

    await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentKey: "M1", childKey: "M2", properties: { Parent: "M1", Child: "M2" } })
    });

    const bulkRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: created.map((member) => member.id) })
    });
    expect(bulkRes.status).toBe(200);
    const bulkBody = await bulkRes.json() as { membersDeleted: number; relationshipsDeleted: number };
    expect(bulkBody.membersDeleted).toBe(3);
    expect(bulkBody.relationshipsDeleted).toBeGreaterThanOrEqual(1);

    const membersRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`);
    const members = await membersRes.json() as { rows: Array<{ memberKey: string }>; total: number };
    expect(members.rows.some((member) => member.memberKey === "M1")).toBe(false);
    expect(members.rows.some((member) => member.memberKey === "M2")).toBe(false);
    expect(members.rows.some((member) => member.memberKey === "M3")).toBe(false);
  });

  it("bulk-deletes relationships", async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Relationship Bulk Delete" })
    });
    const project = await projectRes.json() as { id: string };

    const dimensionsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dimensions = await dimensionsRes.json() as Array<{ id: string; dimensionType: string }>;
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
    expect(account).toBeDefined();

    await Promise.all(["P1", "P2"].map((memberKey) =>
      fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey, properties: { Account: memberKey } })
      })
    ));

    const rels = await Promise.all([
      { parentKey: "P1", childKey: "P2" },
      { parentKey: "P2", childKey: "P1" }
    ].map(async (body) =>
      (
        await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/relationships`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, properties: { Parent: body.parentKey, Child: body.childKey } })
        })
      ).json() as { id: string }
    ));

    const bulkRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/relationships/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationshipIds: rels.map((rel) => rel.id) })
    });
    expect(bulkRes.status).toBe(200);
    const bulkBody = await bulkRes.json() as { relationshipsDeleted: number };
    expect(bulkBody.relationshipsDeleted).toBe(2);

    const relationshipsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/relationships`);
    const relationships = await relationshipsRes.json() as { total: number };
    expect(relationships.total).toBe(0);
  });

  it("rejects member keys with only special characters on create", async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Validation Test" })
    });
    const project = await projectRes.json() as { id: string };

    const dimensionsRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
    const dimensions = await dimensionsRes.json() as Array<{ id: string; dimensionType: string }>;
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
    expect(account).toBeDefined();

    const createRes = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account!.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberKey: "???", properties: { Account: "???" } })
    });
    expect(createRes.status).toBe(400);
  });
});
