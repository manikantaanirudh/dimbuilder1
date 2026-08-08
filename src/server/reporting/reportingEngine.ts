import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord, ValidationIssue } from "../../shared/types";
import type {
  HealthReport,
  MetadataHealthSnapshot,
  VelocityReport,
  CoverageReport,
  DimensionCoverage,
  ComplianceReport
} from "../../shared/reportingTypes";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export interface ValidationSummary {
  dimensionType: string;
  errorCount: number;
  warningCount: number;
}

export function generateHealthReport(
  projectId: string,
  projectData: ProjectData,
  existingSnapshots: MetadataHealthSnapshot[],
  issues: ValidationIssue[] = []
): HealthReport {
  const { dimensions, members, relationships } = projectData;
  const snapshots: MetadataHealthSnapshot[] = [];

  for (const dim of dimensions) {
    const dimMembers = members.filter(m => m.dimensionId === dim.id);
    const dimRels = relationships.filter(r => r.dimensionId === dim.id);
    const dimIssues = issues.filter(i => i.dimensionId === dim.id);

    const memberCount = dimMembers.length;
    const childKeys = new Set(dimRels.map(r => r.childKey));
    const parentKeys = new Set(dimRels.map(r => r.parentKey));
    const orphanCount = dimMembers.filter(m =>
      !childKeys.has(m.memberKey) && !parentKeys.has(m.memberKey)
    ).length;

    const completenessScore = calculateCompleteness(dimMembers);
    const namingScore = calculateNamingConsistency(dimMembers);
    const qualityScore = Math.round((completenessScore + namingScore) / 2);

    const validationErrorCount = dimIssues.filter(i => i.severity === "error").length;
    const validationWarningCount = dimIssues.filter(i => i.severity === "warning").length;

    snapshots.push({
      id: '',
      projectId,
      dimensionType: dim.dimensionType,
      qualityScore,
      completenessScore,
      namingScore,
      validationErrorCount,
      validationWarningCount,
      memberCount,
      orphanCount,
      capturedAt: new Date().toISOString()
    });
  }

  const overallScore = snapshots.length > 0
    ? Math.round(snapshots.reduce((sum, s) => sum + s.qualityScore, 0) / snapshots.length)
    : 100;

  // Determine trend based on previous snapshots
  let trend: HealthReport['trend'] = 'stable';
  if (existingSnapshots.length > 0) {
    const prevAvg = existingSnapshots.reduce((sum, s) => sum + s.qualityScore, 0) / existingSnapshots.length;
    if (overallScore > prevAvg + 5) trend = 'improving';
    else if (overallScore < prevAvg - 5) trend = 'declining';
  }

  return { projectId, snapshots, overallScore, trend };
}

export function generateVelocityReport(
  projectId: string,
  projectData: ProjectData
): VelocityReport {
  const { members } = projectData;

  // Group members by creation week
  const periodMap = new Map<string, { added: number; modified: number }>();

  for (const member of members) {
    const date = new Date(member.createdAt);
    const weekStart = getWeekStart(date);
    const key = weekStart.toISOString().split('T')[0];

    if (!periodMap.has(key)) periodMap.set(key, { added: 0, modified: 0 });
    periodMap.get(key)!.added++;

    if (member.updatedAt !== member.createdAt) {
      const updateDate = new Date(member.updatedAt);
      const updateWeek = getWeekStart(updateDate).toISOString().split('T')[0];
      if (!periodMap.has(updateWeek)) periodMap.set(updateWeek, { added: 0, modified: 0 });
      periodMap.get(updateWeek)!.modified++;
    }
  }

  const sortedKeys = [...periodMap.keys()].sort();
  const periods = sortedKeys.map(key => {
    const data = periodMap.get(key)!;
    const start = new Date(key);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      periodStart: key,
      periodEnd: end.toISOString().split('T')[0],
      membersAdded: data.added,
      membersModified: data.modified,
      membersDeleted: 0,
      totalChanges: data.added + data.modified
    };
  });

  return {
    projectId,
    periods,
    totalChanges: periods.reduce((sum, p) => sum + p.totalChanges, 0)
  };
}

