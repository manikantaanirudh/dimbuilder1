import { Router } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  blueprintFromProjectDimension,
  blueprintToYamlFragment
} from "../../shared/blueprintStudio";
import { previewBulkUpdate, type BulkUpdateRequest } from "../../shared/bulkUpdate";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import {
  buildHierarchyAnalytics,
  exportHierarchyLevelizedCsv,
  exportHierarchyParentChildCsv,
  exportHierarchyPathsCsv,
  exportOrphanMembersCsv,
  exportSharedMembersCsv
} from "../../shared/hierarchyAnalytics";
import { createComparableProjectState, diffProjectMetadata } from "../../shared/metadataDiff";
import { parseExportLoadMode, planRelationshipLoadMode } from "../../shared/relationshipOperations";
import {
  renderChangeSetManifest,
  renderDiffReportCsv,
  renderReleaseNotesMarkdown,
  renderRollbackNotesMarkdown,
  renderValidationReportCsv,
  selectXmlExportModeForChangeSet,
  summarizeValidationIssues
} from "../../shared/releasePackage";
import { relationshipDefaultsToProperties, relationshipPropertiesToDefaults } from "../../shared/relationshipDefaults";
import type {
  BaselineSourceType,
  ChangeSetDetail,
  ChangeSetStatus,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectMetadataState,
  ReleasePackageMode,
  VaryingPropertyTargetType,
  VaryingPropertyValueInput
} from "../../shared/types";
import { validateDimension } from "../../shared/validationEngine";
import { exportProjectXml } from "../../shared/xmlExport";
import { parseOneStreamXml } from "../../shared/xmlImport";
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

  router.get("/:projectId/snapshots", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.snapshots.listByProject(project.id));
  });

  router.post("/:projectId/snapshots", (req, res, next) => {
    try {
      const project = repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const body = req.body ?? {};
      const name = String(body.name ?? "").trim() || `Save ${new Date().toISOString()}`;
      const description = String(body.description ?? "");
      const snapshotState = repos.snapshots.buildState(project.id);
      const snapshotId = repos.snapshots.create({
        projectId: project.id,
        name,
        description,
        snapshot: snapshotState,
        createdBy: "local-admin"
      });
      repos.audit.record({
        projectId: project.id,
        action: "snapshot.create",
        entityType: "snapshot",
        entityId: snapshotId,
        after: { name }
      });
      res.status(201).json({ id: snapshotId, name });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/snapshots/:snapshotId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const snapshot = repos.snapshots.get(project.id, req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
    res.json(snapshot);
  });

  router.post("/:projectId/snapshots/:snapshotId/restore", (req, res, next) => {
    try {
      const project = repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const snapshot = repos.snapshots.get(project.id, req.params.snapshotId);
      if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
      const summary = repos.snapshots.restoreSnapshotIntoProject(project.id, snapshot.id, {
        createdBy: "local-admin",
        restoreValidationIssues: Boolean(req.body?.restoreValidationIssues)
      });
      repos.audit.record({
        projectId: project.id,
        action: "snapshot.restore",
        entityType: "snapshot",
        entityId: snapshot.id,
        after: summary
      });
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/snapshots/:snapshotId/branch", (req, res, next) => {
    try {
      const project = repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const snapshot = repos.snapshots.get(project.id, req.params.snapshotId);
      if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
      const name = String(req.body?.name ?? "").trim() || `${snapshot.name} branch`;
      const result = repos.snapshots.createProjectFromSnapshot(snapshot.id, name, {
        createdBy: "local-admin",
        description: typeof req.body?.description === "string" ? req.body.description : undefined
      });
      repos.audit.record({
        projectId: result.project.id,
        action: "snapshot.branch",
        entityType: "snapshot",
        entityId: snapshot.id,
        before: { sourceProjectId: project.id },
        after: result.summary
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
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
    const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
    if (idsParam) {
      const ids = idsParam.split(",").map(id => id.trim()).filter(Boolean);
      const rows = repos.members.listByIds(req.params.dimensionId, ids);
      return res.json({ rows, total: rows.length });
    }
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
    try {
      const memberKey = req.body.memberKey;
      const properties = req.body.properties;
      if (!memberKey && !properties && req.body.description === undefined) {
        return res.status(400).json({ error: "Provide memberKey, properties, or description to update" });
      }

      const existing = repos.members.getById(req.params.memberId);
      if (!existing) return res.status(404).json({ error: "Member not found" });

      const finalKey = memberKey ?? existing.memberKey;
      const finalProps = properties ?? { ...existing.properties };
      if (req.body.description !== undefined) {
        finalProps.Description = req.body.description;
      }
      repos.members.update(req.params.memberId, { memberKey: finalKey, properties: finalProps });

      repos.audit.record({
        projectId: req.params.projectId,
        action: "member.update",
        entityType: "member",
        entityId: req.params.memberId,
        after: req.body
      });

      const updated = repos.members.getById(req.params.memberId);
      res.json(updated ?? { id: req.params.memberId, memberKey: finalKey, properties: finalProps });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
    }
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
    const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
    if (idsParam) {
      const ids = idsParam.split(",").map(id => id.trim()).filter(Boolean);
      const rows = repos.relationships.listByIds(req.params.dimensionId, ids);
      return res.json({ rows, total: rows.length });
    }
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200)));
    res.json({
      rows: repos.relationships.listByDimension(req.params.dimensionId, { offset, limit }),
      total: repos.relationships.countByDimension(req.params.dimensionId)
    });
  });

  router.get("/:projectId/dimensions/:dimensionId/hierarchy/analytics", (req, res) => {
    const state = loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.json(buildHierarchyAnalytics(state.dimension, state.members, state.relationships));
  });

  router.get("/:projectId/dimensions/:dimensionId/hierarchy/levelized.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportHierarchyLevelizedCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/:projectId/dimensions/:dimensionId/hierarchy/paths.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportHierarchyPathsCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/:projectId/dimensions/:dimensionId/hierarchy/parent-child.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportHierarchyParentChildCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/:projectId/dimensions/:dimensionId/hierarchy/shared-members.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportSharedMembersCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/:projectId/dimensions/:dimensionId/hierarchy/orphans.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportOrphanMembersCsv(state.dimension, state.members, state.relationships));
  });

  router.post("/:projectId/dimensions/:dimensionId/blueprint", (req, res) => {
    const dimension = repos.dimensions.get(req.params.dimensionId);
    if (!dimension || dimension.projectId !== req.params.projectId) return res.status(404).json({ error: "dimension not found" });
    const members = repos.members.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 });
    const relationships = repos.relationships.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 });
    const blueprint = blueprintFromProjectDimension(dimension, members, relationships);
    res.json({
      dimensionType: dimension.dimensionType,
      blueprint,
      yaml: blueprintToYamlFragment(dimension.dimensionType, blueprint)
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

  router.get("/:projectId/varying-properties", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.varyingProperties.listVaryingPropertyValues(project.id, {
      dimensionId: optionalQuery(req.query.dimensionId),
      targetType: parseTargetType(optionalQuery(req.query.targetType)),
      targetId: optionalQuery(req.query.targetId),
      propertyName: optionalQuery(req.query.propertyName)
    }));
  });

  router.post("/:projectId/varying-properties", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const input = toVaryingPropertyInput(project.id, req.body);
    if (!input) return res.status(400).json({ error: "targetType, targetId, propertyName, and dimensionId are required" });
    const dimension = repos.dimensions.get(input.dimensionId);
    if (!dimension || dimension.projectId !== project.id) return res.status(404).json({ error: "dimension not found" });
    const value = repos.varyingProperties.upsertVaryingPropertyValue(input);
    repos.audit.record({ projectId: project.id, action: "varyingProperty.create", entityType: input.targetType, entityId: input.targetId, after: value });
    res.status(201).json(value);
  });

  router.patch("/:projectId/varying-properties/:valueId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const input = toPartialVaryingPropertyInput(req.body);
    if (input.dimensionId) {
      const dimension = repos.dimensions.get(input.dimensionId);
      if (!dimension || dimension.projectId !== project.id) return res.status(404).json({ error: "dimension not found" });
    }
    const value = repos.varyingProperties.updateVaryingPropertyValue(project.id, req.params.valueId, input);
    if (!value) return res.status(404).json({ error: "varying property value not found" });
    repos.audit.record({ projectId: project.id, action: "varyingProperty.update", entityType: value.targetType, entityId: value.targetId, after: value });
    res.json(value);
  });

  router.delete("/:projectId/varying-properties/:valueId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const value = repos.varyingProperties.getVaryingPropertyValue(project.id, req.params.valueId);
    if (!value) return res.status(404).json({ error: "varying property value not found" });
    repos.varyingProperties.deleteVaryingPropertyValue(project.id, value.id);
    repos.audit.record({ projectId: project.id, action: "varyingProperty.delete", entityType: value.targetType, entityId: value.targetId, before: value });
    res.json({ ok: true });
  });

  router.post("/:projectId/baselines", (req, res, next) => {
    try {
      const project = repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const body = req.body ?? {};
      const sourceType = parseBaselineSourceType(String(body.sourceType ?? "")) ?? (body.baseline ? "json" : body.xml || body.xmlContent ? "xml" : "snapshot");
      const name = String(body.name ?? "").trim() || defaultBaselineName(sourceType);
      const sourceFileName = String(body.sourceFileName ?? "").trim();
      const baselineState = createBaselineState(repos, project.id, body, sourceType, sourceFileName);
      const baseline = repos.baselines.create({
        projectId: project.id,
        name,
        sourceType,
        sourceFileName,
        baseline: baselineState,
        createdBy: "local-admin"
      });
      repos.audit.record({ projectId: project.id, action: "baseline.create", entityType: "baseline", entityId: baseline.id, after: baseline });
      res.status(201).json(baseline);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/baselines", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.baselines.listByProject(project.id));
  });

  router.get("/:projectId/baselines/:baselineId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const baseline = repos.baselines.get(project.id, req.params.baselineId);
    if (!baseline) return res.status(404).json({ error: "baseline not found" });
    res.json(baseline);
  });

  router.post("/:projectId/diff", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const baselineId = String(req.body?.baselineId ?? "").trim();
    if (!baselineId) return res.status(400).json({ error: "baselineId is required" });
    const baseline = repos.baselines.get(project.id, baselineId);
    if (!baseline) return res.status(404).json({ error: "baseline not found" });

    const targetState = createComparableProjectState(loadProjectState(repos, project.id));
    const result = diffProjectMetadata(baseline.baseline, targetState, isRecord(req.body?.options) ? req.body.options : {});
    const persisted = repos.diffRuns.createWithItems({
      projectId: project.id,
      baselineId: baseline.id,
      status: "completed",
      summary: result.summary,
      items: result.items,
      createdBy: "local-admin"
    });
    repos.audit.record({ projectId: project.id, action: "diff.run", entityType: "diffRun", entityId: persisted.run.id, after: persisted.run });
    res.status(201).json(persisted.run);
  });

  router.get("/:projectId/diff/:diffRunId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const run = repos.diffRuns.get(project.id, req.params.diffRunId);
    if (!run) return res.status(404).json({ error: "diff run not found" });
    res.json(run);
  });

  router.get("/:projectId/diff/:diffRunId/items", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const run = repos.diffRuns.get(project.id, req.params.diffRunId);
    if (!run) return res.status(404).json({ error: "diff run not found" });
    res.json(repos.diffRuns.listItems(run.id));
  });

  router.post("/:projectId/relationship-plan", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
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

  router.post("/:projectId/bulk-updates/preview", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const request = toBulkUpdateRequest(req.body);
    if (!request) return res.status(400).json({ error: "targetType, operation, and propertyName are required" });
    res.json(previewBulkUpdate(loadProjectState(repos, project.id), request));
  });

  router.post("/:projectId/bulk-updates/apply", (req, res, next) => {
    try {
      const project = repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const request = toBulkUpdateRequest(req.body);
      if (!request) return res.status(400).json({ error: "targetType, operation, and propertyName are required" });
      const state = loadProjectState(repos, project.id);
      const preview = previewBulkUpdate(state, request);
      const dimensionsById = new Map(state.dimensions.map((dimension) => [dimension.id, dimension]));
      const membersById = new Map(state.members.map((member) => [member.id, member]));
      const relationshipsById = new Map(state.relationships.map((relationship) => [relationship.id, relationship]));

      const detail = repos.transaction(() => {
        for (const item of preview.previewItems) {
          const dimension = dimensionsById.get(item.dimensionId);
          if (!dimension) throw Object.assign(new Error("bulk update dimension target not found"), { status: 409 });
          if (item.targetType === "member") {
            const member = membersById.get(item.targetId);
            if (!member) throw Object.assign(new Error("bulk update member target not found"), { status: 409 });
            applyMemberPreviewItem(repos, dimension, member, item.propertyName, item.newValue);
          } else {
            const relationship = relationshipsById.get(item.targetId);
            if (!relationship) throw Object.assign(new Error("bulk update relationship target not found"), { status: 409 });
            applyRelationshipPreviewItem(repos, relationship, item.propertyName, item.newValue);
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

  router.get("/:projectId/bulk-updates", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.bulkUpdates.listJobs(project.id));
  });

  router.get("/:projectId/bulk-updates/:jobId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.bulkUpdates.getJobDetail(project.id, req.params.jobId);
    if (!detail) return res.status(404).json({ error: "bulk update job not found" });
    res.json(detail);
  });

  router.get("/:projectId/change-sets", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.changeSets.listByProject(project.id));
  });

  router.post("/:projectId/change-sets", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const requestedDiffRunId = String(body.diffRunId ?? "").trim();
    const diffRun = requestedDiffRunId
      ? repos.diffRuns.get(project.id, requestedDiffRunId)
      : repos.diffRuns.getLatest(project.id);
    if (!diffRun) return res.status(400).json({ error: "diffRunId is required when no diff run exists" });
    const selectedItemIds = Array.isArray(body.selectedItemIds)
      ? new Set(body.selectedItemIds.map((value: unknown) => String(value)))
      : null;
    const diffItems = repos.diffRuns.listItems(diffRun.id)
      .filter((item) => !selectedItemIds || selectedItemIds.has(item.id));
    const changeSet = repos.changeSets.create({
      projectId: project.id,
      baselineId: diffRun.baselineId,
      diffRunId: diffRun.id,
      name: String(body.name ?? "").trim() || `Change set ${new Date().toISOString()}`,
      description: String(body.description ?? ""),
      targetEnvironment: String(body.targetEnvironment ?? ""),
      items: diffItems,
      createdBy: "local-admin"
    });
    repos.audit.record({ projectId: project.id, action: "changeSet.create", entityType: "changeSet", entityId: changeSet.id, after: changeSet });
    res.status(201).json(repos.changeSets.getDetail(project.id, changeSet.id));
  });

  router.get("/:projectId/change-sets/:changeSetId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, req.params.changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    res.json(detail);
  });

  router.patch("/:projectId/change-sets/:changeSetId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const status = parseChangeSetStatus(req.body?.status);
    const updated = repos.changeSets.update(project.id, req.params.changeSetId, {
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      description: typeof req.body?.description === "string" ? req.body.description : undefined,
      targetEnvironment: typeof req.body?.targetEnvironment === "string" ? req.body.targetEnvironment : undefined,
      status
    });
    if (!updated) return res.status(404).json({ error: "change set not found" });
    repos.audit.record({ projectId: project.id, action: "changeSet.update", entityType: "changeSet", entityId: updated.id, after: updated });
    res.json(repos.changeSets.getDetail(project.id, updated.id));
  });

  router.post("/:projectId/change-sets/:changeSetId/validate", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, req.params.changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    const issues = runProjectValidation(repos, config, project.id);
    const validationSummary = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
    const updated = validationSummary.blockingIssues === 0
      ? repos.changeSets.update(project.id, detail.changeSet.id, { status: "validated" })
      : detail.changeSet;
    repos.changeSets.recordApproval(project.id, detail.changeSet.id, {
      action: "comment",
      comment: validationSummary.blockingIssues === 0 ? "Validation completed with no blocking issues." : `Validation completed with ${validationSummary.blockingIssues} blocking issue(s).`,
      createdBy: "local-admin"
    });
    repos.audit.record({ projectId: project.id, action: "changeSet.validate", entityType: "changeSet", entityId: detail.changeSet.id, after: validationSummary });
    res.json({
      ...repos.changeSets.getDetail(project.id, detail.changeSet.id),
      changeSet: updated ?? detail.changeSet,
      validationSummary,
      issues
    });
  });

  router.post("/:projectId/change-sets/:changeSetId/approve", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, req.params.changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    const issues = runProjectValidation(repos, config, project.id);
    const validationSummary = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
    const bypassValidation = Boolean(req.body?.bypassValidation);
    if (validationSummary.blockingIssues > 0 && !bypassValidation) {
      return res.status(409).json({ error: "blocking validation issues prevent approval", validationSummary, issues });
    }
    const comment = String(req.body?.comment ?? "");
    const approval = repos.changeSets.recordApproval(project.id, detail.changeSet.id, {
      action: "approve",
      comment: bypassValidation ? `[Validation bypass] ${comment}`.trim() : comment,
      createdBy: "local-admin"
    });
    const updated = repos.changeSets.update(project.id, detail.changeSet.id, { status: "approved" });
    repos.audit.record({ projectId: project.id, action: "changeSet.approve", entityType: "changeSet", entityId: detail.changeSet.id, after: { approval, validationSummary, bypassValidation } });
    res.json({ ...repos.changeSets.getDetail(project.id, detail.changeSet.id), changeSet: updated ?? detail.changeSet, validationSummary, issues });
  });

  router.post("/:projectId/change-sets/:changeSetId/reject", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, req.params.changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    const approval = repos.changeSets.recordApproval(project.id, detail.changeSet.id, {
      action: "reject",
      comment: String(req.body?.comment ?? ""),
      createdBy: "local-admin"
    });
    const updated = repos.changeSets.update(project.id, detail.changeSet.id, { status: "rejected" });
    repos.audit.record({ projectId: project.id, action: "changeSet.reject", entityType: "changeSet", entityId: detail.changeSet.id, after: approval });
    res.json({ ...repos.changeSets.getDetail(project.id, detail.changeSet.id), changeSet: updated ?? detail.changeSet });
  });

  router.post("/:projectId/change-sets/:changeSetId/package", (req, res, next) => {
    try {
      const project = repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const detail = repos.changeSets.getDetail(project.id, req.params.changeSetId);
      if (!detail) return res.status(404).json({ error: "change set not found" });
      if (detail.changeSet.status !== "approved" && detail.changeSet.status !== "exported") {
        return res.status(409).json({ error: "change set must be approved before packaging" });
      }

      const issues = runProjectValidation(repos, config, project.id);
      const validationSummary = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
      const mode = selectXmlExportModeForChangeSet(detail, parsePackageMode(req.body?.mode));
      const packageName = safeFileSegment(String(req.body?.packageName ?? "").trim() || `${detail.changeSet.name}-${new Date().toISOString()}`);
      const packagePath = join(config.paths.exportsDirectory, "release-packages", `${packageName}-${detail.changeSet.id.slice(0, 8)}`);
      const packagedDetail: ChangeSetDetail = {
        ...detail,
        changeSet: { ...detail.changeSet, status: "exported" }
      };
      const files = ["01-summary.md", "02-change-set.json", "03-diff-report.csv", "04-validation-report.csv", "05-metadata.xml", "06-rollback-notes.md", "manifest.json"];
      const manifest = renderChangeSetManifest(packagedDetail, {
        packageName,
        packagePath,
        mode,
        files,
        validationSummary
      });
      mkdirSync(packagePath, { recursive: true });
      writeFileSync(join(packagePath, "01-summary.md"), renderReleaseNotesMarkdown(packagedDetail));
      writeFileSync(join(packagePath, "02-change-set.json"), JSON.stringify(packagedDetail, null, 2));
      writeFileSync(join(packagePath, "03-diff-report.csv"), renderDiffReportCsv(packagedDetail.items));
      writeFileSync(join(packagePath, "04-validation-report.csv"), renderValidationReportCsv(issues));
      writeFileSync(join(packagePath, "05-metadata.xml"), exportProjectXml(readSnapshot(repos, project.id), {
        oneStreamVersionFallback: config.application.oneStreamVersionFallback,
        prettyPrint: config.export.xml.prettyPrint,
        skipBlankMemberRows: config.export.xml.skipBlankMemberRows,
        skipFormulaErrors: config.export.xml.skipFormulaErrors,
        includeDimensionSourceAttributes: config.export.xml.includeDimensionSourceAttributes
      }));
      writeFileSync(join(packagePath, "06-rollback-notes.md"), renderRollbackNotesMarkdown(packagedDetail));
      writeFileSync(join(packagePath, "manifest.json"), JSON.stringify(manifest, null, 2));
      const packageRecord = repos.changeSets.createReleasePackage({
        changeSetId: detail.changeSet.id,
        packageName,
        packagePath,
        manifest,
        createdBy: "local-admin"
      });
      const updated = repos.changeSets.update(project.id, detail.changeSet.id, { status: "exported" });
      repos.audit.record({ projectId: project.id, action: "changeSet.package", entityType: "changeSet", entityId: detail.changeSet.id, after: { package: packageRecord, manifest } });
      res.status(201).json({
        ...repos.changeSets.getDetail(project.id, detail.changeSet.id),
        changeSet: updated ?? packagedDetail.changeSet,
        package: packageRecord,
        manifest,
        validationSummary
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/change-sets/:changeSetId/package", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, req.params.changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    if (!detail.latestPackage) return res.status(404).json({ error: "release package not found" });
    res.json({ changeSet: detail.changeSet, package: detail.latestPackage, manifest: detail.latestPackage.manifest });
  });

  router.get("/:projectId/issues", (req, res) => {
    res.json(repos.issues.listByProject(req.params.projectId));
  });

  router.get("/:projectId/validation-config", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = repos.validationOverrides.listByProject(project.id);
    res.json({ overrides });
  });

  router.post("/:projectId/validation-config", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const overrides = req.body?.overrides;
    if (!Array.isArray(overrides)) return res.status(400).json({ error: "overrides must be an array" });
    for (const override of overrides) {
      if (!override.ruleCode || !override.severity) continue;
      if (override.severity === "default") {
        repos.validationOverrides.deleteByProject(project.id, override.ruleCode);
      } else {
        repos.validationOverrides.upsert(project.id, override.ruleCode, override.severity);
      }
    }
    repos.audit.record({ projectId: project.id, action: "validation.configUpdate", entityType: "project", entityId: project.id, after: { overrides } });
    const result = repos.validationOverrides.listByProject(project.id);
    res.json({ overrides: result });
  });

  return router;
}

