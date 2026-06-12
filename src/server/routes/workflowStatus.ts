import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import { computeWorkflowStatus, type WorkflowInput } from "../../shared/workflowReadiness";
import type { ChangeSetRecord } from "../../shared/types";
import type { Repositories } from "../db/repositories";

/**
 * Guided workflow status (TASK-07). Computes end-to-end stage status from real project state.
 * Advisory navigation only - existing tabs remain fully accessible.
 */
export function createWorkflowStatusRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.get("/:projectId/workflow-status", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const dimensionCount = (await repos.dimensions.listByProject(project.id)).length;
    const memberCount = (await repos.members.listByProject(project.id)).length;

    const issues = await repos.issues.listByProject(project.id);
    const validation = {
      hasRun: issues.length > 0,
      errorCount: issues.filter((i) => i.severity === "error").length,
      warningCount: issues.filter((i) => i.severity === "warning").length
    };

    const certificationStatus = loadCertificationStatus(config.paths.exportsDirectory, project.id);
    const baselineCount = (await repos.baselines.listByProject(project.id)).length;
    const impactRunCount = (await repos.impactAnalyses.listByProject(project.id)).length;

    const changeSets = await repos.changeSets.listByProject(project.id);
    const latest = pickLatestChangeSet(changeSets);
    let hasPackage = false;
    if (latest) {
      const detail = await repos.changeSets.getDetail(project.id, latest.id);
      hasPackage = Boolean(detail?.latestPackage);
    }

    const input: WorkflowInput = {
      dimensionCount,
      memberCount,
      validation,
      certificationStatus,
      impactRunCount,
      baselineCount,
      changeSet: { latestStatus: latest?.status ?? null, hasPackage }
    };

    res.json(computeWorkflowStatus(input));
  });

  return router;
}

function pickLatestChangeSet(changeSets: ChangeSetRecord[]): ChangeSetRecord | null {
  if (changeSets.length === 0) return null;
  return [...changeSets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function loadCertificationStatus(
  exportsDirectory: string,
  projectId: string
): "passed" | "passed_with_warnings" | "failed" | null {
  const path = join(exportsDirectory, `${projectId}.certification.json`);
  if (!existsSync(path)) return null;
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as { status?: string };
    if (report.status === "passed" || report.status === "passed_with_warnings" || report.status === "failed") {
      return report.status;
    }
    return null;
  } catch {
    return null;
  }
}
