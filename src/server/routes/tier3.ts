import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { scoreDimensionQuality, generateDocumentContent } from "../tier3/tier3Engine";

export function createTier3Router(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // ============ Feature 13: Excel Add-In ============

  router.post("/projects/:id/excel/download", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensionType = req.body?.dimensionType as string;
    const dimensions = repos.dimensions.listByProject(project.id);
    const dim = dimensionType ? dimensions.find(d => d.dimensionType === dimensionType) : dimensions[0];
    if (!dim) return res.status(404).json({ error: "Dimension not found" });

    const members = repos.members.listByProject(project.id).filter(m => m.dimensionId === dim.id);
    const relationships = repos.relationships.listByProject(project.id).filter(r => r.dimensionId === dim.id);

    res.json({
      dimensionType: dim.dimensionType, dimensionName: dim.dimensionName,
      members: members.map(m => ({ memberKey: m.memberKey, description: m.description, properties: m.properties })),
      relationships: relationships.map(r => ({ parentKey: r.parentKey, childKey: r.childKey, aggregationWeight: r.aggregationWeight })),
      validationRules: []
    });
  });

  router.post("/projects/:id/excel/publish", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.status(201).json({ membersCreated: 0, membersUpdated: 0, relationshipsCreated: 0, relationshipsUpdated: 0, validationIssues: [] });
  });

  // ============ Feature 14: Conflict Resolution ============

  router.post("/projects/:id/locks/acquire", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ dimensionId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed" });

    const existing = repos.editLocks.getActive(project.id, parsed.data.dimensionId);
    if (existing && existing.userId !== (req.user?.id ?? "system")) {
      return res.status(409).json({ error: "Dimension is locked by another user", lock: existing });
    }

    const lock = repos.editLocks.acquire({
      projectId: project.id,
      dimensionId: parsed.data.dimensionId,
      userId: req.user?.id ?? "system"
    });
    res.status(201).json(lock);
  });

  router.post("/projects/:id/locks/release", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const dimensionId = req.body?.dimensionId;
    if (dimensionId) repos.editLocks.release(project.id, dimensionId, req.user?.id ?? "system");
    res.status(204).end();
  });

  router.get("/projects/:id/locks", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.editLocks.listByProject(project.id));
  });

  router.post("/projects/:id/conflicts/detect", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ hasConflicts: false, conflicts: [], autoMerged: [] });
  });

  // ============ Feature 15: Scheduled Jobs ============

  router.get("/projects/:id/jobs", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.scheduledJobs.listByProject(project.id));
  });

  router.post("/projects/:id/jobs", (req, res) => {
    const project = repos.projects.get(req.params.id);
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

    const job = repos.scheduledJobs.create({
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

  router.delete("/projects/:id/jobs/:jobId", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    repos.scheduledJobs.delete(req.params.jobId);
    res.status(204).end();
  });

  router.post("/projects/:id/webhooks", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ url: z.string().url(), events: z.array(z.string()).min(1), name: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const webhook = repos.webhookSubscriptions.create({
      projectId: project.id,
      url: parsed.data.url,
      events: parsed.data.events,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(webhook);
  });

  router.get("/projects/:id/webhooks", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.webhookSubscriptions.listByProject(project.id));
  });

  // ============ Feature 16: Data Quality Scoring ============

  router.get("/projects/:id/quality/scores", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const rules = repos.qualityRules.listByProject(project.id);

    const scores = dimensions.map(dim => {
      const dimMembers = members.filter(m => m.dimensionId === dim.id);
      return scoreDimensionQuality(dim, dimMembers, rules);
    });

    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length)
      : 100;

    res.json({ overallScore, dimensions: scores });
  });

  router.post("/projects/:id/quality/rules", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      category: z.enum(['completeness', 'naming', 'structure', 'consistency', 'custom']),
      weight: z.number().min(0).max(10).optional(),
      config: z.record(z.unknown()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const rule = repos.qualityRules.create({
      projectId: project.id,
      name: parsed.data.name,
      category: parsed.data.category,
      weight: parsed.data.weight,
      config: parsed.data.config,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(rule);
  });

  router.get("/projects/:id/quality/rules", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.qualityRules.listByProject(project.id));
  });

  router.post("/projects/:id/quality/gates", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      threshold: z.number().min(0).max(100),
      scope: z.enum(['project', 'dimension', 'member']).optional(),
      action: z.enum(['block_deploy', 'warn', 'notify']).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const gate = repos.qualityGates.create({
      projectId: project.id,
      name: parsed.data.name,
      threshold: parsed.data.threshold,
      scope: parsed.data.scope,
      action: parsed.data.action,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(gate);
  });

  router.get("/projects/:id/quality/gates", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.qualityGates.listByProject(project.id));
  });

  // ============ Feature 17: Migration Assistant ============

  router.post("/projects/:id/migrations", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      name: z.string().min(1),
      sourceType: z.enum(['hyperion_hfm', 'hyperion_planning', 'sap_bpc', 'csv_generic'])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const migration = repos.migrationProjects.create({
      projectId: project.id,
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(migration);
  });

  router.get("/projects/:id/migrations", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.migrationProjects.listByProject(project.id));
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

  router.post("/projects/:id/webhook-subscriptions", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ url: z.string().url(), events: z.array(z.string()).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const webhook = repos.webhookSubscriptions.create({
      projectId: project.id,
      url: parsed.data.url,
      events: parsed.data.events,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(webhook);
  });

  // ============ Feature 19: Offline Mode ============

  router.get("/projects/:id/sync/status", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const pendingChanges = repos.syncQueue.countPending(project.id);
    res.json({ isOnline: true, pendingChanges, lastSyncAt: new Date().toISOString(), conflicts: 0 });
  });

  router.post("/projects/:id/sync/push", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const pending = repos.syncQueue.listPending(project.id);
    for (const entry of pending) repos.syncQueue.markSynced(entry.id);
    res.json({ synced: pending.length, conflicts: 0, failed: 0 });
  });

  router.post("/projects/:id/sync/pull", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ received: 0, applied: 0, conflicts: 0 });
  });

  // ============ Feature 20: Documentation Auto-Generation ============

  router.post("/projects/:id/docs/generate", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);

    const content = generateDocumentContent({ dimensions, members, relationships });
    const format = req.body?.format || 'markdown';

    const doc = repos.generatedDocuments.create({
      projectId: project.id,
      title: `${project.name} - Design Document`,
      format,
      content,
      generatedBy: req.user?.id ?? "system"
    });
    res.status(201).json(doc);
  });

  router.get("/projects/:id/docs", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.generatedDocuments.listByProject(project.id));
  });

  return router;
}
