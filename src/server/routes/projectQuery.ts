import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import { PROJECT_QUERY_PLAYBOOKS, toProjectQueryResult, type ProjectQueryResult, type ProjectQueryScopeToken } from "../../shared/projectQuery";
import { requireProjectRole } from "../acl/projectACL";
import type { Repositories } from "../db/repositories";
import { executeProjectQuery, interpretProjectQuery, projectQuerySuggestions } from "../projectQuery/engine";
import { logger } from "../logger";

const questionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  sessionId: z.string().min(1).optional()
});

const legacyImportSchema = z.object({
  sessions: z.array(z.object({
    id: z.string().min(1),
    title: z.string().optional(),
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(20000),
      timestamp: z.string().optional(),
      result: z.unknown().optional()
    })).max(100)
  })).max(50)
});

export function createProjectQueryRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();
  const viewer = requireProjectRole(repos, "viewer");

  router.get("/:projectId/query/suggestions", viewer, async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json({ suggestions: projectQuerySuggestions(typeof req.query.q === "string" ? req.query.q : "") });
  });

  router.post("/:projectId/query/interpret", viewer, async (req, res) => {
    const parsed = questionSchema.pick({ question: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "question must be 1-500 characters", details: parsed.error.issues });
    const interpretation = await interpretProjectQuery(repos, req.params.projectId, parsed.data.question);
    if (!interpretation) return res.status(404).json({ error: "project not found" });
    res.json({ interpretation });
  });

  router.get("/:projectId/query/sessions", viewer, async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const userId = req.user?.id ?? "system";
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    res.json({ sessions: await repos.projectQuerySessions.listByProject(project.id, userId, limit, offset), limit, offset });
  });

  router.get("/:projectId/query/sessions/:sessionId", viewer, async (req, res) => {
    const session = await repos.projectQuerySessions.get(req.params.sessionId, req.params.projectId, req.user?.id ?? "system");
    if (!session) return res.status(404).json({ error: "query session not found" });
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
    res.json({ session: { ...session, entries: session.entries.slice(offset, offset + limit) }, offset, limit, totalEntries: session.entries.length });
  });

  router.get("/:projectId/query/entries/:entryId/rows", viewer, async (req, res) => {
    const userId = req.user?.id ?? "system";
    const sessions = await repos.projectQuerySessions.listByProject(req.params.projectId, userId, 100, 0);
    let owned = false;
    for (const session of sessions) {
      const detail = await repos.projectQuerySessions.get(session.id, req.params.projectId, userId);
      if (detail?.entries.some((entry) => entry.id === req.params.entryId)) { owned = true; break; }
    }
    if (!owned) return res.status(404).json({ error: "query entry not found" });
    const offset = Number(req.query.offset ?? 0);
    const limit = Number(req.query.limit ?? 50);
    const search = typeof req.query.search === "string" ? req.query.search : "";
    res.json(await repos.projectQueryRows.list(req.params.entryId, offset, limit, search));
  });

  router.get("/:projectId/query/playbooks", viewer, async (_req, res) => {
    res.json({ playbooks: PROJECT_QUERY_PLAYBOOKS });
  });

  router.get("/:projectId/query/playbook-runs", viewer, async (req, res) => {
    res.json({ runs: await repos.projectQueryPlaybooks.list(req.params.projectId, req.user?.id ?? "system") });
  });

  router.get("/:projectId/query/playbook-runs/:runId", viewer, async (req, res) => {
    const run = await repos.projectQueryPlaybooks.get(req.params.runId, req.params.projectId, req.user?.id ?? "system");
    if (!run) return res.status(404).json({ error: "playbook run not found" });
    res.json({ run });
  });

  router.post("/:projectId/query/playbooks/:playbookId/runs", viewer, async (req, res) => {
    const definition = PROJECT_QUERY_PLAYBOOKS.find((item) => item.id === req.params.playbookId);
    if (!definition) return res.status(404).json({ error: "playbook not found" });
    const userId = req.user?.id ?? "system";
    const scope = Array.isArray(req.body?.scope) ? req.body.scope as ProjectQueryScopeToken[] : [];
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined;
    const run = await repos.projectQueryPlaybooks.create({ projectId: req.params.projectId, userId, sessionId, playbookId: definition.id, definitionVersion: definition.version, scope, steps: definition.steps.map((step) => ({ id: step.id, label: step.label })) });
    let current = run;
    try {
      for (const step of definition.steps) {
        current = (await repos.projectQueryPlaybooks.updateStep(run.id, req.params.projectId, userId, step.id, "running"))!;
        const execution = await executeProjectQuery(repos, _config, req.params.projectId, step.question);
        if (!execution) throw new Error("project not found");
        current = (await repos.projectQueryPlaybooks.updateStep(run.id, req.params.projectId, userId, step.id, execution.result.status === "needs_clarification" ? "needs_clarification" : "completed", execution.result))!;
        if (execution.result.status === "needs_clarification") {
          current = (await repos.projectQueryPlaybooks.updateStatus(run.id, req.params.projectId, userId, "needs_clarification"))!;
          return res.status(200).json({ run: current });
        }
      }
      current = (await repos.projectQueryPlaybooks.updateStatus(run.id, req.params.projectId, userId, "completed"))!;
      res.status(201).json({ run: current });
    } catch (error) {
      current = (await repos.projectQueryPlaybooks.updateStatus(run.id, req.params.projectId, userId, "failed"))!;
      res.status(500).json({ error: error instanceof Error ? error.message : "playbook failed", run: current });
    }
  });

  router.post("/:projectId/query/playbook-runs/:runId/rerun", viewer, async (req, res) => {
    const existing = await repos.projectQueryPlaybooks.get(req.params.runId, req.params.projectId, req.user?.id ?? "system");
    if (!existing) return res.status(404).json({ error: "playbook run not found" });
    const definition = PROJECT_QUERY_PLAYBOOKS.find((item) => item.id === existing.playbookId);
    if (!definition) return res.status(404).json({ error: "playbook definition not found" });
    const userId = req.user?.id ?? "system";
    const rerun = await repos.projectQueryPlaybooks.create({ projectId: req.params.projectId, userId, sessionId: existing.sessionId, playbookId: definition.id, definitionVersion: definition.version, scope: existing.scope, steps: definition.steps.map((step) => ({ id: step.id, label: step.label })) });
    let current = rerun;
    try {
      for (const step of definition.steps) {
        current = (await repos.projectQueryPlaybooks.updateStep(rerun.id, req.params.projectId, userId, step.id, "running"))!;
        const execution = await executeProjectQuery(repos, _config, req.params.projectId, step.question);
        if (!execution) throw new Error("project not found");
        current = (await repos.projectQueryPlaybooks.updateStep(rerun.id, req.params.projectId, userId, step.id, execution.result.status === "needs_clarification" ? "needs_clarification" : "completed", execution.result))!;
        if (execution.result.status === "needs_clarification") {
          current = (await repos.projectQueryPlaybooks.updateStatus(rerun.id, req.params.projectId, userId, "needs_clarification"))!;
          return res.json({ run: current });
        }
      }
      current = (await repos.projectQueryPlaybooks.updateStatus(rerun.id, req.params.projectId, userId, "completed"))!;
      res.status(201).json({ run: current });
    } catch (error) {
      current = (await repos.projectQueryPlaybooks.updateStatus(rerun.id, req.params.projectId, userId, "failed"))!;
      res.status(500).json({ error: error instanceof Error ? error.message : "playbook failed", run: current });
    }
  });

  router.post("/:projectId/query/playbook-runs/:runId/steps/:stepId/rerun", viewer, async (req, res) => {
    const userId = req.user?.id ?? "system";
    const run = await repos.projectQueryPlaybooks.get(req.params.runId, req.params.projectId, userId);
    if (!run) return res.status(404).json({ error: "playbook run not found" });
    const definition = PROJECT_QUERY_PLAYBOOKS.find((item) => item.id === run.playbookId);
    const step = definition?.steps.find((item) => item.id === req.params.stepId);
    if (!step) return res.status(404).json({ error: "playbook step not found" });
    try {
      await repos.projectQueryPlaybooks.updateStep(run.id, req.params.projectId, userId, step.id, "running");
      const execution = await executeProjectQuery(repos, _config, req.params.projectId, step.question);
      if (!execution) return res.status(404).json({ error: "project not found" });
      const status = execution.result.status === "needs_clarification" ? "needs_clarification" : "completed";
      const updated = await repos.projectQueryPlaybooks.updateStep(run.id, req.params.projectId, userId, step.id, status, execution.result);
      await repos.projectQueryPlaybooks.updateStatus(run.id, req.params.projectId, userId, status === "needs_clarification" ? "needs_clarification" : "completed");
      res.json({ run: updated });
    } catch (error) {
      await repos.projectQueryPlaybooks.updateStep(run.id, req.params.projectId, userId, step.id, "failed");
      res.status(500).json({ error: error instanceof Error ? error.message : "playbook step failed" });
    }
  });

  router.get("/:projectId/query/playbook-runs/:runId/export", viewer, async (req, res) => {
    const run = await repos.projectQueryPlaybooks.get(req.params.runId, req.params.projectId, req.user?.id ?? "system");
    if (!run) return res.status(404).json({ error: "playbook run not found" });
    const format = req.query.format === "csv" ? "csv" : "markdown";
    if (format === "csv") {
      const rows = run.steps.map((step) => ({ step: step.label, status: step.status, summary: step.result?.summary ?? "" }));
      const csv = ["step,status,summary", ...rows.map((row) => [row.step, row.status, row.summary].map((value) => JSON.stringify(value)).join(","))].join("\n");
      res.type("text/csv").setHeader("Content-Disposition", `attachment; filename="project-query-playbook-${run.id}.csv"`).send(csv);
      return;
    }
    const markdown = [`# ${run.playbookId}`, ``, `Status: ${run.status}`, `Generated: ${new Date().toISOString()}`, ``, ...run.steps.map((step) => `## ${step.label}\n\nStatus: ${step.status}\n\n${step.result?.summary ?? "No result"}\n${(step.result?.evidence ?? []).map((evidence) => `- ${evidence.label}: ${evidence.value}`).join("\n")}`)].join("\n\n");
    res.type("text/markdown").setHeader("Content-Disposition", `attachment; filename="project-query-playbook-${run.id}.md"`).send(markdown);
  });

  router.get("/:projectId/query/templates", viewer, async (req, res) => {
    res.json({ templates: await repos.projectQueryTemplates.list(req.params.projectId, req.user?.id ?? "system") });
  });

  router.post("/:projectId/query/templates", viewer, async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.name !== "string" || typeof body.question !== "string" || !body.name.trim() || !body.question.trim()) return res.status(400).json({ error: "name and question are required" });
    const template = await repos.projectQueryTemplates.create({ projectId: req.params.projectId, userId: req.user?.id ?? "system", name: body.name, category: typeof body.category === "string" ? body.category : undefined, question: body.question, parameters: Array.isArray(body.parameters) ? body.parameters : undefined, scope: Array.isArray(body.scope) ? body.scope : undefined });
    res.status(201).json({ template });
  });

  router.patch("/:projectId/query/templates/:templateId", viewer, async (req, res) => {
    const body = req.body ?? {};
    const parsed = z.object({
      name: z.string().trim().min(1).optional(),
      category: z.string().trim().min(1).optional(),
      question: z.string().trim().min(1).max(500).optional(),
      parameters: z.array(z.string().min(1)).max(20).optional(),
      scope: z.array(z.unknown()).max(50).optional()
    }).safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: "invalid query template", details: parsed.error.issues });
    const template = await repos.projectQueryTemplates.update(req.params.templateId, req.params.projectId, req.user?.id ?? "system", parsed.data as Parameters<Repositories["projectQueryTemplates"]["update"]>[3]);
    if (!template) return res.status(404).json({ error: "query template not found" });
    res.json({ template });
  });

  router.delete("/:projectId/query/templates/:templateId", viewer, async (req, res) => {
    const deleted = await repos.projectQueryTemplates.delete(req.params.templateId, req.params.projectId, req.user?.id ?? "system");
    if (!deleted) return res.status(404).json({ error: "query template not found" });
    res.status(204).end();
  });

  router.post("/:projectId/query/templates/:templateId/run", viewer, async (req, res) => {
    const template = await repos.projectQueryTemplates.get(req.params.templateId, req.params.projectId, req.user?.id ?? "system");
    if (!template) return res.status(404).json({ error: "query template not found" });
    const question = template.question.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => typeof req.body?.parameters?.[key] === "string" ? req.body.parameters[key] : `{${key}}`);
    if (question.includes("{")) return res.status(400).json({ error: "missing query template parameter" });
    await repos.projectQueryTemplates.markRun(template.id, req.params.projectId, req.user?.id ?? "system");
    const execution = await executeProjectQuery(repos, _config, req.params.projectId, question);
    if (!execution) return res.status(404).json({ error: "project not found" });
    const userId = req.user?.id ?? "system";
    let sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined;
    if (!sessionId) sessionId = (await repos.projectQuerySessions.create({ projectId: req.params.projectId, userId })).id;
    const session = await repos.projectQuerySessions.append(sessionId, req.params.projectId, userId, question, execution.result);
    res.json({ result: execution.result, question, session });
  });

  router.get("/:projectId/query/sessions/:sessionId/export", viewer, async (req, res) => {
    const session = await repos.projectQuerySessions.get(req.params.sessionId, req.params.projectId, req.user?.id ?? "system");
    if (!session) return res.status(404).json({ error: "query session not found" });
    const format = req.query.format === "csv" ? "csv" : "markdown";
    const entry = session.entries.at(-1);
    if (format === "csv") {
      const rows: Array<Record<string, string | number | boolean | null>> = session.entries.flatMap((item) => (item.result.table?.rows ?? []).map((row) => ({ entry: item.question, ...row })));
      const keys = rows.length ? [...new Set(rows.flatMap((row) => Object.keys(row)))] : ["entry"];
      const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
      res.type("text/csv").setHeader("Content-Disposition", `attachment; filename="project-query-${session.id}.csv"`).send(csv);
      return;
    }
    const markdown = [`# ${session.title}`, ``, `Generated: ${new Date().toISOString()}`, ``, ...session.entries.map((item) => [`## ${item.question}`, ``, item.result.summary, ``, item.result.freshness ? `Freshness: ${item.result.freshness.label}` : "", ...(item.result.evidence ?? []).map((evidence) => `- ${evidence.label}: ${evidence.value}`), ...(item.result.remediation ?? []).map((step) => `- [ ] ${step.title}: ${step.explanation}`)].join("\n"))].join("\n\n");
    res.type("text/markdown").setHeader("Content-Disposition", `attachment; filename="project-query-${session.id}.md"`).send(markdown);
  });

  router.post("/:projectId/query/sessions", viewer, async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const title = typeof req.body?.title === "string" ? req.body.title : undefined;
    const session = await repos.projectQuerySessions.create({ projectId: project.id, userId: req.user?.id ?? "system", title });
    res.status(201).json({ session });
  });

  router.delete("/:projectId/query/sessions/:sessionId", viewer, async (req, res) => {
    const deleted = await repos.projectQuerySessions.delete(req.params.sessionId, req.params.projectId, req.user?.id ?? "system");
    if (!deleted) return res.status(404).json({ error: "query session not found" });
    res.status(204).end();
  });

  router.post("/:projectId/query/sessions/import", viewer, async (req, res) => {
    const parsed = legacyImportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid query history import", details: parsed.error.issues });
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const userId = req.user?.id ?? "system";
    let imported = 0;
    for (const legacySession of parsed.data.sessions) {
      let session = await repos.projectQuerySessions.findByLegacyId(project.id, userId, legacySession.id);
      if (!session) session = await repos.projectQuerySessions.create({ projectId: project.id, userId, title: legacySession.title, legacyId: legacySession.id });
      for (const [index, message] of legacySession.messages.entries()) {
        if (message.role !== "user") continue;
        const nextAssistant = legacySession.messages[index + 1];
        const legacyResult = isLegacyResult(message.result) ? message.result : nextAssistant?.result;
        const result = isLegacyResult(legacyResult)
          ? toProjectQueryResult(legacyResult)
          : unsupportedResult(message.content);
        await repos.projectQuerySessions.append(session.id, project.id, userId, message.content, result);
        imported += 1;
      }
    }
    res.status(201).json({ imported });
  });

  router.post("/:projectId/query", viewer, async (req, res) => {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "question must be 1-500 characters", details: parsed.error.issues });
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const userId = req.user?.id ?? "system";
    let sessionId = parsed.data.sessionId;
    if (sessionId && !(await repos.projectQuerySessions.get(sessionId, project.id, userId))) {
      return res.status(404).json({ error: "query session not found" });
    }
    if (!sessionId) sessionId = (await repos.projectQuerySessions.create({ projectId: project.id, userId })).id;
    const startedAt = Date.now();
    const execution = await executeProjectQuery(repos, _config, project.id, parsed.data.question);
    if (!execution) return res.status(404).json({ error: "project not found" });
    logger.info({ projectId: project.id, intent: execution.result.intent, status: execution.result.status, durationMs: Date.now() - startedAt, rowCount: execution.result.table?.totalRows ?? 0, freshness: execution.result.freshness?.state ?? "unknown" }, "project_query.execute");
    const session = await repos.projectQuerySessions.append(sessionId, project.id, userId, parsed.data.question, execution.result);
    res.json({ project: execution.project, session, entry: session?.entries.at(-1) ?? null, result: execution.result });
  });

  return router;
}

function isLegacyResult(value: unknown): value is { answer: string; query: string; matchedMembers: string[]; confidence: number; intent?: string; intentLabel?: string; evidence?: string[]; followUps?: string[] } {
  return Boolean(value && typeof value === "object" && typeof (value as { answer?: unknown }).answer === "string");
}

function unsupportedResult(question: string): ProjectQueryResult {
  return {
    status: "unsupported",
    matchQuality: "unsupported",
    query: question,
    intent: "unknown",
    intentLabel: "Unsupported query",
    summary: "Historical result could not be reconstructed.",
    dataAsOf: null,
    metrics: [],
    findings: [],
    evidence: [],
    targets: [],
    followUps: []
  };
}
