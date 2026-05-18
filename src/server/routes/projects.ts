import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import type { Repositories } from "../db/repositories";
import { createProjectFromBlueprints } from "../projectBlueprints";

export function createProjectRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(repos.projects.list());
  });

  router.post("/", (req, res, next) => {
    try {
      const project = createProjectFromBlueprints(repos, config, {
        name: String(req.body.name ?? "").trim() || "New Metadata Project",
        description: String(req.body.description ?? ""),
        createdBy: "local-admin"
      });
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/summary", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.projects.summary(project.id));
  });

  router.get("/:projectId/dimensions", (req, res) => {
    res.json(repos.dimensions.listByProject(req.params.projectId));
  });

  router.patch("/:projectId/dimensions/:dimensionId", (req, res) => {
    repos.dimensions.update(req.params.dimensionId, req.body);
    repos.audit.record({
      projectId: req.params.projectId,
      action: "dimension.update",
      entityType: "dimension",
      entityId: req.params.dimensionId,
      after: req.body
    });
    res.json({ ok: true });
  });

  router.get("/:projectId/dimensions/:dimensionId/members", (req, res) => {
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200)));
    res.json({
      rows: repos.members.listByDimension(req.params.dimensionId, { offset, limit }),
      total: repos.members.countByDimension(req.params.dimensionId)
    });
  });

  router.post("/:projectId/dimensions/:dimensionId/members", (req, res) => {
    const dimension = repos.dimensions.get(req.params.dimensionId);
    if (!dimension) return res.status(404).json({ error: "dimension not found" });
    const schema = getDimensionSchema(dimension.dimensionType);
    const properties = req.body.properties ?? {};
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: String(req.body.memberKey ?? properties[schema.memberKeyField] ?? ""),
      description: String(properties.Description ?? ""),
      properties,
      rowOrder: repos.members.countByDimension(dimension.id) + 1,
      sourceRowNumber: 0,
      isActive: true
    });
    repos.audit.record({ projectId: req.params.projectId, action: "member.create", entityType: "member", entityId: member.id, after: member });
    res.status(201).json(member);
  });

  router.patch("/:projectId/members/:memberId", (req, res) => {
    repos.members.update(req.params.memberId, req.body);
    repos.audit.record({
      projectId: req.params.projectId,
      action: "member.update",
      entityType: "member",
      entityId: req.params.memberId,
      after: req.body
    });
    res.json({ ok: true });
  });

  router.delete("/:projectId/members/:memberId", (req, res) => {
    repos.members.softDelete(req.params.memberId);
    repos.audit.record({
      projectId: req.params.projectId,
      action: "member.delete",
      entityType: "member",
      entityId: req.params.memberId
    });
    res.json({ ok: true });
  });

  router.get("/:projectId/dimensions/:dimensionId/relationships", (req, res) => {
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200)));
    res.json({
      rows: repos.relationships.listByDimension(req.params.dimensionId, { offset, limit }),
      total: repos.relationships.countByDimension(req.params.dimensionId)
    });
  });

  router.post("/:projectId/dimensions/:dimensionId/relationships", (req, res) => {
    const relationship = repos.relationships.create({
      dimensionId: req.params.dimensionId,
      parentKey: String(req.body.parentKey ?? req.body.properties?.Parent ?? ""),
      childKey: String(req.body.childKey ?? req.body.properties?.Child ?? ""),
      aggregationWeight: req.body.aggregationWeight ?? null,
      percentConsol: req.body.percentConsol ?? null,
      percentOwnership: req.body.percentOwnership ?? null,
      ownershipType: String(req.body.ownershipType ?? ""),
      properties: req.body.properties ?? {},
      rowOrder: repos.relationships.countByDimension(req.params.dimensionId) + 1,
      sourceRowNumber: 0
    });
    repos.audit.record({ projectId: req.params.projectId, action: "relationship.create", entityType: "relationship", entityId: relationship.id, after: relationship });
    res.status(201).json(relationship);
  });

  router.patch("/:projectId/relationships/:relationshipId", (req, res) => {
    repos.relationships.update(req.params.relationshipId, req.body);
    repos.audit.record({
      projectId: req.params.projectId,
      action: "relationship.update",
      entityType: "relationship",
      entityId: req.params.relationshipId,
      after: req.body
    });
    res.json({ ok: true });
  });

  router.delete("/:projectId/relationships/:relationshipId", (req, res) => {
    repos.relationships.delete(req.params.relationshipId);
    repos.audit.record({
      projectId: req.params.projectId,
      action: "relationship.delete",
      entityType: "relationship",
      entityId: req.params.relationshipId
    });
    res.json({ ok: true });
  });

  router.get("/:projectId/issues", (req, res) => {
    res.json(repos.issues.listByProject(req.params.projectId));
  });

  return router;
}
