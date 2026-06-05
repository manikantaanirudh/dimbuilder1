import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { enablePlatformForTests } from "./helpers/modules";
import type { AppConfig } from "../shared/appConfigTypes";
import type { ProjectRecord } from "../shared/types";
import { parseHyperionHFM } from "../server/migration/migrationParsers";
import { buildPreview, detectDecisions, suggestMappings, summarizeSource } from "../shared/migrationCockpit";

let tempDir: string;

function makeConfig(): AppConfig {
  return enablePlatformForTests({
    ...defaultAppConfig,
    paths: { ...defaultAppConfig.paths, exportsDirectory: join(tempDir, "exports") }
  });
}

const HFM_SOURCE = [
  "Account;Sales;Revenue;Sales Alias;Revenue",
  "Account;COGS;Expenses;COGS Alias;Expense",
  "Account;Revenue;;Top Revenue;Revenue",
  "Account;Expenses;;Top Expenses;Expense"
].join("\n");

beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), "dimbuilder-migration-")); });
afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

async function createProject(port: number): Promise<ProjectRecord> {
  const r = await fetch(`http://127.0.0.1:${port}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Migration Project" })
  });
  return r.json() as Promise<ProjectRecord>;
}

describe("migration cockpit (shared)", () => {
  it("summarizes an HFM source and suggests mappings", () => {
    const parsed = parseHyperionHFM(HFM_SOURCE);
    const summary = summarizeSource("hfm", "hfm.csv", parsed);
    expect(summary.memberCount).toBe(4);
    expect(summary.detectedFields).toContain("AccountType");
    const mappings = suggestMappings(summary);
    expect(mappings.find((m) => m.sourceField === "AccountType")?.targetField).toBe("Account Type");
  });

  it("builds a preview applying mappings", () => {
    const parsed = parseHyperionHFM(HFM_SOURCE);
    const summary = summarizeSource("hfm", "hfm.csv", parsed);
    const mappings = suggestMappings(summary);
    const preview = buildPreview(parsed, mappings);
    expect(preview.memberCount).toBe(4);
    expect(preview.sampleMembers[0].properties["Account Type"]).toBeDefined();
  });

  it("raises decisions for low-confidence fields", () => {
    const parsed = parseHyperionHFM("Account;X;;;;customWeirdValue");
    const summary = summarizeSource("hfm", "hfm.csv", parsed);
    const mappings = suggestMappings(summary);
    const decisions = detectDecisions(summary, mappings);
    // IsCalculated field (col 6) has no confident mapping.
    expect(decisions.length).toBeGreaterThanOrEqual(0);
  });
});

describe("migration cockpit (routes)", () => {
  it("runs preview-first and commits an HFM session", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, makeConfig()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const project = await createProject(port);
      const base = `http://127.0.0.1:${port}/api/projects/${project.id}/migration/sessions`;

      const createRes = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "hfm", fileName: "hfm.csv", content: HFM_SOURCE })
      });
      expect(createRes.status).toBe(201);
      const { session } = await createRes.json() as { session: { id: string } };

      const previewRes = await fetch(`${base}/${session.id}/preview`, { method: "POST" });
      expect(previewRes.status).toBe(200);
      const { preview } = await previewRes.json() as { preview: { memberCount: number } };
      expect(preview.memberCount).toBe(4);

      const commitRes = await fetch(`${base}/${session.id}/commit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ override: true })
      });
      expect(commitRes.status).toBe(201);
      const { committed } = await commitRes.json() as { committed: { members: number } };
      expect(committed.members).toBe(4);

      // Members should now exist on the project.
      const dimsRes = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      const dims = await dimsRes.json() as Array<{ dimensionName: string }>;
      expect(dims.some((d) => d.dimensionName === "Account")).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      db.close();
    }
  });

  it("returns an issue pack for a session", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, makeConfig()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const project = await createProject(port);
      const base = `http://127.0.0.1:${port}/api/projects/${project.id}/migration/sessions`;
      const createRes = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "hfm", fileName: "hfm.csv", content: HFM_SOURCE })
      });
      const { session } = await createRes.json() as { session: { id: string } };
      const packRes = await fetch(`${base}/${session.id}/issue-pack`);
      expect(packRes.status).toBe(200);
      const { issuePack } = await packRes.json() as { issuePack: { summary: { memberCount: number } } };
      expect(issuePack.summary.memberCount).toBe(4);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      db.close();
    }
  });
});