function loadProjectState(repos: Repositories, projectId: string): ProjectMetadataState {
  const project = repos.projects.get(projectId) ?? undefined;
  return {
    project,
    dimensions: repos.dimensions.listByProject(projectId),
    members: repos.members.listByProject(projectId),
    relationships: repos.relationships.listByProject(projectId)
  };
}

function loadDimensionHierarchyState(repos: Repositories, projectId: string, dimensionId: string) {
  const dimension = repos.dimensions.get(dimensionId);
  if (!dimension || dimension.projectId !== projectId) return null;
  return {
    dimension,
    members: repos.members.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 }),
    relationships: repos.relationships.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 })
  };
}

function readSnapshot(repos: Repositories, projectId: string) {
  const project = repos.projects.get(projectId);
  if (!project) throw Object.assign(new Error("project not found"), { status: 404 });
  return {
    project,
    dimensions: repos.dimensions.listByProject(project.id),
    members: repos.members.listByProject(project.id),
    relationships: repos.relationships.listByProject(project.id),
    varyingPropertyValues: repos.varyingProperties.listVaryingPropertyValues(project.id)
  };
}

export function runProjectValidation(repos: Repositories, config: AppConfig, projectId: string) {
  const project = repos.projects.get(projectId);
  if (!project) return [];
  const dimensions = repos.dimensions.listByProject(project.id);
  const members = repos.members.listByProject(project.id);
  const relationships = repos.relationships.listByProject(project.id);
  const varyingPropertyValues = repos.varyingProperties.listVaryingPropertyValues(project.id);
  const issues = dimensions.flatMap((dimension) =>
    validateDimension({
      project,
      dimension,
      members: members.filter((member) => member.dimensionId === dimension.id),
      relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
      varyingPropertyValues: varyingPropertyValues.filter((value) => value.dimensionId === dimension.id),
      severities: config.validation
    })
  );

  // Project-level rule: DIMENSION_MISSING_FROM_PROJECT
  const requiredTypes = ["Account", "Entity", "Scenario", "Flow"] as const;
  const presentTypes = new Set(dimensions.map(d => d.dimensionType));
  for (const requiredType of requiredTypes) {
    if (!presentTypes.has(requiredType)) {
      issues.push({
        id: `proj-missing-${requiredType}`,
        projectId: project.id,
        dimensionId: dimensions[0]?.id ?? project.id,
        entityType: "dimension",
        entityId: project.id,
        severity: "warning",
        code: "DIMENSION_MISSING_FROM_PROJECT",
        message: `Project is missing a '${requiredType}' dimension. Most OneStream applications require Account, Entity, Scenario, and Flow dimensions.`,
        fieldName: "Dimensions",
        rowNumber: null,
        createdAt: new Date().toISOString()
      });
    }
  }

  // Project-level rule: CROSS_DIMENSION_CURRENCY_INVALID
  // Check if Entity dimension members reference currencies that don't exist as Account members
  const entityDim = dimensions.find(d => d.dimensionType === "Entity");
  const accountDim = dimensions.find(d => d.dimensionType === "Account");
  if (entityDim && accountDim) {
    const entityMembers = members.filter(m => m.dimensionId === entityDim.id);
    const accountKeys = new Set(members.filter(m => m.dimensionId === accountDim.id).map(m => m.memberKey));
    for (const member of entityMembers) {
      const currency = member.properties["Default Currency"] || member.properties["Currency"];
      if (currency && typeof currency === "string" && currency.trim() !== "") {
        // Currency should typically be a valid ISO code, but if it references an Account member that doesn't exist
        if (currency.length > 5 && !accountKeys.has(currency)) {
          issues.push({
            id: `xdim-currency-${member.id}`,
            projectId: project.id,
            dimensionId: entityDim.id,
            entityType: "member",
            entityId: member.id,
            severity: "warning",
            code: "CROSS_DIMENSION_CURRENCY_INVALID",
            message: `Entity '${member.memberKey}' references currency '${currency}' which is not a recognized currency code or Account member.`,
            fieldName: "Default Currency",
            rowNumber: member.sourceRowNumber,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  }

  repos.issues.replaceForProject(project.id, issues);
  return issues;
}

function parseChangeSetStatus(value: unknown): ChangeSetStatus | undefined {
  if (value === "draft" || value === "validated" || value === "approved" || value === "exported" || value === "rejected") return value;
  return undefined;
}

function parsePackageMode(value: unknown): ReleasePackageMode {
  if (value === "full" || value === "additive" || value === "propertyUpdate" || value === "relationshipDelete" || value === "moveCopy" || value === "breakBuild") return value;
  return "full";
}

function safeFileSegment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "release-package";
}

function createBaselineState(
  repos: Repositories,
  projectId: string,
  body: Record<string, unknown>,
  sourceType: BaselineSourceType,
  sourceFileName: string
) {
  if (sourceType === "snapshot") {
    return createComparableProjectState(loadProjectState(repos, projectId));
  }

  if (sourceType === "xml") {
    const xml = String(body.xml ?? body.xmlContent ?? "").trim();
    if (!xml) throw Object.assign(new Error("xml or xmlContent is required for XML baselines"), { status: 400 });
    const parsed = parseOneStreamXml(xml, {
      projectName: String(body.name ?? "XML Baseline"),
      sourceFileName,
      createdBy: "local-admin"
    });
    return createComparableProjectState(parsed);
  }

  if (isRecord(body.baseline)) {
    return createComparableProjectState(body.baseline);
  }

  throw Object.assign(new Error("baseline is required for json/manual baselines"), { status: 400 });
}

function parseBaselineSourceType(value: string): BaselineSourceType | undefined {
  if (value === "xml" || value === "snapshot" || value === "json" || value === "manual") return value;
  return undefined;
}

function defaultBaselineName(sourceType: BaselineSourceType): string {
  if (sourceType === "snapshot") return "Current project snapshot";
  if (sourceType === "xml") return "XML baseline";
  return "Metadata baseline";
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

function applyMemberPreviewItem(
  repos: Repositories,
  dimension: DimensionRecord,
  member: DimensionMemberRecord,
  propertyName: string,
  newValue: string
): void {
  const schema = getDimensionSchema(dimension.dimensionType);
  const properties = { ...member.properties, [propertyName]: newValue };
  let memberKey = member.memberKey;
  if (propertyName === schema.memberKeyField || propertyName === "Name" || propertyName === "Member Key") {
    memberKey = newValue;
    properties[schema.memberKeyField] = newValue;
  }
  if (propertyName === "Description") properties.Description = newValue;
  repos.members.update(member.id, { memberKey, properties });
}

function applyRelationshipPreviewItem(
  repos: Repositories,
  relationship: DimensionRelationshipRecord,
  propertyName: string,
  newValue: string
): void {
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
  repos.relationships.update(relationship.id, { parentKey, childKey, properties });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
