import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { generateHealthReport, generateVelocityReport, generateCoverageReport, generateComplianceReport } from "../reporting/reportingEngine";
import { exportReportAsHtml, exportReportAsCsv } from "../reporting/reportExporter";
import type { ExportFormat } from "../reporting/reportExporter";
import type { ReportType } from "../../shared/reportingTypes";

export function createReportingRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // GET /reports/definitions — list report definitions
  router.get("/definitions", (req, res) => {
    const reportType = req.query.type as ReportType | undefined;
    const definitions = repos.reportDefinitions.list({ reportType });
    res.json(definitions);
  });

  // POST /reports/definitions — create report definition
  router.post("/definitions", (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      reportType: z.enum(['health', 'velocity', 'compliance', 'coverage', 'custom']),
      config: z.record(z.unknown()).optional(),
      scheduleCron: z.string().optional(),
      format: z.enum(['json', 'xlsx', 'pdf']).optional(),
      recipients: z.array(z.string()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const def = repos.reportDefinitions.create({
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(def);
  });

  // DELETE /reports/definitions/:id
  router.delete("/definitions/:id", (req, res) => {
    const def = repos.reportDefinitions.get(req.params.id);
    if (!def) return res.status(404).json({ error: "Report definition not found" });
    repos.reportDefinitions.delete(req.params.id);
    res.status(204).end();
  });

  // POST /reports/generate/health — generate health report for a project
  router.post("/generate/health", (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const existingSnapshots = repos.healthSnapshots.listByProject(project.id);

    const report = generateHealthReport(project.id, { dimensions, members, relationships }, existingSnapshots);

    // Store new snapshots
    for (const snapshot of report.snapshots) {
      repos.healthSnapshots.create({
        projectId: snapshot.projectId,
        dimensionType: snapshot.dimensionType,
        qualityScore: snapshot.qualityScore,
        completenessScore: snapshot.completenessScore,
        namingScore: snapshot.namingScore,
        validationErrorCount: snapshot.validationErrorCount,
        validationWarningCount: snapshot.validationWarningCount,
        memberCount: snapshot.memberCount,
        orphanCount: snapshot.orphanCount
      });
    }

    res.json(report);
  });

  // POST /reports/generate/velocity
  router.post("/generate/velocity", (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const report = generateVelocityReport(project.id, { dimensions, members, relationships });
    res.json(report);
  });

  // POST /reports/generate/coverage
  router.post("/generate/coverage", (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const report = generateCoverageReport(project.id, { dimensions, members, relationships });
    res.json(report);
  });

  // POST /reports/generate/compliance
  router.post("/generate/compliance", (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    // Get validation issue counts per dimension (from validation_issues table)
    const validationSummaries = dimensions.map(dim => ({
      dimensionType: dim.dimensionType,
      errorCount: 0,
      warningCount: 0
    }));

    const report = generateComplianceReport(project.id, { dimensions, members, relationships }, validationSummaries);
    res.json(report);
  });

  // GET /reports/health-history/:projectId — get health snapshots over time
  router.get("/health-history/:projectId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensionType = req.query.dimensionType as string | undefined;
    const snapshots = repos.healthSnapshots.listByProject(project.id, dimensionType);
    res.json(snapshots);
  });

  // POST /reports/export/:type — export a report in a given format (html, csv, json)
  router.post("/export/:type", (req, res) => {
    const schema = z.object({
      projectId: z.string().min(1),
      format: z.enum(['html', 'csv', 'json']).default('html')
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const reportType = req.params.type as ReportType;
    if (!['health', 'velocity', 'coverage', 'compliance'].includes(reportType)) {
      return res.status(400).json({ error: `Invalid report type: ${reportType}` });
    }

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const dataCtx = { dimensions, members, relationships };

    let report: unknown;
    let title: string;

    switch (reportType) {
      case 'health': {
        const existingSnapshots = repos.healthSnapshots.listByProject(project.id);
        report = generateHealthReport(project.id, dataCtx, existingSnapshots);
        title = `Health Report - ${project.name}`;
        break;
      }
      case 'velocity':
        report = generateVelocityReport(project.id, dataCtx);
        title = `Velocity Report - ${project.name}`;
        break;
      case 'coverage':
        report = generateCoverageReport(project.id, dataCtx);
        title = `Coverage Report - ${project.name}`;
        break;
      case 'compliance': {
        const validationSummaries = dimensions.map(dim => ({
          dimensionType: dim.dimensionType,
          errorCount: 0,
          warningCount: 0
        }));
        report = generateComplianceReport(project.id, dataCtx, validationSummaries);
        title = `Compliance Report - ${project.name}`;
        break;
      }
    }

    const format = parsed.data.format as ExportFormat;
    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json"`);
      return res.json(report);
    }

    if (format === 'html') {
      const result = exportReportAsHtml(report as any, title);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      return res.send(result.content);
    }

    if (format === 'csv') {
      const result = exportReportAsCsv(report as any, title);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      return res.send(result.content);
    }
  });

  return router;
}
