import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { DimensionRecord, ProjectRecord, ValidationIssue } from "../shared/types";

const accountOnlyConfig: AppConfig = {
  ...defaultAppConfig,
  dimensions: {
    ...defaultAppConfig.dimensions,
    enabledTypes: ["Account"],
    displayOrder: ["Account"]
  }
};

interface TestServerContext {
  baseUrl: string;
}

describe("server export validation guard", () => {
  it("allows export when no stored blocking validation issues exist", async () => {
    await withServer(accountOnlyConfig, async ({ baseUrl }) => {
      const { project } = await createProject(baseUrl, "Clean Export Project");

      const response = await fetch(`${baseUrl}/api/export/${project.id}/xml`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<OneStreamXF");
    });
  });

  it("blocks every export endpoint when stored validation errors block export", async () => {
    await withServer(accountOnlyConfig, async ({ baseUrl }) => {
      const { project } = await createProjectWithBlankDimensionError(baseUrl);
      const getEndpoints = ["xml", "json", "members.csv", "relationships.csv", "xlsx"];

      for (const suffix of getEndpoints) {
        const response = await fetch(`${baseUrl}/api/export/${project.id}/${suffix}`);
        expect(response.status, suffix).toBe(409);
        expect(await response.json()).toMatchObject({
          error: "Export blocked by validation issues",
          blocked: true,
          blockedSeverities: ["error"],
          issueCounts: { error: 1, warning: 0, info: 0 }
        });
      }

      const snapshotResponse = await fetch(`${baseUrl}/api/export/${project.id}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked snapshot" })
      });
      expect(snapshotResponse.status).toBe(409);
      expect(await snapshotResponse.json()).toMatchObject({
        error: "Export blocked by validation issues",
        blocked: true,
        issueCounts: { error: 1, warning: 0, info: 0 }
      });
    });
  });

  it("does not block exports for warnings when configuration blocks only errors", async () => {
    await withServer(accountOnlyConfig, async ({ baseUrl }) => {
      const { project, account } = await createProject(baseUrl, "Warning Export Project");
      const relationshipResponse = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account.id}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentKey: "Root",
          childKey: "MissingMember",
          properties: { Parent: "Root", Child: "MissingMember" }
        })
      });
      expect(relationshipResponse.status).toBe(201);

      const validationResponse = await runValidation(baseUrl, project.id);
      expect(validationResponse.issues.some((issue) => issue.severity === "warning")).toBe(true);
      expect(validationResponse.issues.some((issue) => issue.severity === "error")).toBe(false);

      const response = await fetch(`${baseUrl}/api/export/${project.id}/json`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ project: { id: project.id } });
    });
  });

  it("keeps validation bypass disabled by default", async () => {
    await withServer(accountOnlyConfig, async ({ baseUrl }) => {
      const { project } = await createProjectWithBlankDimensionError(baseUrl);

      const response = await fetch(
        `${baseUrl}/api/export/${project.id}/xml?validationBypass=true&validationBypassReason=Emergency`
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: "Export blocked by validation issues",
        blocked: true,
        bypassAllowed: false
      });
    });
  });

  it("allows an audited validation bypass only when enabled and a required reason is provided", async () => {
    const bypassConfig: AppConfig = {
      ...accountOnlyConfig,
      export: {
        ...accountOnlyConfig.export,
        allowValidationBypass: true,
        validationBypassRequiresReason: true
      }
    };

    await withServer(bypassConfig, async ({ baseUrl }) => {
      const { project } = await createProjectWithBlankDimensionError(baseUrl);

      const missingReasonResponse = await fetch(`${baseUrl}/api/export/${project.id}/xml?validationBypass=true`);
      expect(missingReasonResponse.status).toBe(409);
      expect(await missingReasonResponse.json()).toMatchObject({
        error: "Validation bypass reason is required",
        blocked: true,
        bypassAllowed: true
      });

      const response = await fetch(
        `${baseUrl}/api/export/${project.id}/xml?validationBypass=true&validationBypassReason=Emergency%20metadata%20package`
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<OneStreamXF");
    });
  });

  it("blocks exports when validation is required before export and no validation run exists", async () => {
    const requireValidationConfig: AppConfig = {
      ...accountOnlyConfig,
      export: {
        ...accountOnlyConfig.export,
        requireValidationBeforeExport: true
      }
    };

    await withServer(requireValidationConfig, async ({ baseUrl }) => {
      const { project } = await createProject(baseUrl, "Requires Validation Project");

      const blockedResponse = await fetch(`${baseUrl}/api/export/${project.id}/xml`);
      expect(blockedResponse.status).toBe(409);
      expect(await blockedResponse.json()).toMatchObject({
        error: "Validation must run before export",
        blocked: true,
        validationRequired: true
      });

      const validationResponse = await runValidation(baseUrl, project.id);
      expect(validationResponse.issues).toEqual([]);

      const allowedResponse = await fetch(`${baseUrl}/api/export/${project.id}/xml`);
      expect(allowedResponse.status).toBe(200);
    });
  });
});

async function withServer(config: AppConfig, run: (context: TestServerContext) => Promise<void>): Promise<void> {
  const db = createDatabase(":memory:");
  const server = createApp(db, config).listen(0);

  try {
    const { port } = server.address() as AddressInfo;
    await run({ baseUrl: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    db.close();
  }
}

async function createProject(baseUrl: string, name: string): Promise<{ project: ProjectRecord; account: DimensionRecord }> {
  const projectResponse = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  expect(projectResponse.status).toBe(201);
  const project = await projectResponse.json() as ProjectRecord;
  const dimensionsResponse = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions`);
  expect(dimensionsResponse.status).toBe(200);
  const dimensions = await dimensionsResponse.json() as DimensionRecord[];
  const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
  if (!account) throw new Error("Account dimension was not created");
  return { project, account };
}

async function createProjectWithBlankDimensionError(baseUrl: string): Promise<{ project: ProjectRecord; account: DimensionRecord; issues: ValidationIssue[] }> {
  const { project, account } = await createProject(baseUrl, "Invalid Export Project");
  const patchResponse = await fetch(`${baseUrl}/api/projects/${project.id}/dimensions/${account.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dimensionName: "" })
  });
  expect(patchResponse.status).toBe(200);

  const validationResponse = await runValidation(baseUrl, project.id);
  expect(validationResponse.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: "error", code: "DIMENSION_NAME_REQUIRED" })
  ]));
  return { project, account, issues: validationResponse.issues };
}

async function runValidation(baseUrl: string, projectId: string): Promise<{ issues: ValidationIssue[] }> {
  const validationResponse = await fetch(`${baseUrl}/api/validation/${projectId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  expect(validationResponse.status).toBe(200);
  return validationResponse.json() as Promise<{ issues: ValidationIssue[] }>;
}
