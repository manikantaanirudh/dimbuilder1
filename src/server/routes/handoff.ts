import { Router } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import { buildAcmHandoff } from "../../shared/acmHandoff";
import { buildEpmwareHandoff } from "../../shared/epmwareHandoff";
import { computeReadinessScore } from "../../shared/readinessScore";
import { summarizeValidationIssues } from "../../shared/releasePackage";
import type { HandoffResult } from "../../shared/handoffShared";
import type { Repositories } from "../db/repositories";

/**
 * ACM / EPMware handoff package routes (TASK-12, TASK-13). Both produce file-based handoff packages
 * from a change set for governance workflows. Neither submits to ACM or EPMware directly.
 */
export function createHandoffRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  function loadContext(projectId: string, changeSetId: string):
    | { error: string; status: number }
    | {
        project: NonNullable<ReturnType<typeof repos.projects.get>>;
        detail: NonNullable<ReturnType<typeof repos.changeSets.getDetail>>;
        issues: ReturnType<typeof repos.issues.listByProject>;
        validationStatus: string;
        readiness: ReturnType<typeof computeReadinessScore>;
        dimensionNames: Record<string, string>;
      } {
    const project = await repos.projects.get(projectId);
    if (!project) return { error: "project not found", status: 404 };
    const detail = await repos.changeSets.getDetail(projectId, changeSetId);
    if (!detail) return { error: "change set not found", status: 404 };
    const issues = await repos.issues.listByProject(projectId);
    const validation = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
    const dimensions = await repos.dimensions.listByProject(projectId);
    const dimensionNames: Record<string, string> = {};
    for (const d of dimensions) dimensionNames[d.dimensionType] = d.dimensionName;
    const readiness = computeReadinessScore({
      issues,
      dimensions: dimensions.map((d) => ({ dimensionType: d.dimensionType })),
      expectedDimensionTypes: config.validation.oneStreamProfile?.expectedDimensionTypes ?? [],
      certification: null,
      exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
      weights: config.readiness?.categoryWeights
    });
    const validationStatus = validation.blockingIssues > 0 ? "Blocked" : "Passed";
    return { project, detail, issues, validationStatus, readiness, dimensionNames };
  }

  function writePackage(type: "acm" | "epmware", projectId: string, changeSetId: string, result: HandoffResult): string {
    const dir = join(config.paths.exportsDirectory, "handoff", type, changeSetId);
    mkdirSync(dir, { recursive: true });
    for (const file of result.files) writeFileSync(join(dir, file.fileName), file.content);
    return dir;
  }

  router.post("/:projectId/change-sets/:changeSetId/handoff/acm", async (req, res) => {
    if (config.integrations?.acm?.enabled === false) {
      return res.status(403).json({ error: "ACM handoff is disabled in configuration" });
    }
    const ctx = loadContext(req.params.projectId, req.params.changeSetId);
    if ("error" in ctx) return res.status(ctx.status).json({ error: ctx.error });

    const waivers = await repos.validationWaivers.listByProject(ctx.project.id);
    const waivedIssueIds = new Set(waivers.map((w) => w.issueId));
    const waivedIssues = ctx.issues.filter((i) => waivedIssueIds.has(i.id));

    const result = buildAcmHandoff({
      detail: ctx.detail,
      projectName: ctx.project.name,
      issues: ctx.issues,
      validationStatus: ctx.validationStatus,
      readinessScore: ctx.readiness.score,
      validationProfileId: config.validation.defaultProfileId ?? "consultant-review",
      waivedIssues,
      dimensionNames: ctx.dimensionNames,
      impact: await repos.impactAnalyses.listByProject(ctx.project.id),
      config: config.integrations?.acm
    });
    const packagePath = writePackage("acm", ctx.project.id, ctx.detail.changeSet.id, result);
    await repos.audit.record({ projectId: ctx.project.id, action: "handoff.acm", entityType: "changeSet", entityId: ctx.detail.changeSet.id, after: { files: result.fileNames.length } });
    res.status(201).json({ packagePath, files: result.fileNames, warnings: result.warnings });
  });

  router.post("/:projectId/change-sets/:changeSetId/handoff/epmware", async (req, res) => {
    if (config.integrations?.epmware?.enabled === false) {
      return res.status(403).json({ error: "EPMware handoff is disabled in configuration" });
    }
    const ctx = loadContext(req.params.projectId, req.params.changeSetId);
    if ("error" in ctx) return res.status(ctx.status).json({ error: ctx.error });

    const result = buildEpmwareHandoff({
      detail: ctx.detail,
      projectName: ctx.project.name,
      issues: ctx.issues,
      validationStatus: ctx.validationStatus,
      readiness: ctx.readiness,
      config: config.integrations?.epmware
    });
    const packagePath = writePackage("epmware", ctx.project.id, ctx.detail.changeSet.id, result);
    await repos.audit.record({ projectId: ctx.project.id, action: "handoff.epmware", entityType: "changeSet", entityId: ctx.detail.changeSet.id, after: { files: result.fileNames.length } });
    res.status(201).json({ packagePath, files: result.fileNames, warnings: result.warnings });
  });

  return router;
}
