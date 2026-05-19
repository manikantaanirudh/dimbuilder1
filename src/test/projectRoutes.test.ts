import { AddressInfo } from "node:net";
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
});
