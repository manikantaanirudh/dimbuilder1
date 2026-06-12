import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import { buildRiskHeatmap } from "../../shared/riskHeatmap";
import { computeReadinessScore } from "../../shared/readinessScore";
import { findDuplicateVaryingPropertyValues } from "../../shared/varyingProperties";
import type { Severity } from "../../shared/types";
import type { XmlRoundTripCertificationReport } from "../../shared/xmlRoundTripCertification";
import type { Repositories } from "../db/repositories";
import { ArtifactStore } from "./artifactStore";

const VALID_SEVERITIES: Severity[] = ["error", "warning", "info", "off"];

/**
 * Metadata Risk Heatmap (TASK-15). Deterministic risk-by-dimension/category view assembled from
 * validation issues, readiness, XML certification, varying property conflicts, and artifact impact.
 */
export function createRiskHeatmapRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();
  const artifactStore = new ArtifactStore(config.paths.exportsDirectory);

  router.get("/:projectId/risk-heatmap", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const issues = await repos.issues.listByProject(project.id);

    const readiness = computeReadinessScore({
      issues,
      dimensions: dimensions.map((d) => ({ dimensionType: d.dimensionType })),
      expectedDimensionTypes: config.validation.oneStreamProfile?.expectedDimensionTypes ?? [],
      certification: null,
      exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
      weights: config.readiness?.categoryWeights
    });

    // Varying property conflicts grouped by dimension.
    const varyingValues = await repos.varyingProperties.listVaryingPropertyValues(project.id);
    const duplicates = findDuplicateVaryingPropertyValues(varyingValues);
    const varyingConflictsByDimensionId: Record<string, number> = {};
    for (const dup of duplicates) {
      const dimId = dup.records[0]?.dimensionId ?? "";
      if (dimId) varyingConflictsByDimensionId[dimId] = (varyingConflictsByDimensionId[dimId] ?? 0) + 1;
    }

    // Artifact references grouped by dimension type (from scanned artifacts).
    const artifactReferencesByDimensionType: Record<string, number> = {};
    for (const artifact of artifactStore.scannedArtifacts(project.id)) {
      for (const ref of artifact.references) {
        if (!ref.dimensionHint) continue;
        artifactReferencesByDimensionType[ref.dimensionHint] = (artifactReferencesByDimensionType[ref.dimensionHint] ?? 0) + 1;
      }
    }

    const severityFilter = parseSeverityFilter(req.query.severity);

    const report = buildRiskHeatmap({
      dimensions: dimensions.map((d) => ({ id: d.id, dimensionType: d.dimensionType, dimensionName: d.dimensionName })),
      issues,
      certificationStatus: loadCertificationStatus(config.paths.exportsDirectory, project.id),
      readinessBand: readiness.band,
      varyingConflictsByDimensionId,
      artifactReferencesByDimensionType,
      severityFilter
    });

    res.json(report);
  });

  return router;
}

function parseSeverityFilter(value: unknown): Severity[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const requested = value.split(",").map((s) => s.trim()).filter((s): s is Severity => VALID_SEVERITIES.includes(s as Severity));
  return requested.length > 0 ? requested : undefined;
}

function loadCertificationStatus(exportsDirectory: string, projectId: string): "passed" | "passed_with_warnings" | "failed" | null {
  const path = join(exportsDirectory, `${projectId}.certification.json`);
  if (!existsSync(path)) return null;
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as XmlRoundTripCertificationReport).status;
  } catch {
    return null;
  }
}
