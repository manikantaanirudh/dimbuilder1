import { describe, expect, it } from "vitest";
import { analyzeHierarchy, buildHierarchyTree } from "../shared/hierarchy";

describe("hierarchy", () => {
  it("detects cycles and duplicate parent-child relationships", () => {
    const result = analyzeHierarchy(
      [
        { parentKey: "A", childKey: "B", id: "r1" },
        { parentKey: "B", childKey: "A", id: "r2" },
        { parentKey: "A", childKey: "B", id: "r3" }
      ],
      ["A", "B"]
    );

    expect(result.hasCycle).toBe(true);
    expect(result.duplicateRelationshipIds).toEqual(["r3"]);
  });

  it("builds a searchable tree from relationships", () => {
    const tree = buildHierarchyTree([
      { parentKey: "Root", childKey: "Actual", id: "r1" },
      { parentKey: "Actual", childKey: "Actual_Load", id: "r2" }
    ]);

    expect(tree[0].key).toBe("Root");
    expect(tree[0].children[0].children[0].key).toBe("Actual_Load");
  });
});