export function generateCoverageReport(
  projectId: string,
  projectData: ProjectData
): CoverageReport {
  const { dimensions, members } = projectData;
  const dimensionsCoverage: DimensionCoverage[] = [];

  for (const dim of dimensions) {
    const dimMembers = members.filter(m => m.dimensionId === dim.id);
    const propertyCoverage = calculatePropertyCoverage(dimMembers);
    const descriptionCoverage = calculateDescriptionCoverage(dimMembers);

    const lastModified = dimMembers.length > 0
      ? dimMembers.reduce((latest, m) => m.updatedAt > latest ? m.updatedAt : latest, dimMembers[0].updatedAt)
      : dim.updatedAt;

    const daysSinceModified = Math.floor((Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60 * 24));

    dimensionsCoverage.push({
      dimensionType: dim.dimensionType,
      dimensionName: dim.dimensionName,
      memberCount: dimMembers.length,
      propertyCoverage,
      descriptionCoverage,
      lastModified,
      isStale: daysSinceModified > 90
    });
  }

  const overallCoverage = dimensionsCoverage.length > 0
    ? Math.round(dimensionsCoverage.reduce((sum, d) => sum + (d.propertyCoverage + d.descriptionCoverage) / 2, 0) / dimensionsCoverage.length)
    : 100;

  return { projectId, dimensions: dimensionsCoverage, overallCoverage };
}

export function generateComplianceReport(
  projectId: string,
  projectData: ProjectData,
  validationSummaries: ValidationSummary[]
): ComplianceReport {
  const totalMembers = projectData.members.length;
  const totalErrors = validationSummaries.reduce((sum, v) => sum + v.errorCount, 0);
  const validationPassRate = totalMembers > 0
    ? Math.round(((totalMembers - totalErrors) / totalMembers) * 100)
    : 100;

  const dimensionResults = validationSummaries.map(v => ({
    dimensionType: v.dimensionType,
    errorCount: v.errorCount,
    warningCount: v.warningCount,
    complianceScore: totalMembers > 0 ? Math.round(((totalMembers - v.errorCount) / totalMembers) * 100) : 100
  }));

  return { projectId, totalMembers, validationPassRate, dimensionResults };
}

function calculateCompleteness(members: DimensionMemberRecord[]): number {
  if (members.length === 0) return 100;
  let totalProps = 0;
  let filledProps = 0;

  for (const member of members) {
    const props = Object.entries(member.properties);
    totalProps += props.length;
    filledProps += props.filter(([, v]) => v !== null && v !== undefined && v !== '').length;
  }

  return totalProps > 0 ? Math.round((filledProps / totalProps) * 100) : 100;
}

function calculateNamingConsistency(members: DimensionMemberRecord[]): number {
  if (members.length < 3) return 100;
  const keys = members.map(m => m.memberKey);

  // Check if naming is consistent (same case convention)
  let pascalCount = 0;
  for (const key of keys) {
    if (/^[A-Z]/.test(key)) pascalCount++;
  }

  const consistency = Math.max(pascalCount, keys.length - pascalCount) / keys.length;
  return Math.round(consistency * 100);
}

function calculatePropertyCoverage(members: DimensionMemberRecord[]): number {
  if (members.length === 0) return 100;
  const allProps = new Set<string>();
  for (const member of members) {
    for (const key of Object.keys(member.properties)) allProps.add(key);
  }
  if (allProps.size === 0) return 100;

  let totalSlots = members.length * allProps.size;
  let filled = 0;
  for (const member of members) {
    for (const prop of allProps) {
      const val = member.properties[prop];
      if (val !== null && val !== undefined && val !== '') filled++;
    }
  }

  return Math.round((filled / totalSlots) * 100);
}

function calculateDescriptionCoverage(members: DimensionMemberRecord[]): number {
  if (members.length === 0) return 100;
  const withDescription = members.filter(m => m.description.trim().length > 0).length;
  return Math.round((withDescription / members.length) * 100);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
