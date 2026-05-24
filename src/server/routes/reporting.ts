import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { generateHealthReport, generateVelocityReport, generateCoverageReport, generateComplianceReport } from "../reporting/reportingEngine";
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

  return router;
}
