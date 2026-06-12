import { nanoid } from "nanoid";
import type { AppConfig } from "../shared/appConfigTypes";
import type { MetadataCsvCommitPlan } from "../shared/metadataCsvImport";
import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../shared/types";
import type { Repositories } from "./db/repositories";
import { runProjectValidation } from "./helpers/runValidation";

export interface MetadataCsvCommitResult {
  projectId: string;
  importSummary: Record<string, unknown>;
  validationIssues: number;
}

export async function applyMetadataCsvCommitPlan(
  repos: Repositories,
  config: AppConfig,
  plan: MetadataCsvCommitPlan
): Promise<MetadataCsvCommitResult> {
  const timestamp = new Date().toISOString();
  const projectId = await repos.transaction(async () => {
    let projectId = plan.projectId;
    if (plan.mode === "newProject") {
      const project = await repos.projects.create({
        name: plan.projectName,
        description: "Imported from simple parent-child CSV metadata.",
        sourceFileName: plan.sourceFileName,
        createdBy: "local-admin"
      });
      projectId = project.id;
    } else if (!projectId || !(await repos.projects.get(projectId))) {
      throw new Error("Existing project was not found.");
    }

    const dimensionIdByKey = new Map<string, string>();
    const existingDimensions = await repos.dimensions.listByProject(projectId!);
    for (const dimension of existingDimensions) {
      dimensionIdByKey.set(`${dimension.dimensionType}\u0000${dimension.dimensionName.trim().toLowerCase()}`, dimension.id);
    }

    let dimensionsCreated = 0;
    for (const dimensionPlan of plan.dimensions) {
      if (dimensionPlan.existingDimensionId) {
        dimensionIdByKey.set(dimensionPlan.key, dimensionPlan.existingDimensionId);
        continue;
      }
      const created = await repos.dimensions.create({
        projectId: projectId!,
        sheetName: dimensionPlan.dimensionName,
        dimensionType: dimensionPlan.dimensionType,
        dimensionName: dimensionPlan.dimensionName,
        description: dimensionPlan.description,
        accessGroup: "Everyone",
        maintenanceGroup: "Administrators",
        inheritedDimension: "",
        sortOrder: existingDimensions.length + dimensionsCreated + 1,
        metadata: {}
      });
      dimensionIdByKey.set(dimensionPlan.key, created.id);
      dimensionsCreated += 1;
    }

    const membersToInsert: DimensionMemberRecord[] = plan.membersToCreate.map((member) => {
      const dimensionId = dimensionIdByKey.get(member.dimensionKey);
      if (!dimensionId) throw new Error(`Dimension not resolved for ${member.dimensionKey}`);
      return {
        id: nanoid(),
        dimensionId,
        memberKey: member.memberKey,
        description: member.description,
        properties: member.properties,
        rowOrder: member.rowOrder,
        sourceRowNumber: member.sourceRowNumber,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });
    if (membersToInsert.length > 0) {
      await repos.members.bulkInsert(membersToInsert);
    }

    for (const update of plan.membersToUpdate) {
      await repos.members.update(update.memberId, { memberKey: update.memberKey, properties: update.properties });
    }

    const relationshipsToInsert: DimensionRelationshipRecord[] = plan.relationshipsToCreate.map((relationship) => {
      const dimensionId = dimensionIdByKey.get(relationship.dimensionKey);
      if (!dimensionId) throw new Error(`Dimension not resolved for ${relationship.dimensionKey}`);
      return {
        id: nanoid(),
        dimensionId,
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        aggregationWeight: 1,
        percentConsol: null,
        percentOwnership: null,
        ownershipType: "",
        properties: {},
        rowOrder: relationship.rowOrder,
        sourceRowNumber: relationship.sourceRowNumber,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });
    if (relationshipsToInsert.length > 0) {
      await repos.relationships.bulkInsert(relationshipsToInsert);
    }

    const auditAction = plan.mode === "newProject" ? "project.importCsv" : "project.importCsvAppend";
    repos.audit.record({
      projectId: projectId!,
      action: auditAction,
      entityType: "project",
      entityId: projectId!,
      after: {
        dimensionsCreated,
        membersCreated: membersToInsert.length,
        membersUpdated: plan.membersToUpdate.length,
        relationshipsCreated: relationshipsToInsert.length,
        relationshipsSkipped: 0,
        sourceFileName: plan.sourceFileName
      }
    });

    return projectId!;
  });

  const issues = await runProjectValidation(repos, config, projectId);
  return {
    projectId,
    validationIssues: issues.length,
    importSummary: {
      dimensionsImported: plan.dimensions.length,
      membersImported: plan.membersToCreate.length,
      membersUpdated: plan.membersToUpdate.length,
      relationshipsImported: plan.relationshipsToCreate.length,
      validationIssues: issues.length
    }
  };
}
