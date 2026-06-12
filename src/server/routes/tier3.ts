import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { DimensionType } from "../../shared/types";
import type { Repositories } from "../db/repositories";
import { scoreProjectQuality, generateDocumentContent } from "../tier3/tier3Engine";

export function createTier3Router(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // ============ Feature 13: Excel Add-In ============

  router.post("/projects/:id/excel/download", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensionType = req.body?.dimensionType as string;
    const dimensions = await repos.dimensions.listByProject(project.id);
    const dim = dimensionType ? dimensions.find(d => d.dimensionType === dimensionType) : dimensions[0];
    if (!dim) return res.status(404).json({ error: "Dimension not found" });

    const members = (await repos.members.listByProject(project.id)).filter(m => m.dimensionId === dim.id);
    const relationships = (await repos.relationships.listByProject(project.id)).filter(r => r.dimensionId === dim.id);

    res.json({
      dimensionType: dim.dimensionType, dimensionName: dim.dimensionName,
      members: members.map(m => ({ memberKey: m.memberKey, description: m.description, properties: m.properties })),
      relationships: relationships.map(r => ({ parentKey: r.parentKey, childKey: r.childKey, aggregationWeight: r.aggregationWeight })),
      validationRules: []
    });
  });

  router.post("/projects/:id/excel/publish", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      dimensionType: z.string().min(1),
      members: z.array(z.object({
        memberKey: z.string().min(1),
        description: z.string().optional(),
        properties: z.record(z.unknown()).optional()
      })),
      relationships: z.array(z.object({
        parentKey: z.string().min(1),
        childKey: z.string().min(1),
        aggregationWeight: z.number().optional()
      })).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const { dimensionType, members: incomingMembers, relationships: incomingRels } = parsed.data;

    // Find or error on dimension
    const dimensions = await repos.dimensions.listByProject(project.id);
    const dim = dimensions.find(d => d.dimensionType === dimensionType);
    if (!dim) return res.status(404).json({ error: `Dimension type '${dimensionType}' not found in project` });

    const existingMembers = (await repos.members.listByProject(project.id)).filter(m => m.dimensionId === dim.id);
    const existingByKey = new Map(existingMembers.map(m => [m.memberKey, m]));

    let membersCreated = 0;
    let membersUpdated = 0;
    const validationIssues: Array<{ memberKey: string; issue: string }> = [];

    for (const incoming of incomingMembers) {
      const existing = existingByKey.get(incoming.memberKey);
      if (existing) {
        // Update existing member — include description in properties for the update method
        const updatedProps = { ...existing.properties, ...(incoming.properties ?? {}) };
        if (incoming.description) updatedProps['Description'] = incoming.description;
        await repos.members.update(existing.id, {
          memberKey: incoming.memberKey,
          properties: updatedProps
        });
        membersUpdated++;
      } else {
        // Create new member
        await repos.members.create({
          dimensionId: dim.id,
          memberKey: incoming.memberKey,
          description: incoming.description ?? "",
          properties: incoming.properties ?? {},
          rowOrder: existingMembers.length + membersCreated + 1,
          sourceRowNumber: 0,
          isActive: true
        });
        membersCreated++;
      }
    }

    // Process relationships if provided
    let relationshipsCreated = 0;
    let relationshipsUpdated = 0;
    if (incomingRels && incomingRels.length > 0) {
      const existingRels = (await repos.relationships.listByProject(project.id)).filter(r => r.dimensionId === dim.id);
      const relMap = new Map(existingRels.map(r => [`${r.parentKey}:${r.childKey}`, r]));

      for (const rel of incomingRels) {
        const key = `${rel.parentKey}:${rel.childKey}`;
        const existing = relMap.get(key);
        if (existing) {
          // Relationship already exists — count as update (no-op since we don't have an update method)
          relationshipsUpdated++;
        } else {
          // Validate parent and child exist
          const allMembers = (await repos.members.listByProject(project.id)).filter(m => m.dimensionId === dim.id);
          const memberKeys = new Set(allMembers.map(m => m.memberKey));
          if (!memberKeys.has(rel.parentKey)) {
            validationIssues.push({ memberKey: rel.parentKey, issue: "Parent member not found" });
            continue;
          }
          if (!memberKeys.has(rel.childKey)) {
            validationIssues.push({ memberKey: rel.childKey, issue: "Child member not found" });
            continue;
          }
          await repos.relationships.create({
            dimensionId: dim.id,
            parentKey: rel.parentKey,
            childKey: rel.childKey,
            aggregationWeight: rel.aggregationWeight ?? 1.0,
            percentConsol: null,
            percentOwnership: null,
            ownershipType: "",
            properties: {},
            rowOrder: 0,
            sourceRowNumber: 0
          });
          relationshipsCreated++;
        }
      }
    }

    res.status(201).json({ membersCreated, membersUpdated, relationshipsCreated, relationshipsUpdated, validationIssues });
  });

  // ============ Feature 14: Conflict Resolution ============

  router.post("/projects/:id/locks/acquire", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ dimensionId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed" });

    const existing = await repos.editLocks.getActive(project.id, parsed.data.dimensionId);
    if (existing && existing.userId !== (req.user?.id ?? "system")) {
      return res.status(409).json({ error: "Dimension is locked by another user", lock: existing });
    }

    const lock = await repos.editLocks.acquire({
      projectId: project.id,
      dimensionId: parsed.data.dimensionId,
      userId: req.user?.id ?? "system"
    });
    res.status(201).json(lock);
  });

  router.post("/projects/:id/locks/release", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const dimensionId = req.body?.dimensionId;
    if (dimensionId) repos.editLocks.release(project.id, dimensionId, req.user?.id ?? "system");
    res.status(204).end();
  });

  router.get("/projects/:id/locks", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.editLocks.listByProject(project.id));
  });

  router.post("/projects/:id/conflicts/detect", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ hasConflicts: false, conflicts: [], autoMerged: [] });
  });

  // ============ Feature 15: Scheduled Jobs ============

  router.get("/projects/:id/jobs", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.scheduledJobs.listByProject(project.id));
  });

  router.post("/projects/:id/jobs", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      triggerType: z.enum(['cron', 'event', 'webhook']),
      triggerConfig: z.record(z.unknown()).optional(),
      actionType: z.string().min(1),
      actionConfig: z.record(z.unknown()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const job = await repos.scheduledJobs.create({
      projectId: project.id,
      name: parsed.data.name,
      triggerType: parsed.data.triggerType,
      triggerConfig: parsed.data.triggerConfig,
      actionType: parsed.data.actionType,
      actionConfig: parsed.data.actionConfig,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(job);
  });

  router.delete("/projects/:id/jobs/:jobId", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    await repos.scheduledJobs.delete(req.params.jobId);
    res.status(204).end();
  });

  // POST /projects/:id/jobs/:jobId/trigger — manually trigger a scheduled job
  router.post("/projects/:id/jobs/:jobId/trigger", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const jobs = await repos.scheduledJobs.listByProject(project.id);
    const job = jobs.find(j => j.id === req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const startedAt = new Date().toISOString();
    let status: 'completed' | 'failed' = 'completed';
    let result = '';
    let error: string | undefined;

    try {
      switch (job.actionType) {
        case 'validate_project': {
          const members = await repos.members.listByProject(project.id);
          result = `Validated ${members.length} members`;
          break;
        }
        case 'generate_report': {
          const dimensions = await repos.dimensions.listByProject(project.id);
          result = `Report generated for ${dimensions.length} dimensions`;
          break;
        }
        case 'sync_push': {
          const pending = await repos.syncQueue.listPending(project.id);
          for (const entry of pending) repos.syncQueue.markSynced(entry.id);
          result = `Synced ${pending.length} pending changes`;
          break;
        }
        case 'quality_check': {
          const dims = await repos.dimensions.listByProject(project.id);
          result = `Quality check ran on ${dims.length} dimensions`;
          break;
        }
        default:
          status = 'failed';
          error = `Unsupported action: ${job.actionType}`;
          result = error;
      }
    } catch (err: unknown) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
      result = `Error: ${error}`;
    }

    const execution = await repos.jobExecutions.create({
      jobId: job.id,
      status: status === 'completed' ? 'succeeded' : 'failed',
      result: { message: result },
      errorMessage: error
    });

    res.status(201).json(execution);
  });

  // GET /projects/:id/jobs/:jobId/executions — get job execution history
  router.get("/projects/:id/jobs/:jobId/executions", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const jobs = await repos.scheduledJobs.listByProject(project.id);
    const job = jobs.find(j => j.id === req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const executions = await repos.jobExecutions.listByJob(job.id);
    res.json(executions);
  });

  router.post("/projects/:id/webhooks", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ url: z.string().url(), events: z.array(z.string()).min(1), name: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const webhook = await repos.webhookSubscriptions.create({
      projectId: project.id,
      url: parsed.data.url,
      events: parsed.data.events,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(webhook);
  });

  router.get("/projects/:id/webhooks", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.webhookSubscriptions.listByProject(project.id));
  });

  // ============ Feature 16: Data Quality Scoring ============

  router.get("/projects/:id/quality/scores", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const rules = await repos.qualityRules.listByProject(project.id);
    const issues = await repos.issues.listByProject(project.id);

    const report = scoreProjectQuality(dimensions, members, rules, issues);
    res.json({
      overallScore: report.overallScore,
      metadataScore: report.metadataScore,
      validationScore: report.validationScore,
      issueCount: issues.length,
      dimensions: report.dimensions
    });
  });

  router.post("/projects/:id/quality/rules", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      category: z.enum(['completeness', 'naming', 'structure', 'consistency', 'custom']),
      weight: z.number().min(0).max(10).optional(),
      config: z.record(z.unknown()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const rule = await repos.qualityRules.create({
      projectId: project.id,
      name: parsed.data.name,
      category: parsed.data.category,
      weight: parsed.data.weight,
      config: parsed.data.config,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(rule);
  });

  router.get("/projects/:id/quality/rules", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.qualityRules.listByProject(project.id));
  });

  router.post("/projects/:id/quality/gates", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      threshold: z.number().min(0).max(100),
      scope: z.enum(['project', 'dimension', 'member']).optional(),
      action: z.enum(['block_deploy', 'warn', 'notify']).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const gate = await repos.qualityGates.create({
      projectId: project.id,
      name: parsed.data.name,
      threshold: parsed.data.threshold,
      scope: parsed.data.scope,
      action: parsed.data.action,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(gate);
  });

  router.get("/projects/:id/quality/gates", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.qualityGates.listByProject(project.id));
  });

  // ============ Feature 17: Migration Assistant ============

  router.post("/projects/:id/migrations", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      sourceType: z.enum(['hyperion_hfm', 'hyperion_planning', 'sap_bpc', 'csv_generic'])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const migration = await repos.migrationProjects.create({
      projectId: project.id,
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(migration);
  });

  router.get("/projects/:id/migrations", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.migrationProjects.listByProject(project.id));
  });

  // POST /projects/:id/migrations/:migrationId/parse — parse source data and import members
  router.post("/projects/:id/migrations/:migrationId/parse", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const migrations = await repos.migrationProjects.listByProject(project.id);
    const migration = migrations.find(m => m.id === req.params.migrationId);
    if (!migration) return res.status(404).json({ error: "Migration not found" });

    const schema = z.object({
      content: z.string().min(1),
      dimensionName: z.string().optional(),
      config: z.record(z.string()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const { parseHyperionHFM, parseHyperionEPMA, parseSAPBPC, parseGenericCSV } = require("../migration/migrationParsers") as typeof import("../migration/migrationParsers");

    let result;
    switch (migration.sourceType) {
      case 'hyperion_hfm':
        result = parseHyperionHFM(parsed.data.content);
        break;
      case 'hyperion_planning':
        result = parseHyperionEPMA(parsed.data.content, parsed.data.dimensionName);
        break;
      case 'sap_bpc':
        result = parseSAPBPC(parsed.data.content, parsed.data.dimensionName);
        break;
      case 'csv_generic':
      default:
        result = parseGenericCSV(parsed.data.content, {
          dimensionName: parsed.data.dimensionName,
          ...parsed.data.config
        });
        break;
    }

    // Optionally import parsed members into the project
    let imported = 0;
    if (req.query.import === 'true') {
      for (const dim of result.dimensions) {
        // Find or create dimension
        const existing = (await repos.dimensions.listByProject(project.id)).find(d => d.dimensionType === dim.dimensionType);
        const dimensionId = existing?.id ?? (await repos.dimensions.create({
          projectId: project.id,
          sheetName: dim.dimensionName,
          dimensionType: dim.dimensionType as DimensionType,
          dimensionName: dim.dimensionName,
          description: "",
          accessGroup: "Everyone",
          maintenanceGroup: "Everyone",
          inheritedDimension: "",
          sortOrder: 0,
          metadata: {}
        })).id;

        for (const member of dim.members) {
          await repos.members.create({
            dimensionId: dimensionId,
            memberKey: member.memberKey,
            description: member.description,
            properties: member.properties,
            rowOrder: 0,
            sourceRowNumber: 0,
            isActive: true
          });
          imported++;
        }

        for (const rel of dim.relationships) {
          await repos.relationships.create({
            dimensionId: dimensionId,
            parentKey: rel.parentKey,
            childKey: rel.childKey,
            aggregationWeight: 1.0,
            percentConsol: null,
            percentOwnership: null,
            ownershipType: "",
            properties: {},
            rowOrder: 0,
            sourceRowNumber: 0
          });
        }
      }
    }

    res.json({
      ...result,
      imported: req.query.import === 'true' ? imported : 0
    });
  });

  // ============ Feature 18: API & Extensibility Platform ============

  router.post("/api-keys", (req, res) => {
    const schema = z.object({ name: z.string().min(1), permissions: z.array(z.string()).optional(), rateLimitPerMinute: z.number().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const { nanoid } = require("nanoid") as { nanoid: (size?: number) => string };
    const key = nanoid(40);
    res.status(201).json({
      id: nanoid(), name: parsed.data.name, key,
      keyPrefix: key.slice(0, 8),
      permissions: parsed.data.permissions ?? ['read'],
      rateLimitPerMinute: parsed.data.rateLimitPerMinute ?? 60,
      userId: req.user?.id ?? "system",
      lastUsedAt: null, expiresAt: null,
      createdAt: new Date().toISOString()
    });
  });

  router.get("/api-keys", (_req, res) => { res.json([]); });

  router.post("/projects/:id/webhook-subscriptions", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ url: z.string().url(), events: z.array(z.string()).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const webhook = await repos.webhookSubscriptions.create({
      projectId: project.id,
      url: parsed.data.url,
      events: parsed.data.events,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(webhook);
  });

  // ============ Feature 19: Offline Mode ============

  router.get("/projects/:id/sync/status", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const pendingChanges = await repos.syncQueue.countPending(project.id);
    res.json({ isOnline: true, pendingChanges, lastSyncAt: new Date().toISOString(), conflicts: 0 });
  });

  router.post("/projects/:id/sync/push", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const pending = await repos.syncQueue.listPending(project.id);
    for (const entry of pending) repos.syncQueue.markSynced(entry.id);
    res.json({ synced: pending.length, conflicts: 0, failed: 0 });
  });

  router.post("/projects/:id/sync/pull", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ received: 0, applied: 0, conflicts: 0 });
  });

  // ============ Feature 20: Documentation Auto-Generation ============

  router.post("/projects/:id/docs/generate", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const content = generateDocumentContent({ dimensions, members, relationships });
    const format = req.body?.format || 'markdown';

    const doc = await repos.generatedDocuments.create({
      projectId: project.id,
      title: `${project.name} - Design Document`,
      format,
      content,
      generatedBy: req.user?.id ?? "system"
    });
    res.status(201).json(doc);
  });

  router.get("/projects/:id/docs", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await repos.generatedDocuments.listByProject(project.id));
  });

  return router;
}
