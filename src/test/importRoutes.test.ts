import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<OneStreamXF version="9.3.0.0">
  <metadataRoot>
    <dimensions>
      <dimension type="Account" name="Accounts" description="Account metadata">
        <members>
          <member name="Revenue" description="Revenue accounts" />
        </members>
        <relationships>
          <relationship parent="Root" child="Revenue" aggregationWeight="1" />
        </relationships>
      </dimension>
    </dimensions>
  </metadataRoot>
</OneStreamXF>`;

describe("import route upload policy", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let uploadsDir = "";
  let config: AppConfig;

  beforeEach(async () => {
    uploadsDir = mkdtempSync(join(tmpdir(), "dimbuilder-import-"));
    config = {
      ...defaultAppConfig,
      paths: { ...defaultAppConfig.paths, uploadsDirectory: uploadsDir },
      operations: { ...defaultAppConfig.operations!, uploadMaxMb: 1 },
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const db = createDatabase(":memory:");
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
    rmSync(uploadsDir, { recursive: true, force: true });
  });

  it("accepts a small XML upload", async () => {
    const form = new FormData();
    form.append("file", new Blob([SAMPLE_XML], { type: "application/xml" }), "sample.xml");
    const res = await fetch(`${baseUrl}/api/import/xml`, { method: "POST", body: form });
    expect(res.status).toBe(200);
  });

  it("rejects disallowed file extensions", async () => {
    const form = new FormData();
    form.append("file", new Blob(["bad"], { type: "application/octet-stream" }), "malware.exe");
    const res = await fetch(`${baseUrl}/api/import/xml`, { method: "POST", body: form });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects uploads over the configured size limit", async () => {
    const big = Buffer.alloc(Math.ceil(1.1 * 1024 * 1024), 0x41);
    const form = new FormData();
    form.append("file", new Blob([big], { type: "text/xml" }), "large.xml");
    const res = await fetch(`${baseUrl}/api/import/xml`, { method: "POST", body: form });
    expect(res.status).toBe(413);
  });
});

const SIMPLE_CSV = [
  "parent,member,description",
  ",Revenue,Revenue accounts",
  "Revenue,ProductRevenue,Product revenue"
].join("\n");

const INVALID_CSV = "parent,description\nRoot,Revenue";

describe("simple CSV metadata import routes", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let uploadsDir = "";
  let config: AppConfig;

  beforeEach(async () => {
    uploadsDir = mkdtempSync(join(tmpdir(), "dimbuilder-csv-import-"));
    config = {
      ...defaultAppConfig,
      paths: { ...defaultAppConfig.paths, uploadsDirectory: uploadsDir },
      operations: { ...defaultAppConfig.operations!, uploadMaxMb: 1 },
      dimensions: {
        ...defaultAppConfig.dimensions,
        enabledTypes: ["Account"],
        displayOrder: ["Account"]
      }
    };
    const db = createDatabase(":memory:");
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await closeServer();
    rmSync(uploadsDir, { recursive: true, force: true });
  });

  it("preview does not write project records", async () => {
    const before = await fetch(`${baseUrl}/api/projects`);
    const beforeProjects = await before.json() as unknown[];
    const form = new FormData();
    form.append("file", new Blob([SIMPLE_CSV], { type: "text/csv" }), "metadata.csv");
    form.append("dimensionType", "Account");
    form.append("dimensionName", "Accounts");
    const res = await fetch(`${baseUrl}/api/import/csv/preview`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = await res.json() as { preview: { ok: boolean; counts: { membersToCreate: number } } };
    expect(body.preview.ok).toBe(true);
    expect(body.preview.counts.membersToCreate).toBe(2);
    const after = await fetch(`${baseUrl}/api/projects`);
    const afterProjects = await after.json() as unknown[];
    expect(afterProjects.length).toBe(beforeProjects.length);
  });

  it("commit creates a new project with dimensions, members, and relationships", async () => {
    const form = new FormData();
    form.append("file", new Blob([SIMPLE_CSV], { type: "text/csv" }), "metadata.csv");
    form.append("projectName", "CSV Import Project");
    form.append("dimensionType", "Account");
    form.append("dimensionName", "Accounts");
    const res = await fetch(`${baseUrl}/api/import/csv/commit`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = await res.json() as { project: { id: string; name: string }; importSummary: Record<string, unknown> };
    expect(body.project.name).toBe("CSV Import Project");
    expect(body.importSummary.membersImported).toBe(2);
    expect(body.importSummary.relationshipsImported).toBe(1);

    const dimensions = await fetch(`${baseUrl}/api/projects/${body.project.id}/dimensions`);
    const dimensionRows = await dimensions.json() as Array<{ dimensionType: string }>;
    expect(dimensionRows.some((dimension) => dimension.dimensionType === "Account")).toBe(true);
  });

  it("existing project commit appends missing records and updates members", async () => {
    const createForm = new FormData();
    createForm.append("file", new Blob([SIMPLE_CSV], { type: "text/csv" }), "seed.csv");
    createForm.append("projectName", "Append Target");
    createForm.append("dimensionType", "Account");
    createForm.append("dimensionName", "Accounts");
    const created = await fetch(`${baseUrl}/api/import/csv/commit`, { method: "POST", body: createForm });
    const { project } = await created.json() as { project: { id: string } };

    const appendCsv = [
      "parent,member,description",
      ",Revenue,Updated revenue",
      ",Expense,Expense accounts"
    ].join("\n");
    const appendForm = new FormData();
    appendForm.append("file", new Blob([appendCsv], { type: "text/csv" }), "append.csv");
    appendForm.append("projectId", project.id);
    appendForm.append("dimensionType", "Account");
    appendForm.append("dimensionName", "Accounts");
    const appendRes = await fetch(`${baseUrl}/api/import/csv/commit`, { method: "POST", body: appendForm });
    expect(appendRes.status).toBe(200);
    const appendBody = await appendRes.json() as { importSummary: { membersImported: number; membersUpdated: number } };
    expect(appendBody.importSummary.membersUpdated).toBeGreaterThanOrEqual(1);
    expect(appendBody.importSummary.membersImported).toBeGreaterThanOrEqual(1);
  });

  it("commit blocks when preview has errors", async () => {
    const form = new FormData();
    form.append("file", new Blob([INVALID_CSV], { type: "text/csv" }), "invalid.csv");
    form.append("dimensionType", "Account");
    form.append("dimensionName", "Accounts");
    const res = await fetch(`${baseUrl}/api/import/csv/commit`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = await res.json() as { preview: { ok: boolean } };
    expect(body.preview.ok).toBe(false);
  });

  it("records validation issues after commit", async () => {
    const form = new FormData();
    form.append("file", new Blob([SIMPLE_CSV], { type: "text/csv" }), "metadata.csv");
    form.append("dimensionType", "Account");
    form.append("dimensionName", "Accounts");
    const res = await fetch(`${baseUrl}/api/import/csv/commit`, { method: "POST", body: form });
    const { project } = await res.json() as { project: { id: string } };
    const issues = await fetch(`${baseUrl}/api/projects/${project.id}/issues`);
    expect(issues.status).toBe(200);
    const issueRows = await issues.json() as unknown[];
    expect(Array.isArray(issueRows)).toBe(true);
  });
});

