import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { answerProjectQuestion, SUGGESTED_QUESTIONS, type AssistantContext } from "../../shared/projectAssistant";
import { computeReadinessScore } from "../../shared/readinessScore";
import type { Repositories } from "../db/repositories";
import { ArtifactStore } from "./artifactStore";

/**
 * Evidence-based Project Assistant (TASK-14). Answers project questions strictly from stored
 * project data. No external LLM is used; answers are deterministic and cite their evidence.
 */
export function createAssistantRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();
  const artifactStore = new ArtifactStore(config.paths.exportsDirectory);

  router.get("/:projectId/assistant/suggestions", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json({ suggestions: SUGGESTED_QUESTIONS });
  });

  router.post("/:projectId/assistant/query", async (req, res) => {
    const project = await repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) return res.status(400).json({ error: "question is required" });

    const answer = answerProjectQuestion(question, await buildContext(repos, config, artifactStore, project.id, project.name));
    res.json({ question, answer });
  });

  return router;
}

async function buildContext(
  repos: Repositories,
  config: AppConfig,
  artifactStore: ArtifactStore,
  projectId: string,
  projectName: string
): Promise<AssistantContext> {
  const issues = await repos.issues.listByProject(projectId);
  const dimensions = await repos.dimensions.listByProject(projectId);
  const members = await repos.members.listByProject(projectId);

  const readiness = computeReadinessScore({
    issues,
    dimensions: dimensions.map((d) => ({ dimensionType: d.dimensionType })),
    expectedDimensionTypes: config.validation.oneStreamProfile?.expectedDimensionTypes ?? [],
    certification: null,
    exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
    weights: config.readiness?.categoryWeights
  });

  const changeSets = await Promise.all(
    (await repos.changeSets.listByProject(projectId)).map(async (cs) => {
      const detail = await repos.changeSets.getDetail(projectId, cs.id);
      return { id: cs.id, name: cs.name, status: cs.status, itemCount: detail?.items.length ?? 0 };
    })
  );

  const latest = await repos.diffRuns.getLatest(projectId);
  const latestDiffSummary = latest
    ? {
        id: latest.id,
        added: latest.summary.byChangeType.add ?? 0,
        updated: latest.summary.byChangeType.update ?? 0,
        removed: latest.summary.byChangeType.delete ?? 0
      }
    : null;

  const artifactReferences = artifactStore.scannedArtifacts(projectId).flatMap((a) =>
    a.references.map((r) => ({
      memberKey: r.memberKey,
      dimensionHint: r.dimensionHint,
      artifactName: a.artifactName,
      confidence: r.confidence
    }))
  );

  return {
    projectName,
    readiness,
    issues,
    exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
    dimensions: dimensions.map((d) => ({ id: d.id, dimensionType: d.dimensionType, dimensionName: d.dimensionName })),
    members: members.map((m) => ({ id: m.id, dimensionId: m.dimensionId, memberKey: m.memberKey, properties: m.properties ?? {} })),
    changeSets,
    latestDiffSummary,
    artifactReferences
  };
}
