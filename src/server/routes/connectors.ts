import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { createErpConnector } from "../connectors/erp";
import { executeMappingPipeline } from "../connectors/mapping/mappingEngine";
import { requireRole } from "../middleware/authorize";
import type { ConnectorType } from "../../shared/connectorTypes";

const connectorTypeEnum = z.enum(["sap", "oracle", "sql", "csv", "rest"]);

const createConnectorSchema = z.object({
  name: z.string().min(1).max(255),
  connectorType: connectorTypeEnum,
  connectionConfig: z.record(z.unknown()).default({}),
  extractionConfig: z.record(z.unknown()).default({})
});

const updateConnectorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  connectionConfig: z.record(z.unknown()).optional(),
  extractionConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional()
});

const fieldMappingSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  transform: z.string().optional()
});

const hierarchyRuleSchema = z.object({
  parentField: z.string().min(1),
  parentTransform: z.string().optional(),
  rootParent: z.string().min(1)
});

const filterRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["in", "not_in", "equals", "not_equals", "starts_with", "contains"]),
  values: z.array(z.string())
});

const createMappingSchema = z.object({
  name: z.string().min(1).max(255),
  sourceEntity: z.string().min(1),
  targetDimensionType: z.string().min(1),
  fieldMappings: z.array(fieldMappingSchema).min(1),
  hierarchyRules: hierarchyRuleSchema.optional(),
  filterRules: z.array(filterRuleSchema).optional(),
  conflictResolution: z.enum(["source_wins", "target_wins", "skip", "manual"]).optional()
});

const updateMappingSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sourceEntity: z.string().min(1).optional(),
  targetDimensionType: z.string().min(1).optional(),
  fieldMappings: z.array(fieldMappingSchema).min(1).optional(),
  hierarchyRules: hierarchyRuleSchema.nullable().optional(),
  filterRules: z.array(filterRuleSchema).optional(),
  conflictResolution: z.enum(["source_wins", "target_wins", "skip", "manual"]).optional(),
  isActive: z.boolean().optional()
});

const createSyncJobSchema = z.object({
  connectorId: z.string().min(1),
  mappingRuleId: z.string().min(1),
  projectId: z.string().min(1),
  scheduleCron: z.string().optional(),
  autoApprove: z.boolean().optional()
});

