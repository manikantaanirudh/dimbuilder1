import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import { parseExportLoadMode, planRelationshipLoadMode } from "../../shared/relationshipOperations";
import { relationshipDefaultsToProperties, relationshipPropertiesToDefaults } from "../../shared/relationshipDefaults";
import type { ProjectMetadataState } from "../../shared/types";
import type { Repositories } from "../db/repositories";
import { deleteDimension } from "../helpers/dimensionDelete";
import { deleteDimension } from "../helpers/dimensionDelete";
import { deleteMembersWithRelationships } from "../helpers/memberDelete";
import { deleteRelationshipsByIds } from "../helpers/relationshipDelete";
import { loadProjectState } from "../helpers/projectState";
import { validateMemberKey } from "../../shared/memberKeyValidation";
import { nextSortOrderForDimensionType } from "../../shared/dimensionTypeOrder";
import { createDimensionWithBlueprint } from "../projectBlueprints";
import type { DimensionType } from "../../shared/types";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createDimensionsRouter({ repos, config }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/dimensions", (req, res) => {
    res.json(repos.dimensions.listByProject((req.params as Record<string, string>).projectId));
  });

  router.patch("/dimensions/:dimensionId", (req, res) => {
    repos.dimensions.update((req.params as Record<string, string>).dimensionId, req.body);
    repos.audit.record({
      projectId: (req.params as Record<string, string>).projectId,
      action: "dimension.update",
      entityType: "dimension",
      entityId: (req.params as Record<string, string>).dimensionId,
      after: req.body
    });
    res.json({ ok: true });
  });

  router.post("/dimensions", (req, res) => {
    const projectId = (req.params as Record<string, string>).projectId;
    const project = repos.projects.get(projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const dimensionType = String(req.body.dimensionType ?? "") as DimensionType;
    if (!config.dimensions.enabledTypes.includes(dimensionType)) {
      return res.status(400).json({ error: `Unsupported dimension type '${dimensionType}'.` });
    }

    const dimensionName =
      typeof req.body.dimensionName === "string" && req.body.dimensionName.trim()
        ? req.body.dimensionName.trim()
        : undefined;
    const existingDimensions = repos.dimensions.listByProject(projectId);
    const sortOrder = nextSortOrderForDimensionType(dimensionType, existingDimensions);
    const dimension = createDimensionWithBlueprint(repos, config, projectId, dimensionType, sortOrder, {
      dimensionName
    });

    repos.audit.record({
      projectId,
      action: "dimension.create",
      entityType: "dimension",
      entityId: dimension.id,
      after: { dimensionType: dimension.dimensionType, dimensionName: dimension.dimensionName, source: "blueprint" }
    });

    res.status(201).json(dimension);
  });

  router.delete("/dimensions/:dimensionId", (req, res) => {
    const projectId = (req.params as Record<string, string>).projectId;
    const dimensionId = (req.params as Record<string, string>).dimensionId;
    const dimension = repos.dimensions.get(dimensionId);
    if (!dimension || dimension.projectId !== projectId) {
      return res.status(404).json({ error: "dimension not found" });
    }

    const result = deleteDimension(repos, dimensionId);
    if (!result) return res.status(404).json({ error: "dimension not found" });

    repos.audit.record({
      projectId,
      action: "dimension.delete",
      entityType: "dimension",
      entityId: dimensionId,
      before: {
        dimensionType: result.dimensionType,
        dimensionName: result.dimensionName,
        membersRemoved: result.membersRemoved,
        relationshipsRemoved: result.relationshipsRemoved
      }
    });

    res.json(result);
  });

  router.get("/dimensions/:dimensionId/members", (req, res) => {
    const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
    if (idsParam) {
      const ids = idsParam.split(",").map(id => id.trim()).filter(Boolean);
      const rows = repos.members.listByIds((req.params as Record<string, string>).dimensionId, ids);
      return res.json({ rows, total: rows.length });
    }
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200)));
    res.json({
      rows: repos.members.listByDimension((req.params as Record<string, string>).dimensionId, { offset, limit }),
      total: repos.members.countByDimension((req.params as Record<string, string>).dimensionId)
    });
  });

  router.post("/dimensions/:dimensionId/members", (req, res) => {
    const dimension = repos.dimensions.get((req.params as Record<string, string>).dimensionId);
    if (!dimension) return res.status(404).json({ error: "dimension not found" });
    const schema = getDimensionSchema(dimension.dimensionType);
    const properties = req.body.properties ?? {};
    const memberKey = String(req.body.memberKey ?? properties[schema.memberKeyField] ?? "");
    const keyError = validateMemberKey(memberKey, config.validation.oneStreamProfile);
    if (keyError) return res.status(400).json({ error: keyError });
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey,
      description: String(properties.Description ?? ""),
      properties,
      rowOrder: repos.members.countByDimension(dimension.id) + 1,
      sourceRowNumber: 0,
      isActive: true
    });
    repos.audit.record({ projectId: (req.params as Record<string, string>).projectId, action: "member.create", entityType: "member", entityId: member.id, after: member });
    res.status(201).json(member);
  });

  router.patch("/members/:memberId", (req, res) => {
    try {
      const memberKey = req.body.memberKey;
      const properties = req.body.properties;
      if (!memberKey && !properties && req.body.description === undefined) {
        return res.status(400).json({ error: "Provide memberKey, properties, or description to update" });
      }

      const existing = repos.members.getById((req.params as Record<string, string>).memberId);
      if (!existing) return res.status(404).json({ error: "Member not found" });

      const finalKey = memberKey ?? existing.memberKey;
      const keyError = validateMemberKey(finalKey, config.validation.oneStreamProfile);
      if (keyError) return res.status(400).json({ error: keyError });
      const finalProps = properties ?? { ...existing.properties };
      if (req.body.description !== undefined) {
        finalProps.Description = req.body.description;
      }
      repos.members.update((req.params as Record<string, string>).memberId, { memberKey: finalKey, properties: finalProps });

      repos.audit.record({
        projectId: (req.params as Record<string, string>).projectId,
        action: "member.update",
        entityType: "member",
        entityId: (req.params as Record<string, string>).memberId,
        after: req.body
      });

      const updated = repos.members.getById((req.params as Record<string, string>).memberId);
      res.json(updated ?? { id: (req.params as Record<string, string>).memberId, memberKey: finalKey, properties: finalProps });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
    }
  });

  router.delete("/members/:memberId", (req, res) => {
    const member = repos.members.getById((req.params as Record<string, string>).memberId);
    if (!member) return res.status(404).json({ error: "Member not found" });
    const result = deleteMembersWithRelationships(repos, member.dimensionId, [member.id]);
    repos.audit.record({
      projectId: (req.params as Record<string, string>).projectId,
      action: "member.delete",
      entityType: "member",
      entityId: member.id,
      after: result
    });
    res.json({ ok: true, ...result });
  });

  router.post("/dimensions/:dimensionId/members/bulk-delete", (req, res) => {
    const dimensionId = (req.params as Record<string, string>).dimensionId;
    const dimension = repos.dimensions.get(dimensionId);
    if (!dimension) return res.status(404).json({ error: "dimension not found" });
    const memberIds = Array.isArray(req.body.memberIds)
      ? req.body.memberIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (memberIds.length === 0) {
      return res.status(400).json({ error: "memberIds array is required" });
    }
    const result = deleteMembersWithRelationships(repos, dimensionId, memberIds);
    repos.audit.record({
      projectId: (req.params as Record<string, string>).projectId,
      action: "member.bulkDelete",
      entityType: "dimension",
      entityId: dimensionId,
      after: { memberIds, ...result }
    });
    res.json(result);
  });

  router.get("/dimensions/:dimensionId/relationships", (req, res) => {
    const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
    if (idsParam) {
      const ids = idsParam.split(",").map(id => id.trim()).filter(Boolean);
      const rows = repos.relationships.listByIds((req.params as Record<string, string>).dimensionId, ids);
      return res.json({ rows, total: rows.length });
    }
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200)));
    res.json({
      rows: repos.relationships.listByDimension((req.params as Record<string, string>).dimensionId, { offset, limit }),
      total: repos.relationships.countByDimension((req.params as Record<string, string>).dimensionId)
    });
  });

  router.post("/dimensions/:dimensionId/relationships", (req, res) => {
    const dimension = repos.dimensions.get((req.params as Record<string, string>).dimensionId);
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
    repos.audit.record({ projectId: (req.params as Record<string, string>).projectId, action: "relationship.create", entityType: "relationship", entityId: relationship.id, after: relationship });
    res.status(201).json(relationship);
  });

  router.patch("/relationships/:relationshipId", (req, res) => {
    repos.relationships.update((req.params as Record<string, string>).relationshipId, req.body);
    repos.audit.record({
      projectId: (req.params as Record<string, string>).projectId,
      action: "relationship.update",
      entityType: "relationship",
      entityId: (req.params as Record<string, string>).relationshipId,
      after: req.body
    });
    res.json({ ok: true });
  });

  router.delete("/relationships/:relationshipId", (req, res) => {
    const relationship = repos.relationships.getById((req.params as Record<string, string>).relationshipId);
    if (!relationship) {
      return res.status(404).json({ error: "Relationship not found" });
    }
    const result = deleteRelationshipsByIds(repos, relationship.dimensionId, [relationship.id]);
    repos.audit.record({
      projectId: (req.params as Record<string, string>).projectId,
      action: "relationship.delete",
      entityType: "relationship",
      entityId: relationship.id,
      after: result
    });
    res.json({ ok: true, ...result });
  });

  router.post("/dimensions/:dimensionId/relationships/bulk-delete", (req, res) => {
    const dimensionId = (req.params as Record<string, string>).dimensionId;
    const dimension = repos.dimensions.get(dimensionId);
    if (!dimension) return res.status(404).json({ error: "dimension not found" });
    const relationshipIds = Array.isArray(req.body.relationshipIds)
      ? req.body.relationshipIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (relationshipIds.length === 0) {
      return res.status(400).json({ error: "relationshipIds array is required" });
    }
    const result = deleteRelationshipsByIds(repos, dimensionId, relationshipIds);
    repos.audit.record({
      projectId: (req.params as Record<string, string>).projectId,
      action: "relationship.bulkDelete",
      entityType: "dimension",
      entityId: dimensionId,
      after: { relationshipIds, ...result }
    });
    res.json(result);
  });

  router.post("/relationship-plan", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const mode = parseExportLoadMode(req.body?.mode);
    const baselineId = String(req.body?.baselineId ?? "").trim();
    const dimensionId = String(req.body?.dimensionId ?? "").trim() || undefined;
    const baseline = baselineId ? repos.baselines.get(project.id, baselineId) : null;
    if (baselineId && !baseline) return res.status(404).json({ error: "baseline not found" });
    const plan = planRelationshipLoadMode(
      loadProjectState(repos, project.id),
      baseline?.baseline as ProjectMetadataState | undefined,
      mode,
      { dimensionId }
    );
    repos.audit.record({
      projectId: project.id,
      action: "relationshipPlan.run",
      entityType: "project",
      entityId: project.id,
      after: { mode, baselineId, dimensionId, summary: plan.summary }
    });
    res.json(plan);
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
