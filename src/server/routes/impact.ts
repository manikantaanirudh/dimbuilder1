import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { runImpactAnalysis } from "../impact/impactEngine";

const impactAnalysisSchema = z.object({
  type: z.enum(["delete", "move", "restructure", "whatIf"]),
  scope: z.object({
    dimensionType: z.string().min(1),
    memberKeys: z.array(z.string().min(1)).min(1),
    action: z.enum(["delete", "move", "restructure", "whatIf"]),
    targetParent: z.string().optional()
  }),
  environmentId: z.string().optional(),
  changeSetId: z.string().optional()
});

export function createImpactRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // Run impact analysis
  router.post("/projects/:projectId/impact-analysis", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const parsed = impactAnalysisSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }

    const { type, scope, environmentId, changeSetId } = parsed.data;

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const results = runImpactAnalysis(
      { type, scope, environmentId },
      { dimensions, members, relationships }
    );

    const record = repos.impactAnalyses.create({
      projectId: project.id,
      changeSetId,
      analysisType: type,
      scope,
      environmentId,
      results,
      severity: results.severity,
      summary: results.summary,
      createdBy: req.user?.id ?? "system"
    });

    res.status(201).json(record);
  });

  // Run "what if" simulation
  router.post("/projects/:projectId/what-if", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const parsed = impactAnalysisSchema.safeParse({ ...req.body, type: "whatIf", scope: { ...req.body?.scope, action: "whatIf" } });
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }

    const { scope, environmentId, changeSetId } = parsed.data;

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const results = runImpactAnalysis(
      { type: "whatIf", scope: { ...scope, action: "whatIf" }, environmentId },
      { dimensions, members, relationships }
    );

    const record = repos.impactAnalyses.create({
      projectId: project.id,
      changeSetId,
      analysisType: "whatIf",
      scope: { ...scope, action: "whatIf" },
      environmentId,
      results,
      severity: results.severity,
      summary: results.summary,
      createdBy: req.user?.id ?? "system"
    });

    res.status(201).json(record);
  });

  // List past analyses for a project
  router.get("/projects/:projectId/impact-analyses", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const analyses = repos.impactAnalyses.listByProject(project.id);
    res.json(analyses);
  });

  // Get specific analysis detail
  router.get("/impact-analyses/:id", (req, res) => {
    const analysis = repos.impactAnalyses.findById(req.params.id);
    if (!analysis) return res.status(404).json({ error: "Impact analysis not found" });
    res.json(analysis);
  });

  return router;
}
