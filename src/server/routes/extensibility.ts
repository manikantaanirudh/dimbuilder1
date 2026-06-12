import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import type { WhatIfExtensionInput } from "../../shared/extensibilityTypes";
import { buildExtensibilityModel, detectAntiPatterns, whatIfExtension, generateDocumentation } from "../extensibility/extensibilityEngine";

export function createExtensibilityRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // GET /projects/:id/extensibility/model
  router.get("/projects/:id/extensibility/model", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const model = buildExtensibilityModel({ dimensions, members, relationships });
    res.json(model);
  });

  // GET /projects/:id/extensibility/anti-patterns
  router.get("/projects/:id/extensibility/anti-patterns", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const patterns = detectAntiPatterns({ dimensions, members, relationships });
    res.json(patterns);
  });

  // POST /projects/:id/extensibility/what-if
  router.post("/projects/:id/extensibility/what-if", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      dimensionType: z.string().min(1),
      cubeType: z.string().min(1),
      addMembers: z.array(z.string()).optional(),
      removeMembers: z.array(z.string()).optional(),
      overrideProperties: z.array(z.object({
        memberKey: z.string(),
        propertyName: z.string(),
        value: z.unknown()
      })).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const result = whatIfExtension(parsed.data as WhatIfExtensionInput, { dimensions, members, relationships });
    res.json(result);
  });

  // GET /projects/:id/extensibility/documentation
  router.get("/projects/:id/extensibility/documentation", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const docs = generateDocumentation({ dimensions, members, relationships });
    res.json(docs);
  });

  return router;
}
