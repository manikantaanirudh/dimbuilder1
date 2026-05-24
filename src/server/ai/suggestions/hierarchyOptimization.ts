import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../../../shared/types";
import type { HierarchyOptimization } from "../../../shared/aiTypes";

export interface HierarchyOptimizationInput {
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function suggestHierarchyOptimizations(input: HierarchyOptimizationInput): HierarchyOptimization[] {
  const { relationships } = input;
  const suggestions: HierarchyOptimization[] = [];

  const childrenOf = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!childrenOf.has(rel.parentKey)) childrenOf.set(rel.parentKey, []);
    childrenOf.get(rel.parentKey)!.push(rel.childKey);
  }

  // Strategy 1: Over-populated parents (>15 children)
  for (const [parent, children] of childrenOf) {
    if (children.length > 15) {
      const groupable = findGroupableChildren(children);
      if (groupable.length > 0) {
        suggestions.push({
          parentKey: parent,
          action: 'group',
          affectedMembers: children,
          reason: `Parent "${parent}" has ${children.length} direct children — consider grouping by common patterns`,
          confidence: Math.min(0.9, 0.5 + (children.length - 15) * 0.02)
        });
      }
    }
  }

  // Strategy 2: Single-child chains
  const visited = new Set<string>();
  for (const [parent, children] of childrenOf) {
    if (visited.has(parent)) continue;
    if (children.length !== 1) continue;

    const chain = [parent];
    let current = children[0];
    while (childrenOf.has(current) && childrenOf.get(current)!.length === 1) {
      chain.push(current);
      visited.add(current);
      current = childrenOf.get(current)![0];
    }
    chain.push(current);
    visited.add(current);

    if (chain.length >= 3) {
      suggestions.push({
        parentKey: parent,
        action: 'flatten',
        affectedMembers: chain.slice(1, -1),
        reason: `Single-child chain of length ${chain.length} from "${parent}" to "${current}" — intermediate nodes add no value`,
        confidence: Math.min(0.85, 0.5 + chain.length * 0.1)
      });
    }
  }

  // Strategy 3: Unbalanced siblings
  for (const [parent, children] of childrenOf) {
    if (children.length < 3) continue;
    const childCounts = children.map(c => (childrenOf.get(c) || []).length);
    const maxChildren = Math.max(...childCounts);
    const minChildren = Math.min(...childCounts);

    if (maxChildren > 10 && minChildren === 0 && children.length >= 3) {
      const heavyChildren = children.filter(c => (childrenOf.get(c) || []).length > 10);
      suggestions.push({
        parentKey: parent,
        action: 'rebalance',
        affectedMembers: heavyChildren,
        reason: `Children of "${parent}" are unbalanced — some have ${maxChildren} descendants while others are leaves`,
        confidence: 0.6
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function findGroupableChildren(children: string[]): string[][] {
  const prefixGroups = new Map<string, string[]>();

  for (const child of children) {
    const sepIdx = child.indexOf('_');
    if (sepIdx > 2) {
      const groupKey = child.slice(0, sepIdx);
      if (!prefixGroups.has(groupKey)) prefixGroups.set(groupKey, []);
      if (!prefixGroups.get(groupKey)!.includes(child)) {
        prefixGroups.get(groupKey)!.push(child);
      }
    }
  }

  return [...prefixGroups.values()].filter(g => g.length >= 3);
}
