import type { ImpactAnalysisRecord, ImpactAnalysisRequest, ImpactReport } from "@shared/impactTypes";
import { apiGet, apiPost } from "./core";

export function runImpactAnalysis(projectId: string, request: ImpactAnalysisRequest) {
  return apiPost<{ id: string; results: ImpactReport; severity: string; summary: string }>(
    `/projects/${projectId}/impact-analysis`,
    request
  );
}

export function fetchImpactAnalyses(projectId: string) {
  return apiGet<Omit<ImpactAnalysisRecord, "scope" | "results" | "environmentId">[]>(
    `/projects/${projectId}/impact-analyses`
  );
}

export function fetchImpactAnalysis(id: string) {
  return apiGet<ImpactAnalysisRecord>(`/impact-analyses/${id}`);
}

export function runWhatIfAnalysis(projectId: string, request: Omit<ImpactAnalysisRequest, "type">) {
  return apiPost<{ id: string; results: ImpactReport; severity: string; summary: string }>(
    `/projects/${projectId}/what-if`,
    request
  );
}
