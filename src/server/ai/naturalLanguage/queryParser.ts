import type { DimensionMemberRecord, DimensionRelationshipRecord, DimensionRecord } from "../../../shared/types";
import type { NLQueryResult } from "../../../shared/aiTypes";
import type { ProjectAIContext } from "../projectContext";
import { buildHierarchyAnalytics } from "../../../shared/hierarchyAnalytics";
import { generateResponse } from "./responseGenerator";
import { normalizeQuery, matchesAny } from "./queryNormalizer";
import { scoreIntentFromKeywords } from "./intentScoring";
import {
  buildUnknownQueryResult,
  extractDimensionToken,
  membersForDimension,
  resolveDimensionToken,
  toNLQueryResult,
  type QueryExecutionResult
} from "./queryHelpers";

export interface NLQueryInput {
  question: string;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  context?: ProjectAIContext;
}

interface ParsedIntent {
  type:
    | 'find' | 'count' | 'children' | 'missing_property' | 'property_filter' | 'orphans'
    | 'check_exists' | 'summary' | 'issues' | 'export_ready'
    | 'leaf_count' | 'list_leaves' | 'hierarchy_depth' | 'hierarchy_summary'
    | 'shared_members' | 'empty_dimensions' | 'dimension_issues' | 'coverage'
    | 'list_members' | 'list_dimensions' | 'member_details'
    | 'relationship_count' | 'inactive_members' | 'root_members'
    | 'unknown';
  params: Record<string, string>;
}

export function parseAndExecuteQuery(input: NLQueryInput): NLQueryResult {
  const { question, dimensions, members, relationships, context } = input;
  const intent = parseIntent(question, dimensions);
  const result = executeIntent(intent, question, dimensions, members, relationships, context);
  return toNLQueryResult(question, result);
}

