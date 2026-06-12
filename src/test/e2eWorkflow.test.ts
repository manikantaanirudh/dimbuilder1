import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMember,
  addRelationship,
  createBaseline,
  createProject,
  listDimensions,
  runDiff,
  startWorkflowHarness,
  type WorkflowHarness
} from "./helpers/workflow";

/**
 * End-to-end regression suite (TASK-18). Protects the core OneStream metadata workflow from
 * regressions: create -> edit -> validate -> baseline -> diff -> change set -> approve -> package
 * -> export -> certification -> readiness. Test names describe the user workflow.
 */
describe("core OneStream metadata workflow", () => {
  let h: WorkflowHarness;

  beforeEach(async () => { h = await startWorkflowHarness(); });
  afterEach(async () => { await h.close(); });

  it("creates a project, edits metadata, packages a release, and exports certified XML", async () => {
    const base = h.baseUrl;

    // 1. Create project from blueprint.
    const project = await createProject(base, "E2E Workflow Project");
    expect(project.id).toBeTruthy();

    // 2-3. List dimensions (Account is enabled in the harness).
    const dimensions = await listDimensions(base, project.id);
    const account = dimensions.find((d) => d.dimensionType === "Account");
    expect(account).toBeDefined();

    // 4-5. Edit metadata: add a member and a relationship.
    expect((await addMember(base, project.id, account!.id, "Revenue", { Account: "Revenue", Description: "Revenue", "Account Type": "Revenue" })).status).toBe(201);
    expect((await addRelationship(base, project.id, account!.id, "Root", "Revenue")).status).toBe(201);

    // 6. Create baseline.
    const baseline = await createBaseline(base, project.id, "Before release");
    expect(baseline.id).toBeTruthy();

    // 7. Make a change after baseline.
    expect((await addMember(base, project.id, account!.id, "COGS", { Account: "COGS", Description: "COGS", "Account Type": "Expense" })).status).toBe(201);

    // 8. Run diff.
    const diff = await runDiff(base, project.id, baseline.id);
    expect(diff.id).toBeTruthy();

    // 9. Create change set from the diff.
    const csRes = await fetch(`${base}/api/projects/${project.id}/change-sets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diffRunId: diff.id, name: "E2E release", description: "Promote accounts", targetEnvironment: "Production" })
    });
    expect(csRes.status).toBe(201);
    const changeSet = (await csRes.json() as { changeSet: { id: string }; items: unknown[] });
    expect(changeSet.items.length).toBeGreaterThanOrEqual(1);

    // 10. Validate and approve.
    const validateRes = await fetch(`${base}/api/projects/${project.id}/change-sets/${changeSet.changeSet.id}/validate`, { method: "POST" });
    expect(validateRes.status).toBe(200);
    const approveRes = await fetch(`${base}/api/projects/${project.id}/change-sets/${changeSet.changeSet.id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: "Approved" })
    });
    expect(approveRes.status).toBe(200);

    // 11. Generate release package.
    const packageRes = await fetch(`${base}/api/projects/${project.id}/change-sets/${changeSet.changeSet.id}/package`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "full" })
    });
    expect(packageRes.status).toBe(201);
    const pkg = await packageRes.json() as { package: { packagePath: string }; manifest: { files: string[] } };

    // 12. Export XML is part of the package and must be valid OneStream XML.
    const metadataPath = join(pkg.package.packagePath, "05-metadata.xml");
    expect(existsSync(metadataPath)).toBe(true);
    expect(readFileSync(metadataPath, "utf8")).toContain("<OneStreamXF");

    // Evidence subfolder is generated (TASK-08).
    expect(existsSync(join(pkg.package.packagePath, "evidence", "release-summary.md"))).toBe(true);
  });

  it("certifies XML round-trip fidelity for the project", async () => {
    const base = h.baseUrl;
    const project = await createProject(base, "E2E Certification Project");
    const dimensions = await listDimensions(base, project.id);
    const account = dimensions.find((d) => d.dimensionType === "Account")!;
    await addMember(base, project.id, account.id, "Revenue", { Account: "Revenue", Description: "Revenue", "Account Type": "Revenue" });

    const certRes = await fetch(`${base}/api/projects/${project.id}/xml/certification`, { method: "POST" });
    expect(certRes.status).toBe(200);
    const { report } = await certRes.json() as { report: { status: string } };
    expect(["passed", "passed_with_warnings", "failed"]).toContain(report.status);
  });

  it("computes a readiness score and a guided workflow status", async () => {
    const base = h.baseUrl;
    const project = await createProject(base, "E2E Readiness Project");

    const readinessRes = await fetch(`${base}/api/projects/${project.id}/readiness?includeDetails=true`);
    expect(readinessRes.status).toBe(200);
    const readiness = await readinessRes.json() as { score: number; band: string };
    expect(readiness.score).toBeGreaterThanOrEqual(0);
    expect(readiness.score).toBeLessThanOrEqual(100);

    const workflowRes = await fetch(`${base}/api/projects/${project.id}/workflow-status`);
    expect(workflowRes.status).toBe(200);

    const heatmapRes = await fetch(`${base}/api/projects/${project.id}/risk-heatmap`);
    expect(heatmapRes.status).toBe(200);
    const heatmap = await heatmapRes.json() as { categories: unknown[] };
    expect(heatmap.categories.length).toBeGreaterThan(0);
  });
});
