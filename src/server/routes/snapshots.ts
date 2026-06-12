import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createSnapshotsRouter({ repos }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(await repos.snapshots.listByProject(project.id));
  });

  router.post("/", async (req, res, next) => {
    try {
      const project = await repos.projects.get((req.params as Record<string, string>).projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const body = req.body ?? {};
      const name = String(body.name ?? "").trim() || `Save ${new Date().toISOString()}`;
      const description = String(body.description ?? "");
      const snapshotState = await repos.snapshots.buildState(project.id);
      const snapshotId = await repos.snapshots.create({
        projectId: project.id,
        name,
        description,
        snapshot: snapshotState,
        createdBy: "local-admin"
      });
      await repos.audit.record({
        projectId: project.id,
        action: "snapshot.create",
        entityType: "snapshot",
        entityId: snapshotId,
        after: { name }
      });
      res.status(201).json({ id: snapshotId, name });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:snapshotId", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const snapshot = await repos.snapshots.get(project.id, (req.params as Record<string, string>).snapshotId);
    if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
    res.json(snapshot);
  });

  router.post("/:snapshotId/restore", async (req, res, next) => {
    try {
      const project = await repos.projects.get((req.params as Record<string, string>).projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const snapshot = await repos.snapshots.get(project.id, (req.params as Record<string, string>).snapshotId);
      if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
      const summary = await repos.snapshots.restoreSnapshotIntoProject(project.id, snapshot.id, {
        createdBy: "local-admin",
        restoreValidationIssues: Boolean(req.body?.restoreValidationIssues)
      });
      await repos.audit.record({
        projectId: project.id,
        action: "snapshot.restore",
        entityType: "snapshot",
        entityId: snapshot.id,
        after: summary
      });
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:snapshotId/branch", async (req, res, next) => {
    try {
      const project = await repos.projects.get((req.params as Record<string, string>).projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const snapshot = await repos.snapshots.get(project.id, (req.params as Record<string, string>).snapshotId);
      if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
      const name = String(req.body?.name ?? "").trim() || `${snapshot.name} branch`;
      const result = await repos.snapshots.createProjectFromSnapshot(snapshot.id, name, {
        createdBy: "local-admin",
        description: typeof req.body?.description === "string" ? req.body.description : undefined
      });
      await repos.audit.record({
        projectId: result.project.id,
        action: "snapshot.branch",
        entityType: "snapshot",
        entityId: snapshot.id,
        before: { sourceProjectId: project.id },
        after: result.summary
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
