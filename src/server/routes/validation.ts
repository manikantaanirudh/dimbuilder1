import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { validateDimension } from "../../shared/validationEngine";
import type { Repositories } from "../db/repositories";

export function createValidationRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.post("/:projectId/run", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const issues = dimensions.flatMap((dimension) =>
      validateDimension({
        project,
        dimension,
        members: members.filter((member) => member.dimensionId === dimension.id),
        relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
        severities: {
          ...config.validation,
          duplicateMemberSeverity: req.body?.duplicateSeverity ?? config.validation.duplicateMemberSeverity
        },
        duplicateSeverity: req.body?.duplicateSeverity
      })
    );

    repos.issues.replaceForProject(project.id, issues);
    repos.audit.record({ projectId: project.id, action: "validation.run", entityType: "project", entityId: project.id, after: { issues: issues.length } });
    res.json({ issues });
  });

  return router;
}
