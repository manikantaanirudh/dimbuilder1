export interface HierarchyRelationshipInput {
  id: string;
  parentKey: string;
  childKey: string;
}

export interface HierarchyNode {
  key: string;
  children: HierarchyNode[];
  issueCodes: string[];
}

export interface HierarchyAnalysis {
  hasCycle: boolean;
  duplicateRelationshipIds: string[];
  missingParentKeys: string[];
  missingChildKeys: string[];
  orphanMemberKeys: string[];
}

export function analyzeHierarchy(
  relationships: HierarchyRelationshipInput[],
  memberKeys: string[] = []
): HierarchyAnalysis {
  const childrenByParent = new Map<string, string[]>();
  const incoming = new Set<string>();
  const seenPairs = new Set<string>();
  const duplicateRelationshipIds: string[] = [];
  const knownMembers = new Set(memberKeys.filter(Boolean));

  for (const relationship of relationships) {
    const pair = `${relationship.parentKey}\u0000${relationship.childKey}`;
    if (seenPairs.has(pair)) duplicateRelationshipIds.push(relationship.id);
    seenPairs.add(pair);

    if (!childrenByParent.has(relationship.parentKey)) childrenByParent.set(relationship.parentKey, []);
    childrenByParent.get(relationship.parentKey)?.push(relationship.childKey);
    incoming.add(relationship.childKey);
  }

  const hasCycle = detectCycle(childrenByParent);
  const referencedParents = new Set(relationships.map((relationship) => relationship.parentKey).filter(Boolean));
  const referencedChildren = new Set(relationships.map((relationship) => relationship.childKey).filter(Boolean));
  const missingParentKeys = [...referencedParents].filter((key) => knownMembers.size > 0 && key !== "Root" && !knownMembers.has(key));
  const missingChildKeys = [...referencedChildren].filter((key) => knownMembers.size > 0 && !knownMembers.has(key));
  const roots = [...referencedParents].filter((key) => !incoming.has(key));
  const reachable = new Set<string>();

  for (const root of roots.length ? roots : ["Root"]) collectReachable(root, childrenByParent, reachable);

  const orphanMemberKeys = [...knownMembers].filter((key) => relationships.length > 0 && !reachable.has(key));

  return {
    hasCycle,
    duplicateRelationshipIds,
    missingParentKeys,
    missingChildKeys,
    orphanMemberKeys
  };
}

export function buildHierarchyTree(relationships: HierarchyRelationshipInput[]): HierarchyNode[] {
  const childrenByParent = new Map<string, string[]>();
  const incoming = new Set<string>();

  for (const relationship of relationships) {
    if (!childrenByParent.has(relationship.parentKey)) childrenByParent.set(relationship.parentKey, []);
    childrenByParent.get(relationship.parentKey)?.push(relationship.childKey);
    incoming.add(relationship.childKey);
  }

  const roots = [...childrenByParent.keys()].filter((key) => !incoming.has(key));
  return roots.map((root) => buildNode(root, childrenByParent, new Set()));
}

function buildNode(key: string, childrenByParent: Map<string, string[]>, ancestry: Set<string>): HierarchyNode {
  if (ancestry.has(key)) return { key, children: [], issueCodes: ["CIRCULAR_HIERARCHY"] };
  const nextAncestry = new Set(ancestry);
  nextAncestry.add(key);

  return {
    key,
    children: (childrenByParent.get(key) ?? []).map((child) => buildNode(child, childrenByParent, nextAncestry)),
    issueCodes: []
  };
}

function detectCycle(childrenByParent: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;

    visiting.add(node);
    for (const child of childrenByParent.get(node) ?? []) {
      if (visit(child)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of childrenByParent.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

function collectReachable(node: string, childrenByParent: Map<string, string[]>, reachable: Set<string>): void {
  if (reachable.has(node)) return;
  reachable.add(node);
  for (const child of childrenByParent.get(node) ?? []) collectReachable(child, childrenByParent, reachable);
}

