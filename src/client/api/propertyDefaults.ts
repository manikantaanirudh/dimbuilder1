import { apiGet, apiPatchJson } from "./core";

export interface PropertyDefaultValueResponse {
  id: string;
  dimensionType: string;
  targetLevel: "dimension" | "member" | "relationship";
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
  updatedAt?: string;
}

export function fetchPropertyDefaults(projectId: string, dimensionType?: string) {
  const query = dimensionType ? `?dimensionType=${encodeURIComponent(dimensionType)}` : "";
  return apiGet<{
    values: Record<string, PropertyDefaultValueResponse[]>;
  }>(`/projects/${projectId}/property-defaults${query}`);
}

export function updatePropertyDefault(
  projectId: string,
  defaultId: string,
  body: { defaultValue?: string; enabled?: boolean }
) {
  return apiPatchJson<{ value: PropertyDefaultValueResponse }>(
    `/projects/${projectId}/property-defaults/${defaultId}`,
    body
  );
}
