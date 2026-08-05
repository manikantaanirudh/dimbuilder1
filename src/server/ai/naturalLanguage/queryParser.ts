import type { DimensionMemberRecord, DimensionRelationshipRecord, DimensionRecord } from "../../../shared/types";
import type { NLQueryResult } from "../../../shared/aiTypes";
import type { ProjectAIContext } from "../projectContext";
import { buildHierarchyAnalytics } from "../../../shared/hierarchyAnalytics";
import { generateResponse, buildStructuredAnswer } from "./responseGenerator";
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

  const issuesInDimMatch = q.match(/(?:issues?|problems?|errors?)\s+(?:in|for)\s+['"]?([^'"?]+?)['"]?\s*\??$/i);
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

  const missingMatch = q.match(/which\s+([^'"?]+?)\s+(?:are|is)\s+missing\s+['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (missingMatch) {
    return { type: 'missing_property', params: { dimension: missingMatch[1], property: missingMatch[2] } };
  }

  const withoutMatch = q.match(/(?:find|show|list)\s+members?\s+without\s+['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (withoutMatch) {
    return { type: 'missing_property', params: { dimension: '', property: withoutMatch[1] } };
  }

  const childrenMatch = q.match(/(?:show|list|get)\s+(?:members?|children|descendants?)\s+(?:under|of|below)\s+['"]?([^'"?\s]+(?:\s+[^'"?\s]+)*)['"]?\s*\??$/i);
  if (childrenMatch) {
    return { type: 'children', params: { parent: childrenMatch[1].trim() } };
  }

  const countMatch = q.match(/how\s+many\s+members?\s*(?:in\s+['"]?([^'"?]+?)['"]?)?\s*\??$/i);
  if (countMatch) {
    const rawMatch = countMatch[1]?.trim();
    const resolvedDim = rawMatch ? resolveDimensionToken(rawMatch, dimensions) : undefined;
    const chosenDim = resolvedDim?.dimensionName ?? dimensionToken;
    return { type: 'count', params: { dimension: chosenDim || rawMatch || '' } };
  }

  const dimCountMatch = q.match(/(?:how\s+many|total|count)\s+dimensions?/i);
  if (dimCountMatch) {
    return { type: 'count', params: { dimension: '__dimensions__' } };
  }

  const filterMatch = q.match(/(?:which|find|show)\s+members?\s+(?:have|with|where)\s+['"]?([^'"?]+?)['"]?\s*=\s*['"]?([^'"?]+?)['"]?\s*\??$/i);
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
    new RegExp(`\\b${escapeRegex(dimensionToken)}\\b[\\s\\S]*\\bmembers?\\b`, "i").test(normalized) ||
    new RegExp(`\\bmembers?\\b[\\s\\S]*\\b${escapeRegex(dimensionToken)}\\b`, "i").test(normalized)
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
        ? context.dimensions.map(d => `${d.dimensionType} (${d.dimensionName}): ${d.memberCount} member(s)`).join(', ')
        : 'No dimensions yet.';

      return {
        intent: 'summary',
        answer: buildStructuredAnswer({
          summary: `Project "${context.projectName}" contains ${context.dimensionCount} dimension(s), ${context.memberCount} member(s), and ${context.relationshipCount} relationship(s).`,
          keyMetrics: [
            { label: "Total Dimensions", value: context.dimensionCount },
            { label: "Total Members", value: context.memberCount },
            { label: "Total Relationships", value: context.relationshipCount },
            { label: "Overall Metadata Coverage", value: `${context.coverage.overallPercent}%` },
            { label: "Export Readiness", value: context.exportReady ? "Ready" : "Blocked" }
          ],
          findings: [
            {
              severity: context.validation.blockingIssues > 0 ? 'Critical' : context.validation.totalIssues > 0 ? 'Warning' : 'Information',
              text: context.validation.totalIssues === 0
                ? "No validation issues detected."
                : `${context.validation.totalIssues} total issues (${context.validation.errors ?? 0} error(s), ${context.validation.warnings ?? 0} warning(s)).`
            }
          ],
          impact: context.exportReady
            ? "Project is fully compliant with OneStream schema guidelines and ready for XML generation."
            : `Export is blocked by ${context.validation.blockingIssues} validation issue(s).`,
          recommendations: context.exportReady
            ? ["Proceed to XML Export tab to generate production artifacts."]
            : ["Review top blocking issues in the Validation tab before exporting."],
          relatedInsights: [
            `Dimensions summary: ${dimList}`
          ],
          followUps: ["What is wrong with my project?", "Which dimensions are empty?", "How many leaf members in Account?"]
        }),
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
          answer: buildStructuredAnswer({
            summary: `No validation issues found in "${context.projectName}". The project is completely clean.`,
            keyMetrics: [
              { label: "Total Issues", value: 0 },
              { label: "Blocking Issues", value: 0 }
            ],
            findings: [
              { severity: 'Information', text: "0 errors, 0 warnings, 0 information messages." }
            ],
            impact: "Clean validation state guarantees zero build errors during XML compilation.",
            recommendations: ["Proceed to export or perform final metadata review."],
            followUps: ["Is my project ready to export?", "What is the metadata coverage?"]
          }),
          matchedMembers: [],
          confidence: 1.0,
          followUps: ["Is my project ready to export?", "What is the metadata coverage?"]
        };
      }

      return {
        intent: 'issues',
        answer: buildStructuredAnswer({
          summary: `Found ${context.validation.totalIssues} validation issue(s) in "${context.projectName}".`,
          keyMetrics: [
            { label: "Total Issues", value: context.validation.totalIssues },
            { label: "Errors", value: context.validation.errors ?? 0 },
            { label: "Warnings", value: context.validation.warnings ?? 0 },
            { label: "Export Blocking", value: context.validation.blockingIssues }
          ],
          findings: context.topIssues.map(i => ({
            severity: i.severity === 'error' ? 'Critical' : 'Warning',
            text: `${i.code} (x${i.count}): ${i.message}`
          })),
          impact: context.validation.blockingIssues > 0
            ? `${context.validation.blockingIssues} issue(s) block OneStream XML export.`
            : "No issues currently block export, but warnings should be reviewed.",
          recommendations: [
            "Filter validation table by 'Error' severity first.",
            "Fix missing parent references and invalid member keys."
          ],
          relatedInsights: context.issuesByDimension.slice(0, 3).map(r => `${r.dimensionType} (${r.dimensionName}): ${r.totalCount} issues`),
          followUps: ["What's blocking export?", "Which dimension has the most issues?"]
        }),
        matchedMembers: [],
        confidence: 1.0,
        evidence: context.topIssues.slice(0, 3).map(i => `${i.code} ×${i.count}`),
        followUps: ["What's blocking export?", "Which dimension has the most issues?"]
      };
    }

    case 'count': {
      const dimFilter = intent.params.dimension;
      if (dimFilter === '__dimensions__') {
        return {
          intent: 'count',
          answer: buildStructuredAnswer({
            summary: `This project contains ${dimensions.length} defined dimension(s).`,
            keyMetrics: [
              { label: "Total Dimensions", value: dimensions.length },
              { label: "Total Members Across Project", value: members.length },
              { label: "Total Relationships", value: relationships.length }
            ],
            findings: [
              { severity: 'Information', text: `Dimensions: ${dimensions.map(d => `${d.dimensionName} (${d.dimensionType})`).join(', ')}` }
            ],
            impact: "Having structured dimensions ensures clean OneStream metadata modeling.",
            recommendations: ["Select a specific dimension to inspect member breakdown and health."],
            followUps: ["Summarize my project", "Which dimensions are empty?", "What is the metadata coverage?"]
          }),
          matchedMembers: [],
          confidence: 1.0
        };
      }

      const dim = resolveDimensionToken(dimFilter, dimensions);
      if (dim) {
        const scoped = membersForDimension(dim, members, relationships);
        const analytics = buildHierarchyAnalytics(dim, scoped.members, scoped.relationships);
        const dimLabel = `${dim.dimensionName} (${dim.dimensionType})`;
        const count = scoped.members.length;
        const leaves = analytics.summary.leafCount;
        const parents = analytics.summary.parentCount;
        const maxDepth = analytics.summary.maxDepth;
        const orphans = analytics.summary.orphanCount;
        const shared = analytics.summary.sharedMemberCount;
        const missingDesc = scoped.members.filter(m => !m.description || m.description.trim() === '').length;

        const findings: Array<{ severity: 'Critical' | 'Warning' | 'Information'; text: string }> = [
          { severity: 'Information', text: `${count} active member(s) found in ${dimLabel}.` }
        ];
        if (orphans > 0) {
          findings.push({ severity: 'Critical', text: `${orphans} orphan member(s) detected (unconnected to roots).` });
        }
        if (analytics.summary.hasCycle) {
          findings.push({ severity: 'Critical', text: `Hierarchy cycle detected in ${dimLabel}.` });
        }
        if (missingDesc > 0) {
          findings.push({ severity: 'Warning', text: `${missingDesc} member(s) missing descriptions.` });
        }
        if (shared > 0) {
          findings.push({ severity: 'Warning', text: `${shared} shared member(s) have multiple parents.` });
        }

        return {
          intent: 'count',
          answer: buildStructuredAnswer({
            summary: `There are ${count} member(s) in the ${dimLabel} dimension.`,
            keyMetrics: [
              { label: "Total Members", value: count },
              { label: "Leaf Members", value: `${leaves} (${count > 0 ? ((leaves / count) * 100).toFixed(1) : 0}%)` },
              { label: "Parent Members", value: parents },
              { label: "Max Hierarchy Depth", value: maxDepth },
              { label: "Orphan Members", value: orphans },
              { label: "Shared Members", value: shared }
            ],
            findings,
            impact: orphans > 0 || analytics.summary.hasCycle
              ? `Hierarchy issues in ${dim.dimensionName} will block OneStream XML export.`
              : `${dim.dimensionName} structure is reachable and valid for export.`,
            recommendations: orphans > 0
              ? [`Attach ${orphans} orphan members to hierarchy roots or parent nodes.`, `Review member descriptions in ${dim.dimensionName}.`]
              : [`Review leaf member properties in ${dim.dimensionName} before export.`],
            relatedInsights: [
              `Dimension Type: ${dim.dimensionType}`,
              `Sheet Name: ${(dim as unknown as { sheet?: string }).sheet || dim.dimensionName}`
            ],
            followUps: [
              `Show leaf members in ${dim.dimensionName}`,
              `What is the max hierarchy depth in ${dim.dimensionName}?`,
              `Show orphan members in ${dim.dimensionName}`,
              `List all members in ${dim.dimensionName}`
            ]
          }),
          matchedMembers: scoped.members.map(m => m.memberKey),
          confidence: 1.0,
          evidence: [`${count} members in ${dim.dimensionName}`, `${leaves} leaves`, `Depth ${maxDepth}`]
        };
      }

      const matchedKeys = members.map(m => m.memberKey);
      return {
        intent: 'count',
        answer: generateResponse({ matchedMembers: matchedKeys, intent: 'count', params: { dimension: dimFilter } }),
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
