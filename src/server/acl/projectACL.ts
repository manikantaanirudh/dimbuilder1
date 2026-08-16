/**
 * Project-level access control middleware and routes.
 * 
 * Roles (ascending privilege):
 * - viewer: read-only access
 * - editor: can modify members, relationships
 * - manager: can manage project settings, dimensions
 * - owner: full control, can manage access
 * 
 * The project creator is automatically an owner.
 * If no ACL entries exist for a project, all authenticated users have full access (backwards compatible).
 */

import { Router } from "express";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import type { Repositories } from "../db/repositories";

export type ProjectRole = 'viewer' | 'editor' | 'manager' | 'owner';

const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  manager: 3,
  owner: 4
};

/**
 * Middleware factory that checks if the current user has at least the required role
 * for the project identified by :id param.
 */
export function requireProjectRole(repos: Repositories, minimumRole: ProjectRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const projectId = req.params.id ?? req.params.projectId;
    if (!projectId) return res.status(400).json({ error: "Project ID required" });

    const userId = req.user?.id ?? "anonymous";

    // Check if project has any ACL entries
    const members = await repos.projectMembers.listByProject(projectId);

    // If no ACL entries exist, allow all (backwards compatible)
    if (members.length === 0) return next();

    // Check user's role
    const userRole = await repos.projectMembers.getUserRole(projectId, userId) as ProjectRole | null;
    if (!userRole) {
      return res.status(403).json({ error: "Access denied: not a member of this project" });
    }

    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minimumRole]) {
      return res.status(403).json({ error: `Access denied: requires '${minimumRole}' role, you have '${userRole}'` });
    }

    next();
  };
}

/**
 * Creates routes for managing project membership/ACL.
 */
export function createProjectACLRouter(repos: Repositories): Router {
  const router = Router();

  // GET /projects/:id/members — list project members and their roles
  router.get("/projects/:id/members", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const members = await repos.projectMembers.listByProject(project.id);
    res.json(members);
  });

  // POST /projects/:id/members — add/update a project member
  router.post("/projects/:id/members", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const schema = z.object({
      userId: z.string().min(1),
      role: z.enum(['viewer', 'editor', 'manager', 'owner'])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    // Check if requester has owner role (or no ACL exists yet)
    const currentMembers = await repos.projectMembers.listByProject(project.id);
    if (currentMembers.length > 0) {
      const requesterRole = await repos.projectMembers.getUserRole(project.id, req.user?.id ?? "system");
      if (requesterRole !== 'owner') {
        return res.status(403).json({ error: "Only project owners can manage membership" });
      }
    }

    const member = await repos.projectMembers.add({
      projectId: project.id,
      userId: parsed.data.userId,
      role: parsed.data.role,
      grantedBy: req.user?.id ?? "system"
    });
    res.status(201).json(member);
  });

  // DELETE /projects/:id/members/:userId — remove a project member
  router.delete("/projects/:id/members/:userId", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Check if requester has owner role
    const currentMembers = await repos.projectMembers.listByProject(project.id);
    if (currentMembers.length > 0) {
      const requesterRole = await repos.projectMembers.getUserRole(project.id, req.user?.id ?? "system");
      if (requesterRole !== 'owner') {
        return res.status(403).json({ error: "Only project owners can manage membership" });
      }
    }

    await repos.projectMembers.remove(project.id, req.params.userId);
    res.status(204).end();
  });

  // GET /users/:userId/projects — list all projects a user has access to
  router.get("/users/:userId/projects", async (req, res) => {
    const memberships = await repos.projectMembers.listByUser(req.params.userId);
    res.json(memberships);
  });

  return router;
}
