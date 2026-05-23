import type { RequestHandler } from "express";
import { ROLE_PERMISSIONS, type Permission, type SystemRole } from "../../shared/authTypes";

export function hasPermission(role: SystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = req.user.role;
    const hasAll = permissions.every((perm) => hasPermission(userRole, perm));
    if (!hasAll) {
      return res.status(403).json({ error: "Insufficient permissions", required: permissions, userRole });
    }
    next();
  };
}

export function requireRole(...roles: SystemRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role", required: roles, userRole: req.user.role });
    }
    next();
  };
}
