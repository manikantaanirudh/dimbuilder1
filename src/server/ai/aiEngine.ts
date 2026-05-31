import type { DimensionMemberRecord, DimensionRelationshipRecord, DimensionRecord } from "../../shared/types";
import type {
  AIConfigSection,
  AISuggestionType,
  ParentSuggestion,
  DuplicateGroup,
  NamingAnomaly,
  HierarchyOptimization,
  PropertySuggestion,
  NLQueryResult
} from "../../shared/aiTypes";
import { suggestParents } from "./suggestions/parentSuggestion";
import { detectDuplicates } from "./suggestions/duplicateDetection";
import { detectNamingAnomalies } from "./suggestions/namingAnomaly";
import { suggestHierarchyOptimizations } from "./suggestions/hierarchyOptimization";
import { suggestProperties } from "./suggestions/propertySuggestion";
import { parseAndExecuteQuery } from "./naturalLanguage/queryParser";
import type { ProjectAIContext } from "./projectContext";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export interface AnalysisScope {
  dimensionTypes?: string[];
  suggestionTypes?: AISuggestionType[];
}

export interface AnalysisResult {
  parentSuggestions: ParentSuggestion[];
  duplicates: DuplicateGroup[];
  namingAnomalies: NamingAnomaly[];
  hierarchyOptimizations: HierarchyOptimization[];
  propertySuggestions: PropertySuggestion[];
}

export function runFullAnalysis(projectData: ProjectData, config: AIConfigSection, scope?: AnalysisScope): AnalysisResult {
  const result: AnalysisResult = {
    parentSuggestions: [],
    duplicates: [],
    namingAnomalies: [],
    hierarchyOptimizations: [],
    propertySuggestions: []
  };

  const shouldRun = (type: AISuggestionType) => !scope?.suggestionTypes || scope.suggestionTypes.includes(type);

  const filteredDimensions = scope?.dimensionTypes
    ? projectData.dimensions.filter(d => scope.dimensionTypes!.includes(d.dimensionType))
    : projectData.dimensions;
  const dimensionIds = new Set(filteredDimensions.map(d => d.id));
  const filteredMembers = projectData.members.filter(m => dimensionIds.has(m.dimensionId));
  const filteredRelationships = projectData.relationships.filter(r => dimensionIds.has(r.dimensionId));

  if (shouldRun('duplicate') && config.features.duplicateDetection) {
    result.duplicates = detectDuplicates({
      members: filteredMembers,
      config: config.duplicateDetection
    });
  }

  if (shouldRun('naming') && config.features.namingAnomalies) {
    for (const dim of filteredDimensions) {
      const dimMembers = filteredMembers.filter(m => m.dimensionId === dim.id);
      const anomalies = detectNamingAnomalies({ members: dimMembers, dimensionType: dim.dimensionType });
      result.namingAnomalies.push(...anomalies);
    }
  }

  if (shouldRun('hierarchy') && config.features.hierarchyOptimization) {
    for (const dim of filteredDimensions) {
      const dimMembers = filteredMembers.filter(m => m.dimensionId === dim.id);
      const dimRels = filteredRelationships.filter(r => r.dimensionId === dim.id);
      const optimizations = suggestHierarchyOptimizations({ members: dimMembers, relationships: dimRels });
      result.hierarchyOptimizations.push(...optimizations);
    }
  }

  if (shouldRun('property') && config.features.propertySuggestions) {
    for (const dim of filteredDimensions) {
      const dimMembers = filteredMembers.filter(m => m.dimensionId === dim.id);
      const suggestions = suggestProperties({ members: dimMembers, dimensionType: dim.dimensionType });
      result.propertySuggestions.push(...suggestions);
    }
  }

  // Limit total suggestions per config
  const maxTotal = config.suggestions.maxPerAnalysis;
  const totalCount = result.duplicates.length + result.namingAnomalies.length +
                   result.hierarchyOptimizations.length + result.propertySuggestions.length;

  if (totalCount > maxTotal) {
    const quarter = Math.ceil(maxTotal / 4);
    result.namingAnomalies = result.namingAnomalies.slice(0, quarter);
    result.hierarchyOptimizations = result.hierarchyOptimizations.slice(0, quarter);
    result.propertySuggestions = result.propertySuggestions.slice(0, quarter);
    result.duplicates = result.duplicates.slice(0, quarter);
  }

  return result;
}

export function runParentSuggestion(
  memberKey: string,
  dimensionType: string,
  projectData: ProjectData
): ParentSuggestion[] {
  const dimension = projectData.dimensions.find(d => d.dimensionType === dimensionType);
  if (!dimension) return [];

  const dimensionMembers = projectData.members.filter(m => m.dimensionId === dimension.id);
  const relationships = projectData.relationships.filter(r => r.dimensionId === dimension.id);

  return suggestParents({ memberKey, dimensionMembers, relationships });
}

export function runDuplicateDetection(
  projectData: ProjectData,
  config: AIConfigSection,
  threshold?: number
): DuplicateGroup[] {
  const detectionConfig = {
    ...config.duplicateDetection,
    similarityThreshold: threshold ?? config.duplicateDetection.similarityThreshold
  };
  return detectDuplicates({ members: projectData.members, config: detectionConfig });
}

export function runNaturalLanguageQuery(
  question: string,
  projectData: ProjectData,
  context?: ProjectAIContext
): NLQueryResult {
  return parseAndExecuteQuery({
    question,
    dimensions: projectData.dimensions,
    members: projectData.members,
    relationships: projectData.relationships,
    context
  });
}
