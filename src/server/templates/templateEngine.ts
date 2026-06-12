import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import type {
  Template,
  TemplateData,
  TemplateDimensionData,
  TemplatePreview,
  ApplyTemplateResult
} from "../../shared/templateTypes";
import type { Repositories } from "../db/repositories";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function extractTemplateFromProject(
  projectData: ProjectData,
  dimensionTypes: string[]
): TemplateData {
  const { dimensions, members, relationships } = projectData;
  const templateDimensions: TemplateDimensionData[] = [];

  for (const dimType of dimensionTypes) {
    const dim = dimensions.find(d => d.dimensionType === dimType);
    if (!dim) continue;

    const dimMembers = members.filter(m => m.dimensionId === dim.id);
    const dimRels = relationships.filter(r => r.dimensionId === dim.id);

    templateDimensions.push({
      dimensionType: dim.dimensionType,
      dimensionName: dim.dimensionName,
      members: dimMembers.map(m => ({
        memberKey: m.memberKey,
        description: m.description,
        properties: m.properties
      })),
      relationships: dimRels.map(r => ({
        parentKey: r.parentKey,
        childKey: r.childKey,
        aggregationWeight: r.aggregationWeight ?? undefined
      }))
    });
  }

  return { dimensions: templateDimensions };
}

export function buildTemplatePreview(template: Template): TemplatePreview {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    dimensions: template.templateData.dimensions.map(d => ({
      dimensionType: d.dimensionType,
      dimensionName: d.dimensionName,
      memberCount: d.members.length,
      relationshipCount: d.relationships.length,
      sampleMembers: d.members.slice(0, 10).map(m => m.memberKey)
    }))
  };
}

