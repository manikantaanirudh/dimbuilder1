import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import type { MemberQualityScore, DimensionQualityScore, QualityRule } from "../../shared/tier3Types";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function scoreMemberQuality(
  member: DimensionMemberRecord,
  dimension: DimensionRecord,
  rules: QualityRule[]
): MemberQualityScore {
  const breakdown: MemberQualityScore['breakdown'] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  const activeRules = rules.filter(r => r.isActive);
  if (activeRules.length === 0) {
    // Default scoring when no custom rules
    const completenessScore = scoreCompleteness(member);
    const namingScore = scoreNaming(member.memberKey);
    breakdown.push({ rule: 'completeness', score: completenessScore, maxScore: 100 });
    breakdown.push({ rule: 'naming', score: namingScore, maxScore: 100 });
    return { memberKey: member.memberKey, dimensionType: dimension.dimensionType, overallScore: Math.round((completenessScore + namingScore) / 2), breakdown };
  }

  for (const rule of activeRules) {
    let score = 100;
    switch (rule.category) {
      case 'completeness':
        score = scoreCompleteness(member);
        break;
      case 'naming':
        score = scoreNaming(member.memberKey);
        break;
      case 'structure':
        score = 100; // Needs relationship context
        break;
      case 'consistency':
        score = scoreConsistency(member);
        break;
      default:
        score = 100;
    }
    breakdown.push({ rule: rule.name, score, maxScore: 100 });
    totalWeight += rule.weight;
    weightedScore += score * rule.weight;
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 100;
  return { memberKey: member.memberKey, dimensionType: dimension.dimensionType, overallScore, breakdown };
}

export function scoreDimensionQuality(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  rules: QualityRule[]
): DimensionQualityScore {
  const memberScores = members.map(m => scoreMemberQuality(m, dimension, rules));
  const avgScore = memberScores.length > 0
    ? Math.round(memberScores.reduce((sum, s) => sum + s.overallScore, 0) / memberScores.length)
    : 100;

  const lowestScoreMembers = memberScores
    .sort((a, b) => a.overallScore - b.overallScore)
    .slice(0, 5)
    .map(s => ({ memberKey: s.memberKey, score: s.overallScore }));

  const ruleScores: DimensionQualityScore['ruleScores'] = [];
  const activeRules = rules.filter(r => r.isActive);
  for (const rule of activeRules) {
    const ruleAvg = memberScores.length > 0
      ? Math.round(memberScores.reduce((sum, s) => {
          const ruleBreakdown = s.breakdown.find(b => b.rule === rule.name);
          return sum + (ruleBreakdown?.score ?? 100);
        }, 0) / memberScores.length)
      : 100;
    ruleScores.push({ ruleName: rule.name, score: ruleAvg });
  }

  return {
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    overallScore: avgScore,
    memberCount: members.length,
    avgMemberScore: avgScore,
    lowestScoreMembers,
    ruleScores
  };
}

export function generateDocumentContent(projectData: ProjectData): string {
  const { dimensions, members, relationships } = projectData;
  const lines: string[] = [];

  lines.push('# Dimension Design Document');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  for (const dim of dimensions) {
    const dimMembers = members.filter(m => m.dimensionId === dim.id);
    const dimRels = relationships.filter(r => r.dimensionId === dim.id);

    lines.push(`## ${dim.dimensionType}: ${dim.dimensionName}`);
    lines.push('');
    lines.push(`- Members: ${dimMembers.length}`);
    lines.push(`- Relationships: ${dimRels.length}`);
    if (dim.inheritedDimension) lines.push(`- Inherits from: ${dim.inheritedDimension}`);
    lines.push('');

    lines.push('### Member List');
    lines.push('');
    lines.push('| Member Key | Description |');
    lines.push('|------------|-------------|');
    for (const m of dimMembers.slice(0, 50)) {
      lines.push(`| ${m.memberKey} | ${m.description || '-'} |`);
    }
    if (dimMembers.length > 50) lines.push(`| ... | (${dimMembers.length - 50} more) |`);
    lines.push('');

    if (dimRels.length > 0) {
      lines.push('### Hierarchy');
      lines.push('');
      const roots = new Set(dimRels.map(r => r.parentKey));
      const children = new Set(dimRels.map(r => r.childKey));
      const topLevel = [...roots].filter(r => !children.has(r));
      for (const root of topLevel.slice(0, 5)) {
        lines.push(`- ${root}`);
        const directChildren = dimRels.filter(r => r.parentKey === root);
        for (const child of directChildren.slice(0, 10)) {
          lines.push(`  - ${child.childKey}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function scoreCompleteness(member: DimensionMemberRecord): number {
  const props = Object.entries(member.properties);
  if (props.length === 0) return member.description ? 50 : 0;
  const filled = props.filter(([, v]) => v !== null && v !== undefined && v !== '').length;
  const propScore = Math.round((filled / props.length) * 80);
  const descScore = member.description.trim() ? 20 : 0;
  return propScore + descScore;
}

function scoreNaming(memberKey: string): number {
  let score = 100;
  if (memberKey.length < 2) score -= 30;
  if (memberKey.length > 100) score -= 20;
  if (/\s{2,}/.test(memberKey)) score -= 20;
  if (/^[a-z]/.test(memberKey) && !/^[a-z]+$/.test(memberKey)) score -= 10;
  if (/[^\w\-\s]/.test(memberKey)) score -= 15;
  return Math.max(0, score);
}

function scoreConsistency(member: DimensionMemberRecord): number {
  // Check for common inconsistency patterns
  let score = 100;
  const key = member.memberKey;
  // Mixed separators
  if (key.includes('_') && key.includes('-')) score -= 20;
  // Mixed case conventions
  if (/[a-z]/.test(key) && /[A-Z]/.test(key.slice(1)) && key.includes('_')) score -= 10;
  return Math.max(0, score);
}
