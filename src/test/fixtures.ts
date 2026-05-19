import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord
} from "../shared/types";

export const testTimestamp = "2026-05-16T00:00:00.000Z";

export const sampleProject: ProjectRecord = {
  id: "project-1",
  name: "XF Dimensions Template",
  description: "Sample import",
  sourceFileName: "XF Dimensions Template - 29.04.2026.xlsx",
  createdBy: "local-admin",
  createdAt: testTimestamp,
  updatedAt: testTimestamp
};

export const manualProject: ProjectRecord = {
  id: "project-manual",
  name: "Manual Metadata Project",
  description: "App-authored project",
  sourceFileName: "",
  createdBy: "local-admin",
  createdAt: testTimestamp,
  updatedAt: testTimestamp
};

export const sampleScenarioDimension: DimensionRecord = {
  id: "dim-scenario",
  projectId: sampleProject.id,
  sheetName: "Scenarios",
  dimensionType: "Scenario",
  dimensionName: "SampleScenario",
  description: "Corporate Standard Scenarios",
  accessGroup: "Everyone",
  maintenanceGroup: "Everyone",
  inheritedDimension: "",
  sortOrder: 1,
  metadata: {},
  createdAt: testTimestamp,
  updatedAt: testTimestamp
};

export function memberFixture(overrides: Partial<DimensionMemberRecord> = {}): DimensionMemberRecord {
  return {
    id: "member-1",
    dimensionId: sampleScenarioDimension.id,
    memberKey: "Actual",
    description: "Actual scenario",
    properties: { Entity: "Actual", Description: "Actual scenario" },
    rowOrder: 1,
    sourceRowNumber: 9,
    isActive: true,
    createdAt: testTimestamp,
    updatedAt: testTimestamp,
    ...overrides
  };
}

export function relationshipFixture(overrides: Partial<DimensionRelationshipRecord> = {}): DimensionRelationshipRecord {
  return {
    id: "relationship-1",
    dimensionId: sampleScenarioDimension.id,
    parentKey: "Root",
    childKey: "Actual",
    aggregationWeight: null,
    percentConsol: null,
    percentOwnership: null,
    ownershipType: "",
    properties: { Parent: "Root", Child: "Actual" },
    rowOrder: 1,
    sourceRowNumber: 16,
    createdAt: testTimestamp,
    updatedAt: testTimestamp,
    ...overrides
  };
}
