import { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { ProjectRecord } from "../shared/types";

describe("project routes", () => {
  it("creates a blank metadata project from configured blueprints", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Entity", "Account"],
        displayOrder: ["Account", "Entity"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Manual Route Project", description: "Created without XLSX" })
      });

      expect(response.status).toBe(201);
      const project = await response.json() as ProjectRecord;
      expect(project.name).toBe("Manual Route Project");
      expect(project.description).toBe("Created without XLSX");
      expect(project.sourceFileName).toBe("");
      expect(project.createdBy).toBe("local-admin");

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      expect(dimensionsResponse.status).toBe(200);
      const dimensions = await dimensionsResponse.json() as Array<{ dimensionType: string }>;
      expect(dimensions.map((dimension) => dimension.dimensionType)).toEqual(customConfig.dimensions.displayOrder);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("returns a client error for malformed project JSON", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, defaultAppConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      });

      expect(response.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("exposes safe Blueprint Studio endpoints without writing config", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;

      const listResponse = await fetch(`http://127.0.0.1:${port}/api/blueprints`);
      expect(listResponse.status).toBe(200);
      expect(await listResponse.json()).toMatchObject({
        enabled: true,
        allowConfigWrite: false,
        blueprints: {
          Account: { defaultDimensionName: "Accounts", memberKeyField: "Account" }
        }
      });

      const validateResponse = await fetch(`http://127.0.0.1:${port}/api/blueprints/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensionType: "Account",
          draft: {
            defaultDimensionName: "Corporate Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        })
      });
      expect(validateResponse.status).toBe(200);
      expect(await validateResponse.json()).toMatchObject({
        valid: true,
        blueprint: { defaultDimensionName: "Corporate Accounts" },
        errors: []
      });

      const yamlResponse = await fetch(`http://127.0.0.1:${port}/api/blueprints/yaml`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensionType: "Account",
          draft: {
            defaultDimensionName: "Corporate Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        })
      });
      expect(yamlResponse.status).toBe(200);
      const yamlPayload = await yamlResponse.json() as { yaml: string };
      expect(yamlPayload.yaml).toContain("Account:");
      expect(yamlPayload.yaml).toContain("defaultDimensionName: Corporate Accounts");

      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blueprint Studio Source" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");
      await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "Revenue", properties: { Account: "Revenue", Description: "Revenue", "Account Type": "Revenue" } })
      });
      await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentKey: "Root", childKey: "Revenue", properties: { Parent: "Root", Child: "Revenue" } })
      });

      const generatedResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/blueprint`, {
        method: "POST"
      });
      expect(generatedResponse.status).toBe(200);
      expect(await generatedResponse.json()).toMatchObject({
        dimensionType: "Account",
        blueprint: {
          defaultDimensionName: "Accounts",
          rootMembers: ["Root"],
          members: [{ memberKey: "Revenue", properties: { "Account Type": "Revenue" } }],
          relationships: [{ parentKey: "Root", childKey: "Revenue", aggregationWeight: 1 }]
        }
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("applies blueprint relationship defaults to manually created relationships", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Manual Relationship Defaults" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      const dimensions = await dimensionsResponse.json() as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const relationshipResponse = await fetch(
        `http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentKey: "Root",
            childKey: "Revenue",
            properties: { Parent: "Root", Child: "Revenue" }
          })
        }
      );

      expect(relationshipResponse.status).toBe(201);
      const relationship = await relationshipResponse.json() as {
        parentKey: string;
        childKey: string;
        aggregationWeight: number | null;
        properties: Record<string, unknown>;
      };
      expect(relationship).toMatchObject({
        parentKey: "Root",
        childKey: "Revenue",
        aggregationWeight: 1,
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 }
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("lets manual relationship property fields override generated defaults", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Manual Relationship Property Override" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      const dimensions = await dimensionsResponse.json() as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const relationshipResponse = await fetch(
        `http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentKey: "Root",
            childKey: "Revenue",
            properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": -1 }
          })
        }
      );

      expect(relationshipResponse.status).toBe(201);
      const relationship = await relationshipResponse.json() as {
        id: string;
        parentKey: string;
        childKey: string;
        aggregationWeight: number | null;
        properties: Record<string, unknown>;
      };
      expect(relationship).toMatchObject({
        parentKey: "Root",
        childKey: "Revenue",
        aggregationWeight: -1,
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": -1 }
      });

      const storedRelationshipsResponse = await fetch(
        `http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`
      );
      expect(storedRelationshipsResponse.status).toBe(200);
      const storedRelationships = await storedRelationshipsResponse.json() as {
        rows: Array<{ id: string; aggregationWeight: number | null; properties: Record<string, unknown> }>;
      };
      expect(storedRelationships.rows).toHaveLength(1);
      expect(storedRelationships.rows[0]).toMatchObject({
        id: relationship.id,
        aggregationWeight: -1,
        properties: { "Aggregation Weight": -1 }
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("supports varying property CRUD through project routes", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Varying API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const memberResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "Revenue", properties: { Account: "Revenue", Text1: "Base" } })
      });
      expect(memberResponse.status).toBe(201);
      const member = await memberResponse.json() as { id: string };

      const createResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/varying-properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensionId: account.id,
          targetType: "member",
          targetId: member.id,
          propertyName: "Text1",
          value: "Finance actual note",
          cubeType: "Finance",
          scenarioType: "Actual",
          timeMember: "2026M1",
          isDefault: false
        })
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; value: string };
      expect(created.value).toBe("Finance actual note");

      const listResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/varying-properties?dimensionId=${account.id}&targetType=member&targetId=${member.id}`);
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as Array<{ id: string; value: string }>;
      expect(list.map((row) => row.id)).toEqual([created.id]);

      const updateResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/varying-properties/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "Updated note", isDefault: true })
      });
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({ id: created.id, value: "Updated note", isDefault: true });

      const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/varying-properties/${created.id}`, { method: "DELETE" });
      expect(deleteResponse.status).toBe(200);
      const afterDelete = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/varying-properties`).then((response) => response.json()) as unknown[];
      expect(afterDelete).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("previews and applies bulk member updates through project routes", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bulk Update API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const memberResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "Revenue", properties: { Account: "Revenue", Text1: "Before" } })
      });
      expect(memberResponse.status).toBe(201);
      const member = await memberResponse.json() as { id: string };

      const request = {
        targetType: "member",
        operation: "set",
        propertyName: "Text1",
        value: "After",
        filter: {
          dimensionId: account.id,
          memberKeyStartsWith: "Rev"
        }
      };
      const previewResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/bulk-updates/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      expect(previewResponse.status).toBe(200);
      const preview = await previewResponse.json() as { affectedCount: number; previewItems: Array<{ targetId: string; oldValue: string; newValue: string }> };
      expect(preview).toMatchObject({
        affectedCount: 1,
        previewItems: [{ targetId: member.id, oldValue: "Before", newValue: "After" }]
      });

      const applyResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/bulk-updates/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      expect(applyResponse.status).toBe(201);
      const applied = await applyResponse.json() as {
        job: { id: string; status: string; summary: { affectedCount: number } };
        items: Array<{ targetId: string; oldValue: string; newValue: string }>;
      };
      expect(applied.job).toMatchObject({ status: "applied", summary: { affectedCount: 1 } });
      expect(applied.items).toMatchObject([{ targetId: member.id, oldValue: "Before", newValue: "After" }]);

      const membersResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`);
      const members = await membersResponse.json() as { rows: Array<{ id: string; properties: Record<string, unknown> }> };
      expect(members.rows.find((row) => row.id === member.id)?.properties.Text1).toBe("After");

      const jobsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/bulk-updates`);
      expect(jobsResponse.status).toBe(200);
      const jobs = await jobsResponse.json() as Array<{ id: string; operation: string }>;
      expect(jobs).toMatchObject([{ id: applied.job.id, operation: "set" }]);

      const jobDetailResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/bulk-updates/${applied.job.id}`);
      expect(jobDetailResponse.status).toBe(200);
      expect(await jobDetailResponse.json()).toMatchObject({
        job: { id: applied.job.id },
        items: [{ targetId: member.id, propertyName: "Text1", oldValue: "Before", newValue: "After" }]
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("returns hierarchy analytics and deterministic hierarchy CSV exports", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hierarchy Analytics API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      for (const memberKey of ["TotalRevenue", "ProductRevenue", "ServiceRevenue", "AltRoot", "SharedLeaf", "Unattached"]) {
        const response = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberKey,
            properties: { Account: memberKey, Description: `${memberKey} description`, "Account Type": "Revenue" }
          })
        });
        expect(response.status).toBe(201);
      }

      for (const relationship of [
        { parentKey: "Root", childKey: "TotalRevenue" },
        { parentKey: "TotalRevenue", childKey: "ProductRevenue" },
        { parentKey: "TotalRevenue", childKey: "ServiceRevenue" },
        { parentKey: "Root", childKey: "SharedLeaf" },
        { parentKey: "AltRoot", childKey: "SharedLeaf" }
      ]) {
        const response = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...relationship, properties: { Parent: relationship.parentKey, Child: relationship.childKey } })
        });
        expect(response.status).toBe(201);
      }

      const analyticsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/hierarchy/analytics`);
      expect(analyticsResponse.status).toBe(200);
      const analytics = await analyticsResponse.json() as {
        summary: { maxDepth: number; orphanCount: number; sharedMemberCount: number };
        sharedMembers: Array<{ memberKey: string; parentCount: number }>;
        orphanMembers: Array<{ memberKey: string }>;
      };
      expect(analytics.summary).toMatchObject({ maxDepth: 2, orphanCount: 1, sharedMemberCount: 1 });
      expect(analytics.sharedMembers).toEqual([expect.objectContaining({ memberKey: "SharedLeaf", parentCount: 2 })]);
      expect(analytics.orphanMembers).toEqual([expect.objectContaining({ memberKey: "Unattached" })]);

      const levelizedResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/hierarchy/levelized.csv`);
      expect(levelizedResponse.status).toBe(200);
      const levelizedCsv = await levelizedResponse.text();
      expect(levelizedCsv.split("\n")[0]).toBe("dimensionType,dimensionName,path,level0,level1,level2,memberKey,description,isLeaf,parentCount,aggregationWeight,warnings");
      expect(levelizedCsv).toContain("Account,Accounts,Root / TotalRevenue / ProductRevenue");

      const pathsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/hierarchy/paths.csv`);
      expect(pathsResponse.status).toBe(200);
      expect(await pathsResponse.text()).toContain("dimensionType,dimensionName,path,depth,memberKey,isLeaf,parentCount,warnings");

      const parentChildResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/hierarchy/parent-child.csv`);
      expect(parentChildResponse.status).toBe(200);
      const parentChildCsv = await parentChildResponse.text();
      expect(parentChildCsv.split("\n")[0]).toBe("dimensionType,dimensionName,parentKey,childKey,sortOrder,aggregationWeight,percentConsol,percentOwnership,ownershipType,operation");
      expect(parentChildCsv).toContain("Root,TotalRevenue");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("runs validation with default or OneStream profile selection", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Validation Profile API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const memberResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "Revenue", properties: { Account: "Revenue" } })
      });
      expect(memberResponse.status).toBe(201);

      const defaultRunResponse = await fetch(`http://127.0.0.1:${port}/api/validation/${project.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(defaultRunResponse.status).toBe(200);
      const defaultRun = await defaultRunResponse.json() as { issues: Array<{ code: string }> };
      expect(defaultRun.issues.map((issue) => issue.code)).toContain("ACCOUNT_TYPE_MISSING");

      const genericRunResponse = await fetch(`http://127.0.0.1:${port}/api/validation/${project.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: "default" })
      });
      expect(genericRunResponse.status).toBe(200);
      const genericRun = await genericRunResponse.json() as { issues: Array<{ code: string }> };
      expect(genericRun.issues.map((issue) => issue.code)).not.toContain("ACCOUNT_TYPE_MISSING");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("imports OneStream XML as an editable project and preserves unknown fields on export", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, defaultAppConfig).listen(0);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<OneStreamXF version="9.3.0.0">
  <metadataRoot>
    <dimensions>
      <dimension type="Account" name="Accounts" description="Account metadata" accessGroup="Everyone" maintenanceGroup="Admins" customDimAttr="dim-custom">
        <members>
          <member name="Revenue" description="Revenue accounts" customMemberAttr="member-custom">
            <properties>
              <property name="AccountType" value="Revenue" />
              <property name="LegacyMemberFlag" value="PreserveMember" />
            </properties>
          </member>
        </members>
        <relationships>
          <relationship parent="Root" child="Revenue" aggregationWeight="1" customRelationshipAttr="relationship-custom" />
        </relationships>
      </dimension>
    </dimensions>
  </metadataRoot>
</OneStreamXF>`;

    try {
      const { port } = server.address() as AddressInfo;
      const formData = new FormData();
      formData.append("file", new Blob([xml], { type: "application/xml" }), "accounts.xml");
      formData.append("projectName", "Imported XML Project");

      const response = await fetch(`http://127.0.0.1:${port}/api/import/xml`, {
        method: "POST",
        body: formData
      });

      expect(response.status).toBe(200);
      const result = await response.json() as {
        project: ProjectRecord;
        importSummary: Record<string, unknown>;
      };
      expect(result.project.name).toBe("Imported XML Project");
      expect(result.project.sourceFileName).toBe("accounts.xml");
      expect(result.importSummary).toMatchObject({
        dimensionsImported: 1,
        membersImported: 1,
        relationshipsImported: 1,
        unknownAttributesPreserved: 3,
        unknownPropertiesPreserved: 1
      });

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${result.project.id}/dimensions`);
      expect(dimensionsResponse.status).toBe(200);
      const dimensions = await dimensionsResponse.json() as Array<{ id: string; dimensionType: string; dimensionName: string }>;
      expect(dimensions).toMatchObject([{ dimensionType: "Account", dimensionName: "Accounts" }]);

      const membersResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${result.project.id}/dimensions/${dimensions[0].id}/members`);
      expect(membersResponse.status).toBe(200);
      const members = await membersResponse.json() as { rows: Array<{ memberKey: string; properties: Record<string, unknown> }> };
      expect(members.rows).toHaveLength(1);
      expect(members.rows[0]).toMatchObject({
        memberKey: "Revenue",
        properties: { "Account Type": "Revenue" }
      });

      const exportResponse = await fetch(`http://127.0.0.1:${port}/api/export/${result.project.id}/xml`);
      expect(exportResponse.status).toBe(200);
      const exportedXml = await exportResponse.text();
      expect(exportedXml).toContain('customDimAttr="dim-custom"');
      expect(exportedXml).toContain('customMemberAttr="member-custom"');
      expect(exportedXml).toContain('customRelationshipAttr="relationship-custom"');
      expect(exportedXml).toContain('<property name="LegacyMemberFlag" value="PreserveMember" />');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("persists project baselines and metadata diff runs through project routes", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Diff API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const baselineResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Before account changes", sourceType: "snapshot" })
      });
      expect(baselineResponse.status).toBe(201);
      const baseline = await baselineResponse.json() as { id: string; name: string; sourceType: string };
      expect(baseline).toMatchObject({ name: "Before account changes", sourceType: "snapshot" });

      const memberResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberKey: "Revenue",
          properties: { Account: "Revenue", Description: "Revenue", "Account Type": "Revenue" }
        })
      });
      expect(memberResponse.status).toBe(201);
      const relationshipResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentKey: "Root",
          childKey: "Revenue",
          properties: { Parent: "Root", Child: "Revenue" }
        })
      });
      expect(relationshipResponse.status).toBe(201);

      const runResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId: baseline.id })
      });
      expect(runResponse.status).toBe(201);
      const run = await runResponse.json() as { id: string; baselineId: string; summary: { members: { adds: number }; relationships: { adds: number } } };
      expect(run.baselineId).toBe(baseline.id);
      expect(run.summary.members.adds).toBeGreaterThanOrEqual(1);
      expect(run.summary.relationships.adds).toBeGreaterThanOrEqual(1);

      const listResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/baselines`);
      expect(listResponse.status).toBe(200);
      expect(await listResponse.json()).toMatchObject([{ id: baseline.id }]);

      const runGetResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/diff/${run.id}`);
      expect(runGetResponse.status).toBe(200);
      expect(await runGetResponse.json()).toMatchObject({ id: run.id, baselineId: baseline.id, status: "completed" });

      const itemsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/diff/${run.id}/items`);
      expect(itemsResponse.status).toBe(200);
      const items = await itemsResponse.json() as Array<{ changeType: string; targetType: string; objectKey: string }>;
      expect(items).toEqual(expect.arrayContaining([
        expect.objectContaining({ targetType: "member", changeType: "add", objectKey: "Revenue" }),
        expect.objectContaining({ targetType: "relationship", changeType: "add", objectKey: "Root -> Revenue" })
      ]));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("plans relationship export operations and uses XML mode query parameters", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Relationship Plan API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      for (const memberKey of ["OldParent", "NewParent", "AltParent", "Moved", "Copied"]) {
        const response = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberKey, properties: { Account: memberKey } })
        });
        expect(response.status).toBe(201);
      }

      const oldMovedRelationship = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentKey: "OldParent", childKey: "Moved", properties: { Parent: "OldParent", Child: "Moved" } })
      }).then((response) => response.json()) as { id: string };
      const copiedRelationship = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentKey: "OldParent", childKey: "Copied", properties: { Parent: "OldParent", Child: "Copied" } })
      }).then((response) => response.json()) as { id: string };
      expect(copiedRelationship.id).toBeTruthy();

      const baselineResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Before hierarchy edits", sourceType: "snapshot" })
      });
      expect(baselineResponse.status).toBe(201);
      const baseline = await baselineResponse.json() as { id: string };

      const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/relationships/${oldMovedRelationship.id}`, {
        method: "DELETE"
      });
      expect(deleteResponse.status).toBe(200);
      for (const relationship of [
        { parentKey: "NewParent", childKey: "Moved" },
        { parentKey: "AltParent", childKey: "Copied" }
      ]) {
        const response = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...relationship, properties: { Parent: relationship.parentKey, Child: relationship.childKey } })
        });
        expect(response.status).toBe(201);
      }

      const planResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/relationship-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId: baseline.id, mode: "moveCopy", dimensionId: account.id })
      });
      expect(planResponse.status).toBe(200);
      const plan = await planResponse.json() as {
        mode: string;
        summary: { moves: number; copies: number; warnings: number };
        items: Array<{ operation: string; childKey: string; oldParentKey?: string; newParentKey?: string }>;
      };
      expect(plan.summary).toMatchObject({ moves: 1, copies: 1 });
      expect(plan.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ operation: "move", childKey: "Moved", oldParentKey: "OldParent", newParentKey: "NewParent" }),
        expect.objectContaining({ operation: "copy", childKey: "Copied" })
      ]));

      const exportResponse = await fetch(`http://127.0.0.1:${port}/api/export/${project.id}/xml?mode=moveCopy&baselineId=${baseline.id}&dimensionId=${account.id}`);
      expect(exportResponse.status).toBe(200);
      const xml = await exportResponse.text();
      expect(xml).toContain('<relationshipOperations mode="moveCopy"');
      expect(xml).toContain('operation="move"');
      expect(xml).toContain('operation="copy"');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("supports change set validation, approval, and release package export", async () => {
    const db = createDatabase(":memory:");
    const exportsDirectory = join(process.cwd(), "data", `test-release-exports-${Date.now()}`);
    mkdirSync(exportsDirectory, { recursive: true });
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      paths: {
        ...defaultAppConfig.paths,
        exportsDirectory
      },
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Change Set API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const baselineResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Before release", sourceType: "snapshot" })
      });
      expect(baselineResponse.status).toBe(201);
      const baseline = await baselineResponse.json() as { id: string };

      const memberResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberKey: "Revenue",
          properties: { Account: "Revenue", Description: "Revenue", "Account Type": "Revenue" }
        })
      });
      expect(memberResponse.status).toBe(201);

      const runResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId: baseline.id })
      });
      expect(runResponse.status).toBe(201);
      const run = await runResponse.json() as { id: string };

      const createChangeSetResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diffRunId: run.id,
          name: "Revenue release",
          description: "Promote Revenue member.",
          targetEnvironment: "Production"
        })
      });
      expect(createChangeSetResponse.status).toBe(201);
      const changeSetDetail = await createChangeSetResponse.json() as {
        changeSet: { id: string; status: string; targetEnvironment: string };
        items: unknown[];
      };
      expect(changeSetDetail.changeSet).toMatchObject({ status: "draft", targetEnvironment: "Production" });
      expect(changeSetDetail.items.length).toBeGreaterThanOrEqual(1);

      const validateResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets/${changeSetDetail.changeSet.id}/validate`, {
        method: "POST"
      });
      expect(validateResponse.status).toBe(200);
      expect(await validateResponse.json()).toMatchObject({
        changeSet: { id: changeSetDetail.changeSet.id, status: "validated" },
        validationSummary: { blockingIssues: 0 }
      });

      const approveResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets/${changeSetDetail.changeSet.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Approved for package." })
      });
      expect(approveResponse.status).toBe(200);
      expect(await approveResponse.json()).toMatchObject({ changeSet: { status: "approved" } });

      const packageResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets/${changeSetDetail.changeSet.id}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "breakBuild" })
      });
      expect(packageResponse.status).toBe(201);
      const packageResult = await packageResponse.json() as {
        changeSet: { status: string };
        package: { packagePath: string };
        manifest: { mode: string; files: string[] };
      };
      expect(packageResult.changeSet.status).toBe("exported");
      expect(packageResult.manifest.mode).toBe("breakBuild");
      for (const fileName of ["01-summary.md", "02-change-set.json", "03-diff-report.csv", "04-validation-report.csv", "05-metadata.xml", "06-rollback-notes.md", "manifest.json"]) {
        expect(existsSync(join(packageResult.package.packagePath, fileName))).toBe(true);
      }
      expect(readFileSync(join(packageResult.package.packagePath, "05-metadata.xml"), "utf8")).toContain("<OneStreamXF");

      const latestPackageResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets/${changeSetDetail.changeSet.id}/package`);
      expect(latestPackageResponse.status).toBe(200);
      expect(await latestPackageResponse.json()).toMatchObject({ package: { packagePath: packageResult.package.packagePath } });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
      rmSync(exportsDirectory, { recursive: true, force: true });
    }
  });

  it("lists, reads, restores, and branches project snapshots", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Snapshot API Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      const dimensions = await dimensionsResponse.json() as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const memberResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberKey: "Revenue",
          properties: { Account: "Revenue", Description: "Revenue", Text1: "Original" }
        })
      });
      expect(memberResponse.status).toBe(201);
      const member = await memberResponse.json() as { id: string };

      const relationshipResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentKey: "Root",
          childKey: "Revenue",
          properties: { Parent: "Root", Child: "Revenue" }
        })
      });
      expect(relationshipResponse.status).toBe(201);
      const relationship = await relationshipResponse.json() as { id: string };

      const snapshotResponse = await fetch(`http://127.0.0.1:${port}/api/export/${project.id}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Before edits", description: "API restore point" })
      });
      expect(snapshotResponse.status).toBe(200);
      const snapshotCreated = await snapshotResponse.json() as { id: string };

      const snapshotsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/snapshots`);
      expect(snapshotsResponse.status).toBe(200);
      const snapshots = await snapshotsResponse.json() as Array<{ id: string; name: string }>;
      expect(snapshots).toMatchObject([{ id: snapshotCreated.id, name: "Before edits" }]);

      const snapshotDetailResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/snapshots/${snapshotCreated.id}`);
      expect(snapshotDetailResponse.status).toBe(200);
      expect(await snapshotDetailResponse.json()).toMatchObject({
        id: snapshotCreated.id,
        description: "API restore point",
        snapshot: { members: expect.arrayContaining([expect.objectContaining({ memberKey: "Revenue" })]) }
      });

      await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberKey: "RevenueRenamed",
          properties: { Account: "RevenueRenamed", Description: "Changed", Text1: "Changed" }
        })
      });
      await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/relationships/${relationship.id}`, { method: "DELETE" });

      const restoreResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/snapshots/${snapshotCreated.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(restoreResponse.status).toBe(200);
      expect(await restoreResponse.json()).toMatchObject({
        mode: "replaceCurrent",
        projectId: project.id,
        snapshotId: snapshotCreated.id,
        dimensionsRestored: 1,
        membersRestored: expect.any(Number),
        relationshipsRestored: expect.any(Number)
      });

      const restoredMembersResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`);
      const restoredMembers = await restoredMembersResponse.json() as { rows: Array<{ memberKey: string }> };
      expect(restoredMembers.rows.map((row) => row.memberKey)).toContain("Revenue");
      expect(restoredMembers.rows.map((row) => row.memberKey)).not.toContain("RevenueRenamed");

      const restoredRelationshipsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/relationships`);
      const restoredRelationships = await restoredRelationshipsResponse.json() as { rows: Array<{ parentKey: string; childKey: string }> };
      expect(restoredRelationships.rows).toEqual(expect.arrayContaining([expect.objectContaining({ parentKey: "Root", childKey: "Revenue" })]));

      const branchResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/snapshots/${snapshotCreated.id}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Snapshot API Branch" })
      });
      expect(branchResponse.status).toBe(201);
      const branchResult = await branchResponse.json() as { project: ProjectRecord; summary: { mode: string; projectId: string } };
      expect(branchResult.project).toMatchObject({ name: "Snapshot API Branch" });
      expect(branchResult.project.id).not.toBe(project.id);
      expect(branchResult.summary).toMatchObject({ mode: "newProject", projectId: branchResult.project.id });

      const branchDimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${branchResult.project.id}/dimensions`);
      const branchDimensions = await branchDimensionsResponse.json() as Array<{ id: string; dimensionType: string }>;
      const branchAccount = branchDimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!branchAccount) throw new Error("Branch account dimension was not created");
      expect(branchAccount.id).not.toBe(account.id);
      const branchMembersResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${branchResult.project.id}/dimensions/${branchAccount.id}/members`);
      const branchMembers = await branchMembersResponse.json() as { rows: Array<{ memberKey: string }> };
      expect(branchMembers.rows.map((row) => row.memberKey)).toContain("Revenue");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });

  it("blocks change set approval when validation has blocking errors unless bypassed", async () => {
    const db = createDatabase(":memory:");
    const customConfig: AppConfig = {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const server = createApp(db, customConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const projectResponse = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Approval Gate Project" })
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as ProjectRecord;
      const dimensions = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`).then((response) => response.json()) as Array<{ id: string; dimensionType: string }>;
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const baselineResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Before invalid edit", sourceType: "snapshot" })
      });
      const baseline = await baselineResponse.json() as { id: string };

      await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey: "Revenue", properties: { Account: "Revenue" } })
      });
      const run = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId: baseline.id })
      }).then((response) => response.json()) as { id: string };
      const changeSetDetail = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffRunId: run.id, name: "Invalid approval gate" })
      }).then((response) => response.json()) as { changeSet: { id: string } };

      const invalidateResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensionName: "" })
      });
      expect(invalidateResponse.status).toBe(200);

      const blockedApproval = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets/${changeSetDetail.changeSet.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Try to approve" })
      });
      expect(blockedApproval.status).toBe(409);
      expect(await blockedApproval.json()).toMatchObject({ validationSummary: { blockingIssues: 1 } });

      const bypassedApproval = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/change-sets/${changeSetDetail.changeSet.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Emergency release approval.", bypassValidation: true })
      });
      expect(bypassedApproval.status).toBe(200);
      expect(await bypassedApproval.json()).toMatchObject({
        changeSet: { id: changeSetDetail.changeSet.id, status: "approved" },
        validationSummary: { blockingIssues: 1 }
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });
});
