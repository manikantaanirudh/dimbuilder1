import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import { computeReadinessScore, type ReadinessCertificationInput } from "../../shared/readinessScore";
import type { Repositories } from "../db/repositories";

/**
 * Deployment readiness scoring (TASK-06). Aggregates the latest validation issues, XML
 * round-trip certification status, and expected-dimension completeness into a weighted score.
 * This never hard-blocks export; it is advisory and complements the existing export guards.
 */
export function createReadinessRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.get("/:projectId/readiness", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const issues = repos.issues.listByProject(project.id);
    const dimensions = repos.dimensions.listByProject(project.id).map((d) => ({ dimensionType: d.dimensionType }));
    const expectedDimensionTypes = config.validation.oneStreamProfile?.expectedDimensionTypes ?? [];
    const certification = loadCertificationStatus(config.paths.exportsDirectory, project.id);

    const report = computeReadinessScore({
      issues,
      dimensions,
      expectedDimensionTypes,
      certification,
      exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
      weights: config.readiness?.categoryWeights
    });

    const minimumScore = config.readiness?.minimumScoreForExportWarning ?? 75;
    const exportWarning = report.score < minimumScore;

    const includeDetails = req.query.includeDetails === "true" || req.query.includeDetails === "1";
    if (!includeDetails) {
      res.json({
        score: report.score,
        band: report.band,
        generatedAt: report.generatedAt,
        exportWarning,
        minimumScoreForExportWarning: minimumScore,
        blockers: report.blockers,
        categories: report.categories.map((c) => ({ key: c.key, label: c.label, score: c.score, status: c.status }))
      });
      return;
    }

    res.json({ ...report, exportWarning, minimumScoreForExportWarning: minimumScore });
  });

  return router;
}

function loadCertificationStatus(exportsDirectory: string, projectId: string): ReadinessCertificationInput | null {
  const path = join(exportsDirectory, `${projectId}.certification.json`);
  if (!existsSync(path)) return null;
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as { status?: ReadinessCertificationInput["status"] };
    if (report.status === "passed" || report.status === "passed_with_warnings" || report.status === "failed") {
      return { status: report.status };
    }
    return null;
  } catch {
    return null;
  }
}
