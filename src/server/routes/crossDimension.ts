import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { buildDimensionMap, whereUsed, buildInheritanceChains, validateCrossDimension } from "../crossDimension/crossDimensionEngine";

export function createCrossDimensionRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // GET /projects/:id/cross-dimension/map
  router.get("/projects/:id/cross-dimension/map", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const map = buildDimensionMap({ dimensions, members, relationships });
    res.json(map);
  });

  // GET /projects/:id/cross-dimension/where-used?memberKey=&dimensionType=
  router.get("/projects/:id/cross-dimension/where-used", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const memberKey = req.query.memberKey as string;
    const dimensionType = req.query.dimensionType as string;
    if (!memberKey || !dimensionType) {
      return res.status(400).json({ error: "memberKey and dimensionType query parameters are required" });
    }

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const result = whereUsed(memberKey, dimensionType, { dimensions, members, relationships });
    res.json(result);
  });

  // GET /projects/:id/cross-dimension/inheritance
  router.get("/projects/:id/cross-dimension/inheritance", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const chains = buildInheritanceChains(dimensions);
    res.json(chains);
  });

  // POST /projects/:id/cross-dimension/validate
  router.post("/projects/:id/cross-dimension/validate", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const rules = repos.crossDimensionRules.listByProject(project.id);

    const result = validateCrossDimension(rules, { dimensions, members, relationships });
    res.json(result);
  });

  // GET /projects/:id/cross-dimension/rules
  router.get("/projects/:id/cross-dimension/rules", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const rules = repos.crossDimensionRules.listByProject(project.id);
    res.json(rules);
  });

  // POST /projects/:id/cross-dimension/rules
  router.post("/projects/:id/cross-dimension/rules", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      sourceDimensionType: z.string().min(1),
      targetDimensionType: z.string().min(1),
      ruleType: z.enum(['member_exists', 'property_maps', 'hierarchy_mirrors']),
      ruleConfig: z.record(z.unknown()).optional(),
      severity: z.enum(['error', 'warning', 'info']).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const rule = repos.crossDimensionRules.create({
      projectId: project.id,
      name: parsed.data.name,
      sourceDimensionType: parsed.data.sourceDimensionType,
      targetDimensionType: parsed.data.targetDimensionType,
      ruleType: parsed.data.ruleType,
      ruleConfig: parsed.data.ruleConfig,
      severity: parsed.data.severity,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(rule);
  });

  // PATCH /projects/:id/cross-dimension/rules/:ruleId
  router.patch("/projects/:id/cross-dimension/rules/:ruleId", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1).optional(),
      ruleConfig: z.record(z.unknown()).optional(),
      severity: z.enum(['error', 'warning', 'info']).optional(),
      isActive: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const updated = repos.crossDimensionRules.update(req.params.ruleId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Rule not found" });
    res.json(updated);
  });

  // DELETE /projects/:id/cross-dimension/rules/:ruleId
  router.delete("/projects/:id/cross-dimension/rules/:ruleId", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const existing = repos.crossDimensionRules.get(req.params.ruleId);
    if (!existing) return res.status(404).json({ error: "Rule not found" });

    repos.crossDimensionRules.delete(req.params.ruleId);
    res.status(204).end();
  });

  return router;
}
