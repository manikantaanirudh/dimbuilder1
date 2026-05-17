import { Router } from "express";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportMembersCsv, exportRelationshipsCsv, exportJsonBackup } from "../../shared/csvJsonExport";
import { exportProjectXml } from "../../shared/xmlExport";
import { exportWorkbook } from "../../shared/xlsxExport";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { ParsedProject } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export function createExportRouter(repos: Repositories, config: AppConfig): Router {
  mkdirSync(config.paths.exportsDirectory, { recursive: true });
  const router = Router();

  router.get("/:projectId/xml", (req, res) => {
    if (!config.export.xml.enabled) return disabledFormat(res, "XML");
    const snapshot = readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    const xml = exportProjectXml(snapshot, {
      oneStreamVersionFallback: config.application.oneStreamVersionFallback,
      prettyPrint: config.export.xml.prettyPrint,
      skipBlankMemberRows: config.export.xml.skipBlankMemberRows,
      skipFormulaErrors: config.export.xml.skipFormulaErrors,
      includeDimensionSourceAttributes: config.export.xml.includeDimensionSourceAttributes
    });
    repos.audit.record({ projectId: snapshot.project.id, action: "export.xml", entityType: "project", entityId: snapshot.project.id });
    res.type("application/xml").send(xml);
  });

  router.get("/:projectId/json", (req, res) => {
    if (!config.export.json.enabled) return disabledFormat(res, "JSON");
    const snapshot = readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    res.type("application/json").send(exportJsonBackup({ ...snapshot, importSummary: emptyImportSummary() }));
  });

  router.get("/:projectId/members.csv", (req, res) => {
    if (!config.export.csv.enabled) return disabledFormat(res, "CSV");
    const snapshot = readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    res.type("text/csv").send(exportMembersCsv(snapshot.members));
  });

  router.get("/:projectId/relationships.csv", (req, res) => {
    if (!config.export.csv.enabled) return disabledFormat(res, "CSV");
    const snapshot = readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    res.type("text/csv").send(exportRelationshipsCsv(snapshot.relationships));
  });

  router.get("/:projectId/xlsx", async (req, res, next) => {
    try {
      if (!config.export.xlsx.enabled) return disabledFormat(res, "XLSX");
      const snapshot = readSnapshot(repos, req.params.projectId);
      if (!snapshot) return res.status(404).json({ error: "project not found" });
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

  router.post("/:projectId/snapshot", (req, res) => {
    const snapshot = readSnapshot(repos, req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });
    const id = repos.snapshots.create({
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

function readSnapshot(repos: Repositories, projectId: string) {
  const project = repos.projects.get(projectId);
  if (!project) return null;
  return {
    project,
    dimensions: repos.dimensions.listByProject(project.id),
    members: repos.members.listByProject(project.id),
    relationships: repos.relationships.listByProject(project.id)
  };
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
