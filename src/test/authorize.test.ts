import { describe, expect, it } from "vitest";
import { hasPermission } from "../server/middleware/authorize";
import type { SystemRole } from "../shared/authTypes";

describe("authorize middleware", () => {
  it("admin has all permissions", () => {
    expect(hasPermission("admin", "users.manage")).toBe(true);
    expect(hasPermission("admin", "projects.create")).toBe(true);
    expect(hasPermission("admin", "deploy")).toBe(true);
  });

  it("viewer cannot edit or export", () => {
    expect(hasPermission("viewer", "projects.edit")).toBe(false);
    expect(hasPermission("viewer", "members.edit")).toBe(false);
    expect(hasPermission("viewer", "export.xml")).toBe(false);
  });

  it("reviewer can approve but not edit", () => {
    expect(hasPermission("reviewer", "changeSets.approve")).toBe(true);
    expect(hasPermission("reviewer", "members.edit")).toBe(false);
  });

  it("author can edit but not approve or manage users", () => {
    expect(hasPermission("author", "members.edit")).toBe(true);
    expect(hasPermission("author", "changeSets.approve")).toBe(false);
    expect(hasPermission("author", "users.manage")).toBe(false);
  });
});
