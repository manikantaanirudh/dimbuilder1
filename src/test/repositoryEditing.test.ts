import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";

describe("grid editing repositories", () => {
  it("lists and updates member and relationship rows by dimension", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Test",
      description: "",
      sourceFileName: "",
      createdBy: "local-admin"
    });
    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Scenarios",
      dimensionType: "Scenario",
      dimensionName: "SampleScenario",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Actual",
      description: "Actual scenario",
      properties: { Entity: "Actual", Description: "Actual scenario" },
      rowOrder: 1,
      sourceRowNumber: 9,
      isActive: true
    });
    const relationship = repos.relationships.create({
      dimensionId: dimension.id,
      parentKey: "Root",
      childKey: "Actual",
      aggregationWeight: null,
      percentConsol: null,
      percentOwnership: null,
      ownershipType: "",
      properties: { Parent: "Root", Child: "Actual" },
      rowOrder: 1,
      sourceRowNumber: 16
    });

    repos.members.update(member.id, {
      memberKey: "Actuals",
      properties: { Entity: "Actuals", Description: "Actual scenario" }
    });
    repos.relationships.update(relationship.id, {
      parentKey: "Root",
      childKey: "Actuals",
      properties: { Parent: "Root", Child: "Actuals" }
    });

    expect(repos.members.listByDimension(dimension.id)[0].memberKey).toBe("Actuals");
    expect(repos.relationships.listByDimension(dimension.id)[0].childKey).toBe("Actuals");
    db.close();
  });

  it("upserts and replaces varying property values by target/context", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Varying Properties",
      description: "",
      sourceFileName: "",
      createdBy: "local-admin"
    });
    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Accounts",
      dimensionType: "Account",
      dimensionName: "Accounts",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Revenue",
      description: "Revenue",
      properties: { Account: "Revenue", Text1: "Base" },
      rowOrder: 1,
      sourceRowNumber: 2,
      isActive: true
    });

    const created = repos.varyingProperties.upsertVaryingPropertyValue({
      projectId: project.id,
      dimensionId: dimension.id,
      targetType: "member",
      targetId: member.id,
      propertyName: "Text1",
      value: "Finance actual note",
      cubeType: "Finance",
      scenarioType: "Actual",
      timeMember: "2026M1",
      isDefault: false,
      source: "manual",
      metadata: { comment: "seed" }
    });
    const updated = repos.varyingProperties.upsertVaryingPropertyValue({
      projectId: project.id,
      dimensionId: dimension.id,
      targetType: "member",
      targetId: member.id,
      propertyName: "Text1",
      value: "Updated note",
      cubeType: "Finance",
      scenarioType: "Actual",
      timeMember: "2026M1",
      isDefault: false
    });

    expect(updated.id).toBe(created.id);
    expect(repos.varyingProperties.listVaryingPropertyValuesForTarget(project.id, "member", member.id)).toHaveLength(1);
    expect(repos.varyingProperties.listVaryingPropertyValues(project.id, { dimensionId: dimension.id })[0]).toMatchObject({
      propertyName: "Text1",
      value: "Updated note",
      cubeType: "Finance",
      scenarioType: "Actual",
      timeMember: "2026M1",
      isDefault: false
    });

    repos.varyingProperties.replaceVaryingPropertyValuesForTarget(project.id, "member", member.id, [
      {
        projectId: project.id,
        dimensionId: dimension.id,
        targetType: "member",
        targetId: member.id,
        propertyName: "Text2",
        value: "Default note",
        cubeType: "",
        scenarioType: "",
        timeMember: "",
        isDefault: true
      }
    ]);

    expect(repos.varyingProperties.listVaryingPropertyValuesForTarget(project.id, "member", member.id).map((row) => row.propertyName)).toEqual(["Text2"]);
    expect(repos.varyingProperties.getEffectivePropertyValue("Base", repos.varyingProperties.listVaryingPropertyValuesForTarget(project.id, "member", member.id), {
      cubeType: "Finance",
      scenarioType: "Actual",
      timeMember: "2026M1"
    })).toBe("Default note");

    repos.varyingProperties.deleteVaryingPropertyValue(project.id, repos.varyingProperties.listVaryingPropertyValues(project.id)[0].id);
    expect(repos.varyingProperties.listVaryingPropertyValues(project.id)).toEqual([]);
    db.close();
  });

  it("persists change sets, approvals, and release package records", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Release Package Project",
      description: "",
      sourceFileName: "",
      createdBy: "local-admin"
    });
    const baseline = repos.baselines.create({
      projectId: project.id,
      name: "Before release",
      sourceType: "snapshot",
      baseline: { dimensions: [], members: [], relationships: [] }
    });
    const diff = repos.diffRuns.createWithItems({
      projectId: project.id,
      baselineId: baseline.id,
      status: "completed",
      summary: {
        totalItems: 1,
        bySeverity: { info: 1, warning: 0, error: 0 },
        byChangeType: { add: 1, update: 0, delete: 0, move: 0, copy: 0, unchanged: 0, warning: 0 },
        members: { adds: 1, updates: 0, deletes: 0 },
        relationships: { adds: 0, deletes: 0, moves: 0, copies: 0 },
        properties: { updates: 0 },
        warnings: 0,
        errors: 0
      },
      items: [
        {
          dimensionType: "Account",
          dimensionName: "Accounts",
          targetType: "member",
          changeType: "add",
          severity: "info",
          objectKey: "Revenue",
          parentKey: "",
          childKey: "",
          propertyName: "",
          oldValue: "",
          newValue: "Revenue",
          details: { source: "test" }
        }
      ]
    });

    const changeSet = repos.changeSets.create({
      projectId: project.id,
      baselineId: baseline.id,
      diffRunId: diff.run.id,
      name: "Revenue release",
      description: "Promote Revenue member.",
      targetEnvironment: "Production",
      items: diff.items
    });
    const listed = repos.changeSets.listByProject(project.id);
    const updated = repos.changeSets.update(project.id, changeSet.id, { status: "validated" });
    repos.changeSets.recordApproval(project.id, changeSet.id, {
      action: "approve",
      comment: "Approved after validation.",
      createdBy: "local-admin"
    });
    const packageRecord = repos.changeSets.createReleasePackage({
      changeSetId: changeSet.id,
      packageName: "revenue-release",
      packagePath: "data/exports/release-packages/revenue-release",
      manifest: { packageName: "revenue-release", files: ["manifest.json"] }
    });
    const detail = repos.changeSets.getDetail(project.id, changeSet.id);

    expect(listed).toMatchObject([{ id: changeSet.id, status: "draft", targetEnvironment: "Production" }]);
    expect(updated).toMatchObject({ id: changeSet.id, status: "validated" });
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]).toMatchObject({ itemType: "member", changeType: "add", objectKey: "Revenue" });
    expect(detail?.approvals).toMatchObject([{ action: "approve", comment: "Approved after validation." }]);
    expect(detail?.latestPackage).toMatchObject({ id: packageRecord.id, packageName: "revenue-release" });
    db.close();
  });

  it("persists bulk update jobs and rolls back partial transactional edits", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Bulk Update Project",
      description: "",
      sourceFileName: "",
      createdBy: "local-admin"
    });
    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Accounts",
      dimensionType: "Account",
      dimensionName: "Accounts",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Revenue",
      description: "Revenue",
      properties: { Account: "Revenue", Text1: "Before" },
      rowOrder: 1,
      sourceRowNumber: 2,
      isActive: true
    });

    const created = repos.bulkUpdates.createJobWithItems({
      projectId: project.id,
      targetType: "member",
      operation: "set",
      request: { targetType: "member", operation: "set", propertyName: "Text1", value: "After", filter: { dimensionId: dimension.id } },
      summary: { affectedCount: 1, skippedCount: 0, warningCount: 0 },
      rollback: [{ targetType: "member", targetId: member.id, propertyName: "Text1", oldValue: "Before", newValue: "After" }],
      status: "applied",
      items: [
        {
          targetId: member.id,
          targetKey: "Revenue",
          propertyName: "Text1",
          oldValue: "Before",
          newValue: "After",
          status: "applied",
          message: ""
        }
      ]
    });

    expect(repos.bulkUpdates.listJobs(project.id)).toMatchObject([{ id: created.job.id, targetType: "member", operation: "set", status: "applied" }]);
    expect(repos.bulkUpdates.getJobDetail(project.id, created.job.id)?.items).toMatchObject([
      { targetId: member.id, targetKey: "Revenue", propertyName: "Text1", oldValue: "Before", newValue: "After", status: "applied" }
    ]);

    expect(() => repos.transaction<void>(() => {
      repos.members.update(member.id, {
        memberKey: "Revenue",
        properties: { Account: "Revenue", Text1: "Partial" }
      });
      repos.bulkUpdates.createJobWithItems({
        projectId: project.id,
        targetType: "member",
        operation: "set",
        request: { targetType: "member", operation: "set", propertyName: "Text1", value: "Partial", filter: { dimensionId: dimension.id } },
        summary: { affectedCount: 1, skippedCount: 0, warningCount: 0 },
        rollback: [],
        status: "failed",
        items: []
      });
      throw new Error("simulated failure");
    })).toThrow("simulated failure");

    expect(repos.members.listByDimension(dimension.id)[0].properties.Text1).toBe("Before");
    expect(repos.bulkUpdates.listJobs(project.id)).toHaveLength(1);
    db.close();
  });

  it("lists snapshots and restores a snapshot into the current project transactionally", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Snapshot Restore Project",
      description: "Before restore",
      sourceFileName: "",
      createdBy: "local-admin"
    });
    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Accounts",
      dimensionType: "Account",
      dimensionName: "Accounts",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Revenue",
      description: "Revenue",
      properties: { Account: "Revenue", Description: "Revenue", Text1: "Original" },
      rowOrder: 1,
      sourceRowNumber: 2,
      isActive: true
    });
    const relationship = repos.relationships.create({
      dimensionId: dimension.id,
      parentKey: "Root",
      childKey: "Revenue",
      aggregationWeight: 1,
      percentConsol: null,
      percentOwnership: null,
      ownershipType: "",
      properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 },
      rowOrder: 1,
      sourceRowNumber: 3
    });
    const varying = repos.varyingProperties.upsertVaryingPropertyValue({
      projectId: project.id,
      dimensionId: dimension.id,
      targetType: "member",
      targetId: member.id,
      propertyName: "Text1",
      value: "Original varying",
      cubeType: "Finance",
      scenarioType: "Actual",
      timeMember: "2026M1"
    });

    const snapshotId = repos.snapshots.create({
      projectId: project.id,
      name: "Original snapshot",
      description: "Restore point",
      snapshot: {
        project,
        dimensions: [dimension],
        members: [member],
        relationships: [relationship],
        varyingPropertyValues: [varying]
      }
    });
    expect(repos.snapshots.listByProject(project.id)).toMatchObject([{ id: snapshotId, name: "Original snapshot" }]);
    expect(repos.snapshots.get(project.id, snapshotId)).toMatchObject({ id: snapshotId, description: "Restore point" });

    repos.members.update(member.id, {
      memberKey: "RevenueRenamed",
      properties: { Account: "RevenueRenamed", Description: "Changed", Text1: "Changed" }
    });
    repos.relationships.delete(relationship.id);
    repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Temporary",
      description: "Temporary",
      properties: { Account: "Temporary" },
      rowOrder: 2,
      sourceRowNumber: 4,
      isActive: true
    });

    const summary = repos.snapshots.restoreSnapshotIntoProject(project.id, snapshotId);

    expect(summary).toMatchObject({
      mode: "replaceCurrent",
      projectId: project.id,
      snapshotId,
      dimensionsRestored: 1,
      membersRestored: 1,
      relationshipsRestored: 1,
      varyingPropertiesRestored: 1
    });
    expect(summary.safetySnapshotId).toBeTruthy();
    expect(repos.members.listByDimension(dimension.id).map((row) => row.memberKey)).toEqual(["Revenue"]);
    expect(repos.relationships.listByDimension(dimension.id)).toMatchObject([{ parentKey: "Root", childKey: "Revenue" }]);
    expect(repos.varyingProperties.listVaryingPropertyValues(project.id)).toMatchObject([{ targetId: member.id, value: "Original varying" }]);
    expect(repos.snapshots.listByProject(project.id)).toHaveLength(2);
    db.close();
  });

  it("creates a new project branch from a snapshot and remaps record ids", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Snapshot Source Project",
      description: "",
      sourceFileName: "",
      createdBy: "local-admin"
    });
    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Accounts",
      dimensionType: "Account",
      dimensionName: "Accounts",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Revenue",
      description: "Revenue",
      properties: { Account: "Revenue", Text1: "Original" },
      rowOrder: 1,
      sourceRowNumber: 2,
      isActive: true
    });
    const relationship = repos.relationships.create({
      dimensionId: dimension.id,
      parentKey: "Root",
      childKey: "Revenue",
      aggregationWeight: 1,
      percentConsol: null,
      percentOwnership: null,
      ownershipType: "",
      properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 },
      rowOrder: 1,
      sourceRowNumber: 3
    });
    const varying = repos.varyingProperties.upsertVaryingPropertyValue({
      projectId: project.id,
      dimensionId: dimension.id,
      targetType: "member",
      targetId: member.id,
      propertyName: "Text1",
      value: "Original varying"
    });
    const snapshotId = repos.snapshots.create({
      projectId: project.id,
      name: "Branch source",
      description: "",
      snapshot: {
        project,
        dimensions: [dimension],
        members: [member],
        relationships: [relationship],
        varyingPropertyValues: [varying]
      }
    });

    const result = repos.snapshots.createProjectFromSnapshot(snapshotId, "Branch Project");
    const branchDimensions = repos.dimensions.listByProject(result.project.id);
    const branchMembers = repos.members.listByProject(result.project.id);
    const branchRelationships = repos.relationships.listByProject(result.project.id);
    const branchVarying = repos.varyingProperties.listVaryingPropertyValues(result.project.id);

    expect(result.project).toMatchObject({ name: "Branch Project", createdBy: "local-admin" });
    expect(result.project.id).not.toBe(project.id);
    expect(branchDimensions).toMatchObject([{ dimensionName: "Accounts", projectId: result.project.id }]);
    expect(branchDimensions[0].id).not.toBe(dimension.id);
    expect(branchMembers).toMatchObject([{ memberKey: "Revenue", dimensionId: branchDimensions[0].id }]);
    expect(branchMembers[0].id).not.toBe(member.id);
    expect(branchRelationships).toMatchObject([{ parentKey: "Root", childKey: "Revenue", dimensionId: branchDimensions[0].id }]);
    expect(branchRelationships[0].id).not.toBe(relationship.id);
    expect(branchVarying).toMatchObject([{ dimensionId: branchDimensions[0].id, targetId: branchMembers[0].id, value: "Original varying" }]);
    expect(result.summary).toMatchObject({ mode: "newProject", dimensionsRestored: 1, membersRestored: 1, relationshipsRestored: 1, varyingPropertiesRestored: 1 });
    db.close();
  });
});
