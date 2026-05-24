import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { extractTemplateFromProject, buildTemplatePreview, applyTemplate, getBuiltinTemplates } from "../templates/templateEngine";
import type { TemplateCategory, TemplateIndustry } from "../../shared/templateTypes";

export function createTemplateRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // GET /templates — list with filters
  router.get("/", (req, res) => {
    const category = req.query.category as TemplateCategory | undefined;
    const industry = req.query.industry as TemplateIndustry | undefined;
    const search = req.query.search as string | undefined;
    const templates = repos.templates.list({ category, industry, search });
    res.json(templates);
  });

  // POST /templates — create new template
  router.post("/", (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(['industry', 'dimension_type', 'pattern', 'custom']).optional(),
      industry: z.enum(['manufacturing', 'financial_services', 'technology', 'retail', 'healthcare', 'general']).optional(),
      dimensionTypes: z.array(z.string().min(1)).min(1),
      templateData: z.object({
        dimensions: z.array(z.object({
          dimensionType: z.string(),
          dimensionName: z.string(),
          members: z.array(z.object({
            memberKey: z.string(),
            description: z.string(),
            properties: z.record(z.unknown())
          })),
          relationships: z.array(z.object({
            parentKey: z.string(),
            childKey: z.string(),
            aggregationWeight: z.number().optional()
          }))
        }))
      }),
      tags: z.array(z.string()).optional(),
      isPublic: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const template = repos.templates.create({
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(template);
  });

  // POST /templates/from-project — extract template from project
  router.post("/from-project", (req, res) => {
    const schema = z.object({
      projectId: z.string().min(1),
      dimensionTypes: z.array(z.string().min(1)).min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(['industry', 'dimension_type', 'pattern', 'custom']).optional(),
      industry: z.enum(['manufacturing', 'financial_services', 'technology', 'retail', 'healthcare', 'general']).optional(),
      tags: z.array(z.string()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const templateData = extractTemplateFromProject(
      { dimensions, members, relationships },
      parsed.data.dimensionTypes
    );

    const template = repos.templates.create({
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      industry: parsed.data.industry,
      dimensionTypes: parsed.data.dimensionTypes,
      templateData,
      tags: parsed.data.tags,
      createdBy: req.user?.id ?? "system"
    });

    res.status(201).json(template);
  });

  // GET /templates/:id/preview — preview template before applying
  router.get("/:id/preview", (req, res) => {
    const template = repos.templates.get(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });

    const preview = buildTemplatePreview(template);
    res.json(preview);
  });

  // POST /templates/:id/apply — apply template to project
  router.post("/:id/apply", (req, res) => {
    const template = repos.templates.get(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });

    const schema = z.object({
      projectId: z.string().min(1),
      renameMapping: z.record(z.string()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const result = applyTemplate(template, project.id, repos, parsed.data.renameMapping);

    // Record application
    const application = repos.templateApplications.create({
      templateId: template.id,
      projectId: project.id,
      appliedBy: req.user?.id ?? "system",
      renameMapping: parsed.data.renameMapping
    });

    repos.templates.incrementUsage(template.id);

    res.status(201).json({ ...result, applicationId: application.id });
  });

  // DELETE /templates/:id
  router.delete("/:id", (req, res) => {
    const template = repos.templates.get(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    repos.templates.delete(req.params.id);
    res.status(204).end();
  });

  // POST /templates/seed — seed builtin templates (admin utility)
  router.post("/seed", (req, res) => {
    const builtins = getBuiltinTemplates();
    const created = [];
    for (const tpl of builtins) {
      const existing = repos.templates.list({ search: tpl.name });
      if (existing.length === 0) {
        const template = repos.templates.create({
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          industry: tpl.industry ?? undefined,
          dimensionTypes: tpl.dimensionTypes,
          templateData: tpl.templateData,
          tags: tpl.tags,
          isPublic: tpl.isPublic,
          createdBy: 'system'
        });
        created.push(template);
      }
    }
    res.status(201).json({ seeded: created.length, templates: created });
  });

  return router;
}
