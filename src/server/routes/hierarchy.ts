import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  blueprintFromProjectDimension,
  blueprintToYamlFragment
} from "../../shared/blueprintStudio";
import {
  buildHierarchyAnalytics,
  exportHierarchyLevelizedCsv,
  exportHierarchyParentChildCsv,
  exportHierarchyPathsCsv,
  exportOrphanMembersCsv,
  exportSharedMembersCsv
} from "../../shared/hierarchyAnalytics";
import type { Repositories } from "../db/repositories";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createHierarchyRouter({ repos }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/dimensions/:dimensionId/hierarchy/analytics", (req, res) => {
    const state = loadDimensionHierarchyState(repos, (req.params as Record<string, string>).projectId, (req.params as Record<string, string>).dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.json(buildHierarchyAnalytics(state.dimension, state.members, state.relationships));
  });

  router.get("/dimensions/:dimensionId/hierarchy/levelized.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, (req.params as Record<string, string>).projectId, (req.params as Record<string, string>).dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportHierarchyLevelizedCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/dimensions/:dimensionId/hierarchy/paths.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, (req.params as Record<string, string>).projectId, (req.params as Record<string, string>).dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportHierarchyPathsCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/dimensions/:dimensionId/hierarchy/parent-child.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, (req.params as Record<string, string>).projectId, (req.params as Record<string, string>).dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportHierarchyParentChildCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/dimensions/:dimensionId/hierarchy/shared-members.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, (req.params as Record<string, string>).projectId, (req.params as Record<string, string>).dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportSharedMembersCsv(state.dimension, state.members, state.relationships));
  });

  router.get("/dimensions/:dimensionId/hierarchy/orphans.csv", (req, res) => {
    const state = loadDimensionHierarchyState(repos, (req.params as Record<string, string>).projectId, (req.params as Record<string, string>).dimensionId);
    if (!state) return res.status(404).json({ error: "dimension not found" });
    res.type("text/csv").send(exportOrphanMembersCsv(state.dimension, state.members, state.relationships));
  });

  router.post("/dimensions/:dimensionId/blueprint", async (req, res) => {
    const dimension = await repos.dimensions.get((req.params as Record<string, string>).dimensionId);
    if (!dimension || dimension.projectId !== (req.params as Record<string, string>).projectId) return res.status(404).json({ error: "dimension not found" });
    const members = await repos.members.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 });
    const relationships = await repos.relationships.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 });
    const blueprint = blueprintFromProjectDimension(dimension, members, relationships);
    res.json({
      dimensionType: dimension.dimensionType,
      blueprint,
      yaml: blueprintToYamlFragment(dimension.dimensionType, blueprint)
    });
  });

  return router;
}

async function loadDimensionHierarchyState(repos: Repositories, projectId: string, dimensionId: string) {
  const dimension = await repos.dimensions.get(dimensionId);
  if (!dimension || dimension.projectId !== projectId) return null;
  return {
    dimension,
    members: await repos.members.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 }),
    relationships: await repos.relationships.listByDimension(dimension.id, { offset: 0, limit: 1_000_000 })
  };
}
