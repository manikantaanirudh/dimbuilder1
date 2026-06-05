import { Router } from "express";
import { mkdirSync } from "node:fs";
import type { AppConfig } from "../../shared/appConfigTypes";
import { assessProposedChange, buildMemberWhereUsed, type ProposedChangeType } from "../../shared/artifactReferenceScanner";
import type { Repositories } from "../db/repositories";
import { ArtifactStore } from "./artifactStore";

const VALID_CHANGE_TYPES: ProposedChangeType[] = ["rename", "delete", "move", "update"];

/**
 * OneStream Artifact Impact Scanner routes (TASK-09). Upload artifact text, scan for member
 * references with confidence levels, and expose where-used / proposed-change impact.
 */
export function createArtifactRouter(repos: Repositories, config: AppConfig): Router {
  mkdirSync(config.paths.exportsDirectory, { recursive: true });
  const store = new ArtifactStore(config.paths.exportsDirectory);
  const router = Router();

  function knownMembers(projectId: string): Array<{ dimensionType: string; memberKey: string }> {
    const dimensionTypeById = new Map(repos.dimensions.listByProject(projectId).map((d) => [d.id, d.dimensionType]));
    return repos.members.listByProject(projectId).map((m) => ({
      dimensionType: dimensionTypeById.get(m.dimensionId) ?? "",
      memberKey: m.memberKey
    }));
  }

  router.post("/:projectId/artifacts/upload", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const content = typeof body.content === "string" ? body.content : "";
    const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "artifact.txt";
    if (!content) return res.status(400).json({ error: "content is required" });
    if (content.length > 5_000_000) return res.status(413).json({ error: "artifact content exceeds 5MB limit" });
    const artifact = store.upload(project.id, {
      name: typeof body.name === "string" ? body.name : fileName,
      fileName,
      content,
      artifactType: body.artifactType
    });
    repos.audit.record({ projectId: project.id, action: "artifact.upload", entityType: "project", entityId: project.id, after: { artifactId: artifact.id, name: artifact.name } });
    res.status(201).json({ artifact });
  });

  router.post("/:projectId/artifacts/:artifactId/scan", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const result = store.scan(project.id, req.params.artifactId, knownMembers(project.id));
    if (!result) return res.status(404).json({ error: "artifact not found" });
    repos.audit.record({ projectId: project.id, action: "artifact.scan", entityType: "project", entityId: project.id, after: { artifactId: req.params.artifactId, references: result.references.length } });
    res.json(result);
  });

  router.get("/:projectId/artifacts", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json({ artifacts: store.list(project.id) });
  });

  router.get("/:projectId/impact/member/:memberId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const member = repos.members.getById(req.params.memberId);
    if (!member) return res.status(404).json({ error: "member not found" });
    const dimension = repos.dimensions.get(member.dimensionId);
    if (!dimension || dimension.projectId !== project.id) return res.status(404).json({ error: "member not found" });
    const whereUsed = buildMemberWhereUsed(dimension.dimensionType, member.memberKey, store.scannedArtifacts(project.id));
    res.json({ whereUsed });
  });

  router.post("/:projectId/impact/proposed-change", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const dimensionType = String(body.dimensionType ?? "").trim();
    const memberKey = String(body.memberKey ?? "").trim();
    const changeType = body.changeType as ProposedChangeType;
    if (!dimensionType || !memberKey) return res.status(400).json({ error: "dimensionType and memberKey are required" });
    if (!VALID_CHANGE_TYPES.includes(changeType)) return res.status(400).json({ error: "changeType must be one of rename, delete, move, update" });
    const impact = assessProposedChange(dimensionType, memberKey, changeType, store.scannedArtifacts(project.id));
    res.json({ impact });
  });

  return router;
}
