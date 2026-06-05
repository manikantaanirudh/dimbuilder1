import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { buildXdXray } from "../../shared/xdXray";
import type { Repositories } from "../db/repositories";

/**
 * Extensible Dimensionality X-Ray (TASK-11). Returns base/extended dimension structure, member
 * lineage (base/inherited/overridden/local), relationship differences, and risks. Inferred links
 * are always labelled `inferred` and never presented as definite.
 */
export function createXdXrayRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.get("/:projectId/extensibility/xray", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const report = buildXdXray({
      dimensions: repos.dimensions.listByProject(project.id),
      members: repos.members.listByProject(project.id),
      relationships: repos.relationships.listByProject(project.id),
      dimensionLinks: config.extensibility?.dimensionLinks,
      namingPatterns: config.extensibility?.namingPatterns
    });

    res.json(report);
  });

  return router;
}
