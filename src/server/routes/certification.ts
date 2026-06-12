import { Router } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  certifyXmlRoundTrip,
  renderCertificationMarkdown,
  type CertificationSnapshot,
  type XmlRoundTripCertificationReport
} from "../../shared/xmlRoundTripCertification";
import type { Repositories } from "../db/repositories";

/**
 * XML round-trip certification routes. The latest report is persisted as a JSON file in the
 * exports directory (no raw XML is stored), so it can be re-read without recomputation.
 */
export function createCertificationRouter(repos: Repositories, config: AppConfig): Router {
  mkdirSync(config.paths.exportsDirectory, { recursive: true });
  const router = Router();

  async function loadSnapshot(projectId: string): Promise<CertificationSnapshot | null> {
    const project = await repos.projects.get(projectId);
    if (!project) return null;
    return {
      project,
      dimensions: await repos.dimensions.listByProject(project.id),
      members: await repos.members.listByProject(project.id),
      relationships: await repos.relationships.listByProject(project.id),
      varyingPropertyValues: await repos.varyingProperties.listVaryingPropertyValues(project.id)
    };
  }

  function reportPath(projectId: string): string {
    return join(config.paths.exportsDirectory, `${projectId}.certification.json`);
  }

  router.post("/:projectId/xml/certification", async (req, res) => {
    const snapshot = await loadSnapshot(req.params.projectId);
    if (!snapshot) return res.status(404).json({ error: "project not found" });

    const report = certifyXmlRoundTrip(snapshot, {
      oneStreamVersionFallback: config.application.oneStreamVersionFallback,
      prettyPrint: config.export.xml.prettyPrint,
      skipBlankMemberRows: config.export.xml.skipBlankMemberRows,
      skipFormulaErrors: config.export.xml.skipFormulaErrors,
      includeDimensionSourceAttributes: config.export.xml.includeDimensionSourceAttributes
    });

    const format = typeof req.query.format === "string" ? req.query.format : undefined;
    if (format === "markdown") {
      const markdown = renderCertificationMarkdown(report, snapshot.project.name);
      writeReport(reportPath(snapshot.project.id), report);
      return res.type("text/markdown").send(markdown);
    }

    writeReport(reportPath(snapshot.project.id), report);
    await repos.audit.record({
      projectId: snapshot.project.id,
      action: "xml.certification",
      entityType: "project",
      entityId: snapshot.project.id,
      after: { status: report.status, findings: report.findings.length }
    });
    res.json({ report });
  });

  router.get("/:projectId/xml/certification/latest", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const path = reportPath(project.id);
    if (!existsSync(path)) return res.status(404).json({ error: "no certification has been run for this project" });
    try {
      const report = JSON.parse(readFileSync(path, "utf8")) as XmlRoundTripCertificationReport;
      res.json({ report });
    } catch {
      res.status(500).json({ error: "stored certification report is unreadable" });
    }
  });

  return router;
}

function writeReport(path: string, report: XmlRoundTripCertificationReport): void {
  try {
    writeFileSync(path, JSON.stringify(report, null, 2));
  } catch {
    // Persistence is best-effort; the report is still returned to the caller.
  }
}
