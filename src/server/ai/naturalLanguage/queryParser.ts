import type { DimensionMemberRecord, DimensionRelationshipRecord, DimensionRecord } from "../../../shared/types";
import type { NLQueryResult } from "../../../shared/aiTypes";
import { generateResponse } from "./responseGenerator";

export interface NLQueryInput {
  question: string;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

interface ParsedIntent {
  type: 'find' | 'count' | 'children' | 'missing_property' | 'property_filter' | 'orphans' | 'check_exists' | 'unknown';
  params: Record<string, string>;
}

export function parseAndExecuteQuery(input: NLQueryInput): NLQueryResult {
  const { question, dimensions, members, relationships } = input;
  const intent = parseIntent(question);
  const result = executeIntent(intent, dimensions, members, relationships);

  return {
    answer: result.answer,
    matchedMembers: result.matchedMembers,
    query: question,
    confidence: result.confidence
  };
}

function parseIntent(question: string): ParsedIntent {
  const q = question.trim();

  // "Which [dimension] are missing [property]?"
  const missingMatch = q.match(/which\s+(\w+)\s+(?:are|is)\s+missing\s+['"]?(\w+)['"]?/i);
  if (missingMatch) {
    return { type: 'missing_property', params: { dimension: missingMatch[1], property: missingMatch[2] } };
  }

  // "Find members without [property]"
  const withoutMatch = q.match(/(?:find|show|list)\s+members?\s+without\s+['"]?(\w+)['"]?/i);
  if (withoutMatch) {
    return { type: 'missing_property', params: { dimension: '', property: withoutMatch[1] } };
  }

  // "Show members under [parent]" / "List children of [parent]"
  const childrenMatch = q.match(/(?:show|list|get)\s+(?:members?|children|descendants?)\s+(?:under|of|below)\s+['"]?([^'"?\s]+(?:\s+[^'"?\s]+)*)['"]?\s*\??$/i);
  if (childrenMatch) {
    return { type: 'children', params: { parent: childrenMatch[1].trim() } };
  }

  // "How many members (in [dimension])?"
  const countMatch = q.match(/how\s+many\s+members?\s*(?:in\s+['"]?(\w+)['"]?)?/i);
  if (countMatch) {
    return { type: 'count', params: { dimension: countMatch[1] || '' } };
  }

  // "How many dimensions?" / "total dimensions"
  const dimCountMatch = q.match(/(?:how\s+many|total|count)\s+dimensions?/i);
  if (dimCountMatch) {
    return { type: 'count', params: { dimension: '__dimensions__' } };
  }

  // "Which members have [property] = [value]?"
  const filterMatch = q.match(/(?:which|find|show)\s+members?\s+(?:have|with|where)\s+['"]?(\w+)['"]?\s*=\s*['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (filterMatch) {
    return { type: 'property_filter', params: { property: filterMatch[1], value: filterMatch[2].trim() } };
  }

  // "Show orphan members" / "Find members without parents"
  if (q.includes('orphan') || q.match(/members?\s+without\s+parents?/)) {
    return { type: 'orphans', params: {} };
  }

  // "Is there a member called X" / "Does X exist" / "Check if X exists"
  const existsMatch = q.match(/(?:is there|does|do we have|check if|can you (?:find|check))\s+(?:a\s+)?(?:member\s+)?(?:called|named|with name)?\s*['"]?([^'"?]+?)['"]?\s*(?:exist[s]?|in the)?\s*\??$/i);
  if (existsMatch) {
    return { type: 'check_exists', params: { memberKey: existsMatch[1].trim() } };
  }

  // "Find [pattern]" / "Search for [pattern]"
  const findMatch = q.match(/(?:find|search|look\s+for|show)\s+(?:for\s+)?['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (findMatch) {
    // Strip filler words: "member", "called", "named", "a", "the"
    const raw = findMatch[1].trim();
    const pattern = raw.replace(/\b(member|members|called|named|a|the|dimension|in)\b/gi, '').trim();
    return { type: 'find', params: { pattern: pattern || raw } };
  }

  return { type: 'unknown', params: { raw: question } };
}

function executeIntent(
  intent: ParsedIntent,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): { answer: string; matchedMembers: string[]; confidence: number } {
  switch (intent.type) {
    case 'find': {
      const pattern = intent.params.pattern.toLowerCase();
      const matched = members.filter(m =>
        m.memberKey.toLowerCase().includes(pattern) ||
        m.description.toLowerCase().includes(pattern)
      );
      const matchedKeys = matched.map(m => m.memberKey);
      return {
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'find', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.8
      };
    }

    case 'count': {
      const dimFilter = intent.params.dimension;
      // Special case: counting dimensions
      if (dimFilter === '__dimensions__') {
        return {
          answer: `This project has ${dimensions.length} dimension(s): ${dimensions.map(d => `${d.dimensionType} (${d.dimensionName})`).join(', ')}`,
          matchedMembers: [],
          confidence: 1.0
        };
      }
      let filtered = members;
      if (dimFilter) {
        const dim = dimensions.find(d =>
          d.dimensionType.toLowerCase() === dimFilter.toLowerCase() ||
          d.dimensionName.toLowerCase() === dimFilter.toLowerCase()
        );
        if (dim) {
          filtered = members.filter(m => m.dimensionId === dim.id);
        }
      }
      return {
        answer: generateResponse({ matchedMembers: filtered.map(m => m.memberKey), intent: 'count', params: intent.params }),
        matchedMembers: filtered.map(m => m.memberKey),
        confidence: 1.0
      };
    }

    case 'children': {
      const parentKey = intent.params.parent;
      const descendants = findDescendants(parentKey, relationships);
      return {
        answer: generateResponse({ matchedMembers: descendants, intent: 'children', params: intent.params }),
        matchedMembers: descendants,
        confidence: 0.9
      };
    }

    case 'missing_property': {
      const { dimension, property } = intent.params;
      let filtered = members;
      if (dimension) {
        const dim = dimensions.find(d =>
          d.dimensionType.toLowerCase() === dimension.toLowerCase() ||
          d.dimensionName.toLowerCase() === dimension.toLowerCase()
        );
        if (dim) {
          filtered = members.filter(m => m.dimensionId === dim.id);
        }
      }
      const missing = filtered.filter(m => {
        const val = m.properties[property] ?? m.properties[property.charAt(0).toUpperCase() + property.slice(1)];
        return val === undefined || val === null || val === '';
      });
      const matchedKeys = missing.map(m => m.memberKey);
      return {
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'missing_property', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.9
      };
    }

    case 'property_filter': {
      const { property, value } = intent.params;
      const matched = members.filter(m => {
        const propVal = m.properties[property] ?? m.properties[property.charAt(0).toUpperCase() + property.slice(1)];
        return String(propVal ?? '').toLowerCase() === value.toLowerCase();
      });
      const matchedKeys = matched.map(m => m.memberKey);
      return {
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'property_filter', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.9
      };
    }

    case 'orphans': {
      const childKeys = new Set(relationships.map(r => r.childKey));
      const parentKeys = new Set(relationships.map(r => r.parentKey));
      const orphans = members.filter(m =>
        !childKeys.has(m.memberKey) && !parentKeys.has(m.memberKey)
      );
      const matchedKeys = orphans.map(m => m.memberKey);
      return {
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'orphans', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.9
      };
    }

    case 'check_exists': {
      const searchKey = intent.params.memberKey.toLowerCase();
      const found = members.filter(m => m.memberKey.toLowerCase() === searchKey);
      if (found.length === 0) {
        const partial = members.filter(m => m.memberKey.toLowerCase().includes(searchKey));
        if (partial.length > 0) {
          return {
            answer: `No exact match for "${intent.params.memberKey}", but found ${partial.length} similar member(s): ${partial.slice(0, 5).map(m => m.memberKey).join(', ')}${partial.length > 5 ? '...' : ''}`,
            matchedMembers: partial.slice(0, 10).map(m => m.memberKey),
            confidence: 0.6
          };
        }
        return {
          answer: `No member called "${intent.params.memberKey}" exists in this project.`,
          matchedMembers: [],
          confidence: 1.0
        };
      }
      const member = found[0];
      const dim = dimensions.find(d => d.id === member.dimensionId);
      const parentRels = relationships.filter(r => r.childKey === member.memberKey);
      const parents = parentRels.map(r => r.parentKey).join(', ') || 'None (root)';
      const propCount = Object.keys(member.properties).length;
      return {
        answer: `Yes! Member "${member.memberKey}" exists.\n• Dimension: ${dim?.dimensionType ?? 'Unknown'} (${dim?.dimensionName ?? ''})\n• Description: ${member.description || '(none)'}\n• Parent(s): ${parents}\n• Properties: ${propCount} defined\n• Active: ${member.isActive ? 'Yes' : 'No'}`,
        matchedMembers: found.map(m => m.memberKey),
        confidence: 1.0
      };
    }

    default: {
      // Fallback: keyword search
      const raw = intent.params.raw || '';
      const words = raw.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const matched = members.filter(m =>
        words.some(w => m.memberKey.toLowerCase().includes(w) || m.description.toLowerCase().includes(w))
      );
      const matchedKeys = matched.map(m => m.memberKey);
      return {
        answer: matchedKeys.length > 0
          ? generateResponse({ matchedMembers: matchedKeys, intent: 'find', params: { pattern: raw } })
          : `I couldn't understand the query "${raw}". Try "Find [name]", "Show members under [parent]", or "How many members in [dimension]?"`,
        matchedMembers: matchedKeys,
        confidence: 0.3
      };
    }
  }
}

function findDescendants(parentKey: string, relationships: DimensionRelationshipRecord[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!childrenOf.has(rel.parentKey)) childrenOf.set(rel.parentKey, []);
    childrenOf.get(rel.parentKey)!.push(rel.childKey);
  }

  // Case-insensitive parent lookup
  let resolvedParent = parentKey;
  if (!childrenOf.has(parentKey)) {
    for (const key of childrenOf.keys()) {
      if (key.toLowerCase() === parentKey.toLowerCase()) {
        resolvedParent = key;
        break;
      }
    }
  }

  const descendants: string[] = [];
  const queue = childrenOf.get(resolvedParent) || [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    descendants.push(current);
    const children = childrenOf.get(current) || [];
    queue.push(...children);
  }

  return descendants;
}
