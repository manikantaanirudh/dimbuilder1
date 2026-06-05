import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { groupDisplayRowsByDimensionType } from "../../shared/propertyDefaultResolver";
import type { Repositories } from "../db/repositories";

export function createPropertyDefaultsRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  router.get("/:projectId/property-defaults", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const dimensionType = typeof req.query.dimensionType === "string" ? req.query.dimensionType : undefined;
    const rows = repos.propertyDefaults.listDisplayRows(project.id, dimensionType);

    res.json({
      values: groupDisplayRowsByDimensionType(rows)
    });
  });

  router.patch("/:projectId/property-defaults/:defaultId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const body = req.body ?? {};
    const defaultValue = typeof body.defaultValue === "string" ? body.defaultValue : undefined;
    const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
    if (defaultValue === undefined && enabled === undefined) {
      return res.status(400).json({ error: "defaultValue or enabled is required" });
    }

    const updated = repos.propertyDefaults.updateCatalog(req.params.defaultId, { defaultValue, enabled });
    if (!updated) return res.status(404).json({ error: "property default not found" });

    repos.audit.record({
      projectId: project.id,
      action: "propertyDefaults.update",
      entityType: "propertyDefaultCatalog",
      entityId: updated.id,
      after: { defaultValue: updated.defaultValue, enabled: updated.enabled }
    });

    res.json({ value: updated });
  });

  return router;
}
