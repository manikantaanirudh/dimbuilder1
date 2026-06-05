import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { ProjectRecord } from "../shared/types";

let tempDir: string;

function makeConfig(): AppConfig {
  return {
    ...defaultAppConfig,
    paths: { ...defaultAppConfig.paths, exportsDirectory: join(tempDir, "exports") }
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "dimbuilder-artifacts-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function createProject(port: number): Promise<ProjectRecord> {
  const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Artifact Project" })
  });
  return response.json() as Promise<ProjectRecord>;
}

describe("artifact impact scanner routes", () => {
  it("uploads, scans, lists, and assesses proposed-change impact", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, makeConfig()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const project = await createProject(port);

      const uploadRes = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/artifacts/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: "CalcRule.vb", content: "result = A#Sales + E#Houston" })
      });
      expect(uploadRes.status).toBe(201);
      const { artifact } = await uploadRes.json() as { artifact: { id: string; artifactType: string } };
      expect(artifact.artifactType).toBe("businessRule");

      const scanRes = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/artifacts/${artifact.id}/scan`, { method: "POST" });
      expect(scanRes.status).toBe(200);
      const scan = await scanRes.json() as { references: Array<{ memberKey: string }> };
      expect(scan.references.map((r) => r.memberKey)).toContain("Sales");

      const listRes = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/artifacts`);
      const list = await listRes.json() as { artifacts: Array<{ scanStatus: string; referenceCount: number }> };
      expect(list.artifacts[0].scanStatus).toBe("scanned");
      expect(list.artifacts[0].referenceCount).toBeGreaterThan(0);

      const impactRes = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/impact/proposed-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensionType: "Account", memberKey: "Sales", changeType: "delete" })
      });
      expect(impactRes.status).toBe(200);
      const { impact } = await impactRes.json() as { impact: { riskLevel: string; totalReferences: number } };
      expect(impact.riskLevel).toBe("high");
      expect(impact.totalReferences).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      db.close();
    }
  });

  it("rejects an invalid proposed change type", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, makeConfig()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const project = await createProject(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/impact/proposed-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensionType: "Account", memberKey: "Sales", changeType: "explode" })
      });
      expect(res.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      db.close();
    }
  });
});
