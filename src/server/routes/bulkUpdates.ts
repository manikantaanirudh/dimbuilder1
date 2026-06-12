import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { previewBulkUpdate, type BulkUpdateRequest } from "../../shared/bulkUpdate";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import type { Repositories } from "../db/repositories";
import { isRecord, loadProjectState } from "../helpers/projectState";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createBulkUpdatesRouter({ repos }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.post("/preview", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const request = toBulkUpdateRequest(req.body);
    if (!request) return res.status(400).json({ error: "targetType, operation, and propertyName are required" });
    res.json(previewBulkUpdate(await loadProjectState(repos, project.id), request));
  });

  router.post("/apply", async (req, res, next) => {
    try {
      const project = await repos.projects.get((req.params as Record<string, string>).projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const request = toBulkUpdateRequest(req.body);
      if (!request) return res.status(400).json({ error: "targetType, operation, and propertyName are required" });
      const state = await loadProjectState(repos, project.id);
      const preview = previewBulkUpdate(state, request);
      const dimensionsById = new Map(state.dimensions.map((dimension) => [dimension.id, dimension]));
      const membersById = new Map(state.members.map((member) => [member.id, member]));
      const relationshipsById = new Map(state.relationships.map((relationship) => [relationship.id, relationship]));

      const detail = await repos.transaction(async () => {
        for (const item of preview.previewItems) {
          const dimension = dimensionsById.get(item.dimensionId);
          if (!dimension) throw Object.assign(new Error("bulk update dimension target not found"), { status: 409 });
          if (item.targetType === "member") {
            const member = membersById.get(item.targetId);
            if (!member) throw Object.assign(new Error("bulk update member target not found"), { status: 409 });
            await applyMemberPreviewItem(repos, dimension, member, item.propertyName, item.newValue);
          } else {
            const relationship = relationshipsById.get(item.targetId);
            if (!relationship) throw Object.assign(new Error("bulk update relationship target not found"), { status: 409 });
            await applyRelationshipPreviewItem(repos, relationship, item.propertyName, item.newValue);
          }
        }

        const warningCount = preview.warnings.length + preview.previewItems.reduce((count, item) => count + item.warnings.length, 0);
        const created = repos.bulkUpdates.createJobWithItems({
          projectId: project.id,
          targetType: preview.targetType,
          operation: preview.operation,
          request,
          summary: {
            affectedCount: preview.affectedCount,
            skippedCount: preview.skippedCount,
            warningCount,
            warnings: preview.warnings
          },
          rollback: preview.previewItems.map((item) => ({
            targetType: item.targetType,
            targetId: item.targetId,
            propertyName: item.propertyName,
            oldValue: item.oldValue,
            newValue: item.newValue
          })),
          status: "applied",
          items: preview.previewItems.map((item) => ({
            targetId: item.targetId,
            targetKey: item.targetKey,
            propertyName: item.propertyName,
            oldValue: item.oldValue,
            newValue: item.newValue,
            status: "applied",
            message: item.warnings.join("; ")
          })),
          createdBy: "local-admin"
        });
        repos.audit.record({
          projectId: project.id,
          action: "bulkUpdate.apply",
          entityType: "bulkUpdateJob",
          entityId: created.job.id,
          after: { request, summary: created.job.summary }
        });
        return created;
      });

      res.status(201).json(detail);
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.bulkUpdates.listJobs(project.id));
  });

  router.get("/:jobId", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.bulkUpdates.getJobDetail(project.id, (req.params as Record<string, string>).jobId);
    if (!detail) return res.status(404).json({ error: "bulk update job not found" });
    res.json(detail);
  });

  return router;
}

