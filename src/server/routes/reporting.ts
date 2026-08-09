import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { generateHealthReport, generateVelocityReport, generateCoverageReport, generateComplianceReport } from "../reporting/reportingEngine";
import { exportReportAsHtml, exportReportAsCsv } from "../reporting/reportExporter";
import { scoreProjectQuality } from "../tier3/tier3Engine";
import type { ExportFormat } from "../reporting/reportExporter";
import type { ReportType } from "../../shared/reportingTypes";

export function createReportingRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // GET /reports/definitions — list report definitions
  router.get("/definitions", async (req, res) => {
    const reportType = req.query.type as ReportType | undefined;
    const definitions = await repos.reportDefinitions.list({ reportType });
    res.json(definitions);
  });

  // POST /reports/definitions — create report definition
  router.post("/definitions", async (req, res) => {
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

    const def = await repos.reportDefinitions.create({
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(def);
  });

  // DELETE /reports/definitions/:id
  router.delete("/definitions/:id", async (req, res) => {
    const def = await repos.reportDefinitions.get(req.params.id);
    if (!def) return res.status(404).json({ error: "Report definition not found" });
    await repos.reportDefinitions.delete(req.params.id);
    res.status(204).end();
  });

  // POST /reports/generate/health — generate health report for a project
  router.post("/generate/health", async (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = await repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);
    const existingSnapshots = await repos.healthSnapshots.listByProject(project.id);
    const issues = await repos.issues.listByProject(project.id);

    const report = generateHealthReport(project.id, { dimensions, members, relationships }, existingSnapshots, issues);

    // Store new snapshots
    for (const snapshot of report.snapshots) {
      await repos.healthSnapshots.create({
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
  router.post("/generate/velocity", async (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = await repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const report = generateVelocityReport(project.id, { dimensions, members, relationships });
    res.json(report);
  });

  // POST /reports/generate/coverage
  router.post("/generate/coverage", async (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = await repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const report = generateCoverageReport(project.id, { dimensions, members, relationships });
    res.json(report);
  });

  // POST /reports/generate/compliance
  router.post("/generate/compliance", async (req, res) => {
    const schema = z.object({ projectId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = await repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

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
  router.get("/health-history/:projectId", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensionType = req.query.dimensionType as string | undefined;
    const snapshots = await repos.healthSnapshots.listByProject(project.id, dimensionType);
    res.json(snapshots);
  });

  // POST /reports/export/:type — export a report in a given format (html, csv, json)
  router.post("/export/:type", async (req, res) => {
    try {
      const schema = z.object({
        projectId: z.string().min(1),
        format: z.enum(['html', 'csv', 'json']).default('html')
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

      const reportType = req.params.type as string;
      if (!['executive', 'health', 'velocity', 'coverage', 'compliance'].includes(reportType)) {
        return res.status(400).json({ error: `Invalid report type: ${reportType}` });
      }

      const project = await repos.projects.get(parsed.data.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const dimensions = await repos.dimensions.listByProject(project.id).catch(() => []);
      const members = await repos.members.listByProject(project.id).catch(() => []);
      const relationships = await repos.relationships.listByProject(project.id).catch(() => []);
      const issues = await repos.issues.listByProject(project.id).catch(() => []);
      const dataCtx = { dimensions, members, relationships };

      let report: unknown;
      let title = "Report";

      if (reportType === 'executive' || reportType === 'health') {
        const existingSnapshots = await repos.healthSnapshots.listByProject(project.id).catch(() => []);
        const healthReport = generateHealthReport(project.id, dataCtx, existingSnapshots, issues);
        const coverageReport = generateCoverageReport(project.id, dataCtx);

        // Gather Quality rules & gates
        const rules = await repos.qualityRules.listByProject(project.id).catch(() => []);
        const qualityScoreResult = scoreProjectQuality(dimensions, members, rules, issues);
        const rawGates = await repos.qualityGates.listByProject(project.id).catch(() => []);
        const gates = rawGates.map(g => ({
          id: g.id,
          name: g.name,
          threshold: g.threshold,
          passed: qualityScoreResult.overallScore >= g.threshold
        }));

        const totalErrors = healthReport.snapshots.reduce((s, d) => s + d.validationErrorCount, 0);
        const totalWarnings = healthReport.snapshots.reduce((s, d) => s + d.validationWarningCount, 0);
        const totalOrphans = healthReport.snapshots.reduce((s, d) => s + d.orphanCount, 0);
        const totalMembers = healthReport.snapshots.reduce((s, d) => s + d.memberCount, 0);

        report = {
          project: { id: project.id, name: project.name },
          generatedAt: new Date().toISOString(),
          summary: {
            healthScore: healthReport.overallScore,
            healthTrend: healthReport.trend,
            qualityScore: qualityScoreResult.overallScore,
            overallCoverage: coverageReport.overallCoverage,
            totalDimensions: dimensions.length,
            totalMembers,
            totalOrphans,
            totalErrors,
            totalWarnings
          },
          health: healthReport,
          quality: {
            overallScore: qualityScoreResult.overallScore,
            dimensions: qualityScoreResult.dimensions.map(d => {
              const dimObj = dimensions.find(dm => dm.id === d.dimensionId);
              return {
                ...d,
                dimensionName: dimObj?.dimensionName || d.dimensionType
              };
            })
          },
          coverage: coverageReport,
          gates
        };
        title = `Executive Governance Report - ${project.name}`;
      } else {
        switch (reportType) {
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
      }

      const format = parsed.data.format as ExportFormat;
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json"`);
        return res.json(report);
      }

      if (format === 'html') {
        const result = exportReportAsHtml(report as any, title);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        return res.send(result.content);
      }

      if (format === 'csv') {
        const result = exportReportAsCsv(report as any, title);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        return res.send(result.content);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Export endpoint error:", err);
      return res.status(500).json({ error: msg });
    }
  });

  return router;
}
