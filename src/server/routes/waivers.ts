import { Router } from "express";
import type { Repositories } from "../db/repositories";

export function createWaiversRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/:projectId/waivers", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const waivers = await repos.validationWaivers.listByProject(project.id);
    res.json({ waivers });
  });

  router.post("/:projectId/waivers", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
    const ruleCode = typeof body.ruleCode === "string" ? body.ruleCode.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!issueId || !ruleCode || !reason) {
      return res.status(400).json({ error: "issueId, ruleCode, and reason are required" });
    }
    const created = await repos.validationWaivers.create({
      projectId: project.id,
      issueId,
      ruleCode,
      reason,
      dimensionId: typeof body.dimensionId === "string" ? body.dimensionId : undefined,
      memberKey: typeof body.memberKey === "string" ? body.memberKey : undefined,
      userId: typeof body.userId === "string" ? body.userId : undefined
    });
    await repos.audit.record({
      projectId: project.id,
      action: "validation.waiver.create",
      entityType: "project",
      entityId: project.id,
      after: { waiverId: created.id, issueId, ruleCode }
    });
    res.status(201).json(created);
  });

  router.delete("/:projectId/waivers/:waiverId", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const revoked = await repos.validationWaivers.revoke(project.id, req.params.waiverId);
    if (!revoked) return res.status(404).json({ error: "waiver not found" });
    await repos.audit.record({
      projectId: project.id,
      action: "validation.waiver.revoke",
      entityType: "project",
      entityId: project.id,
      after: { waiverId: req.params.waiverId }
    });
    res.json({ ok: true });
  });

  return router;
}
