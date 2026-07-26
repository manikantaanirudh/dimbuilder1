import type { ArtifactType, ProposedChangeImpact, ProposedChangeType } from "@shared/artifactReferenceScanner";
import type { PatternEvaluation, PatternProfile } from "@shared/clientPatternProfiler";
import type { EffectivePovReport } from "@shared/effectivePov";
import type { MigrationPreview, MigrationSession } from "@shared/migrationCockpit";
import type { AssistantAnswer } from "@shared/projectAssistant";
import type { ReadinessBand, ReadinessCategory } from "@shared/readinessScore";
import type { RiskHeatmapReport } from "@shared/riskHeatmap";
import type { XdXrayReport } from "@shared/xdXray";
import { apiGet, apiPost } from "./core";

export interface ReadinessResponse {
  score: number;
  band: ReadinessBand;
  generatedAt: string;
  exportWarning: boolean;
  minimumScoreForExportWarning: number;
  blockers: string[];
  topRecommendations: string[];
  categories: Array<Pick<ReadinessCategory, "key" | "label" | "score" | "status">>;
}

export interface ArtifactRecord {
  id: string;
  projectId: string;
  name: string;
  artifactType: ArtifactType;
  originalFileName: string;
  contentHash: string;
  uploadedBy: string;
  uploadedAt: string;
  scanStatus: "unscanned" | "scanned";
  scannedAt: string | null;
  referenceCount: number;
}

export type EffectivePovResponse = EffectivePovReport;

export function fetchReadiness(projectId: string, includeDetails = false) {
  const query = includeDetails ? "?includeDetails=true" : "";
  return apiGet<ReadinessResponse>(`/projects/${projectId}/readiness${query}`);
}

export function fetchArtifacts(projectId: string) {
  return apiGet<{ artifacts: ArtifactRecord[] }>(`/projects/${projectId}/artifacts`);
}

export function uploadArtifact(
  projectId: string,
  body: { name: string; fileName: string; content: string; artifactType?: ArtifactType }
) {
  return apiPost<{ artifact: ArtifactRecord }>(`/projects/${projectId}/artifacts/upload`, body);
}

export function scanArtifact(projectId: string, artifactId: string) {
  return apiPost<{ artifact: ArtifactRecord; references: unknown[] }>(
    `/projects/${projectId}/artifacts/${artifactId}/scan`,
    {}
  );
}

export function assessProposedArtifactChange(
  projectId: string,
  body: { dimensionType: string; memberKey: string; changeType: ProposedChangeType }
) {
  return apiPost<{ impact: ProposedChangeImpact }>(`/projects/${projectId}/impact/proposed-change`, body);
}

export function fetchEffectivePov(
  projectId: string,
  body: {
    targetType: "member" | "relationship" | "dimension";
    targetId?: string;
    dimensionId?: string;
    memberId?: string;
    memberKey?: string;
    parentKey?: string;
    childKey?: string;
    relationshipId?: string;
    context?: { cubeType?: string; scenarioType?: string; timeMember?: string };
    propertyNames?: string[];
  }
) {
  return apiPost<EffectivePovResponse>(`/projects/${projectId}/effective-pov`, body);
}

export function fetchXdXray(projectId: string) {
  return apiGet<XdXrayReport>(`/projects/${projectId}/extensibility/xray`);
}

export function fetchRiskHeatmap(projectId: string, severityFilter?: string[]) {
  const query = severityFilter?.length ? `?severity=${encodeURIComponent(severityFilter.join(","))}` : "";
  return apiGet<RiskHeatmapReport>(`/projects/${projectId}/risk-heatmap${query}`);
}

export function fetchPatternProfiles(projectId: string) {
  return apiGet<{ profiles: PatternProfile[] }>(`/projects/${projectId}/pattern-profiles`);
}

export function createPatternProfile(projectId: string) {
  return apiPost<{ profile: PatternProfile }>(`/projects/${projectId}/pattern-profiles`, {});
}

export function evaluatePatternProfile(projectId: string, profileId: string) {
  return apiPost<{ evaluation: PatternEvaluation }>(
    `/projects/${projectId}/pattern-profiles/${profileId}/evaluate`,
    {}
  );
}

export function fetchAssistantSuggestions(projectId: string) {
  return apiGet<{ suggestions: string[] }>(`/projects/${projectId}/assistant/suggestions`);
}

export function queryProjectAssistant(projectId: string, question: string) {
  return apiPost<{ question: string; answer: AssistantAnswer }>(`/projects/${projectId}/assistant/query`, { question });
}

export function createMigrationSession(
  projectId: string,
  body: { sourceType: string; fileName: string; content: string }
) {
  return apiPost<{ session: MigrationSession }>(`/projects/${projectId}/migration/sessions`, body);
}

export function previewMigration(projectId: string, sessionId: string) {
  return apiPost<{ preview: MigrationPreview; unresolvedDecisions: number }>(
    `/projects/${projectId}/migration/sessions/${sessionId}/preview`,
    {}
  );
}

export function commitMigration(projectId: string, sessionId: string, overrideUnresolved = false) {
  return apiPost<{ committed: { members: number; relationships: number; dimensions: number } }>(
    `/projects/${projectId}/migration/sessions/${sessionId}/commit`,
    { overrideUnresolved }
  );
}
