import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { ProjectRecord } from "../shared/types";

describe("project routes", () => {
  it("creates a blank metadata project from configured blueprints", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, defaultAppConfig).listen(0);

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
      expect(project.sourceFileName).toBe("");

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      expect(dimensionsResponse.status).toBe(200);
      const dimensions = await dimensionsResponse.json() as Array<{ dimensionType: string }>;
      expect(dimensions.map((dimension) => dimension.dimensionType)).toEqual(defaultAppConfig.dimensions.displayOrder);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });
});
