import type { BulkUpdatePreviewItem, BulkUpdateRequest } from "../shared/bulkUpdate";
import type { Repositories } from "./db/repositories";
import type { ProjectMetadataState } from "../shared/types";
import { applyMemberPreviewItem, applyRelationshipPreviewItem } from "./routes/bulkUpdates";

export async function applyBulkUpdatePreviewItems(
  repos: Repositories,
  projectId: string,
  state: ProjectMetadataState,
  previewItems: BulkUpdatePreviewItem[],
  options: {
    request: BulkUpdateRequest;
    auditAction: "bulkUpdate.apply" | "bulkUpdate.applyCsv";
    summary: Record<string, unknown>;
    createdBy?: string;
  }
) {
  const dimensionsById = new Map(state.dimensions.map((dimension) => [dimension.id, dimension]));
  const membersById = new Map(state.members.map((member) => [member.id, member]));
  const relationshipsById = new Map(state.relationships.map((relationship) => [relationship.id, relationship]));

  return repos.transaction(async () => {
    for (const item of previewItems) {
      const dimension = dimensionsById.get(item.dimensionId);
      if (!dimension) throw Object.assign(new Error("bulk update dimension target not found"), { status: 409 });

      if (item.targetType === "member") {
        const member = membersById.get(item.targetId);
        if (!member) throw Object.assign(new Error("bulk update member target not found"), { status: 409 });
        await applyMemberPreviewItem(repos, dimension, member, item.propertyName, item.newValue);
        const refreshed = (await repos.members.listByIds(dimension.id, [member.id]))[0];
        if (refreshed) membersById.set(member.id, refreshed);
      } else {
        const relationship = relationshipsById.get(item.targetId);
        if (!relationship) throw Object.assign(new Error("bulk update relationship target not found"), { status: 409 });
        await applyRelationshipPreviewItem(repos, relationship, item.propertyName, item.newValue);
        const refreshed = (await repos.relationships.listByIds(dimension.id, [relationship.id]))[0];
        if (refreshed) relationshipsById.set(relationship.id, refreshed);
      }
    }

    const warningCount = previewItems.reduce((count, item) => count + item.warnings.length, 0);
    const created = repos.bulkUpdates.createJobWithItems({
      projectId,
      targetType: options.request.targetType,
      operation: options.request.operation,
      request: options.request,
      summary: options.summary,
      rollback: previewItems.map((item) => ({
        targetType: item.targetType,
        targetId: item.targetId,
        propertyName: item.propertyName,
        oldValue: item.oldValue,
        newValue: item.newValue
      })),
      status: "applied",
      items: previewItems.map((item) => ({
        targetId: item.targetId,
        targetKey: item.targetKey,
        propertyName: item.propertyName,
        oldValue: item.oldValue,
        newValue: item.newValue,
        status: "applied",
        message: item.warnings.join("; ")
      })),
      createdBy: options.createdBy ?? "local-admin"
    });

    repos.audit.record({
      projectId,
      action: options.auditAction,
      entityType: "bulkUpdateJob",
      entityId: created.job.id,
      after: { summary: created.job.summary }
    });

    return created;
  });
}
