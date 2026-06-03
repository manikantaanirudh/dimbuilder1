import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { createProjectFromBlueprints } from "../projectBlueprints";
import { createBaselinesRouter } from "./baselines";
import { createBulkUpdatesRouter } from "./bulkUpdates";
import { createChangeSetsRouter } from "./changeSets";
import { createDimensionsRouter } from "./dimensions";
import { createHierarchyRouter } from "./hierarchy";
import { createSnapshotsRouter } from "./snapshots";
import { createProjectValidationRouter } from "./validation";
import { createVaryingPropertiesRouter } from "./varyingProperties";

export function createProjectRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();
  const deps = { repos, config };

  router.get("/", (_req, res) => {
    res.json(repos.projects.list());
  });

  router.post("/", (req, res, next) => {
    try {
      const body = req.body ?? {};
      const name = String(body.name ?? "").trim() || "New Metadata Project";
      const description = String(body.description ?? "");
      const project = createProjectFromBlueprints(repos, config, {
        name,
        description,
        createdBy: "local-admin"
      });
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    repos.projects.delete(project.id);
    res.status(204).end();
  });

  router.patch("/:projectId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const updated = repos.projects.update(project.id, {
      name: body.name,
      description: body.description
    });
    repos.audit.record({
      projectId: project.id,
      action: "project.rename",
      entityType: "project",
      entityId: project.id,
      before: { name: project.name, description: project.description },
      after: { name: updated!.name, description: updated!.description }
    });
    res.json(updated);
  });

  router.get("/:projectId/summary", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.projects.summary(project.id));
  });

  router.use("/:projectId/snapshots", createSnapshotsRouter(deps));
  router.use("/:projectId/varying-properties", createVaryingPropertiesRouter(deps));
  router.use("/:projectId/bulk-updates", createBulkUpdatesRouter(deps));
  router.use("/:projectId/change-sets", createChangeSetsRouter(deps));
  router.use("/:projectId", createDimensionsRouter(deps));
  router.use("/:projectId", createHierarchyRouter(deps));
  router.use("/:projectId", createBaselinesRouter(deps));
  router.use("/:projectId", createProjectValidationRouter(deps));

  return router;
}
