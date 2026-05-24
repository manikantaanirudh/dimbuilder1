import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { Repositories } from "../db/repositories";
import { serializeProject, computeDiff, mergeBranches } from "../vcs/vcsEngine";
import type { ProjectSnapshot } from "../../shared/vcsTypes";

export function createVcsRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  // GET /projects/:id/vcs/branches
  router.get("/projects/:id/vcs/branches", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.vcsBranches.listByProject(project.id));
  });

  // POST /projects/:id/vcs/branches
  router.post("/projects/:id/vcs/branches", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ name: z.string().min(1), baseBranchId: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const branch = repos.vcsBranches.create({
      projectId: project.id,
      name: parsed.data.name,
      baseBranchId: parsed.data.baseBranchId,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(branch);
  });

  // POST /projects/:id/vcs/commit
  router.post("/projects/:id/vcs/commit", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ branchId: z.string().min(1), message: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const branch = repos.vcsBranches.get(parsed.data.branchId);
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const snapshot = serializeProject(repos, project.id);
    const commit = repos.vcsCommits.create({
      projectId: project.id,
      branchId: branch.id,
      message: parsed.data.message,
      snapshotData: snapshot,
      parentCommitId: branch.headCommitId ?? undefined,
      createdBy: req.user?.id ?? "system"
    });

    repos.vcsBranches.updateHead(branch.id, commit.id);
    res.status(201).json(commit);
  });

  // GET /projects/:id/vcs/history
  router.get("/projects/:id/vcs/history", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const commits = repos.vcsCommits.listByProject(project.id);
    const branches = repos.vcsBranches.listByProject(project.id);
    const tags = repos.vcsTags.listByProject(project.id);
    res.json({ commits, branches, tags });
  });

  // GET /projects/:id/vcs/diff?from=&to=
  router.get("/projects/:id/vcs/diff", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const fromId = req.query.from as string;
    const toId = req.query.to as string;
    if (!fromId || !toId) return res.status(400).json({ error: "from and to commit IDs required" });

    const fromCommit = repos.vcsCommits.get(fromId);
    const toCommit = repos.vcsCommits.get(toId);
    if (!fromCommit || !toCommit) return res.status(404).json({ error: "Commit not found" });

    const diff = computeDiff(
      fromCommit.snapshotData as unknown as ProjectSnapshot,
      toCommit.snapshotData as unknown as ProjectSnapshot
    );
    diff.fromCommitId = fromId;
    diff.toCommitId = toId;
    res.json(diff);
  });

  // POST /projects/:id/vcs/merge
  router.post("/projects/:id/vcs/merge", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ sourceBranchId: z.string().min(1), targetBranchId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const sourceBranch = repos.vcsBranches.get(parsed.data.sourceBranchId);
    const targetBranch = repos.vcsBranches.get(parsed.data.targetBranchId);
    if (!sourceBranch || !targetBranch) return res.status(404).json({ error: "Branch not found" });

    const sourceCommit = sourceBranch.headCommitId ? repos.vcsCommits.get(sourceBranch.headCommitId) : null;
    const targetCommit = targetBranch.headCommitId ? repos.vcsCommits.get(targetBranch.headCommitId) : null;

    if (!sourceCommit || !targetCommit) {
      return res.status(400).json({ error: "Both branches must have commits to merge" });
    }

    const sourceSnapshot = sourceCommit.snapshotData as unknown as ProjectSnapshot;
    const targetSnapshot = targetCommit.snapshotData as unknown as ProjectSnapshot;

    // Find base (parent of source branch)
    const baseCommitId = sourceCommit.parentCommitId;
    const baseCommit = baseCommitId ? repos.vcsCommits.get(baseCommitId) : null;
    const baseSnapshot = baseCommit ? baseCommit.snapshotData as unknown as ProjectSnapshot : null;

    const mergeResult = mergeBranches(sourceSnapshot, targetSnapshot, baseSnapshot);

    if (mergeResult.success) {
      // Create merge commit on target branch
      const mergeCommit = repos.vcsCommits.create({
        projectId: project.id,
        branchId: targetBranch.id,
        message: `Merge branch "${sourceBranch.name}" into "${targetBranch.name}"`,
        snapshotData: sourceSnapshot,
        parentCommitId: targetBranch.headCommitId ?? undefined,
        createdBy: req.user?.id ?? "system"
      });
      repos.vcsBranches.updateHead(targetBranch.id, mergeCommit.id);
      repos.vcsBranches.updateStatus(sourceBranch.id, 'merged');
      mergeResult.commitId = mergeCommit.id;
    }

    res.json(mergeResult);
  });

  // POST /projects/:id/vcs/tags
  router.post("/projects/:id/vcs/tags", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({ name: z.string().min(1), commitId: z.string().min(1), description: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const commit = repos.vcsCommits.get(parsed.data.commitId);
    if (!commit) return res.status(404).json({ error: "Commit not found" });

    const tag = repos.vcsTags.create({
      projectId: project.id,
      name: parsed.data.name,
      commitId: parsed.data.commitId,
      description: parsed.data.description,
      createdBy: req.user?.id ?? "system"
    });
    res.status(201).json(tag);
  });

  // GET /projects/:id/vcs/tags
  router.get("/projects/:id/vcs/tags", (req, res) => {
    const project = repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(repos.vcsTags.listByProject(project.id));
  });

  return router;
}
