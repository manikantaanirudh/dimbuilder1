import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../../../shared/types";
import type { ParentSuggestion } from "../../../shared/aiTypes";

export interface ParentSuggestionInput {
  memberKey: string;
  dimensionMembers: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function suggestParents(input: ParentSuggestionInput): ParentSuggestion[] {
  const { memberKey, relationships } = input;
  const suggestions: ParentSuggestion[] = [];

  const childrenOf = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!childrenOf.has(rel.parentKey)) childrenOf.set(rel.parentKey, []);
    childrenOf.get(rel.parentKey)!.push(rel.childKey);
  }

  const allParentKeys = new Set(relationships.map(r => r.parentKey));

  // Strategy 1: Prefix matching
  for (const parentKey of allParentKeys) {
    if (parentKey === memberKey) continue;
    const normalizedParent = parentKey.replace(/[_\-\s]/g, '').toLowerCase();
    const normalizedMember = memberKey.replace(/[_\-\s]/g, '').toLowerCase();
    if (normalizedMember.startsWith(normalizedParent) && normalizedParent.length >= 3) {
      const ratio = normalizedParent.length / normalizedMember.length;
      suggestions.push({
        parentKey,
        confidence: Math.min(0.9, 0.5 + ratio * 0.4),
        reason: `Member name starts with "${parentKey}" prefix`
      });
    }
  }

  // Strategy 2: Sibling pattern matching
  for (const [parent, children] of childrenOf) {
    if (parent === memberKey || children.includes(memberKey)) continue;
    if (children.length < 2) continue;

    const commonPrefix = findCommonPrefix(children);
    if (commonPrefix.length >= 3) {
      const normalizedMember = memberKey.replace(/[_\-\s]/g, '').toLowerCase();
      const normalizedPrefix = commonPrefix.replace(/[_\-\s]/g, '').toLowerCase();
      if (normalizedMember.startsWith(normalizedPrefix)) {
        const existing = suggestions.find(s => s.parentKey === parent);
        if (!existing) {
          suggestions.push({
            parentKey: parent,
            confidence: 0.75,
            reason: `Siblings share common prefix "${commonPrefix}" matching this member`
          });
        }
      }
    }
  }

  // Strategy 3: Moderate child count parents
  if (suggestions.length < 3) {
    for (const [parent, children] of childrenOf) {
      if (parent === memberKey || children.includes(memberKey)) continue;
      if (suggestions.find(s => s.parentKey === parent)) continue;
      if (children.length >= 2 && children.length <= 20) {
        suggestions.push({
          parentKey: parent,
          confidence: 0.3,
          reason: `Parent has ${children.length} children at similar level`
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  const sorted = [...strings].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let i = 0;
  while (i < first.length && i < last.length && first[i] === last[i]) i++;
  let prefix = first.slice(0, i);
  const lastSep = Math.max(prefix.lastIndexOf('_'), prefix.lastIndexOf('-'), prefix.lastIndexOf(' '));
  if (lastSep > 0 && lastSep < prefix.length - 1) prefix = prefix.slice(0, lastSep);
  return prefix;
}
