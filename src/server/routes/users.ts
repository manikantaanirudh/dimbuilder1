import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { SystemRole } from "../../shared/authTypes";
import { SYSTEM_ROLES } from "../../shared/authTypes";
import type { Repositories, UserRow } from "../db/repositories";
import { hashPassword } from "../auth/passwords";

// --- Zod Schemas ---

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  password: z.string().min(8).optional(),
  role: z.enum(SYSTEM_ROLES as unknown as [string, ...string[]])
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  role: z.enum(SYSTEM_ROLES as unknown as [string, ...string[]]).optional(),
  isActive: z.boolean().optional()
});

// --- Helpers ---

function sanitizeUser(row: UserRow) {
  const { password_hash, ...rest } = row;
  return rest;
}

// --- Router Factory ---

export function createUserRouter(repos: Repositories): Router {
  const router = Router();

  // GET / — List all users
  router.get("/", (_req, res) => {
    const users = repos.users.listUsers();
    return res.json(users.map(sanitizeUser));
  });

  // POST / — Create/invite a user
  router.post("/", async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
        });
      }

      const { email, displayName, password, role } = parsed.data;

      // Check if email already exists
      const existing = repos.users.findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }

      const passwordHash = password ? await hashPassword(password) : undefined;
      const id = nanoid();

      repos.users.createUser({
        id,
        email,
        displayName,
        passwordHash,
        authProvider: password ? "local" : "oidc",
        role
      });

      const created = repos.users.findUserById(id);
      if (!created) {
        return res.status(500).json({ error: "Failed to create user" });
      }

      return res.status(201).json(sanitizeUser(created));
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /:id — Update user
  router.patch("/:id", (req, res) => {
    try {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message }))
        });
      }

      const { id } = req.params;
      const { displayName, role, isActive } = parsed.data;
      const currentUserId = req.user?.id;

      // Cannot deactivate yourself
      if (id === currentUserId && isActive === false) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }

      // Cannot remove your own admin role
      if (id === currentUserId && role && role !== "admin") {
        return res.status(400).json({ error: "Cannot remove your own admin role" });
      }

      const user = repos.users.findUserById(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      repos.users.updateUser(id, {
        displayName,
        role,
        isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined
      });

      const updated = repos.users.findUserById(id);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update user" });
      }

      return res.json(sanitizeUser(updated));
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /:id — Deactivate user (soft delete)
  router.delete("/:id", (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id;

      // Cannot deactivate yourself
      if (id === currentUserId) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }

      const user = repos.users.findUserById(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      repos.users.updateUser(id, { isActive: 0 });
      repos.sessions.deleteSessionsByUserId(id);

      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
