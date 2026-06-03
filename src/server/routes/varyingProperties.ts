import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { VaryingPropertyTargetType, VaryingPropertyValueInput } from "../../shared/types";
import type { Repositories } from "../db/repositories";
import { isRecord } from "../helpers/projectState";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createVaryingPropertiesRouter({ repos }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.varyingProperties.listVaryingPropertyValues(project.id, {
      dimensionId: optionalQuery(req.query.dimensionId),
      targetType: parseTargetType(optionalQuery(req.query.targetType)),
      targetId: optionalQuery(req.query.targetId),
      propertyName: optionalQuery(req.query.propertyName)
    }));
  });

  router.post("/", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const input = toVaryingPropertyInput(project.id, req.body);
    if (!input) return res.status(400).json({ error: "targetType, targetId, propertyName, and dimensionId are required" });
    const dimension = repos.dimensions.get(input.dimensionId);
    if (!dimension || dimension.projectId !== project.id) return res.status(404).json({ error: "dimension not found" });
    const value = repos.varyingProperties.upsertVaryingPropertyValue(input);
    repos.audit.record({ projectId: project.id, action: "varyingProperty.create", entityType: input.targetType, entityId: input.targetId, after: value });
    res.status(201).json(value);
  });

  router.patch("/:valueId", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const input = toPartialVaryingPropertyInput(req.body);
    if (input.dimensionId) {
      const dimension = repos.dimensions.get(input.dimensionId);
      if (!dimension || dimension.projectId !== project.id) return res.status(404).json({ error: "dimension not found" });
    }
    const value = repos.varyingProperties.updateVaryingPropertyValue(project.id, (req.params as Record<string, string>).valueId, input);
    if (!value) return res.status(404).json({ error: "varying property value not found" });
    repos.audit.record({ projectId: project.id, action: "varyingProperty.update", entityType: value.targetType, entityId: value.targetId, after: value });
    res.json(value);
  });

  router.delete("/:valueId", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const value = repos.varyingProperties.getVaryingPropertyValue(project.id, (req.params as Record<string, string>).valueId);
    if (!value) return res.status(404).json({ error: "varying property value not found" });
    repos.varyingProperties.deleteVaryingPropertyValue(project.id, value.id);
    repos.audit.record({ projectId: project.id, action: "varyingProperty.delete", entityType: value.targetType, entityId: value.targetId, before: value });
    res.json({ ok: true });
  });

  return router;
}

function optionalQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseTargetType(value: string | undefined): VaryingPropertyTargetType | undefined {
  if (value === "dimension" || value === "member" || value === "relationship") return value;
  return undefined;
}

function toVaryingPropertyInput(projectId: string, body: Record<string, unknown>): VaryingPropertyValueInput | null {
  const targetType = parseTargetType(String(body.targetType ?? ""));
  const targetId = String(body.targetId ?? "").trim();
  const propertyName = String(body.propertyName ?? "").trim();
  const dimensionId = String(body.dimensionId ?? "").trim();
  if (!targetType || !targetId || !propertyName || !dimensionId) return null;
  return {
    projectId,
    dimensionId,
    targetType,
    targetId,
    propertyName,
    value: String(body.value ?? ""),
    cubeType: String(body.cubeType ?? "").trim(),
    scenarioType: String(body.scenarioType ?? "").trim(),
    timeMember: String(body.timeMember ?? "").trim(),
    isDefault: Boolean(body.isDefault),
    source: String(body.source ?? "manual"),
    metadata: isRecord(body.metadata) ? body.metadata : {}
  };
}

function toPartialVaryingPropertyInput(body: Record<string, unknown>): Partial<VaryingPropertyValueInput> {
  const input: Partial<VaryingPropertyValueInput> = {};
  if (typeof body.dimensionId === "string") input.dimensionId = body.dimensionId.trim();
  const targetType = typeof body.targetType === "string" ? parseTargetType(body.targetType) : undefined;
  if (targetType) input.targetType = targetType;
  if (typeof body.targetId === "string") input.targetId = body.targetId.trim();
  if (typeof body.propertyName === "string") input.propertyName = body.propertyName.trim();
  if (body.value !== undefined) input.value = String(body.value);
  if (body.cubeType !== undefined) input.cubeType = String(body.cubeType).trim();
  if (body.scenarioType !== undefined) input.scenarioType = String(body.scenarioType).trim();
  if (body.timeMember !== undefined) input.timeMember = String(body.timeMember).trim();
  if (body.isDefault !== undefined) input.isDefault = Boolean(body.isDefault);
  if (body.source !== undefined) input.source = String(body.source);
  if (isRecord(body.metadata)) input.metadata = body.metadata;
  return input;
}
