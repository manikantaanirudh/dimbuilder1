export type ReportType = 'health' | 'velocity' | 'compliance' | 'coverage' | 'custom';
export type ReportFormat = 'json' | 'xlsx' | 'pdf';
export type ReportRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReportDefinition {
  id: string;
  name: string;
  reportType: ReportType;
  config: ReportConfig;
  scheduleCron: string | null;
  format: ReportFormat;
  recipients: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportConfig {
  projectId?: string;
  dimensionTypes?: string[];
  dateRange?: { from: string; to: string };
  metrics?: string[];
}

export interface ReportRun {
  id: string;
  definitionId: string;
  status: ReportRunStatus;
  outputData: Record<string, unknown> | null;
  generatedAt: string;
}

export interface MetadataHealthSnapshot {
  id: string;
  projectId: string;
  dimensionType: string;
  dimensionName?: string;
  qualityScore: number;
  completenessScore: number;
  namingScore: number;
  validationErrorCount: number;
  validationWarningCount: number;
  memberCount: number;
  orphanCount: number;
  capturedAt: string;
}

export interface HealthReport {
  projectId: string;
  snapshots: MetadataHealthSnapshot[];
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface VelocityReport {
  projectId: string;
  periods: VelocityPeriod[];
  totalChanges: number;
}

export interface VelocityPeriod {
  periodStart: string;
  periodEnd: string;
  membersAdded: number;
  membersModified: number;
  membersDeleted: number;
  totalChanges: number;
}

export interface CoverageReport {
  projectId: string;
  dimensions: DimensionCoverage[];
  overallCoverage: number;
}

export interface DimensionCoverage {
  dimensionType: string;
  dimensionName: string;
  memberCount: number;
  propertyCoverage: number;
  descriptionCoverage: number;
  lastModified: string;
  isStale: boolean;
}

export interface ComplianceReport {
  projectId: string;
  totalMembers: number;
  validationPassRate: number;
  dimensionResults: Array<{
    dimensionType: string;
    errorCount: number;
    warningCount: number;
    complianceScore: number;
  }>;
}
