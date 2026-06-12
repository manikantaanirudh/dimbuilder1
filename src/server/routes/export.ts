import { Router } from "express";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportMembersCsv, exportRelationshipsCsv, exportJsonBackup } from "../../shared/csvJsonExport";
import {
  assertDimensionExportWithinMemberLimit,
  assertProjectExportWithinMemberLimit
} from "../../shared/exportLimits";
import { parseExportLoadMode, planRelationshipLoadMode } from "../../shared/relationshipOperations";
import { iterateProjectXmlChunks } from "../../shared/xmlExport";
import { exportWorkbook } from "../../shared/xlsxExport";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { ParsedProject, ProjectMetadataState } from "../../shared/types";
import type { Repositories } from "../db/repositories";
import {
  assertProjectCanExport,
  assertDimensionCanExport,
  parseExportGuardOptions,
  sendExportGuardError,
  sendExportLimitError
} from "../exportGuards";

export function createExportRouter(repos: Repositories, config: AppConfig): Router {
  mkdirSync(config.paths.exportsDirectory, { recursive: true });
  const router = Router();

  router.get("/:projectId/xml", async (req, res, next) => {
    try {
      if (!config.export.xml.enabled) return disabledFormat(res, "XML");
      const projectId = req.params.projectId;
      const dimensionId = optionalQuery(req.query.dimensionId);
      const previewOnly = isTruthyFlag(req.query.preview);
      const project = await repos.projects.get(projectId);
      if (!project) return res.status(404).json({ error: "project not found" });

      if (dimensionId) {
        await assertDimensionExportWithinMemberLimit(repos, dimensionId, "xml", config);
      } else {
        await assertProjectExportWithinMemberLimit(repos, projectId, "xml", config);
      }

      const snapshot = await readSnapshot(repos, projectId, dimensionId);
      if (!snapshot) return res.status(404).json({ error: "project not found" });
      if (!previewOnly) {
        if (dimensionId) {
          if (!await guardDimensionExportRequest(req.query as Record<string, unknown>, res, repos, config, snapshot.project.id, dimensionId, "xml")) return;
        } else {
          if (!await guardExportRequest(req.query as Record<string, unknown>, res, repos, config, snapshot.project.id, "xml")) return;
        }
      }
      const mode = parseExportLoadMode(req.query.mode);
      const baselineId = optionalQuery(req.query.baselineId);
      const baseline = baselineId ? await repos.baselines.get(snapshot.project.id, baselineId) : null;
      if (baselineId && !baseline) return res.status(404).json({ error: "baseline not found" });
      const relationshipPlan = mode === "full"
        ? undefined
        : planRelationshipLoadMode(snapshot, baseline?.baseline as ProjectMetadataState | undefined, mode, { dimensionId });
      const xmlOptions = {
        oneStreamVersionFallback: config.application.oneStreamVersionFallback,
        prettyPrint: config.export.xml.prettyPrint,
        skipBlankMemberRows: config.export.xml.skipBlankMemberRows,
        skipFormulaErrors: config.export.xml.skipFormulaErrors,
        includeDimensionSourceAttributes: config.export.xml.includeDimensionSourceAttributes,
        loadMode: mode,
        relationshipPlan,
        dimensionId,
        propertyDefaults: await repos.propertyDefaults.getEffectiveDefaultsForExport(snapshot.project.id)
      };
      await repos.audit.record({ projectId: snapshot.project.id, action: "export.xml", entityType: "project", entityId: snapshot.project.id, after: { mode, baselineId, dimensionId, relationshipPlan: relationshipPlan?.summary } });
      res.type("application/xml");
      for (const chunk of iterateProjectXmlChunks(snapshot, xmlOptions)) {
        res.write(chunk);
      }
      res.end();
    } catch (error) {
      if (sendExportLimitError(res, error)) return;
      if (sendExportGuardError(res, error)) return;
      next(error);
    }
  });

  router.get("/:projectId/json", async (req, res) => {
    if (!config.export.json.enabled) return disabledFormat(res, "JSON");
    const snapshot = await readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    if (!await guardExportRequest(req.query as Record<string, unknown>, res, repos, config, snapshot.project.id, "json")) return;
    res.type("application/json").send(exportJsonBackup({ ...snapshot, importSummary: emptyImportSummary() }));
  });

  router.get("/:projectId/members.csv", async (req, res) => {
    if (!config.export.csv.enabled) return disabledFormat(res, "CSV");
    const snapshot = await readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    if (!await guardExportRequest(req.query as Record<string, unknown>, res, repos, config, snapshot.project.id, "members.csv")) return;
    res.type("text/csv").send(exportMembersCsv(snapshot.members));
  });

  router.get("/:projectId/relationships.csv", async (req, res) => {
    if (!config.export.csv.enabled) return disabledFormat(res, "CSV");
    const snapshot = await readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    if (!await guardExportRequest(req.query as Record<string, unknown>, res, repos, config, snapshot.project.id, "relationships.csv")) return;
    res.type("text/csv").send(exportRelationshipsCsv(snapshot.relationships));
  });

  router.get("/:projectId/xlsx", async (req, res, next) => {
    try {
      if (!config.export.xlsx.enabled) return disabledFormat(res, "XLSX");
      const snapshot = await readSnapshot(repos, req.params.projectId);
      if (!snapshot) return res.status(404).json({ error: "project not found" });
      if (!await guardExportRequest(req.query as Record<string, unknown>, res, repos, config, snapshot.project.id, "xlsx")) return;
      const filePath = join(config.paths.exportsDirectory, `${snapshot.project.id}.xlsx`);
      await exportWorkbook(filePath, snapshot.dimensions, snapshot.members, snapshot.relationships, { creator: config.export.xlsx.creator });
      const buffer = readFileSync(filePath);
      res
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .setHeader("Content-Disposition", `attachment; filename="${snapshot.project.name.replace(/[^A-Za-z0-9_-]+/g, "_")}.xlsx"`)
        .send(buffer);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/snapshot", async (req, res) => {
    const snapshot = await readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    if (!await guardExportRequest(req.body as Record<string, unknown>, res, repos, config, snapshot.project.id, "snapshot")) return;
    const id = await repos.snapshots.create({
      projectId: snapshot.project.id,
      name: req.body.name || `Snapshot ${new Date().toISOString()}`,
      description: req.body.description || "",
      snapshot
    });
    writeFileSync(join(config.paths.exportsDirectory, `${id}.json`), JSON.stringify(snapshot, null, 2));
    res.json({ id });
  });

  return router;
}

function disabledFormat(res: import("express").Response, format: string) {
  return res.status(404).json({ error: `${format} export is disabled` });
}

async function readSnapshot(repos: Repositories, projectId: string, dimensionId?: string) {
  const project = await repos.projects.get(projectId);
  if (!project) return null;
  if (dimensionId) {
    const dimensions = (await repos.dimensions.listByProject(project.id)).filter((dimension) => dimension.id === dimensionId);
    return {
      project,
      dimensions,
      members: dimensions.length ? await repos.members.listAllByDimension(dimensionId) : [],
      relationships: dimensions.length ? await repos.relationships.listAllByDimension(dimensionId) : [],
      varyingPropertyValues: await repos.varyingProperties.listVaryingPropertyValues(project.id)
    };
  }
  return {
    project,
    dimensions: await repos.dimensions.listByProject(project.id),
    members: await repos.members.listByProject(project.id),
    relationships: await repos.relationships.listByProject(project.id),
    varyingPropertyValues: await repos.varyingProperties.listVaryingPropertyValues(project.id)
  };
}

function optionalQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

async function guardExportRequest(
  source: Record<string, unknown>,
  res: import("express").Response,
  repos: Repositories,
  config: AppConfig,
  projectId: string,
  exportType: string
): Promise<boolean> {
  try {
    await assertProjectCanExport(projectId, config, repos, parseExportGuardOptions(source, exportType));
    return true;
  } catch (error) {
    if (sendExportLimitError(res, error)) return false;
    if (sendExportGuardError(res, error)) return false;
    throw error;
  }
}

async function guardDimensionExportRequest(
  source: Record<string, unknown>,
  res: import("express").Response,
  repos: Repositories,
  config: AppConfig,
  projectId: string,
  dimensionId: string,
  exportType: string
): Promise<boolean> {
  try {
    await assertDimensionCanExport(projectId, dimensionId, config, repos, parseExportGuardOptions(source, exportType));
    return true;
  } catch (error) {
    if (sendExportLimitError(res, error)) return false;
    if (sendExportGuardError(res, error)) return false;
    throw error;
  }
}

function emptyImportSummary(): ParsedProject["importSummary"] {
  return {
    sheetsDetected: 0,
    dimensionsImported: 0,
    membersImported: 0,
    relationshipsImported: 0,
    skippedBlankRows: 0,
    warnings: [],
    errors: []
  };
}
