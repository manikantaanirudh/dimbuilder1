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

  // --- Definitions ---

  router.get("/definitions", (_req, res) => {
    res.json(repos.workflows.definitions.list());
  });

  router.post("/definitions", requireRole("admin"), (req, res) => {
    const parsed = createDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const { name, description, dimensionTypes, steps, autoAdvanceRules } = parsed.data;
    const definition = repos.workflows.definitions.create({
      name,
      description,
      dimensionTypes,
      steps,
      autoAdvanceRules,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(definition);
  });

  router.patch("/definitions/:id", requireRole("admin"), (req, res) => {
    const parsed = updateDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const updated = repos.workflows.definitions.update(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Workflow definition not found" });
    res.json(updated);
  });

  // --- Submit ---

  router.post("/submit", (req, res) => {
    const parsed = submitWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const { changeSetId, definitionId } = parsed.data;

    // Need to find the projectId from the change set — look through all projects
    const changeSet = findChangeSetAcrossProjects(repos, changeSetId);
    if (!changeSet) return res.status(404).json({ error: "Change set not found" });

    const result = submitWorkflow(repos, changeSetId, changeSet.projectId, req.user?.id ?? "system", definitionId);
    if (isWorkflowEngineError(result)) {
      return res.status(result.status).json({ error: result.message, code: result.code });
    }
    res.status(201).json(result);
  });

  // --- Instances ---

  router.get("/instances", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const status = String(req.query.status ?? "");
    if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
    res.json(repos.workflows.instances.listByProject(projectId, status || undefined));
  });

  router.get("/instances/:id", (req, res) => {
    const detail = getInstanceDetail(repos, req.params.id);
    if (!detail) return res.status(404).json({ error: "Workflow instance not found" });
    res.json(detail);
  });

  router.post("/instances/:id/approve", (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const result = approveStep(
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

  router.post("/instances/:id/reject", (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
      });
    }
    const result = rejectWorkflow(
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

  router.post("/instances/:id/cancel", (req, res) => {
    const result = cancelWorkflow(
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

  // --- My Pending ---

  router.get("/my-pending", (req, res) => {
    const userId = req.user?.id ?? "system";
    const userRole = req.user?.role ?? "viewer";
    res.json(repos.workflows.instances.listPendingForUser(userId, userRole));
  });

  // --- Notifications ---

  router.get("/notifications", (req, res) => {
    const userId = req.user?.id ?? "system";
    res.json(repos.workflows.notifications.listByRecipient(userId));
  });

  router.patch("/notifications/:id/read", (req, res) => {
    repos.workflows.notifications.markRead(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function findChangeSetAcrossProjects(repos: Repositories, changeSetId: string): { projectId: string; changeSetId: string } | null {
  const projects = repos.projects.list();
  for (const project of projects) {
    const cs = repos.changeSets.get(project.id, changeSetId);
    if (cs) return { projectId: project.id, changeSetId: cs.id };
  }
  return null;
}
