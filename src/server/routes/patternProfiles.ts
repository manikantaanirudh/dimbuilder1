import { Router } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  buildPatternProfile,
  evaluatePatternProfile,
  type PatternProfile,
  type ProfilerDimension
} from "../../shared/clientPatternProfiler";
import type { Repositories } from "../db/repositories";

/**
 * Client Pattern Profiler routes (TASK-16). Learns client-specific metadata conventions from a
 * project and evaluates a project against a learned profile. Findings are suggestions (with
 * confidence), not hard OneStream validation rules.
 */
export function createPatternProfileRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  function profilesDir(projectId: string): string {
    return join(config.paths.exportsDirectory, "pattern-profiles", projectId);
  }

  function readProfiles(projectId: string): PatternProfile[] {
    const path = join(profilesDir(projectId), "index.json");
    if (!existsSync(path)) return [];
    try {
      return JSON.parse(readFileSync(path, "utf8")) as PatternProfile[];
    } catch {
      return [];
    }
  }

  function writeProfiles(projectId: string, profiles: PatternProfile[]): void {
    mkdirSync(profilesDir(projectId), { recursive: true });
    writeFileSync(join(profilesDir(projectId), "index.json"), JSON.stringify(profiles, null, 2));
  }

  function buildProfilerDimensions(projectId: string): ProfilerDimension[] {
    const dimensions = repos.dimensions.listByProject(projectId);
    const membersByDimension = new Map<string, ProfilerDimension>();
    for (const dimension of dimensions) {
      membersByDimension.set(dimension.id, { dimensionType: dimension.dimensionType, members: [] });
    }
    for (const member of repos.members.listByProject(projectId)) {
      const entry = membersByDimension.get(member.dimensionId);
      if (entry) entry.members.push({ memberKey: member.memberKey, description: member.description ?? "", properties: member.properties ?? {} });
    }
    return [...membersByDimension.values()];
  }

  router.post("/:projectId/pattern-profiles", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const profile = buildPatternProfile(project.id, project.name, buildProfilerDimensions(project.id), {
      minimumConfidence: config.patternProfiler?.minimumConfidence,
      maxGeneratedRules: config.patternProfiler?.maxGeneratedRules
    });
    const profiles = readProfiles(project.id);
    profiles.push(profile);
    writeProfiles(project.id, profiles);
    repos.audit.record({ projectId: project.id, action: "patternProfile.create", entityType: "project", entityId: project.id, after: { profileId: profile.id, rules: profile.rules.length } });
    res.status(201).json({ profile });
  });

  router.get("/:projectId/pattern-profiles", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json({ profiles: readProfiles(project.id) });
  });

  router.post("/:projectId/pattern-profiles/:profileId/evaluate", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const profile = readProfiles(project.id).find((p) => p.id === req.params.profileId);
    if (!profile) return res.status(404).json({ error: "profile not found" });
    const evaluation = evaluatePatternProfile(profile, buildProfilerDimensions(project.id));
    res.json({ evaluation });
  });

  return router;
}