function parseIntent(question: string, dimensions: DimensionRecord[]): ParsedIntent {
  const q = question.trim();
  const nq = normalizeQuery(q);
  const n = nq.normalized;
  const dimensionToken = extractDimensionToken(q, dimensions) ?? extractDimensionToken(n, dimensions) ?? "";

  if (/\bexport\b/i.test(q) && /(ready|can i|able to|block|blocking|blocked|allowed|safe to)/i.test(q)) {
    return { type: 'export_ready', params: {} };
  }

  if (/(what(?:'s| is| are)?\s+(?:wrong|the issues|the problems))|(\b(issues?|problems?|errors?|warnings?)\b.*\b(project|have|are there|exist))|(\bhealth(y|\b))|(is\s+(?:my|the)\s+project\s+(?:ok|okay|valid|healthy|clean))/i.test(q)) {
    return { type: 'issues', params: {} };
  }

  if (/(summar(y|ize|ise))|(\boverview\b)|(project\s+status)|(tell me about (?:my|this|the) project)|(give me (?:a )?(?:rundown|snapshot))/i.test(q)) {
    return { type: 'summary', params: {} };
  }

  if (/(metadata|property|description)\s+coverage|what(?:'s| is)\s+(?:the\s+)?coverage/i.test(q)) {
    return { type: 'coverage', params: {} };
  }

  if (/(empty|blank)\s+dimensions?|dimensions?\s+(with\s+)?no\s+members?|which\s+dimensions?\s+(are\s+)?empty/i.test(q)) {
    return { type: 'empty_dimensions', params: {} };
  }

  if (matchesAny(q, [/\b(?:list|show|get|what|which)\s+(?:all\s+)?(?:the\s+)?dimensions?\b/i, /\bwhat\s+dimensions?\s+exist/i, /\bdimension\s+list\b/i]) ||
      matchesAny(n, [/\b(?:list|show|get|what|which)\s+dimensions?\b/i, /\bdimensions?\s+in\s+(?:the\s+)?project\b/i])) {
    return { type: 'list_dimensions', params: {} };
  }

  if (/which\s+dimension\s+has\s+(?:the\s+)?most\s+issues?/i.test(q)) {
    return { type: 'dimension_issues', params: { dimension: '' } };
  }

  const issuesInDimMatch = q.match(/(?:issues?|problems?|errors?)\s+(?:in|for)\s+['"]?(\w[\w\s-]*)['"]?/i);
  if (issuesInDimMatch) {
    return { type: 'dimension_issues', params: { dimension: issuesInDimMatch[1].trim() } };
  }

  if (/how\s+many\s+(?:leaf|leaves)\s+members?/i.test(q) || /how\s+many\s+members?\s+are\s+leaves?/i.test(q)) {
    return { type: 'leaf_count', params: { dimension: dimensionToken } };
  }

  if (/(?:show|list)\s+(?:the\s+)?leaf\s+members?/i.test(q) || (/leaf\s+members?\s+(?:in|for)\b/i.test(q) && !/^how\s+many\b/i.test(q))) {
    return { type: 'list_leaves', params: { dimension: dimensionToken } };
  }

  if (/(?:max|maximum)\s+(?:hierarchy\s+)?depth|how\s+deep\s+is\s+(?:the\s+)?(?:\w+\s+)?hierarchy|deepest\s+(?:level|node)/i.test(q)) {
    return { type: 'hierarchy_depth', params: { dimension: dimensionToken } };
  }

  if (/hierarchy\s+(?:health|summary|stats?)/i.test(q)) {
    return { type: 'hierarchy_summary', params: { dimension: dimensionToken } };
  }

  if (/(?:show|list|how\s+many)\s+shared\s+members?|members?\s+with\s+multiple\s+parents?/i.test(q)) {
    return { type: 'shared_members', params: { dimension: dimensionToken } };
  }

  if (/how\s+many\s+relationships?/i.test(q) || /\brelationship\s+count\b/i.test(q)) {
    return { type: 'relationship_count', params: { dimension: dimensionToken } };
  }

  if (/\b(inactive|disabled|deactivated)\s+members?\b/i.test(q)) {
    return { type: 'inactive_members', params: { dimension: dimensionToken } };
  }

  if (/\b(root|top[\s-]?level)\s+members?\b/i.test(q)) {
    return { type: 'root_members', params: { dimension: dimensionToken } };
  }

  if (wantsMemberList(q, n, dimensionToken)) {
    return { type: 'list_members', params: { dimension: dimensionToken } };
  }

  const memberDetailsMatch = q.match(/(?:tell me about|details for|describe|info on|information about)\s+(?:the\s+)?(?:member\s+)?['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (memberDetailsMatch) {
    return { type: 'member_details', params: { memberKey: memberDetailsMatch[1].trim() } };
  }

  const missingMatch = q.match(/which\s+(\w+)\s+(?:are|is)\s+missing\s+['"]?(\w+)['"]?/i);
  if (missingMatch) {
    return { type: 'missing_property', params: { dimension: missingMatch[1], property: missingMatch[2] } };
  }

  const withoutMatch = q.match(/(?:find|show|list)\s+members?\s+without\s+['"]?(\w+)['"]?/i);
  if (withoutMatch) {
    return { type: 'missing_property', params: { dimension: '', property: withoutMatch[1] } };
  }

  const childrenMatch = q.match(/(?:show|list|get)\s+(?:members?|children|descendants?)\s+(?:under|of|below)\s+['"]?([^'"?\s]+(?:\s+[^'"?\s]+)*)['"]?\s*\??$/i);
  if (childrenMatch) {
    return { type: 'children', params: { parent: childrenMatch[1].trim() } };
  }

  const countMatch = q.match(/how\s+many\s+members?\s*(?:in\s+['"]?(\w+)['"]?)?/i);
  if (countMatch) {
    return { type: 'count', params: { dimension: countMatch[1] || dimensionToken } };
  }

  const dimCountMatch = q.match(/(?:how\s+many|total|count)\s+dimensions?/i);
  if (dimCountMatch) {
    return { type: 'count', params: { dimension: '__dimensions__' } };
  }

  const filterMatch = q.match(/(?:which|find|show)\s+members?\s+(?:have|with|where)\s+['"]?(\w+)['"]?\s*=\s*['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (filterMatch) {
    return { type: 'property_filter', params: { property: filterMatch[1], value: filterMatch[2].trim() } };
  }

  if (q.includes('orphan') || q.match(/members?\s+without\s+parents?/)) {
    return { type: 'orphans', params: { dimension: dimensionToken } };
  }

  const existsMatch = q.match(/(?:is there|does|do we have|check if|can you (?:find|check))\s+(?:a\s+)?(?:member\s+)?(?:called|named|with name)?\s*['"]?([^'"?]+?)['"]?\s*(?:exist[s]?|in the)?\s*\??$/i);
  if (existsMatch) {
    return { type: 'check_exists', params: { memberKey: existsMatch[1].trim() } };
  }

  const findMatch = q.match(/(?:find|search|look\s+for|show)\s+(?:for\s+)?['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (findMatch) {
    const raw = findMatch[1].trim();
    const pattern = raw.replace(/\b(member|members|called|named|a|the|dimension|in)\b/gi, '').trim();
    return { type: 'find', params: { pattern: pattern || raw } };
  }

  const scored = scoreIntentFromKeywords(nq, dimensions, q);
  if (scored) {
    return { type: scored.intent, params: scored.params };
  }

  return { type: 'unknown', params: { raw: question } };
}

function wantsMemberList(raw: string, normalized: string, dimensionToken: string): boolean {
  if (!dimensionToken) return false;
  const exclusion = /leaf|leaves|shared|orphan|relationship|children|descendants|under|below|how many|without|missing|property/i;
  if (exclusion.test(raw) || exclusion.test(normalized)) return false;
  if (!/\bmembers?\b/i.test(raw) && !/\bmembers?\b/i.test(normalized)) return false;

  return (
    /\b(list|show|get|display|enumerate|all|every|available|what|which)\b/i.test(normalized) ||
    /\bmembers?\s+(?:in|for|from|of)\b/i.test(normalized) ||
    /\b(?:in|for|from|of)\s+[\w\s-]+\s+members?\b/i.test(normalized) ||
    new RegExp(`\\b${dimensionToken}\\b[\\s\\S]*\\bmembers?\\b`, "i").test(normalized) ||
    new RegExp(`\\bmembers?\\b[\\s\\S]*\\b${dimensionToken}\\b`, "i").test(normalized)
  );
}

function executeIntent(
  intent: ParsedIntent,
  question: string,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  context?: ProjectAIContext
): QueryExecutionResult {
  switch (intent.type) {
    case 'summary': {
      if (!context) {
        return unavailableContext('summary');
      }
      const dimList = context.dimensions.length > 0
        ? context.dimensions.map(d => `${d.dimensionType} (${d.dimensionName}): ${d.memberCount} member(s)`).join('\n  ')
        : 'No dimensions yet.';
      const health = context.validation.totalIssues === 0
        ? 'No validation issues.'
        : `${context.validation.totalIssues} issue(s): ${context.validation.errors ?? 0} error(s), ${context.validation.warnings ?? 0} warning(s), ${context.validation.infos ?? 0} info.`;
      const exportLine = context.exportReady
        ? 'Export status: ready (no blocking issues).'
        : `Export status: blocked by ${context.validation.blockingIssues} issue(s).`;
      const coverageLine = `Metadata coverage: ${context.coverage.overallPercent}% overall.`;
      return {
        intent: 'summary',
        answer: `Project "${context.projectName}"\n• ${context.dimensionCount} dimension(s), ${context.memberCount} member(s), ${context.relationshipCount} relationship(s).\n• ${health}\n• ${exportLine}\n• ${coverageLine}\n\nDimensions:\n  ${dimList}`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: [
          `${context.dimensionCount} dimensions`,
          `${context.memberCount} members`,
          `${context.coverage.overallPercent}% coverage`
        ],
        followUps: ["What is wrong with my project?", "Which dimensions are empty?", "How many leaf members in Account?"]
      };
    }

    case 'issues': {
      if (!context) return unavailableContext('issues');
      if (context.validation.totalIssues === 0) {
        return {
          intent: 'issues',
          answer: `No validation issues in "${context.projectName}". The project is clean.`,
          matchedMembers: [],
          confidence: 1.0,
          followUps: ["Is my project ready to export?", "What is the metadata coverage?"]
        };
      }
      const breakdown = `${context.validation.totalIssues} issue(s): ${context.validation.errors ?? 0} error(s), ${context.validation.warnings ?? 0} warning(s), ${context.validation.infos ?? 0} info.`;
      const top = context.topIssues.length > 0
        ? '\n\nMost frequent:\n  ' + context.topIssues.map(i => `${i.code} (x${i.count}): ${i.message}`).join('\n  ')
        : '';
      const byDimension = context.issuesByDimension.length > 0
        ? '\n\nBy dimension:\n  ' + context.issuesByDimension.slice(0, 5).map(row =>
          `${row.dimensionType}: ${row.totalCount} (${row.errors} error(s), ${row.warnings} warning(s))`
        ).join('\n  ')
        : '';
      const blocking = context.validation.blockingIssues > 0
        ? `\n\n${context.validation.blockingIssues} of these block export.`
        : '\n\nNone of these block export.';
      return {
        intent: 'issues',
        answer: `${breakdown}${top}${byDimension}${blocking}`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: context.topIssues.slice(0, 3).map(i => `${i.code} ×${i.count}`),
        followUps: ["What's blocking export?", "Which dimension has the most issues?"]
      };
    }

    case 'export_ready': {
      if (!context) return unavailableContext('export_ready');
      if (context.exportReady) {
        return {
          intent: 'export_ready',
          answer: `Yes, "${context.projectName}" is ready to export. No blocking validation issues.`,
          matchedMembers: [],
          confidence: 1.0,
          evidence: ["0 blocking issues"],
          followUps: ["Summarize my project", "What is the metadata coverage?"]
        };
      }
      const top = context.topIssues.length > 0
        ? '\n\nTop issues:\n  ' + context.topIssues.map(i => `${i.code} (x${i.count}): ${i.message}`).join('\n  ')
        : '';
      return {
        intent: 'export_ready',
        answer: `Not yet. Export is blocked by ${context.validation.blockingIssues} issue(s) in "${context.projectName}". Resolve the blocking issues, then export.${top}`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: [`${context.validation.blockingIssues} blocking issue(s)`],
        followUps: ["What is wrong with my project?", "Which dimension has the most issues?"]
      };
    }

    case 'coverage': {
      if (!context) return unavailableContext('coverage');
      const rows = context.coverage.dimensions
        .map(row => `${row.dimensionType}: ${row.propertyCoverage}% properties, ${row.descriptionCoverage}% descriptions${row.isStale ? " (stale)" : ""}`)
        .join('\n  ');
      return {
        intent: 'coverage',
        answer: `Overall metadata coverage for "${context.projectName}" is ${context.coverage.overallPercent}%.\n\nBy dimension:\n  ${rows || "No dimensions."}`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: [`${context.coverage.overallPercent}% overall`],
        followUps: ["Which dimensions are empty?", "Summarize my project"]
      };
    }

    case 'empty_dimensions': {
      if (!context) return unavailableContext('empty_dimensions');
      const empty = context.dimensions.filter(d => d.memberCount === 0);
      if (empty.length === 0) {
        return {
          intent: 'empty_dimensions',
          answer: `All ${context.dimensions.length} dimension(s) in "${context.projectName}" have at least one member.`,
          matchedMembers: [],
          confidence: 1.0
        };
      }
      const labels = empty.map(d => `${d.dimensionType} (${d.dimensionName})`).join(', ');
      return {
        intent: 'empty_dimensions',
        answer: `${empty.length} empty dimension(s): ${labels}.`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: empty.map(d => d.dimensionType),
        followUps: ["Summarize my project", "What is the metadata coverage?"]
      };
    }

    case 'dimension_issues': {
      if (!context) return unavailableContext('dimension_issues');
      if (!intent.params.dimension) {
        const top = context.issuesByDimension[0];
        if (!top) {
          return {
            intent: 'dimension_issues',
            answer: `No validation issues in "${context.projectName}".`,
            matchedMembers: [],
            confidence: 1.0
          };
        }
        return {
          intent: 'dimension_issues',
          answer: `${top.dimensionType} (${top.dimensionName}) has the most issues: ${top.totalCount} total (${top.errors} error(s), ${top.warnings} warning(s)).`,
          matchedMembers: [],
          confidence: 1.0,
          evidence: [`${top.totalCount} issues in ${top.dimensionType}`],
          followUps: [`What is wrong with issues in ${top.dimensionType}?`, "What's blocking export?"]
        };
      }
      const dimToken = intent.params.dimension;
      const row = context.issuesByDimension.find(d =>
        d.dimensionType.toLowerCase() === dimToken.toLowerCase() ||
        d.dimensionName.toLowerCase() === dimToken.toLowerCase()
      );
      if (!row) {
        return {
          intent: 'dimension_issues',
          answer: `No validation issues found for "${dimToken}" in "${context.projectName}".`,
          matchedMembers: [],
          confidence: 0.9
        };
      }
      return {
        intent: 'dimension_issues',
        answer: `${row.dimensionType} (${row.dimensionName}) has ${row.totalCount} issue(s): ${row.errors} error(s), ${row.warnings} warning(s).`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: [`${row.errors} errors`, `${row.warnings} warnings`]
      };
    }

    case 'leaf_count':
    case 'list_leaves':
    case 'hierarchy_depth':
    case 'hierarchy_summary':
    case 'shared_members':
      return executeHierarchyIntent(intent, question, dimensions, members, relationships);

    case 'list_members': {
      const dim = resolveDimensionToken(intent.params.dimension, dimensions);
      if (!dim) {
        return {
          intent: 'list_members',
          answer: intent.params.dimension
            ? `Could not find a dimension matching "${intent.params.dimension}".`
            : "Please specify a dimension, for example: List all members in Scenario.",
          matchedMembers: [],
          confidence: 0.5,
          followUps: ["List all members in Account", "What dimensions exist in this project?"]
        };
      }
      const filtered = members
        .filter((member) => member.dimensionId === dim.id)
        .sort((left, right) => left.memberKey.localeCompare(right.memberKey));
      const matchedKeys = filtered.map((member) => member.memberKey);
      return {
        intent: 'list_members',
        answer: generateResponse({
          matchedMembers: matchedKeys,
          intent: 'list_members',
          params: { dimension: dim.dimensionType }
        }),
        matchedMembers: matchedKeys,
        confidence: 1.0,
        evidence: [`${dim.dimensionType} (${dim.dimensionName})`, `${matchedKeys.length} members`],
        followUps: [
          `How many members in ${dim.dimensionType}?`,
          `Show leaf members in ${dim.dimensionType}`,
          `What is the max hierarchy depth in ${dim.dimensionType}?`
        ]
      };
    }

    case 'list_dimensions': {
      const rows = context?.dimensions ?? dimensions.map((dimension) => ({
        dimensionType: dimension.dimensionType,
        dimensionName: dimension.dimensionName,
        memberCount: members.filter((member) => member.dimensionId === dimension.id).length
      }));
      const lines = rows.map((row) => `${row.dimensionType} (${row.dimensionName}): ${row.memberCount} member(s)`);
      return {
        intent: 'list_dimensions',
        answer: rows.length === 0
          ? "No dimensions exist in this project yet."
          : `This project has ${rows.length} dimension(s):\n  ${lines.join("\n  ")}`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: rows.slice(0, 5).map((row) => row.dimensionType),
        followUps: rows.slice(0, 3).map((row) => `List all members in ${row.dimensionType}`)
      };
    }

    case 'member_details':
      return executeMemberDetails(intent.params.memberKey, dimensions, members, relationships);

    case 'relationship_count': {
      const dim = resolveDimensionToken(intent.params.dimension, dimensions);
      const scoped = membersForDimension(dim, members, relationships);
      const label = dim ? `${dim.dimensionType} (${dim.dimensionName})` : "the project";
      return {
        intent: 'relationship_count',
        answer: `${label} has ${scoped.relationships.length} relationship(s) across ${scoped.members.length} member(s).`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: [`${scoped.relationships.length} relationships`],
        followUps: dim
          ? [`Hierarchy health for ${dim.dimensionType}`, `List all members in ${dim.dimensionType}`]
          : ["Summarize my project"]
      };
    }

    case 'inactive_members': {
      const dim = resolveDimensionToken(intent.params.dimension, dimensions);
      const scoped = membersForDimension(dim, members, relationships);
      const inactive = scoped.members.filter((member) => member.isActive === false);
      const matchedKeys = inactive.map((member) => member.memberKey);
      const label = dim ? `${dim.dimensionType} (${dim.dimensionName})` : "the project";
      return {
        intent: 'inactive_members',
        answer: matchedKeys.length === 0
          ? `No inactive members in ${label}.`
          : `${matchedKeys.length} inactive member(s) in ${label}: ${formatMemberList(matchedKeys)}`,
        matchedMembers: matchedKeys,
        confidence: 1.0
      };
    }

    case 'root_members': {
      const dim = resolveDimensionToken(intent.params.dimension, dimensions) ?? dimensions[0];
      if (!dim) {
        return { intent: 'root_members', answer: "No dimensions exist in this project yet.", matchedMembers: [], confidence: 0.8 };
      }
      const scoped = membersForDimension(dim, members, relationships);
      const childKeys = new Set(scoped.relationships.map((relationship) => relationship.childKey));
      const rootKeys = scoped.members
        .filter((member) => !childKeys.has(member.memberKey))
        .map((member) => member.memberKey)
        .sort((left, right) => left.localeCompare(right));
      const label = `${dim.dimensionType} (${dim.dimensionName})`;
      return {
        intent: 'root_members',
        answer: rootKeys.length === 0
          ? `No root members found in ${label}.`
          : `${rootKeys.length} root member(s) in ${label}: ${formatMemberList(rootKeys)}`,
        matchedMembers: rootKeys,
        confidence: 1.0,
        followUps: [`Show members under ${rootKeys[0] ?? dim.dimensionType}`, `List all members in ${dim.dimensionType}`]
      };
    }

    case 'find': {
      const pattern = intent.params.pattern.toLowerCase();
      const matched = members.filter(m =>
        m.memberKey.toLowerCase().includes(pattern) ||
        m.description.toLowerCase().includes(pattern)
      );
      const matchedKeys = matched.map(m => m.memberKey);
      return {
        intent: 'find',
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'find', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.8
      };
    }

    case 'count': {
      const dimFilter = intent.params.dimension;
      if (dimFilter === '__dimensions__') {
        return {
          intent: 'count',
          answer: `This project has ${dimensions.length} dimension(s): ${dimensions.map(d => `${d.dimensionType} (${d.dimensionName})`).join(', ')}`,
          matchedMembers: [],
          confidence: 1.0
        };
      }
      let filtered = members;
      const dim = resolveDimensionToken(dimFilter, dimensions);
      if (dim) {
        filtered = members.filter(m => m.dimensionId === dim.id);
      }
      const matchedKeys = filtered.map(m => m.memberKey);
      return {
        intent: 'count',
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'count', params: { dimension: dim?.dimensionType ?? dimFilter } }),
        matchedMembers: matchedKeys,
        confidence: 1.0
      };
    }

    case 'children': {
      const parentKey = intent.params.parent;
      const descendants = findDescendants(parentKey, relationships);
      return {
        intent: 'children',
        answer: generateResponse({ matchedMembers: descendants, intent: 'children', params: intent.params }),
        matchedMembers: descendants,
        confidence: 0.9
      };
    }

    case 'missing_property': {
      const { dimension, property } = intent.params;
      let filtered = members;
      const dim = resolveDimensionToken(dimension, dimensions);
      if (dim) {
        filtered = members.filter(m => m.dimensionId === dim.id);
      }
      const missing = filtered.filter(m => {
        const val = m.properties[property] ?? m.properties[property.charAt(0).toUpperCase() + property.slice(1)];
        return val === undefined || val === null || val === '';
      });
      const matchedKeys = missing.map(m => m.memberKey);
      return {
        intent: 'missing_property',
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
        intent: 'property_filter',
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'property_filter', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.9
      };
    }

    case 'orphans': {
      const dim = resolveDimensionToken(intent.params.dimension, dimensions);
      if (dim) {
        const scoped = membersForDimension(dim, members, relationships);
        const analytics = buildHierarchyAnalytics(dim, scoped.members, scoped.relationships);
        const matchedKeys = analytics.orphanMembers.map(row => row.memberKey);
        const label = `${dim.dimensionType} (${dim.dimensionName})`;
        return {
          intent: 'orphans',
          answer: matchedKeys.length === 0
            ? `No orphan members in ${label} — all active members are reachable from hierarchy roots.`
            : `${matchedKeys.length} orphan member(s) in ${label} (not reachable from roots): ${formatMemberList(matchedKeys)}`,
          matchedMembers: matchedKeys,
          confidence: 0.95,
          evidence: [`${analytics.summary.relationshipCount} relationships`, `${analytics.summary.memberCount} members`]
        };
      }
      const childKeys = new Set(relationships.map(r => r.childKey));
      const parentKeys = new Set(relationships.map(r => r.parentKey));
      const orphans = members.filter(m => !childKeys.has(m.memberKey) && !parentKeys.has(m.memberKey));
      const matchedKeys = orphans.map(m => m.memberKey);
      return {
        intent: 'orphans',
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'orphans', params: intent.params }),
        matchedMembers: matchedKeys,
        confidence: 0.9
      };
    }

    case 'check_exists':
      return executeMemberDetails(intent.params.memberKey, dimensions, members, relationships, 'check_exists');

    default: {
      const raw = intent.params.raw || question;
      const words = raw.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const matched = members.filter(m =>
        words.some(w => m.memberKey.toLowerCase().includes(w) || m.description.toLowerCase().includes(w))
      );
      const matchedKeys = matched.map(m => m.memberKey);
      if (matchedKeys.length > 0) {
        return {
          intent: 'find',
          answer: generateResponse({ matchedMembers: matchedKeys, intent: 'find', params: { pattern: raw } }),
          matchedMembers: matchedKeys,
          confidence: 0.3
        };
      }
      return buildUnknownQueryResult(raw);
    }
  }
}

function executeHierarchyIntent(
  intent: ParsedIntent,
  question: string,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): QueryExecutionResult {
  const dim = resolveDimensionToken(intent.params.dimension, dimensions) ?? dimensions[0];
  if (!dim) {
    return {
      intent: intent.type,
      answer: "No dimensions exist in this project yet.",
      matchedMembers: [],
      confidence: 0.8
    };
  }

  const scoped = membersForDimension(dim, members, relationships);
  const analytics = buildHierarchyAnalytics(dim, scoped.members, scoped.relationships);
  const label = `${dim.dimensionType} (${dim.dimensionName})`;
  const summary = analytics.summary;

  switch (intent.type) {
    case 'leaf_count':
      return {
        intent: 'leaf_count',
        answer: `${label} has ${summary.leafCount} leaf member(s) out of ${summary.memberCount} total.`,
        matchedMembers: analytics.classifications.filter(row => row.isLeaf).map(row => row.memberKey),
        confidence: 1.0,
        evidence: [`${summary.parentCount} parent(s)`, `${summary.relationshipCount} relationship(s)`],
        followUps: ["Show leaf members in " + dim.dimensionType, "What is the max hierarchy depth in " + dim.dimensionType + "?"]
      };

    case 'list_leaves': {
      const leafKeys = analytics.classifications.filter(row => row.isLeaf).map(row => row.memberKey);
      return {
        intent: 'list_leaves',
        answer: leafKeys.length === 0
          ? `No leaf members found in ${label}.`
          : `${leafKeys.length} leaf member(s) in ${label}: ${formatMemberList(leafKeys)}`,
        matchedMembers: leafKeys,
        confidence: 1.0
      };
    }

    case 'hierarchy_depth':
      return {
        intent: 'hierarchy_depth',
        answer: `${label} hierarchy depth: max ${summary.maxDepth}, average ${analytics.depthStats.averageDepth.toFixed(1)} across ${analytics.depthStats.pathCount} path(s)${summary.hasCycle ? " (cycle detected)" : ""}.`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: [`max depth ${summary.maxDepth}`, `${summary.pathCount} paths`],
        followUps: ["Hierarchy health for " + dim.dimensionType, "Show shared members in " + dim.dimensionType]
      };

    case 'hierarchy_summary':
      return {
        intent: 'hierarchy_summary',
        answer: `Hierarchy health for ${label}:\n• ${summary.memberCount} members, ${summary.relationshipCount} relationships\n• ${summary.leafCount} leaves, ${summary.parentCount} parents\n• Max depth ${summary.maxDepth}, ${summary.orphanCount} orphan(s), ${summary.sharedMemberCount} shared member(s)${summary.hasCycle ? "\n• Cycle detected in hierarchy" : ""}`,
        matchedMembers: [],
        confidence: 1.0,
        evidence: summary.warnings.slice(0, 3),
        followUps: ["How many leaf members in " + dim.dimensionType + "?", "Show orphan members"]
      };

    case 'shared_members': {
      const sharedKeys = analytics.sharedMembers.map(row => row.memberKey);
      const detail = analytics.sharedMembers.slice(0, 5).map(row =>
        `${row.memberKey} (${row.parentCount} parents: ${row.parents.join(", ")})`
      ).join('\n  ');
      return {
        intent: 'shared_members',
        answer: sharedKeys.length === 0
          ? `No shared members (multiple parents) in ${label}.`
          : `${sharedKeys.length} shared member(s) in ${label}:\n  ${detail}${sharedKeys.length > 5 ? `\n  ...and ${sharedKeys.length - 5} more` : ""}`,
        matchedMembers: sharedKeys,
        confidence: 1.0
      };
    }

    default:
      return buildUnknownQueryResult(question);
  }
}

function executeMemberDetails(
  memberKey: string,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  intent: 'member_details' | 'check_exists' = 'member_details'
): QueryExecutionResult {
  const searchKey = memberKey.toLowerCase();
  const found = members.filter((member) => member.memberKey.toLowerCase() === searchKey);
  if (found.length === 0) {
    const partial = members.filter((member) => member.memberKey.toLowerCase().includes(searchKey));
    if (partial.length > 0) {
      return {
        intent,
        answer: `No exact match for "${memberKey}", but found ${partial.length} similar member(s): ${partial.slice(0, 5).map((member) => member.memberKey).join(", ")}${partial.length > 5 ? "..." : ""}`,
        matchedMembers: partial.slice(0, 10).map((member) => member.memberKey),
        confidence: 0.6
      };
    }
    return {
      intent,
      answer: `No member called "${memberKey}" exists in this project.`,
      matchedMembers: [],
      confidence: 1.0
    };
  }

  const member = found[0];
  const dim = dimensions.find((dimension) => dimension.id === member.dimensionId);
  const parentRels = relationships.filter((relationship) => relationship.childKey === member.memberKey);
  const childRels = relationships.filter((relationship) => relationship.parentKey === member.memberKey);
  const parents = parentRels.map((relationship) => relationship.parentKey).join(", ") || "None (root)";
  const children = childRels.map((relationship) => relationship.childKey).join(", ") || "None";
  const propCount = Object.keys(member.properties).length;
  return {
    intent,
    answer: `${intent === 'check_exists' ? 'Yes! ' : ''}Member "${member.memberKey}"\n• Dimension: ${dim?.dimensionType ?? "Unknown"} (${dim?.dimensionName ?? ""})\n• Description: ${member.description || "(none)"}\n• Parent(s): ${parents}\n• Children: ${children}\n• Properties: ${propCount} defined\n• Active: ${member.isActive ? "Yes" : "No"}`,
    matchedMembers: found.map((member) => member.memberKey),
    confidence: 1.0,
    evidence: [dim?.dimensionType ?? "Unknown", member.isActive ? "Active" : "Inactive"],
    followUps: parents !== "None (root)" ? [`Show members under ${member.memberKey}`] : [`List all members in ${dim?.dimensionType ?? "Account"}`]
  };
}

function unavailableContext(intent: string): QueryExecutionResult {
  return {
    intent,
    answer: "Project context is unavailable right now. Open a project and try again.",
    matchedMembers: [],
    confidence: 0.4
  };
}

function formatMemberList(members: string[]): string {
  if (members.length <= 10) return members.join(', ');
  return members.slice(0, 10).join(', ') + ` ...and ${members.length - 10} more`;
}

function findDescendants(parentKey: string, relationships: DimensionRelationshipRecord[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!childrenOf.has(rel.parentKey)) childrenOf.set(rel.parentKey, []);
    childrenOf.get(rel.parentKey)!.push(rel.childKey);
  }

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
