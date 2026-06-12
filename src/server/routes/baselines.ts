import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { createComparableProjectState, diffProjectMetadata } from "../../shared/metadataDiff";
import type { BaselineSourceType } from "../../shared/types";
import { parseOneStreamXml } from "../../shared/xmlImport";
import type { Repositories } from "../db/repositories";
import { isRecord, loadProjectState } from "../helpers/projectState";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createBaselinesRouter({ repos }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.post("/baselines", async (req, res, next) => {
    try {
      const project = await repos.projects.get((req.params as Record<string, string>).projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const body = req.body ?? {};
      const sourceType = parseBaselineSourceType(String(body.sourceType ?? "")) ?? (body.baseline ? "json" : body.xml || body.xmlContent ? "xml" : "snapshot");
      const name = String(body.name ?? "").trim() || defaultBaselineName(sourceType);
      const sourceFileName = String(body.sourceFileName ?? "").trim();
      const baselineState = await createBaselineState(repos, project.id, body, sourceType, sourceFileName);
      const baseline = await repos.baselines.create({
        projectId: project.id,
        name,
        sourceType,
        sourceFileName,
        baseline: baselineState,
        createdBy: "local-admin"
      });
      await repos.audit.record({ projectId: project.id, action: "baseline.create", entityType: "baseline", entityId: baseline.id, after: baseline });
      res.status(201).json(baseline);
    } catch (error) {
      next(error);
    }
  });

  router.get("/baselines", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(await repos.baselines.listByProject(project.id));
  });

  router.get("/baselines/:baselineId", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const baseline = await repos.baselines.get(project.id, (req.params as Record<string, string>).baselineId);
    if (!baseline) return res.status(404).json({ error: "baseline not found" });
    res.json(baseline);
  });

  router.post("/diff", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const baselineId = String(req.body?.baselineId ?? "").trim();
    if (!baselineId) return res.status(400).json({ error: "baselineId is required" });
    const baseline = await repos.baselines.get(project.id, baselineId);
    if (!baseline) return res.status(404).json({ error: "baseline not found" });

    const targetState = createComparableProjectState(await loadProjectState(repos, project.id));
    const result = diffProjectMetadata(baseline.baseline, targetState, isRecord(req.body?.options) ? req.body.options : {});
    const persisted = await repos.diffRuns.createWithItems({
      projectId: project.id,
      baselineId: baseline.id,
      status: "completed",
      summary: result.summary,
      items: result.items,
      createdBy: "local-admin"
    });
    await repos.audit.record({ projectId: project.id, action: "diff.run", entityType: "diffRun", entityId: persisted.run.id, after: persisted.run });
    res.status(201).json(persisted.run);
  });

  router.get("/diff/:diffRunId", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const run = await repos.diffRuns.get(project.id, (req.params as Record<string, string>).diffRunId);
    if (!run) return res.status(404).json({ error: "diff run not found" });
    res.json(run);
  });

  router.get("/diff/:diffRunId/items", async (req, res) => {
    const project = await repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const run = await repos.diffRuns.get(project.id, (req.params as Record<string, string>).diffRunId);
    if (!run) return res.status(404).json({ error: "diff run not found" });
    res.json(await repos.diffRuns.listItems(run.id));
  });

  return router;
}

async function createBaselineState(
  repos: Repositories,
  projectId: string,
  body: Record<string, unknown>,
  sourceType: BaselineSourceType,
  sourceFileName: string
) {
  if (sourceType === "snapshot") {
    return createComparableProjectState(await loadProjectState(repos, projectId));
  }

  if (sourceType === "xml") {
    const xml = String(body.xml ?? body.xmlContent ?? "").trim();
    if (!xml) throw Object.assign(new Error("xml or xmlContent is required for XML baselines"), { status: 400 });
    const parsed = parseOneStreamXml(xml, {
      projectName: String(body.name ?? "XML Baseline"),
      sourceFileName,
      createdBy: "local-admin"
    });
    return createComparableProjectState(parsed);
  }

  if (isRecord(body.baseline)) {
    return createComparableProjectState(body.baseline);
  }

  throw Object.assign(new Error("baseline is required for json/manual baselines"), { status: 400 });
}

function parseBaselineSourceType(value: string): BaselineSourceType | undefined {
  if (value === "xml" || value === "snapshot" || value === "json" || value === "manual") return value;
  return undefined;
}

function defaultBaselineName(sourceType: BaselineSourceType): string {
  if (sourceType === "snapshot") return "Current project snapshot";
  if (sourceType === "xml") return "XML baseline";
  return "Metadata baseline";
}
