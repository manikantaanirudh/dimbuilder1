import { useCallback, useEffect, useState } from "react";
import type {
  DashboardSummary,
  DimensionRecord,
  ProjectRecord,
  VaryingPropertyValueRecord,
  ValidationIssue
} from "../../shared/types";
import {
  fetchDimensions,
  fetchIssues,
  fetchProjects,
  fetchVaryingPropertyValues,
  fetchSummary
} from "../api/client";

export function useProjectStore() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<DimensionRecord[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [varyingPropertyValues, setVaryingPropertyValues] = useState<VaryingPropertyValueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (projectIdOverride?: string) => {
    setLoading(true);
    setError("");
    try {
      const loadedProjects = await fetchProjects();
      setProjects(loadedProjects);
      const nextProjectId = projectIdOverride ?? selectedProjectId ?? loadedProjects[0]?.id ?? null;
      setSelectedProjectId(nextProjectId);
      if (nextProjectId) {
        const [loadedDimensions, loadedSummary, loadedIssues, loadedVaryingPropertyValues] = await Promise.all([
          fetchDimensions(nextProjectId),
          fetchSummary(nextProjectId),
          fetchIssues(nextProjectId),
          fetchVaryingPropertyValues(nextProjectId)
        ]);
        setDimensions(loadedDimensions);
        setSummary(loadedSummary);
        setIssues(loadedIssues);
        setVaryingPropertyValues(loadedVaryingPropertyValues);
      } else {
        setDimensions([]);
        setSummary(null);
        setIssues([]);
        setVaryingPropertyValues([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void refresh();
  }, []);

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    dimensions,
    summary,
    issues,
    varyingPropertyValues,
    loading,
    error,
    refresh
  };
}