function toBulkUpdateRequest(body: unknown): BulkUpdateRequest | null {
  if (!isRecord(body)) return null;
  const targetType = body.targetType === "relationship" ? "relationship" : body.targetType === "member" ? "member" : undefined;
  const operation = parseBulkUpdateOperation(body.operation);
  const propertyName = String(body.propertyName ?? "").trim();
  if (!targetType || !operation || !propertyName) return null;
  const filter = isRecord(body.filter) ? body.filter : {};
  return {
    targetType,
    operation,
    propertyName,
    value: body.value === undefined ? undefined : String(body.value),
    sourcePropertyName: body.sourcePropertyName === undefined ? undefined : String(body.sourcePropertyName),
    searchText: body.searchText === undefined ? undefined : String(body.searchText),
    replaceText: body.replaceText === undefined ? undefined : String(body.replaceText),
    regexPattern: body.regexPattern === undefined ? undefined : String(body.regexPattern),
    regexFlags: body.regexFlags === undefined ? undefined : String(body.regexFlags),
    filter: {
      dimensionId: optionalString(filter.dimensionId),
      activeOnly: typeof filter.activeOnly === "boolean" ? filter.activeOnly : undefined,
      memberKeyContains: optionalString(filter.memberKeyContains),
      memberKeyStartsWith: optionalString(filter.memberKeyStartsWith),
      memberKeyRegex: optionalString(filter.memberKeyRegex),
      parentKeyContains: optionalString(filter.parentKeyContains),
      parentKeyStartsWith: optionalString(filter.parentKeyStartsWith),
      parentKeyRegex: optionalString(filter.parentKeyRegex),
      childKeyContains: optionalString(filter.childKeyContains),
      childKeyStartsWith: optionalString(filter.childKeyStartsWith),
      childKeyRegex: optionalString(filter.childKeyRegex),
      propertyFilters: Array.isArray(filter.propertyFilters)
        ? filter.propertyFilters.filter(isRecord).map((propertyFilter) => ({
          propertyName: String(propertyFilter.propertyName ?? ""),
          operator: parsePropertyFilterOperator(propertyFilter.operator),
          value: propertyFilter.value === undefined ? undefined : String(propertyFilter.value)
        }))
        : undefined
    }
  };
}

function parseBulkUpdateOperation(value: unknown): BulkUpdateRequest["operation"] | undefined {
  if (
    value === "set" ||
    value === "clear" ||
    value === "replaceText" ||
    value === "append" ||
    value === "prepend" ||
    value === "copyFromProperty" ||
    value === "deriveFromParent" ||
    value === "regexReplace"
  ) {
    return value;
  }
  return undefined;
}

function parsePropertyFilterOperator(value: unknown): NonNullable<NonNullable<BulkUpdateRequest["filter"]>["propertyFilters"]>[number]["operator"] {
  if (value === "equals" || value === "notEquals" || value === "contains" || value === "blank" || value === "notBlank" || value === "regex") {
    return value;
  }
  return "equals";
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export async function applyMemberPreviewItem(
  repos: Repositories,
  dimension: DimensionRecord,
  member: DimensionMemberRecord,
  propertyName: string,
  newValue: string
): Promise<void> {
  const schema = getDimensionSchema(dimension.dimensionType);
  const properties = { ...member.properties, [propertyName]: newValue };
  let memberKey = member.memberKey;
  if (propertyName === schema.memberKeyField || propertyName === "Name" || propertyName === "Member Key") {
    memberKey = newValue;
    properties[schema.memberKeyField] = newValue;
  }
  if (propertyName === "Description") properties.Description = newValue;
  await repos.members.update(member.id, { memberKey, properties });
}

export async function applyRelationshipPreviewItem(
  repos: Repositories,
  relationship: DimensionRelationshipRecord,
  propertyName: string,
  newValue: string
): Promise<void> {
  const properties = { ...relationship.properties, [propertyName]: newValue };
  let parentKey = relationship.parentKey;
  let childKey = relationship.childKey;
  if (propertyName === "Parent") {
    parentKey = newValue;
    properties.Parent = newValue;
  }
  if (propertyName === "Child") {
    childKey = newValue;
    properties.Child = newValue;
  }
  await repos.relationships.update(relationship.id, { parentKey, childKey, properties });
}