function redactConnectionConfig(config: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (/password|secret|token|key/i.test(key)) {
      redacted[key] = "***REDACTED***";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function createConnectorRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // --- Connector CRUD (admin only, applied at mount) ---

  router.get("/", (_req, res) => {
    const connectors = repos.connectors.list().map(c => ({
      ...c,
      connectionConfig: redactConnectionConfig(c.connectionConfig)
    }));
    res.json(connectors);
  });

  router.post("/", (req, res) => {
    const parsed = createConnectorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
    }
    const connector = repos.connectors.create({
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json({ ...connector, connectionConfig: redactConnectionConfig(connector.connectionConfig) });
  });

  router.patch("/:id", (req, res) => {
    const parsed = updateConnectorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
    }
    const updated = repos.connectors.update(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Connector not found" });
    res.json({ ...updated, connectionConfig: redactConnectionConfig(updated.connectionConfig) });
  });

  router.delete("/:id", (req, res) => {
    const existing = repos.connectors.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Connector not found" });
    repos.connectors.delete(req.params.id);
    res.json({ ok: true });
  });

  router.post("/:id/test", (req, res) => {
    const connector = repos.connectors.getById(req.params.id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });

    try {
      const erp = createErpConnector(connector.connectorType as ConnectorType, connector.connectionConfig);
      const result = erp.testConnection();
      repos.connectors.setLastTested(connector.id);
      res.json(result);
    } catch (err) {
      res.json({ success: false, message: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  router.post("/:id/preview", (req, res) => {
    const connector = repos.connectors.getById(req.params.id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });

    const { mappingRuleId } = req.body as { mappingRuleId?: string };
    if (!mappingRuleId) return res.status(400).json({ error: "mappingRuleId is required" });

    const rule = repos.mappingRules.getById(mappingRuleId);
    if (!rule) return res.status(404).json({ error: "Mapping rule not found" });

    try {
      const erp = createErpConnector(connector.connectorType as ConnectorType, connector.connectionConfig);
      const records = erp.extractRecords(rule.sourceEntity);
      const result = executeMappingPipeline(records, {
        fieldMappings: rule.fieldMappings,
        hierarchyRules: rule.hierarchyRules,
        filterRules: rule.filterRules as { field: string; operator: "in" | "not_in" | "equals" | "not_equals" | "starts_with" | "contains"; values: string[] }[],
        conflictResolution: rule.conflictResolution as "source_wins" | "target_wins" | "skip" | "manual"
      });
      res.json({
        membersToCreate: result.members.length,
        membersToUpdate: 0,
        membersToDelete: 0,
        relationshipsToCreate: result.relationships.length,
        conflicts: result.conflicts,
        sampleRecords: records.slice(0, 5)
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Extraction failed" });
    }
  });

  // --- Mapping Rules ---

  router.get("/:id/mappings", (req, res) => {
    const connector = repos.connectors.getById(req.params.id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    res.json(repos.mappingRules.listByConnector(req.params.id));
  });

  router.post("/:id/mappings", (req, res) => {
    const connector = repos.connectors.getById(req.params.id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });

    const parsed = createMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
    }
    const rule = repos.mappingRules.create({
      connectorId: req.params.id,
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(rule);
  });

  return router;
}

export function createMappingRouter(repos: Repositories): Router {
  const router = Router();

  router.patch("/:id", (req, res) => {
    const parsed = updateMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
    }
    const updated = repos.mappingRules.update(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Mapping rule not found" });
    res.json(updated);
  });

  router.delete("/:id", (req, res) => {
    const existing = repos.mappingRules.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Mapping rule not found" });
    repos.mappingRules.delete(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

export function createSyncJobRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const { connectorId, projectId } = req.query as { connectorId?: string; projectId?: string };
    res.json(repos.syncJobs.list({ connectorId, projectId }));
  });

  router.post("/", (req, res) => {
    const parsed = createSyncJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
    }

    // Validate references exist
    const connector = repos.connectors.getById(parsed.data.connectorId);
    if (!connector) return res.status(400).json({ error: "Connector not found" });
    const rule = repos.mappingRules.getById(parsed.data.mappingRuleId);
    if (!rule) return res.status(400).json({ error: "Mapping rule not found" });
    const project = repos.projects.get(parsed.data.projectId);
    if (!project) return res.status(400).json({ error: "Project not found" });

    const job = repos.syncJobs.create({
      ...parsed.data,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(job);
  });

  router.post("/:id/run", (req, res) => {
    const job = repos.syncJobs.getById(req.params.id);
    if (!job) return res.status(404).json({ error: "Sync job not found" });

    const connector = repos.connectors.getById(job.connectorId);
    if (!connector) return res.status(500).json({ error: "Connector no longer exists" });

    const rule = repos.mappingRules.getById(job.mappingRuleId);
    if (!rule) return res.status(500).json({ error: "Mapping rule no longer exists" });

    const run = repos.syncRuns.create({ jobId: job.id });

    try {
      const erp = createErpConnector(connector.connectorType as ConnectorType, connector.connectionConfig);
      const records = erp.extractRecords(rule.sourceEntity);
      const pipelineResult = executeMappingPipeline(records, {
        fieldMappings: rule.fieldMappings,
        hierarchyRules: rule.hierarchyRules,
        filterRules: rule.filterRules as { field: string; operator: "in" | "not_in" | "equals" | "not_equals" | "starts_with" | "contains"; values: string[] }[],
        conflictResolution: rule.conflictResolution as "source_wins" | "target_wins" | "skip" | "manual"
      });

      // Register members in source registry
      for (const member of pipelineResult.members) {
        if (member.memberKey) {
          repos.memberSourceRegistry.upsert({
            projectId: job.projectId,
            dimensionType: rule.targetDimensionType,
            memberKey: member.memberKey,
            sourceSystem: connector.name
          });
        }
      }

      const status = pipelineResult.conflicts.length > 0 ? "partial" : "success";
      repos.syncRuns.complete(run.id, {
        status,
        sourceRecordsRead: pipelineResult.sourceRecordsRead,
        membersCreated: pipelineResult.members.length,
        membersUpdated: 0,
        membersDeleted: 0,
        relationshipsCreated: pipelineResult.relationships.length,
        relationshipsUpdated: 0,
        conflictsDetected: pipelineResult.conflicts.length,
        conflictsResolved: 0
      });

      repos.syncJobs.updateLastRun(job.id);
      const completedRun = repos.syncRuns.getById(run.id);
      res.json(completedRun);
    } catch (err) {
      repos.syncRuns.complete(run.id, {
        status: "failed",
        sourceRecordsRead: 0,
        membersCreated: 0,
        membersUpdated: 0,
        membersDeleted: 0,
        relationshipsCreated: 0,
        relationshipsUpdated: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        errorMessage: err instanceof Error ? err.message : "Unknown error"
      });
      repos.syncJobs.updateLastRun(job.id);
      const failedRun = repos.syncRuns.getById(run.id);
      res.json(failedRun);
    }
  });

  router.get("/:id/runs", (req, res) => {
    const job = repos.syncJobs.getById(req.params.id);
    if (!job) return res.status(404).json({ error: "Sync job not found" });
    res.json(repos.syncRuns.listByJob(req.params.id));
  });

  return router;
}

export function createSyncRunRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/:id", (req, res) => {
    const run = repos.syncRuns.getById(req.params.id);
    if (!run) return res.status(404).json({ error: "Sync run not found" });
    res.json(run);
  });

  return router;
}

export function createSourceRegistryRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/:projectId/source-registry", (req, res) => {
    const { dimensionType } = req.query as { dimensionType?: string };
    res.json(repos.memberSourceRegistry.listByProject(req.params.projectId, dimensionType));
  });

  return router;
}
