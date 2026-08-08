import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { buildProjectAIContext } from "../ai/projectContext";
import { runNaturalLanguageQuery } from "../ai/aiEngine";
import { createProjectFromBlueprints } from "../projectBlueprints";
import { scoreProjectQuality } from "../tier3/tier3Engine";
import { createAssistantRouter } from "./assistant";
import { createBaselinesRouter } from "./baselines";
import { createBulkUpdatesRouter } from "./bulkUpdates";
import { createChangeSetsRouter } from "./changeSets";
import { createDimensionsRouter } from "./dimensions";
import { createHierarchyRouter } from "./hierarchy";
import { createSnapshotsRouter } from "./snapshots";
import { createProjectValidationRouter } from "./validation";
import { createVaryingPropertiesRouter } from "./varyingProperties";

import { validateDimension } from "../../shared/validationEngine";

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

  router.get("/:projectId/quality/gates", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(await repos.qualityGates.listByProject(project.id));
  });

  router.get("/:projectId/quality/rules", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(await repos.qualityRules.listByProject(project.id));
  });

  router.get("/:projectId/audit-log", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(await repos.audit.listByProject(project.id));
  });

  router.get("/:projectId/versions", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    let versions = await repos.projectVersions.listByProject(project.id);
    const maxVer = Math.max(...versions.map((v) => v.versionNumber), project.versionNumber ?? 1);
    const existingVerNums = new Set(versions.map((v) => v.versionNumber));
    for (let v = 1; v <= maxVer; v++) {
      if (!existingVerNums.has(v)) {
        versions.push({
          id: `synthetic-v${v}-${project.id}`,
          projectId: project.id,
          versionNumber: v,
          versionLabel: `v${v}`,
          sourceFileName: project.sourceFileName || `Version ${v} Seed`,
          seededAt: project.seededAt || project.createdAt,
          createdBy: project.createdBy || "local-admin",
          summary: {},
          snapshot: {}
        });
      }
    }
    versions.sort((a, b) => b.versionNumber - a.versionNumber);
    res.json(versions);
  });

  router.post("/:projectId/versions/:versionNumber/restore", async (req, res) => {
    try {
      const project = await repos.projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const verNum = parseInt(req.params.versionNumber, 10);
      if (isNaN(verNum)) return res.status(400).json({ error: "invalid version number" });

      let targetVersion = await repos.projectVersions.getByVersion(project.id, verNum);
      let snapshotData: { dimensions: any[]; members: any[]; relationships: any[] } | null = null;

      if (targetVersion && targetVersion.snapshot && Array.isArray(targetVersion.snapshot.dimensions) && targetVersion.snapshot.dimensions.length > 0) {
        snapshotData = targetVersion.snapshot as any;
      } else {
        const baselines = await repos.baselines.listByProject(project.id);
        if (baselines.length > 0 && baselines[0].baselineJson) {
          const bJson = typeof baselines[0].baselineJson === "string" ? JSON.parse(baselines[0].baselineJson) : baselines[0].baselineJson;
          if (bJson && Array.isArray(bJson.dimensions)) {
            snapshotData = bJson;
          }
        }

        if (!snapshotData) {
          const snapshotSummaries = await repos.snapshots.listByProject(project.id);
          if (snapshotSummaries.length > 0) {
            const fullSnapshot = await repos.snapshots.get(project.id, snapshotSummaries[0].id);
            if (fullSnapshot && fullSnapshot.snapshot && Array.isArray(fullSnapshot.snapshot.dimensions)) {
              snapshotData = fullSnapshot.snapshot as any;
            }
          }
        }

        if (!snapshotData) {
          const [dims, mems, rels] = await Promise.all([
            repos.dimensions.listByProject(project.id),
            repos.members.listByProject(project.id),
            repos.relationships.listByProject(project.id)
          ]);
          snapshotData = { dimensions: dims, members: mems, relationships: rels };
        }

        targetVersion = await repos.projectVersions.create({
          projectId: project.id,
          versionNumber: verNum,
          versionLabel: `v${verNum}`,
          sourceFileName: project.sourceFileName || `Version ${verNum} Seed`,
          createdBy: project.createdBy || "local-admin",
          summary: {
            dimensionsImported: snapshotData.dimensions.length,
            membersImported: snapshotData.members.length,
            relationshipsImported: snapshotData.relationships.length
          },
          snapshot: snapshotData
        });
      }

      const snapshot = snapshotData!;

      const updatedProject = await repos.transaction(async (tx) => {
        const oldDims = await tx.dimensions.listByProject(project.id);
        for (const d of oldDims) {
          await tx.dimensions.delete(d.id);
        }

        const dimensionIdMap = new Map<string, string>();
        for (const dimension of snapshot.dimensions) {
          const saved = await tx.dimensions.create({ ...dimension, projectId: project.id });
          dimensionIdMap.set(dimension.id, saved.id);
        }

        await tx.members.bulkInsert((snapshot.members || []).map((member: any) => ({
          ...member,
          dimensionId: dimensionIdMap.get(member.dimensionId) ?? member.dimensionId
        })));
        await tx.relationships.bulkInsert((snapshot.relationships || []).map((relationship: any) => ({
          ...relationship,
          dimensionId: dimensionIdMap.get(relationship.dimensionId) ?? relationship.dimensionId
        })));

        return await tx.projects.updateVersion(project.id, {
          versionNumber: verNum,
          versionLabel: `v${verNum}`,
          sourceFileName: targetVersion.sourceFileName || project.sourceFileName,
          seededAt: targetVersion.seededAt || new Date().toISOString()
        });
      });

      const [dimensions, members, relationships] = await Promise.all([
        await repos.dimensions.listByProject(project.id),
        await repos.members.listByProject(project.id),
        await repos.relationships.listByProject(project.id)
      ]);
      const issues = dimensions.flatMap((dimension) =>
        validateDimension({
          project: updatedProject ?? project,
          dimension,
          members: members.filter((member) => member.dimensionId === dimension.id),
          relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
          severities: config.validation
        })
      );
      await repos.issues.replaceForProject(project.id, issues);
      await repos.audit.record({
        projectId: project.id,
        action: "project.version.restore",
        entityType: "project",
        entityId: project.id,
        after: { restoredVersion: `v${verNum}` }
      });

      res.json({ project: updatedProject, message: `Switched project to v${verNum}` });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to switch version" });
    }
  });

  router.post("/:projectId/ai/query", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const schema = z.object({ question: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "question is required" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);
    const context = await buildProjectAIContext(repos, config, project.id) ?? undefined;

    res.json(runNaturalLanguageQuery(
      parsed.data.question,
      { dimensions, members, relationships },
      context
    ));
  });

  router.use(createAssistantRouter(repos, config));

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