export async function applyTemplate(
  template: Template,
  projectId: string,
  repos: Repositories,
  renameMapping?: Record<string, string>
): Promise<ApplyTemplateResult> {
  let dimensionsCreated = 0;
  let membersCreated = 0;
  let relationshipsCreated = 0;

  for (const dimData of template.templateData.dimensions) {
    const dimensionName = renameMapping?.[dimData.dimensionName] ?? dimData.dimensionName;
    const dimensionType = dimData.dimensionType as DimensionRecord['dimensionType'];

    // Check if dimension already exists in project
    const existingDims = await repos.dimensions.listByProject(projectId);
    const existing = existingDims.find(d => d.dimensionType === dimensionType);

    let dimensionId: string;
    if (existing) {
      dimensionId = existing.id;
    } else {
      const created = await repos.dimensions.create({
        projectId,
        sheetName: dimensionName,
        dimensionType,
        dimensionName,
        description: '',
        accessGroup: 'Everyone',
        maintenanceGroup: 'Everyone',
        inheritedDimension: '',
        sortOrder: existingDims.length + 1,
        metadata: {}
      });
      dimensionId = created.id;
      dimensionsCreated++;
    }

    // Add members
    const memberRecords: DimensionMemberRecord[] = dimData.members.map((m, idx) => {
      const memberKey = renameMapping?.[m.memberKey] ?? m.memberKey;
      return {
        id: `tpl-${Date.now()}-${idx}-${memberKey}`,
        dimensionId,
        memberKey,
        description: m.description,
        properties: m.properties,
        rowOrder: idx + 1,
        sourceRowNumber: idx + 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    if (memberRecords.length > 0) {
      await repos.members.bulkInsert(memberRecords);
      membersCreated += memberRecords.length;
    }

    // Add relationships
    const relRecords: DimensionRelationshipRecord[] = dimData.relationships.map((r, idx) => {
      const parentKey = renameMapping?.[r.parentKey] ?? r.parentKey;
      const childKey = renameMapping?.[r.childKey] ?? r.childKey;
      return {
        id: `tpl-rel-${Date.now()}-${idx}-${parentKey}-${childKey}`,
        dimensionId,
        parentKey,
        childKey,
        aggregationWeight: r.aggregationWeight ?? null,
        percentConsol: null,
        percentOwnership: null,
        ownershipType: '',
        properties: { Parent: parentKey, Child: childKey },
        rowOrder: idx + 1,
        sourceRowNumber: idx + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    if (relRecords.length > 0) {
      await repos.relationships.bulkInsert(relRecords);
      relationshipsCreated += relRecords.length;
    }
  }

  return { applicationId: '', dimensionsCreated, membersCreated, relationshipsCreated };
}

export function getBuiltinTemplates(): Array<Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>> {
  return [
    {
      name: 'Manufacturing Chart of Accounts',
      description: 'Standard manufacturing CoA with COGS, revenue, and operating expense categories',
      category: 'industry',
      industry: 'manufacturing',
      dimensionTypes: ['Account'],
      templateData: {
        dimensions: [{
          dimensionType: 'Account',
          dimensionName: 'Accounts',
          members: [
            { memberKey: 'Root', description: 'Root account', properties: {} },
            { memberKey: 'Revenue', description: 'Total Revenue', properties: { AccountType: 'Revenue' } },
            { memberKey: 'Revenue_Product', description: 'Product Revenue', properties: { AccountType: 'Revenue' } },
            { memberKey: 'Revenue_Services', description: 'Services Revenue', properties: { AccountType: 'Revenue' } },
            { memberKey: 'COGS', description: 'Cost of Goods Sold', properties: { AccountType: 'Expense' } },
            { memberKey: 'COGS_Materials', description: 'Raw Materials', properties: { AccountType: 'Expense' } },
            { memberKey: 'COGS_Labor', description: 'Direct Labor', properties: { AccountType: 'Expense' } },
            { memberKey: 'COGS_Overhead', description: 'Manufacturing Overhead', properties: { AccountType: 'Expense' } },
            { memberKey: 'OpEx', description: 'Operating Expenses', properties: { AccountType: 'Expense' } },
            { memberKey: 'OpEx_SGA', description: 'SG&A', properties: { AccountType: 'Expense' } },
            { memberKey: 'OpEx_RnD', description: 'Research & Development', properties: { AccountType: 'Expense' } }
          ],
          relationships: [
            { parentKey: 'Root', childKey: 'Revenue' },
            { parentKey: 'Revenue', childKey: 'Revenue_Product' },
            { parentKey: 'Revenue', childKey: 'Revenue_Services' },
            { parentKey: 'Root', childKey: 'COGS' },
            { parentKey: 'COGS', childKey: 'COGS_Materials' },
            { parentKey: 'COGS', childKey: 'COGS_Labor' },
            { parentKey: 'COGS', childKey: 'COGS_Overhead' },
            { parentKey: 'Root', childKey: 'OpEx' },
            { parentKey: 'OpEx', childKey: 'OpEx_SGA' },
            { parentKey: 'OpEx', childKey: 'OpEx_RnD' }
          ]
        }]
      },
      tags: ['manufacturing', 'coa', 'accounts', 'cogs'],
      version: '1.0.0',
      isPublic: true,
      createdBy: 'system'
    },
    {
      name: 'Corporate Entity Hierarchy',
      description: 'Standard corporate entity structure with regions and business units',
      category: 'pattern',
      industry: 'general',
      dimensionTypes: ['Entity'],
      templateData: {
        dimensions: [{
          dimensionType: 'Entity',
          dimensionName: 'Entities',
          members: [
            { memberKey: 'Root', description: 'Root entity', properties: {} },
            { memberKey: 'Corporate', description: 'Corporate', properties: {} },
            { memberKey: 'Americas', description: 'Americas Region', properties: {} },
            { memberKey: 'EMEA', description: 'Europe Middle East Africa', properties: {} },
            { memberKey: 'APAC', description: 'Asia Pacific', properties: {} },
            { memberKey: 'Eliminations', description: 'Intercompany Eliminations', properties: {} }
          ],
          relationships: [
            { parentKey: 'Root', childKey: 'Corporate' },
            { parentKey: 'Corporate', childKey: 'Americas' },
            { parentKey: 'Corporate', childKey: 'EMEA' },
            { parentKey: 'Corporate', childKey: 'APAC' },
            { parentKey: 'Root', childKey: 'Eliminations' }
          ]
        }]
      },
      tags: ['entity', 'corporate', 'regions', 'hierarchy'],
      version: '1.0.0',
      isPublic: true,
      createdBy: 'system'
    }
  ];
}
