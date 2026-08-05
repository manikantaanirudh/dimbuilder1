export interface ResponseInput {
  matchedMembers: string[];
  intent: string;
  params: Record<string, string>;
}

export interface StructuredAnswerOptions {
  summary: string;
  keyMetrics?: Array<{ label: string; value: string | number }>;
  findings?: Array<{ severity: 'Critical' | 'Warning' | 'Information'; text: string }>;
  impact?: string;
  recommendations?: string[];
  relatedInsights?: string[];
  followUps?: string[];
}

export function buildStructuredAnswer(opts: StructuredAnswerOptions): string {
  const parts: string[] = [];

  // 1. Summary
  parts.push(`## Summary\n${opts.summary}`);

  // 2. Key Metrics
  if (opts.keyMetrics && opts.keyMetrics.length > 0) {
    parts.push(`## Key Metrics\n${opts.keyMetrics.map(m => `• **${m.label}**: ${m.value}`).join('\n')}`);
  }

  // 3. Findings
  if (opts.findings && opts.findings.length > 0) {
    parts.push(`## Findings\n${opts.findings.map(f => `• **[${f.severity}]** ${f.text}`).join('\n')}`);
  } else {
    parts.push(`## Findings\n• **[Information]** No anomalies or violations detected.`);
  }

  // 4. Impact
  if (opts.impact) {
    parts.push(`## Impact\n${opts.impact}`);
  }

  // 5. Recommendations
  if (opts.recommendations && opts.recommendations.length > 0) {
    parts.push(`## Recommendations\n${opts.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  // 6. Related Insights
  if (opts.relatedInsights && opts.relatedInsights.length > 0) {
    parts.push(`## Related Insights\n${opts.relatedInsights.map(i => `• ${i}`).join('\n')}`);
  }

  // 7. Suggested Follow-up Questions
  if (opts.followUps && opts.followUps.length > 0) {
    parts.push(`## Suggested Follow-up Questions\n${opts.followUps.map(q => `• ${q}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

export function generateResponse(input: ResponseInput): string {
  const { matchedMembers, intent, params } = input;
  const count = matchedMembers.length;
  const memberList = formatMemberList(matchedMembers);

  switch (intent) {
    case 'find':
      return buildStructuredAnswer({
        summary: count === 0 ? `No members found matching "${params.pattern}".` : `Found ${count} member(s) matching "${params.pattern}".`,
        keyMetrics: [{ label: "Matched Count", value: count }],
        findings: [{ severity: count === 0 ? 'Warning' : 'Information', text: count === 0 ? `Search term "${params.pattern}" returned 0 results.` : `Matched members: ${memberList}` }],
        impact: count === 0 ? "Verify spelling or try searching by member description." : "Matched members can be selected for hierarchy inspection.",
        recommendations: count === 0 ? ["Try searching with partial keywords or wildcard patterns.", "Check member list in project overview."] : ["Click on matched member pills to jump to member workbench."],
        followUps: ["List all dimensions", "Summarize my project"]
      });

    case 'count':
      return buildStructuredAnswer({
        summary: params.dimension ? `There are ${count} member(s) in the ${params.dimension} dimension.` : `There are ${count} members total across the project.`,
        keyMetrics: [{ label: "Total Members", value: count }],
        findings: [{ severity: 'Information', text: `${count} active member(s) retrieved from live database.` }],
        impact: "Valid member counts ensure expected hierarchy scope for calculation and export.",
        recommendations: ["Review leaf member ratio and hierarchy depth."],
        followUps: [`Show leaf members in ${params.dimension || 'Account'}`, `What is the max hierarchy depth in ${params.dimension || 'Account'}?`]
      });

    case 'children':
      return buildStructuredAnswer({
        summary: count === 0 ? `No children found under parent "${params.parent}".` : `${count} child member(s) found under parent "${params.parent}".`,
        keyMetrics: [{ label: "Child Count", value: count }],
        findings: [{ severity: count === 0 ? 'Information' : 'Information', text: count === 0 ? `"${params.parent}" is a leaf member (has no children).` : `Children: ${memberList}` }],
        impact: "Parent-child relationships define roll-up aggregations in OneStream.",
        recommendations: ["Verify parent aggregation method in hierarchy editor."],
        followUps: [`Tell me about member ${params.parent}`]
      });

    case 'missing_property': {
      const dimLabel = params.dimension ? `${params.dimension} ` : '';
      return buildStructuredAnswer({
        summary: count === 0 ? `All ${dimLabel}members have the "${params.property}" property defined.` : `Found ${count} ${dimLabel}member(s) missing the "${params.property}" property.`,
        keyMetrics: [{ label: "Missing Property Count", value: count }],
        findings: [{ severity: count === 0 ? 'Information' : 'Warning', text: count === 0 ? `0 members missing property "${params.property}".` : `Members missing property: ${memberList}` }],
        impact: count > 0 ? `Missing ${params.property} properties may trigger default overrides during OneStream XML generation.` : `Metadata completeness verified for ${params.property}.`,
        recommendations: count > 0 ? [`Populate missing "${params.property}" properties in Bulk Update table.`] : ["Check description coverage across remaining dimensions."],
        followUps: ["What is the metadata coverage?", "Is my project ready to export?"]
      });
    }

    case 'property_filter':
      return buildStructuredAnswer({
        summary: count === 0 ? `No members found with ${params.property} = "${params.value}".` : `Found ${count} member(s) with ${params.property} = "${params.value}".`,
        keyMetrics: [{ label: "Filtered Count", value: count }],
        findings: [{ severity: 'Information', text: count > 0 ? `Members: ${memberList}` : "No matches." }],
        followUps: ["Summarize my project"]
      });

    case 'orphans':
      return buildStructuredAnswer({
        summary: count === 0 ? `No orphan members found — all members are connected in the hierarchy.` : `Found ${count} orphan member(s) not attached to any hierarchy root.`,
        keyMetrics: [{ label: "Orphan Count", value: count }],
        findings: [{ severity: count === 0 ? 'Information' : 'Critical', text: count === 0 ? "Hierarchy clean: 0 orphans." : `Orphans: ${memberList}` }],
        impact: count > 0 ? "Orphan members will cause validation failures and block XML export." : "Hierarchy topology is valid for export.",
        recommendations: count > 0 ? ["Attach orphan members to hierarchy roots or parent nodes."] : ["Proceed to export readiness check."],
        followUps: ["Is my project ready to export?", "What is wrong with my project?"]
      });

    case 'list_members': {
      const dimLabel = params.dimension ? `${params.dimension} ` : 'the project ';
      return buildStructuredAnswer({
        summary: count === 0 ? `No members found in ${dimLabel}.` : `${count} member(s) listed in ${dimLabel}.`,
        keyMetrics: [{ label: "Member Count", value: count }],
        findings: [{ severity: 'Information', text: `Members: ${memberList}` }],
        impact: "Members represent the data slice nodes in OneStream cubes.",
        recommendations: ["Inspect member property overrides and hierarchy relationships."],
        followUps: [`How many leaf members in ${params.dimension || 'Account'}?`, `What is the max hierarchy depth in ${params.dimension || 'Account'}?`]
      });
    }

    default:
      return buildStructuredAnswer({
        summary: count === 0 ? `No results found.` : `Found ${count} result(s).`,
        keyMetrics: [{ label: "Result Count", value: count }],
        findings: [{ severity: 'Information', text: count > 0 ? `Results: ${memberList}` : "0 results." }],
        followUps: ["Summarize my project"]
      });
  }
}

function formatMemberList(members: string[]): string {
  if (members.length <= 10) {
    return members.join(', ');
  }
  return members.slice(0, 10).join(', ') + ` ...and ${members.length - 10} more`;
}

