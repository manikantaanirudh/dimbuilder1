import { describe, expect, it } from "vitest";
import {
  analyzeHierarchy,
  buildHierarchyTree,
  canReparentHierarchy,
} from "../shared/hierarchy";

describe("hierarchy", () => {
  it("detects cycles and duplicate parent-child relationships", () => {
    const result = analyzeHierarchy(
      [
        { parentKey: "A", childKey: "B", id: "r1" },
        { parentKey: "B", childKey: "A", id: "r2" },
        { parentKey: "A", childKey: "B", id: "r3" },
      ],
      ["A", "B"],
    );

    expect(result.hasCycle).toBe(true);
    expect(result.duplicateRelationshipIds).toEqual(["r3"]);
  });

  it("builds a searchable tree from relationships", () => {
    const tree = buildHierarchyTree([
      { parentKey: "Root", childKey: "Actual", id: "r1" },
      { parentKey: "Actual", childKey: "Actual_Load", id: "r2" },
    ]);

    expect(tree[0].key).toBe("Root");
    expect(tree[0].children[0].children[0].key).toBe("Actual_Load");
  });

  it("allows reparenting a child to a new parent when it does not create a cycle", () => {
    const result = canReparentHierarchy(
      [
        { parentKey: "Root", childKey: "LE_110", id: "r1" },
        { parentKey: "LE_110", childKey: "LE_111", id: "r2" },
        { parentKey: "LE_110", childKey: "LE_112", id: "r3" },
        { parentKey: "Root", childKey: "LE_120", id: "r4" },
      ],
      "LE_111",
      "LE_120",
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a reparenting action that would create a cycle", () => {
    const result = canReparentHierarchy(
      [
        { parentKey: "Root", childKey: "LE_110", id: "r1" },
        { parentKey: "LE_110", childKey: "LE_111", id: "r2" },
        { parentKey: "LE_111", childKey: "LE_112", id: "r3" },
      ],
      "LE_111",
      "LE_112",
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("cycle");
  });
});
