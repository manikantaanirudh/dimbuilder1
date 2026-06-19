import { apiGet, apiPost } from "./core";

export interface AISuggestionResponse {
  suggestions: Array<{
    id: string;
    suggestionType: string;
    targetMemberKey?: string;
    suggestion: Record<string, unknown>;
    confidence: number;
  }>;
  totalGenerated: number;
}

export function fetchAIAnalysis(projectId: string) {
  return apiPost<AISuggestionResponse>(`/projects/${projectId}/ai/analyze`, {});
}

export function fetchDuplicateDetection(projectId: string) {
  return apiPost<Array<{ members: string[]; similarity: number; method: string }>>(
    `/projects/${projectId}/ai/duplicates`,
    {}
  );
}

export function fetchNamingAnomalies(projectId: string) {
  return apiPost<AISuggestionResponse>(`/projects/${projectId}/ai/analyze`, { scope: { types: ["naming"] } });
}

export function fetchHierarchyOptimizations(projectId: string) {
  return apiPost<AISuggestionResponse>(`/projects/${projectId}/ai/analyze`, { scope: { types: ["hierarchy"] } });
}

export function fetchQualityScores(projectId: string) {
  return apiGet<{
    overallScore: number;
    dimensions: Array<{
      dimensionType: string;
      overallScore: number;
      completeness: number;
      naming: number;
      structure: number;
    }>;
  }>(`/projects/${projectId}/quality/scores`);
}

export function fetchQualityGates(projectId: string) {
  return apiGet<Array<{ id: string; name: string; threshold: number; scope: string; action: string }>>(
    `/projects/${projectId}/quality/gates`
  );
}

export function fetchAuditLog(projectId: string) {
  return apiGet<
    Array<{
      id: string;
      userId: string;
      action: string;
      entityType: string;
      entityId: string;
      changes: Record<string, unknown>;
      timestamp: string;
    }>
  >(`/projects/${projectId}/audit-log`);
}
