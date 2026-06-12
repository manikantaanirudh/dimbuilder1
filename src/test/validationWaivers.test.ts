import { afterEach, describe, expect, it } from "vitest";
import { createProject, startWorkflowHarness, type WorkflowHarness } from "./helpers/workflow";

describe("validation waivers API", () => {
  let harness: WorkflowHarness;

  afterEach(async () => {
    await harness.close();
  });

  it("creates, lists, and revokes waivers with audit metadata", async () => {
    harness = await startWorkflowHarness();
    const project = await createProject(harness.baseUrl, "Waiver test");
    const issueId = "issue-test-1";
    const ruleCode = "MISSING_REQUIRED_DIMENSION";

    const createRes = await fetch(`${harness.baseUrl}/api/projects/${project.id}/waivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, ruleCode, reason: "Documented for pilot" })
    });
    expect(createRes.status).toBe(201);
    const { id: waiverId } = (await createRes.json()) as { id: string };

    const listRes = await fetch(`${harness.baseUrl}/api/projects/${project.id}/waivers`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { waivers: Array<{ id: string; issueId: string }> };
    expect(listed.waivers.some((w) => w.id === waiverId && w.issueId === issueId)).toBe(true);

    const revokeRes = await fetch(`${harness.baseUrl}/api/projects/${project.id}/waivers/${waiverId}`, {
      method: "DELETE"
    });
    expect(revokeRes.status).toBe(200);

    const afterRes = await fetch(`${harness.baseUrl}/api/projects/${project.id}/waivers`);
    const after = (await afterRes.json()) as { waivers: Array<{ id: string }> };
    expect(after.waivers.some((w) => w.id === waiverId)).toBe(false);
  });
});
