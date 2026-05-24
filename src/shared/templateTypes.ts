export type TemplateCategory = 'industry' | 'dimension_type' | 'pattern' | 'custom';
export type TemplateIndustry = 'manufacturing' | 'financial_services' | 'technology' | 'retail' | 'healthcare' | 'general';

export interface TemplateMember {
  memberKey: string;
  description: string;
  properties: Record<string, unknown>;
}

export interface TemplateRelationship {
  parentKey: string;
  childKey: string;
  aggregationWeight?: number;
}

export interface TemplateDimensionData {
  dimensionType: string;
  dimensionName: string;
  members: TemplateMember[];
  relationships: TemplateRelationship[];
}

export interface TemplateData {
  dimensions: TemplateDimensionData[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  industry: TemplateIndustry | null;
  dimensionTypes: string[];
  templateData: TemplateData;
  tags: string[];
  version: string;
  isPublic: boolean;
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateApplication {
  id: string;
  templateId: string;
  projectId: string;
  appliedBy: string;
  renameMapping: Record<string, string> | null;
  appliedAt: string;
}

export interface TemplatePreview {
  id: string;
  name: string;
  description: string;
  dimensions: Array<{
    dimensionType: string;
    dimensionName: string;
    memberCount: number;
    relationshipCount: number;
    sampleMembers: string[];
  }>;
}

export interface ApplyTemplateResult {
  applicationId: string;
  dimensionsCreated: number;
  membersCreated: number;
  relationshipsCreated: number;
}

export interface CreateTemplateFromProjectInput {
  projectId: string;
  dimensionTypes: string[];
  name: string;
  description?: string;
  category?: TemplateCategory;
  industry?: TemplateIndustry;
  tags?: string[];
}
