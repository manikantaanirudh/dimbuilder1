import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { createProjectFromBlueprints } from "../projectBlueprints";
import { scoreProjectQuality } from "../tier3/tier3Engine";
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

  router.get("/", async (_req, res) => {
    res.json(await repos.projects.list());
  });

  router.post("/", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const name = String(body.name ?? "").trim() || "New Metadata Project";
      const description = String(body.description ?? "");
      const project = await createProjectFromBlueprints(repos, config, {
        name,
        description,
        createdBy: "local-admin"
      });
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    await repos.projects.delete(project.id);
    res.status(204).end();
  });

  router.patch("/:projectId", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const updated = await repos.projects.update(project.id, {
      name: body.name,
      description: body.description
    });
    await repos.audit.record({
      projectId: project.id,
      action: "project.rename",
      entityType: "project",
      entityId: project.id,
      before: { name: project.name, description: project.description },
      after: { name: updated!.name, description: updated!.description }
    });
    res.json(updated);
  });

  router.get("/:projectId/summary", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(await repos.projects.summary(project.id));
  });

  router.get("/:projectId/quality/scores", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const rules = await repos.qualityRules.listByProject(project.id);
    const issues = await repos.issues.listByProject(project.id);
    const report = scoreProjectQuality(dimensions, members, rules, issues);

    res.json({
      overallScore: report.overallScore,
      metadataScore: report.metadataScore,
      validationScore: report.validationScore,
      issueCount: issues.length,
      dimensions: report.dimensions
    });
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
