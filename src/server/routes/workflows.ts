import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { SystemRole } from "../../shared/authTypes";
import type { Repositories } from "../db/repositories";
import {
  approveStep,
  cancelWorkflow,
  getInstanceDetail,
  isWorkflowEngineError,
  rejectWorkflow,
  submitWorkflow
} from "../workflow/workflowEngine";
import { evaluateAutoAdvance, runAutoAdvanceCheck } from "../workflow/autoAdvanceEngine";
import { requireRole } from "../middleware/authorize";

const createDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  dimensionTypes: z.string().optional(),
  steps: z.array(z.object({
    name: z.string().min(1),
    requiredRole: z.enum(["admin", "author", "reviewer", "viewer"]),
    minApprovals: z.number().int().min(1),
    slaHours: z.number().optional()
  })).min(1),
  autoAdvanceRules: z.record(z.unknown()).optional()
});

const updateDefinitionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  dimensionTypes: z.string().optional(),
  steps: z.array(z.object({
    name: z.string().min(1),
    requiredRole: z.enum(["admin", "author", "reviewer", "viewer"]),
    minApprovals: z.number().int().min(1),
    slaHours: z.number().optional()
  })).min(1).optional(),
  autoAdvanceRules: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional()
});

const submitWorkflowSchema = z.object({
  changeSetId: z.string().min(1),
  definitionId: z.string().optional()
});

const actionSchema = z.object({
  comment: z.string().max(2000).optional()
});

export function createWorkflowRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  router.get("/definitions", async (_req, res) => {
    res.json(await repos.workflows.definitions.list());
  });

  router.post("/definitions", requireRole("admin"), async (req, res) => {
    const parsed = createDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const { name, description, dimensionTypes, steps, autoAdvanceRules } = parsed.data;
    const definition = await repos.workflows.definitions.create({
      name,
      description,
      dimensionTypes,
      steps,
      autoAdvanceRules,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(definition);
  });

  router.patch("/definitions/:id", requireRole("admin"), async (req, res) => {
    const parsed = updateDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const updated = await repos.workflows.definitions.update(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Workflow definition not found" });
    res.json(updated);
  });

  router.post("/submit", async (req, res) => {
    const parsed = submitWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const { changeSetId, definitionId } = parsed.data;

    const changeSet = await findChangeSetAcrossProjects(repos, changeSetId);
    if (!changeSet) return res.status(404).json({ error: "Change set not found" });

    const result = await submitWorkflow(repos, changeSetId, changeSet.projectId, req.user?.id ?? "system", definitionId);
    if (isWorkflowEngineError(result)) {
      return res.status(result.status).json({ error: result.message, code: result.code });
    }
    res.status(201).json(result);
  });

  router.get("/instances", async (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const status = String(req.query.status ?? "");
    if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
    res.json(await repos.workflows.instances.listByProject(projectId, status || undefined));
  });

  router.get("/instances/:id", async (req, res) => {
    const detail = await getInstanceDetail(repos, req.params.id);
    if (!detail) return res.status(404).json({ error: "Workflow instance not found" });
    res.json(detail);
  });

  router.post("/instances/:id/approve", async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const result = await approveStep(
      repos,
      req.params.id,
      req.user?.id ?? "system",
      (req.user?.role ?? "viewer") as SystemRole,
      parsed.data.comment
    );
    if (isWorkflowEngineError(result)) {
      return res.status(result.status).json({ error: result.message, code: result.code });
    }
    res.json(result);
  });

  router.post("/instances/:id/reject", async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const result = await rejectWorkflow(
      repos,
      req.params.id,
      req.user?.id ?? "system",
      (req.user?.role ?? "viewer") as SystemRole,
      parsed.data.comment
    );
    if (isWorkflowEngineError(result)) {
      return res.status(result.status).json({ error: result.message, code: result.code });
    }
    res.json(result);
  });

  router.post("/instances/:id/cancel", async (req, res) => {
    const result = await cancelWorkflow(
      repos,
      req.params.id,
      req.user?.id ?? "system",
      (req.user?.role ?? "viewer") as SystemRole
    );
    if (isWorkflowEngineError(result)) {
      return res.status(result.status).json({ error: result.message, code: result.code });
    }
    res.json(result);
  });

  router.get("/my-pending", async (req, res) => {
    const userId = req.user?.id ?? "system";
    const userRole = req.user?.role ?? "viewer";
    res.json(await repos.workflows.instances.listPendingForUser(userId, userRole));
  });

  router.get("/notifications", async (req, res) => {
    const userId = req.user?.id ?? "system";
    res.json(await repos.workflows.notifications.listByRecipient(userId));
  });

  router.patch("/notifications/:id/read", async (req, res) => {
    await repos.workflows.notifications.markRead(req.params.id);
    res.json({ ok: true });
  });

  router.post("/instances/:id/auto-advance/evaluate", async (req, res) => {
    const result = await evaluateAutoAdvance(repos, req.params.id);
    if (!result) return res.status(404).json({ error: "Instance not found or has no auto-advance rules" });
    res.json(result);
  });

  router.post("/auto-advance/run", requireRole("admin"), async (_req, res) => {
    const results = await runAutoAdvanceCheck(repos);
    res.json({ evaluated: results.length, advanced: results.filter(r => r.advanced).length, results });
  });

  return router;
}

async function findChangeSetAcrossProjects(repos: Repositories, changeSetId: string): Promise<{ projectId: string; changeSetId: string } | null> {
  const projects = await repos.projects.list();
  for (const project of projects) {
    const cs = await repos.changeSets.get(project.id, changeSetId);
    if (cs) return { projectId: project.id, changeSetId: cs.id };
  }
  return null;
}
