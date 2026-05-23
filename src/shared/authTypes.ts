export type SystemRole = "admin" | "author" | "reviewer" | "viewer";
export type ProjectRole = "owner" | "editor" | "reviewer" | "viewer";

export const SYSTEM_ROLES: SystemRole[] = ["admin", "author", "reviewer", "viewer"];
export const PROJECT_ROLES: ProjectRole[] = ["owner", "editor", "reviewer", "viewer"];

export type Permission =
  | "projects.create"
  | "projects.delete"
  | "projects.edit"
  | "projects.view"
  | "members.edit"
  | "relationships.edit"
  | "validation.run"
  | "export.xml"
  | "export.all"
  | "changeSets.approve"
  | "changeSets.reject"
  | "deploy"
  | "users.manage"
  | "config.manage";

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  admin: [
    "projects.create", "projects.delete", "projects.edit", "projects.view",
    "members.edit", "relationships.edit", "validation.run",
    "export.xml", "export.all", "changeSets.approve", "changeSets.reject",
    "deploy", "users.manage", "config.manage"
  ],
  author: [
    "projects.create", "projects.delete", "projects.edit", "projects.view",
    "members.edit", "relationships.edit", "validation.run",
    "export.xml", "export.all"
  ],
  reviewer: [
    "projects.view", "validation.run", "export.xml",
    "changeSets.approve", "changeSets.reject"
  ],
  viewer: [
    "projects.view", "validation.run"
  ]
};

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  authProvider: "local" | "oidc";
  role: SystemRole;
  isActive: boolean;
  avatarUrl?: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: SystemRole;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
