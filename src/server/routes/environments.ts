import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { createOneStreamClient } from "../connectors/onestream";
import { exportProjectXml } from "../../shared/xmlExport";

const createEnvironmentSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["onestream", "mock"]),
  baseUrl: z.string().max(2048).default(""),
  clientId: z.string().max(512).default(""),
  clientSecret: z.string().max(1024).default(""),
  tenantId: z.string().max(255).optional(),
  appName: z.string().max(255).optional()
});

const updateEnvironmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["onestream", "mock"]).optional(),
  baseUrl: z.string().max(2048).optional(),
  clientId: z.string().max(512).optional(),
  clientSecret: z.string().max(1024).optional(),
  tenantId: z.string().max(255).optional(),
  appName: z.string().max(255).optional(),
  isActive: z.boolean().optional()
});

const deploySchema = z.object({
  projectId: z.string().min(1),
  changeSetId: z.string().optional(),
  dimensionIds: z.array(z.string()).optional(),
  comment: z.string().max(2000).optional()
});

export function createEnvironmentRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  // List environments (credentials redacted)
  router.get("/", (_req, res) => {
    res.json(repos.environments.list());
  });

  // Create environment
  router.post("/", (req, res) => {
    const parsed = createEnvironmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const env = repos.environments.create({
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(env);
  });

  // Update environment
  router.patch("/:id", (req, res) => {
    const parsed = updateEnvironmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const updated = repos.environments.update(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Environment not found" });
    res.json(updated);
  });

  // Delete environment
  router.delete("/:id", (req, res) => {
    const existing = repos.environments.getSafe(req.params.id);
    if (!existing) return res.status(404).json({ error: "Environment not found" });
    repos.environments.delete(req.params.id);
    res.json({ ok: true });
  });

  // Test connection
  router.post("/:id/test-connection", async (req, res) => {
    const env = repos.environments.getById(req.params.id);
    if (!env) return res.status(404).json({ error: "Environment not found" });
    try {
      const client = createOneStreamClient(env);
      const result = await client.testConnection();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Connection test failed" });
    }
  });

  // Pull dimensions from environment
  router.post("/:id/pull", async (req, res) => {
    const env = repos.environments.getById(req.params.id);
    if (!env) return res.status(404).json({ error: "Environment not found" });
    try {
      const client = createOneStreamClient(env);
      const result = await client.pullDimensions();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Pull failed" });
    }
  });

  // Deploy to environment
  router.post("/:id/deploy", async (req, res) => {
    const env = repos.environments.getById(req.params.id);
    if (!env) return res.status(404).json({ error: "Environment not found" });

    const parsed = deploySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }

    const { projectId, changeSetId, dimensionIds, comment } = parsed.data;
    const project = repos.projects.get(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Build snapshot and export XML
    const dimensions = repos.dimensions.listByProject(projectId);
    const filteredDimensions = dimensionIds?.length
      ? dimensions.filter(d => dimensionIds.includes(d.id))
      : dimensions;

    if (filteredDimensions.length === 0) {
      return res.status(400).json({ error: "No dimensions to deploy" });
    }

    const members = repos.members.listByProject(projectId);
    const relationships = repos.relationships.listByProject(projectId);
    const varyingPropertyValues = repos.varyingProperties.listVaryingPropertyValues(projectId);

    const xml = exportProjectXml(
      { project, dimensions: filteredDimensions, members, relationships, varyingPropertyValues },
      {
        oneStreamVersionFallback: config.application.oneStreamVersionFallback,
        prettyPrint: config.export.xml.prettyPrint,
        skipBlankMemberRows: config.export.xml.skipBlankMemberRows,
        skipFormulaErrors: config.export.xml.skipFormulaErrors,
        includeDimensionSourceAttributes: config.export.xml.includeDimensionSourceAttributes
      }
    );

    const dimensionTypes = filteredDimensions.map(d => d.dimensionType);

    try {
      const client = createOneStreamClient(env);
      const result = await client.pushXml(xml, dimensionTypes);

      const deployment = repos.deployments.create({
        environmentId: env.id,
        projectId,
        changeSetId,
        status: result.success ? "success" : "failed",
        xmlPayload: xml,
        comment: comment ?? "",
        initiatedBy: req.user?.id ?? "system",
        dimensionResults: result.results
      });

      res.status(201).json(deployment);
    } catch (err) {
      const deployment = repos.deployments.create({
        environmentId: env.id,
        projectId,
        changeSetId,
        status: "failed",
        xmlPayload: xml,
        comment: comment ?? "",
        initiatedBy: req.user?.id ?? "system",
        dimensionResults: dimensionTypes.map(dt => ({
          dimensionType: dt,
          dimensionName: dt,
          status: "failed" as const,
          message: err instanceof Error ? err.message : "Deploy failed"
        }))
      });
      res.status(500).json(deployment);
    }
  });

  // List deployments
  router.get("/deployments", (req, res) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const environmentId = typeof req.query.environmentId === "string" ? req.query.environmentId : undefined;
    res.json(repos.deployments.list({ projectId, environmentId }));
  });

  // Get deployment detail
  router.get("/deployments/:id", (req, res) => {
    const deployment = repos.deployments.getById(req.params.id);
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    res.json(deployment);
  });

  return router;
}
