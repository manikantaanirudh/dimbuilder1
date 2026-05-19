import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import { relationshipDefaultsToProperties, relationshipPropertiesToDefaults } from "../../shared/relationshipDefaults";
import type { Repositories } from "../db/repositories";
import { createProjectFromBlueprints } from "../projectBlueprints";

export function createProjectRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

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
    const dimension = repos.dimensions.get(req.params.dimensionId);
    if (!dimension) return res.status(404).json({ error: "dimension not found" });
    const schema = getDimensionSchema(dimension.dimensionType);
    const supportedRelationshipFields = new Set(schema.relationshipFields.map((field) => field.name));
    const relationshipDefaults = resolveRelationshipDefaults(dimension, config);
    const relationshipPropertyValues = relationshipPropertiesToDefaults(req.body.properties ?? {}, supportedRelationshipFields);
    const relationshipValues = {
      ...relationshipDefaults,
      ...relationshipPropertyValues,
      aggregationWeight: req.body.aggregationWeight ?? relationshipPropertyValues.aggregationWeight ?? relationshipDefaults.aggregationWeight,
      percentConsol: req.body.percentConsol ?? relationshipPropertyValues.percentConsol ?? relationshipDefaults.percentConsol,
      percentOwnership: req.body.percentOwnership ?? relationshipPropertyValues.percentOwnership ?? relationshipDefaults.percentOwnership,
      ownershipType: req.body.ownershipType ?? relationshipPropertyValues.ownershipType ?? relationshipDefaults.ownershipType
    };
    const parentKey = String(req.body.parentKey ?? req.body.properties?.Parent ?? "");
    const childKey = String(req.body.childKey ?? req.body.properties?.Child ?? "");
    const properties = {
      ...(req.body.properties ?? {}),
      ...relationshipDefaultsToProperties(relationshipValues, supportedRelationshipFields),
      Parent: parentKey,
      Child: childKey
    };
    const relationship = repos.relationships.create({
      dimensionId: dimension.id,
      parentKey,
      childKey,
      aggregationWeight: relationshipValues.aggregationWeight ?? null,
      percentConsol: relationshipValues.percentConsol ?? null,
      percentOwnership: relationshipValues.percentOwnership ?? null,
      ownershipType: String(relationshipValues.ownershipType ?? ""),
      properties,
      rowOrder: repos.relationships.countByDimension(dimension.id) + 1,
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

function resolveRelationshipDefaults(
  dimension: { dimensionType: keyof AppConfig["dimensions"]["blueprints"]; metadata: Record<string, unknown> },
  config: AppConfig
) {
  const metadataDefaults = dimension.metadata.relationshipDefaults;
  if (metadataDefaults && typeof metadataDefaults === "object" && !Array.isArray(metadataDefaults)) {
    return metadataDefaults as NonNullable<AppConfig["dimensions"]["blueprints"][typeof dimension.dimensionType]>["relationshipDefaults"];
  }
  return config.dimensions.blueprints[dimension.dimensionType]?.relationshipDefaults ?? {};
}
