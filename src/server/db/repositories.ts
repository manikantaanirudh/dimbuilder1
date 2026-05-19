import { nanoid } from "nanoid";
import type { AppDatabase } from "./database";
import type {
  BulkUpdateItemRecord,
  BulkUpdateItemStatus,
  BulkUpdateJobRecord,
  BulkUpdateJobStatus,
  BulkUpdateOperation,
  BulkUpdateRequest,
  BulkUpdateTarget
} from "../../shared/bulkUpdate";
import type {
  BaselineSourceType,
  ChangeSetApprovalAction,
  ChangeSetApprovalRecord,
  ChangeSetItemRecord,
  ChangeSetRecord,
  ChangeSetStatus,
  DashboardSummary,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType,
  MetadataDiffItemRecord,
  MetadataDiffRunRecord,
  MetadataDiffStatus,
  MetadataDiffSummary,
  ProjectMetadataState,
  ProjectBaselineRecord,
  ProjectRecord,
  ProjectSnapshotRecord,
  ProjectSnapshotState,
  ProjectSnapshotSummaryRecord,
  ReleasePackageRecord,
  SnapshotRestoreSummary,
  VaryingPropertyContext,
  VaryingPropertyTargetType,
  VaryingPropertyValueFilters,
  VaryingPropertyValueInput,
  VaryingPropertyValueRecord,
  ValidationIssue
} from "../../shared/types";
import { getEffectivePropertyValue } from "../../shared/varyingProperties";

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface CreateProjectInput {
  name: string;
  description: string;
  sourceFileName: string;
  createdBy: string;
}

let transactionCounter = 0;

export function createRepositories(db: AppDatabase) {
  return {
    // Synchronous-only savepoint boundary. TypeScript rejects normal async/Promise-like
    // callbacks, and runtime rejects native async callbacks plus returned thenables.
    // Callers must not start async work inside the callback (async IIFEs, timers, etc.):
    // JavaScript cannot cancel scheduled continuations after the transaction returns.
    transaction<T>(action: () => T, ..._guard: T extends PromiseLike<unknown> ? [never] : []): T {
      return runInTransaction(db, action);
    },
    projects: {
      create(input: CreateProjectInput): ProjectRecord {
        const createdAt = now();
        const project: ProjectRecord = {
          id: nanoid(),
          name: input.name,
          description: input.description,
          sourceFileName: input.sourceFileName,
          createdBy: input.createdBy,
          createdAt,
          updatedAt: createdAt
        };

        db.prepare(`
          INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(project.id, project.name, project.description, project.sourceFileName, project.createdBy, project.createdAt, project.updatedAt);

        return project;
      },
      list(): ProjectRecord[] {
        return db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(mapProject);
      },
      get(projectId: string): ProjectRecord | null {
        const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        return row ? mapProject(row) : null;
      },
      delete(projectId: string): void {
        db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      },
      summary(projectId: string): DashboardSummary {
        const dimensions = this.getDimensions(projectId);
        return {
          totalDimensions: Number(db.prepare("SELECT COUNT(*) AS count FROM dimensions WHERE project_id = ?").get(projectId)?.count ?? 0),
          totalMembers: Number(db.prepare(`
            SELECT COUNT(*) AS count FROM dimension_members m
            JOIN dimensions d ON d.id = m.dimension_id
            WHERE d.project_id = ? AND m.is_active = 1
          `).get(projectId)?.count ?? 0),
          totalRelationships: Number(db.prepare(`
            SELECT COUNT(*) AS count FROM dimension_relationships r
            JOIN dimensions d ON d.id = r.dimension_id
            WHERE d.project_id = ?
          `).get(projectId)?.count ?? 0),
          validationErrors: Number(db.prepare("SELECT COUNT(*) AS count FROM validation_issues WHERE project_id = ? AND severity = 'error'").get(projectId)?.count ?? 0),
          validationWarnings: Number(db.prepare("SELECT COUNT(*) AS count FROM validation_issues WHERE project_id = ? AND severity = 'warning'").get(projectId)?.count ?? 0),
          recentDimensions: dimensions.slice(0, 5)
        };
      },
      getDimensions(projectId: string): DimensionRecord[] {
        return db.prepare("SELECT * FROM dimensions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 5").all(projectId).map(mapDimension);
      }
    },
    dimensions: {
      create(input: Omit<DimensionRecord, "id" | "createdAt" | "updatedAt">): DimensionRecord {
        const createdAt = now();
        const dimension: DimensionRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };

        db.prepare(`
          INSERT INTO dimensions (
            id, project_id, sheet_name, dimension_type, dimension_name, description, access_group,
            maintenance_group, inherited_dimension, sort_order, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          dimension.id,
          dimension.projectId,
          dimension.sheetName,
          dimension.dimensionType,
          dimension.dimensionName,
          dimension.description,
          dimension.accessGroup,
          dimension.maintenanceGroup,
          dimension.inheritedDimension,
          dimension.sortOrder,
          JSON.stringify(dimension.metadata),
          dimension.createdAt,
          dimension.updatedAt
        );

        return dimension;
      },
      listByProject(projectId: string): DimensionRecord[] {
        return db.prepare("SELECT * FROM dimensions WHERE project_id = ? ORDER BY sort_order").all(projectId).map(mapDimension);
      },
      get(dimensionId: string): DimensionRecord | null {
        const row = db.prepare("SELECT * FROM dimensions WHERE id = ?").get(dimensionId);
        return row ? mapDimension(row) : null;
      },
      update(dimensionId: string, input: Partial<Pick<DimensionRecord, "dimensionName" | "description" | "accessGroup" | "maintenanceGroup" | "inheritedDimension" | "metadata">>): void {
        const current = this.get(dimensionId);
        if (!current) return;
        db.prepare(`
          UPDATE dimensions
          SET dimension_name = ?, description = ?, access_group = ?, maintenance_group = ?,
              inherited_dimension = ?, metadata_json = ?, updated_at = ?
          WHERE id = ?
        `).run(
          input.dimensionName ?? current.dimensionName,
          input.description ?? current.description,
          input.accessGroup ?? current.accessGroup,
          input.maintenanceGroup ?? current.maintenanceGroup,
          input.inheritedDimension ?? current.inheritedDimension,
          JSON.stringify(input.metadata ?? current.metadata),
          now(),
          dimensionId
        );
      }
    },
    members: {
      bulkInsert(records: DimensionMemberRecord[]): void {
        runInTransaction(db, () => {
          const stmt = db.prepare(`
            INSERT INTO dimension_members (
              id, dimension_id, member_key, description, properties_json, row_order,
              source_row_number, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const record of records) {
            stmt.run(
              record.id,
              record.dimensionId,
              record.memberKey,
              record.description,
              JSON.stringify(record.properties),
              record.rowOrder,
              record.sourceRowNumber,
              record.isActive ? 1 : 0,
              record.createdAt,
              record.updatedAt
            );
          }
        });
      },
      create(input: Omit<DimensionMemberRecord, "id" | "createdAt" | "updatedAt">): DimensionMemberRecord {
        const createdAt = now();
        const record: DimensionMemberRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };
        this.bulkInsert([record]);
        return record;
      },
      listByDimension(dimensionId: string, paging = { offset: 0, limit: 200 }): DimensionMemberRecord[] {
        return db.prepare(`
          SELECT * FROM dimension_members
          WHERE dimension_id = ? AND is_active = 1
          ORDER BY row_order
          LIMIT ? OFFSET ?
        `).all(dimensionId, paging.limit, paging.offset).map(mapMember);
      },
      listByProject(projectId: string): DimensionMemberRecord[] {
        return db.prepare(`
          SELECT m.* FROM dimension_members m
          JOIN dimensions d ON d.id = m.dimension_id
          WHERE d.project_id = ? AND m.is_active = 1
          ORDER BY d.sort_order, m.row_order
        `).all(projectId).map(mapMember);
      },
      countByDimension(dimensionId: string): number {
        return Number(db.prepare("SELECT COUNT(*) AS count FROM dimension_members WHERE dimension_id = ? AND is_active = 1").get(dimensionId)?.count ?? 0);
      },
      update(id: string, input: { memberKey: string; properties: Record<string, unknown> }): void {
        const description = String(input.properties.Description ?? "");
        db.prepare(`
          UPDATE dimension_members
          SET member_key = ?, description = ?, properties_json = ?, updated_at = ?
          WHERE id = ?
        `).run(input.memberKey, description, JSON.stringify(input.properties), now(), id);
      },
      softDelete(id: string): void {
        db.prepare("UPDATE dimension_members SET is_active = 0, updated_at = ? WHERE id = ?").run(now(), id);
      }
    },
    relationships: {
      bulkInsert(records: DimensionRelationshipRecord[]): void {
        runInTransaction(db, () => {
          const stmt = db.prepare(`
            INSERT INTO dimension_relationships (
              id, dimension_id, parent_key, child_key, aggregation_weight, percent_consol,
              percent_ownership, ownership_type, properties_json, operation, operation_source,
              operation_notes, row_order, source_row_number,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const record of records) {
            stmt.run(
              record.id,
              record.dimensionId,
              record.parentKey,
              record.childKey,
              record.aggregationWeight,
              record.percentConsol,
              record.percentOwnership,
              record.ownershipType,
              JSON.stringify(record.properties),
              record.operation || null,
              record.operationSource || null,
              record.operationNotes || null,
              record.rowOrder,
              record.sourceRowNumber,
              record.createdAt,
              record.updatedAt
            );
          }
        });
      },
      create(input: Omit<DimensionRelationshipRecord, "id" | "createdAt" | "updatedAt">): DimensionRelationshipRecord {
        const createdAt = now();
        const record: DimensionRelationshipRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };
        this.bulkInsert([record]);
        return record;
      },
      listByDimension(dimensionId: string, paging = { offset: 0, limit: 200 }): DimensionRelationshipRecord[] {
        return db.prepare(`
          SELECT * FROM dimension_relationships
          WHERE dimension_id = ?
          ORDER BY row_order
          LIMIT ? OFFSET ?
        `).all(dimensionId, paging.limit, paging.offset).map(mapRelationship);
      },
      listByProject(projectId: string): DimensionRelationshipRecord[] {
        return db.prepare(`
          SELECT r.* FROM dimension_relationships r
          JOIN dimensions d ON d.id = r.dimension_id
          WHERE d.project_id = ?
          ORDER BY d.sort_order, r.row_order
        `).all(projectId).map(mapRelationship);
      },
      countByDimension(dimensionId: string): number {
        return Number(db.prepare("SELECT COUNT(*) AS count FROM dimension_relationships WHERE dimension_id = ?").get(dimensionId)?.count ?? 0);
      },
      update(id: string, input: {
        parentKey: string;
        childKey: string;
        properties: Record<string, unknown>;
        operation?: DimensionRelationshipRecord["operation"];
        operationSource?: string;
        operationNotes?: string;
      }): void {
        const current = db.prepare("SELECT * FROM dimension_relationships WHERE id = ?").get(id);
        const nextAggregationWeight = nullableNumber(input.properties["Aggregation Weight"] ?? current?.aggregation_weight);
        const nextPercentConsol = nullableNumber(input.properties["Percent Consol"] ?? current?.percent_consol);
        const nextPercentOwnership = nullableNumber(input.properties["Percent Ownership"] ?? current?.percent_ownership);
        const nextOwnershipType = input.properties["Ownership Type"] !== undefined
          ? String(input.properties["Ownership Type"] ?? "")
          : String(current?.ownership_type ?? "");
        db.prepare(`
          UPDATE dimension_relationships
          SET parent_key = ?, child_key = ?, aggregation_weight = ?, percent_consol = ?,
              percent_ownership = ?, ownership_type = ?, properties_json = ?,
              operation = ?, operation_source = ?, operation_notes = ?, updated_at = ?
          WHERE id = ?
        `).run(
          input.parentKey,
          input.childKey,
          nextAggregationWeight,
          nextPercentConsol,
          nextPercentOwnership,
          nextOwnershipType,
          JSON.stringify(input.properties),
          (input.operation ?? String(current?.operation ?? "")) || null,
          (input.operationSource ?? String(current?.operation_source ?? "")) || null,
          (input.operationNotes ?? String(current?.operation_notes ?? "")) || null,
          now(),
          id
        );
      },
      delete(id: string): void {
        db.prepare("DELETE FROM dimension_relationships WHERE id = ?").run(id);
      }
    },
    varyingProperties: {
      listVaryingPropertyValues(projectId: string, filters: VaryingPropertyValueFilters = {}): VaryingPropertyValueRecord[] {
        const conditions = ["project_id = ?"];
        const values: unknown[] = [projectId];
        if (filters.dimensionId) {
          conditions.push("dimension_id = ?");
          values.push(filters.dimensionId);
        }
        if (filters.targetType) {
          conditions.push("target_type = ?");
          values.push(filters.targetType);
        }
        if (filters.targetId) {
          conditions.push("target_id = ?");
          values.push(filters.targetId);
        }
        if (filters.propertyName) {
          conditions.push("property_name = ?");
          values.push(filters.propertyName);
        }
        return db.prepare(`
          SELECT * FROM varying_property_values
          WHERE ${conditions.join(" AND ")}
          ORDER BY dimension_id, target_type, target_id, property_name, cube_type, scenario_type, time_member, created_at, id
        `).all(...values).map(mapVaryingPropertyValue);
      },
      listVaryingPropertyValuesForTarget(projectId: string, targetType: VaryingPropertyTargetType, targetId: string): VaryingPropertyValueRecord[] {
        return this.listVaryingPropertyValues(projectId, { targetType, targetId });
      },
      upsertVaryingPropertyValue(input: VaryingPropertyValueInput): VaryingPropertyValueRecord {
        const timestamp = now();
        const id = nanoid();
        const normalized = normalizeVaryingPropertyInput(input);
        db.prepare(`
          INSERT INTO varying_property_values (
            id, project_id, dimension_id, target_type, target_id, property_name, value,
            cube_type, scenario_type, time_member, is_default, source, metadata_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, target_type, target_id, property_name, cube_type, scenario_type, time_member)
          DO UPDATE SET
            dimension_id = excluded.dimension_id,
            value = excluded.value,
            is_default = excluded.is_default,
            source = excluded.source,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `).run(
          id,
          normalized.projectId,
          normalized.dimensionId,
          normalized.targetType,
          normalized.targetId,
          normalized.propertyName,
          normalized.value,
          normalized.cubeType,
          normalized.scenarioType,
          normalized.timeMember,
          normalized.isDefault ? 1 : 0,
          normalized.source,
          JSON.stringify(normalized.metadata),
          timestamp,
          timestamp
        );
        const row = this.findByUniqueContext(normalized);
        if (!row) throw new Error("Failed to upsert varying property value.");
        return row;
      },
      updateVaryingPropertyValue(projectId: string, valueId: string, input: Partial<VaryingPropertyValueInput>): VaryingPropertyValueRecord | null {
        const current = this.getVaryingPropertyValue(projectId, valueId);
        if (!current) return null;
        const next = normalizeVaryingPropertyInput({
          projectId,
          dimensionId: input.dimensionId ?? current.dimensionId,
          targetType: input.targetType ?? current.targetType,
          targetId: input.targetId ?? current.targetId,
          propertyName: input.propertyName ?? current.propertyName,
          value: input.value ?? current.value,
          cubeType: input.cubeType ?? current.cubeType,
          scenarioType: input.scenarioType ?? current.scenarioType,
          timeMember: input.timeMember ?? current.timeMember,
          isDefault: input.isDefault ?? current.isDefault,
          source: input.source ?? current.source,
          metadata: input.metadata ?? current.metadata
        });
        db.prepare(`
          UPDATE varying_property_values
          SET dimension_id = ?, target_type = ?, target_id = ?, property_name = ?, value = ?,
              cube_type = ?, scenario_type = ?, time_member = ?, is_default = ?,
              source = ?, metadata_json = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
        `).run(
          next.dimensionId,
          next.targetType,
          next.targetId,
          next.propertyName,
          next.value,
          next.cubeType,
          next.scenarioType,
          next.timeMember,
          next.isDefault ? 1 : 0,
          next.source,
          JSON.stringify(next.metadata),
          now(),
          projectId,
          valueId
        );
        return this.getVaryingPropertyValue(projectId, valueId);
      },
      deleteVaryingPropertyValue(projectId: string, valueId: string): void {
        db.prepare("DELETE FROM varying_property_values WHERE project_id = ? AND id = ?").run(projectId, valueId);
      },
      replaceVaryingPropertyValuesForTarget(
        projectId: string,
        targetType: VaryingPropertyTargetType,
        targetId: string,
        values: VaryingPropertyValueInput[]
      ): VaryingPropertyValueRecord[] {
        return runInTransaction(db, () => {
          db.prepare("DELETE FROM varying_property_values WHERE project_id = ? AND target_type = ? AND target_id = ?").run(projectId, targetType, targetId);
          return values.map((value) => this.upsertVaryingPropertyValue({ ...value, projectId, targetType, targetId }));
        });
      },
      getEffectivePropertyValue(baseValue: unknown, varyingValues: VaryingPropertyValueRecord[], context: VaryingPropertyContext): string {
        return getEffectivePropertyValue(baseValue, varyingValues, context);
      },
      getVaryingPropertyValue(projectId: string, valueId: string): VaryingPropertyValueRecord | null {
        const row = db.prepare("SELECT * FROM varying_property_values WHERE project_id = ? AND id = ?").get(projectId, valueId);
        return row ? mapVaryingPropertyValue(row) : null;
      },
      findByUniqueContext(input: VaryingPropertyValueInput): VaryingPropertyValueRecord | null {
        const normalized = normalizeVaryingPropertyInput(input);
        const row = db.prepare(`
          SELECT * FROM varying_property_values
          WHERE project_id = ? AND target_type = ? AND target_id = ? AND property_name = ?
            AND cube_type = ? AND scenario_type = ? AND time_member = ?
        `).get(
          normalized.projectId,
          normalized.targetType,
          normalized.targetId,
          normalized.propertyName,
          normalized.cubeType,
          normalized.scenarioType,
          normalized.timeMember
        );
        return row ? mapVaryingPropertyValue(row) : null;
      }
    },
    bulkUpdates: {
      createJobWithItems(input: {
        projectId: string;
        targetType: BulkUpdateTarget;
        operation: BulkUpdateOperation;
        request: BulkUpdateRequest;
        summary: Record<string, unknown>;
        rollback: unknown;
        status: BulkUpdateJobStatus;
        items: Array<{
          targetId: string;
          targetKey: string;
          propertyName: string;
          oldValue: string;
          newValue: string;
          status: BulkUpdateItemStatus;
          message?: string;
        }>;
        createdBy?: string;
      }): { job: BulkUpdateJobRecord; items: BulkUpdateItemRecord[] } {
        return runInTransaction(db, () => {
          const id = nanoid();
          const createdAt = now();
          db.prepare(`
            INSERT INTO bulk_update_jobs (
              id, project_id, target_type, operation, request_json, summary_json,
              rollback_json, status, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            input.projectId,
            input.targetType,
            input.operation,
            JSON.stringify(input.request),
            JSON.stringify(input.summary),
            JSON.stringify(input.rollback ?? []),
            input.status,
            input.createdBy ?? "local-admin",
            createdAt
          );

          const stmt = db.prepare(`
            INSERT INTO bulk_update_items (
              id, job_id, target_id, target_key, property_name, old_value,
              new_value, status, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of input.items) {
            stmt.run(
              nanoid(),
              id,
              item.targetId,
              item.targetKey,
              item.propertyName,
              item.oldValue,
              item.newValue,
              item.status,
              item.message ?? ""
            );
          }

          const detail = this.getJobDetail(input.projectId, id);
          if (!detail) throw new Error("Failed to create bulk update job.");
          return detail;
        });
      },
      listJobs(projectId: string): BulkUpdateJobRecord[] {
        return db.prepare(`
          SELECT * FROM bulk_update_jobs
          WHERE project_id = ?
          ORDER BY created_at DESC, id
        `).all(projectId).map(mapBulkUpdateJob);
      },
      getJob(projectId: string, jobId: string): BulkUpdateJobRecord | null {
        const row = db.prepare("SELECT * FROM bulk_update_jobs WHERE project_id = ? AND id = ?").get(projectId, jobId);
        return row ? mapBulkUpdateJob(row) : null;
      },
      listItems(jobId: string): BulkUpdateItemRecord[] {
        return db.prepare(`
          SELECT * FROM bulk_update_items
          WHERE job_id = ?
          ORDER BY target_key, property_name, id
        `).all(jobId).map(mapBulkUpdateItem);
      },
      getJobDetail(projectId: string, jobId: string): { job: BulkUpdateJobRecord; items: BulkUpdateItemRecord[] } | null {
        const job = this.getJob(projectId, jobId);
        if (!job) return null;
        return { job, items: this.listItems(job.id) };
      }
    },
    issues: {
      replaceForProject(projectId: string, issues: ValidationIssue[]): void {
        runInTransaction(db, () => {
          db.prepare("DELETE FROM validation_issues WHERE project_id = ?").run(projectId);
          const stmt = db.prepare(`
            INSERT INTO validation_issues (
              id, project_id, dimension_id, entity_type, entity_id, severity, code,
              message, field_name, row_number, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const issue of issues) {
            stmt.run(
              issue.id,
              issue.projectId,
              issue.dimensionId,
              issue.entityType,
              issue.entityId,
              issue.severity,
              issue.code,
              issue.message,
              issue.fieldName,
              issue.rowNumber,
              issue.createdAt
            );
          }
        });
      },
      listByProject(projectId: string): ValidationIssue[] {
        return db.prepare("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY severity, row_number").all(projectId).map(mapIssue);
      },
      listValidationIssuesForProject(projectId: string): ValidationIssue[] {
        return db.prepare("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY severity, row_number").all(projectId).map(mapIssue);
      },
      hasBlockingValidationIssues(projectId: string, blockedSeverities: string[]): boolean {
        if (blockedSeverities.length === 0) return false;
        const placeholders = blockedSeverities.map(() => "?").join(", ");
        const row = db.prepare(`
          SELECT COUNT(*) AS count
          FROM validation_issues
          WHERE project_id = ? AND severity IN (${placeholders})
        `).get(projectId, ...blockedSeverities) as { count?: number } | undefined;
        return Number(row?.count ?? 0) > 0;
      },
      hasValidationRun(projectId: string): boolean {
        const row = db.prepare(`
          SELECT COUNT(*) AS count
          FROM audit_logs
          WHERE project_id = ?
            AND action IN ('validation.run', 'project.import', 'project.importXml', 'changeSet.validate', 'changeSet.approve', 'changeSet.package')
        `).get(projectId) as { count?: number } | undefined;
        return Number(row?.count ?? 0) > 0;
      }
    },
    audit: {
      record(input: { projectId: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; userId?: string }): void {
        db.prepare(`
          INSERT INTO audit_logs (id, project_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          nanoid(),
          input.projectId,
          input.userId ?? "local-admin",
          input.action,
          input.entityType,
          input.entityId,
          JSON.stringify(input.before ?? {}),
          JSON.stringify(input.after ?? {}),
          now()
        );
      }
    },
    snapshots: {
      create(input: { projectId: string; name: string; description: string; snapshot: unknown; createdBy?: string }): string {
        const id = nanoid();
        db.prepare(`
          INSERT INTO project_snapshots (id, project_id, name, description, snapshot_json, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.projectId, input.name, input.description, JSON.stringify(input.snapshot), input.createdBy ?? "local-admin", now());
        return id;
      },
      listByProject(projectId: string): ProjectSnapshotSummaryRecord[] {
        return db.prepare(`
          SELECT id, project_id, name, description, created_by, created_at FROM project_snapshots
          WHERE project_id = ?
          ORDER BY created_at DESC, id
        `).all(projectId).map(mapProjectSnapshotSummary);
      },
      get(projectId: string, snapshotId: string): ProjectSnapshotRecord | null {
        const row = db.prepare("SELECT * FROM project_snapshots WHERE project_id = ? AND id = ?").get(projectId, snapshotId);
        return row ? mapProjectSnapshot(row) : null;
      },
      restoreSnapshotIntoProject(projectId: string, snapshotId: string, options: { createdBy?: string; restoreValidationIssues?: boolean } = {}): SnapshotRestoreSummary {
        return runInTransaction(db, () => {
          const snapshot = this.get(projectId, snapshotId);
          if (!snapshot) throw new Error("Snapshot not found.");
          const safetySnapshotId = createProjectSnapshotRow(db, {
            projectId,
            name: `Safety snapshot before restore ${new Date().toISOString()}`,
            description: `Automatic safety snapshot created before restoring ${snapshot.name}.`,
            snapshot: buildProjectSnapshotState(db, projectId),
            createdBy: options.createdBy ?? "local-admin"
          });

          deleteProjectMetadata(db, projectId);
          insertSnapshotStateIntoProject(db, projectId, snapshot.snapshot, {
            preserveIds: true,
            restoreValidationIssues: Boolean(options.restoreValidationIssues)
          });
          db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), projectId);

          return {
            mode: "replaceCurrent",
            projectId,
            snapshotId,
            safetySnapshotId,
            dimensionsRestored: snapshot.snapshot.dimensions.length,
            membersRestored: snapshot.snapshot.members.length,
            relationshipsRestored: snapshot.snapshot.relationships.length,
            varyingPropertiesRestored: snapshot.snapshot.varyingPropertyValues?.length ?? 0
          };
        });
      },
      createProjectFromSnapshot(snapshotId: string, newProjectName: string, options: { createdBy?: string; description?: string } = {}): { project: ProjectRecord; summary: SnapshotRestoreSummary } {
        return runInTransaction(db, () => {
          const row = db.prepare("SELECT * FROM project_snapshots WHERE id = ?").get(snapshotId);
          if (!row) throw new Error("Snapshot not found.");
          const snapshot = mapProjectSnapshot(row);
          const sourceProject = snapshot.snapshot.project;
          const createdAt = now();
          const project: ProjectRecord = {
            id: nanoid(),
            name: newProjectName.trim() || `${sourceProject?.name ?? snapshot.name} branch`,
            description: options.description ?? sourceProject?.description ?? "",
            sourceFileName: sourceProject?.sourceFileName ?? "",
            createdBy: options.createdBy ?? "local-admin",
            createdAt,
            updatedAt: createdAt
          };
          db.prepare(`
            INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(project.id, project.name, project.description, project.sourceFileName, project.createdBy, project.createdAt, project.updatedAt);

          const summary = insertSnapshotStateIntoProject(db, project.id, snapshot.snapshot, {
            preserveIds: false,
            restoreValidationIssues: false
          });

          return {
            project,
            summary: {
              mode: "newProject",
              projectId: project.id,
              snapshotId,
              dimensionsRestored: summary.dimensionsRestored,
              membersRestored: summary.membersRestored,
              relationshipsRestored: summary.relationshipsRestored,
              varyingPropertiesRestored: summary.varyingPropertiesRestored
            }
          };
        });
      }
    },
    baselines: {
      create(input: { projectId: string; name: string; sourceType: BaselineSourceType; sourceFileName?: string; baseline: unknown; createdBy?: string }): ProjectBaselineRecord {
        const id = nanoid();
        const createdAt = now();
        db.prepare(`
          INSERT INTO project_baselines (id, project_id, name, source_type, source_file_name, baseline_json, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.projectId,
          input.name,
          input.sourceType,
          input.sourceFileName ?? "",
          JSON.stringify(input.baseline),
          input.createdBy ?? "local-admin",
          createdAt
        );
        const baseline = this.get(input.projectId, id);
        if (!baseline) throw new Error("Failed to create project baseline.");
        return baseline;
      },
      listByProject(projectId: string): ProjectBaselineRecord[] {
        return db.prepare("SELECT * FROM project_baselines WHERE project_id = ? ORDER BY created_at DESC, name").all(projectId).map(mapProjectBaseline);
      },
      get(projectId: string, baselineId: string): ProjectBaselineRecord | null {
        const row = db.prepare("SELECT * FROM project_baselines WHERE project_id = ? AND id = ?").get(projectId, baselineId);
        return row ? mapProjectBaseline(row) : null;
      }
    },
    diffRuns: {
      createWithItems(input: {
        projectId: string;
        baselineId: string;
        status: MetadataDiffStatus;
        summary: MetadataDiffSummary;
        items: Array<Omit<MetadataDiffItemRecord, "id" | "diffRunId">>;
        createdBy?: string;
      }): { run: MetadataDiffRunRecord; items: MetadataDiffItemRecord[] } {
        return runInTransaction(db, () => {
          const runId = nanoid();
          const createdAt = now();
          db.prepare(`
            INSERT INTO metadata_diff_runs (id, project_id, baseline_id, status, summary_json, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            runId,
            input.projectId,
            input.baselineId,
            input.status,
            JSON.stringify(input.summary),
            input.createdBy ?? "local-admin",
            createdAt
          );

          const stmt = db.prepare(`
            INSERT INTO metadata_diff_items (
              id, diff_run_id, dimension_type, dimension_name, target_type, change_type,
              severity, object_key, parent_key, child_key, property_name, old_value,
              new_value, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of input.items) {
            stmt.run(
              nanoid(),
              runId,
              item.dimensionType,
              item.dimensionName,
              item.targetType,
              item.changeType,
              item.severity,
              item.objectKey,
              item.parentKey,
              item.childKey,
              item.propertyName,
              item.oldValue,
              item.newValue,
              JSON.stringify(item.details)
            );
          }

          const run = this.get(input.projectId, runId);
          if (!run) throw new Error("Failed to create metadata diff run.");
          return {
            run,
            items: this.listItems(runId)
          };
        });
      },
      get(projectId: string, diffRunId: string): MetadataDiffRunRecord | null {
        const row = db.prepare("SELECT * FROM metadata_diff_runs WHERE project_id = ? AND id = ?").get(projectId, diffRunId);
        return row ? mapMetadataDiffRun(row) : null;
      },
      listByProject(projectId: string): MetadataDiffRunRecord[] {
        return db.prepare("SELECT * FROM metadata_diff_runs WHERE project_id = ? ORDER BY created_at DESC, id").all(projectId).map(mapMetadataDiffRun);
      },
      getLatest(projectId: string): MetadataDiffRunRecord | null {
        const row = db.prepare("SELECT * FROM metadata_diff_runs WHERE project_id = ? ORDER BY created_at DESC, id LIMIT 1").get(projectId);
        return row ? mapMetadataDiffRun(row) : null;
      },
      listItems(diffRunId: string): MetadataDiffItemRecord[] {
        return db.prepare(`
          SELECT * FROM metadata_diff_items
          WHERE diff_run_id = ?
          ORDER BY dimension_name, target_type, change_type, object_key, property_name, parent_key, child_key, id
        `).all(diffRunId).map(mapMetadataDiffItem);
      }
    },
    changeSets: {
      create(input: {
        projectId: string;
        baselineId?: string;
        diffRunId?: string;
        name: string;
        description?: string;
        targetEnvironment?: string;
        status?: ChangeSetStatus;
        items?: MetadataDiffItemRecord[];
        createdBy?: string;
      }): ChangeSetRecord {
        return runInTransaction(db, () => {
          const id = nanoid();
          const timestamp = now();
          db.prepare(`
            INSERT INTO change_sets (
              id, project_id, baseline_id, diff_run_id, name, description, status,
              target_environment, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            input.projectId,
            input.baselineId || null,
            input.diffRunId || null,
            input.name,
            input.description ?? "",
            input.status ?? "draft",
            input.targetEnvironment ?? "",
            input.createdBy ?? "local-admin",
            timestamp,
            timestamp
          );

          const stmt = db.prepare(`
            INSERT INTO change_set_items (
              id, change_set_id, diff_item_id, item_type, change_type, severity,
              dimension_type, object_key, property_name, old_value, new_value,
              details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of input.items ?? []) {
            stmt.run(
              nanoid(),
              id,
              item.id || null,
              item.targetType,
              item.changeType,
              item.severity,
              item.dimensionType,
              item.objectKey,
              item.propertyName,
              item.oldValue,
              item.newValue,
              JSON.stringify({
                ...item.details,
                dimensionName: item.dimensionName,
                parentKey: item.parentKey,
                childKey: item.childKey
              })
            );
          }

          const created = this.get(input.projectId, id);
          if (!created) throw new Error("Failed to create change set.");
          return created;
        });
      },
      listByProject(projectId: string): ChangeSetRecord[] {
        return db.prepare("SELECT * FROM change_sets WHERE project_id = ? ORDER BY created_at DESC, name").all(projectId).map(mapChangeSet);
      },
      get(projectId: string, changeSetId: string): ChangeSetRecord | null {
        const row = db.prepare("SELECT * FROM change_sets WHERE project_id = ? AND id = ?").get(projectId, changeSetId);
        return row ? mapChangeSet(row) : null;
      },
      getDetail(projectId: string, changeSetId: string) {
        const changeSet = this.get(projectId, changeSetId);
        if (!changeSet) return null;
        return {
          changeSet,
          items: this.listItems(changeSet.id),
          approvals: this.listApprovals(changeSet.id),
          latestPackage: this.getLatestReleasePackage(changeSet.id)
        };
      },
      update(projectId: string, changeSetId: string, input: Partial<Pick<ChangeSetRecord, "name" | "description" | "status" | "targetEnvironment">>): ChangeSetRecord | null {
        const current = this.get(projectId, changeSetId);
        if (!current) return null;
        db.prepare(`
          UPDATE change_sets
          SET name = ?, description = ?, status = ?, target_environment = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
        `).run(
          input.name ?? current.name,
          input.description ?? current.description,
          input.status ?? current.status,
          input.targetEnvironment ?? current.targetEnvironment,
          now(),
          projectId,
          changeSetId
        );
        return this.get(projectId, changeSetId);
      },
      listItems(changeSetId: string): ChangeSetItemRecord[] {
        return db.prepare(`
          SELECT * FROM change_set_items
          WHERE change_set_id = ?
          ORDER BY dimension_type, item_type, change_type, object_key, property_name, id
        `).all(changeSetId).map(mapChangeSetItem);
      },
      recordApproval(projectId: string, changeSetId: string, input: { action: ChangeSetApprovalAction; comment?: string; createdBy?: string }): ChangeSetApprovalRecord {
        const changeSet = this.get(projectId, changeSetId);
        if (!changeSet) throw new Error("change set not found");
        const approval: ChangeSetApprovalRecord = {
          id: nanoid(),
          changeSetId,
          action: input.action,
          comment: input.comment ?? "",
          createdBy: input.createdBy ?? "local-admin",
          createdAt: now()
        };
        db.prepare(`
          INSERT INTO change_set_approvals (id, change_set_id, action, comment, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(approval.id, approval.changeSetId, approval.action, approval.comment, approval.createdBy, approval.createdAt);
        return approval;
      },
      listApprovals(changeSetId: string): ChangeSetApprovalRecord[] {
        return db.prepare("SELECT * FROM change_set_approvals WHERE change_set_id = ? ORDER BY created_at, id").all(changeSetId).map(mapChangeSetApproval);
      },
      createReleasePackage(input: { changeSetId: string; packageName: string; packagePath: string; manifest: unknown; createdBy?: string }): ReleasePackageRecord {
        const id = nanoid();
        db.prepare(`
          INSERT INTO release_packages (id, change_set_id, package_name, package_path, manifest_json, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.changeSetId,
          input.packageName,
          input.packagePath,
          JSON.stringify(input.manifest ?? {}),
          input.createdBy ?? "local-admin",
          now()
        );
        const row = db.prepare("SELECT * FROM release_packages WHERE id = ?").get(id);
        if (!row) throw new Error("Failed to create release package.");
        return mapReleasePackage(row);
      },
      getLatestReleasePackage(changeSetId: string): ReleasePackageRecord | null {
        const row = db.prepare("SELECT * FROM release_packages WHERE change_set_id = ? ORDER BY created_at DESC, id LIMIT 1").get(changeSetId);
        return row ? mapReleasePackage(row) : null;
      }
    }
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

function runInTransaction<T>(db: AppDatabase, action: () => T): T {
  if (isAsyncFunction(action)) {
    throw new Error("Repository transactions only support synchronous callbacks.");
  }

  const savepointName = `repository_tx_${++transactionCounter}`;
  db.exec(`SAVEPOINT ${savepointName}`);
  try {
    const result = action();
    if (isThenable(result)) {
      throw new Error("Repository transactions only support synchronous callbacks.");
    }
    db.exec(`RELEASE ${savepointName}`);
    return result;
  } catch (error) {
    try {
      db.exec(`ROLLBACK TO ${savepointName}`);
    } catch {
      // Preserve the original action error if rollback cleanup fails.
    }
    try {
      db.exec(`RELEASE ${savepointName}`);
    } catch {
      // Preserve the original action error if savepoint cleanup fails.
    }
    throw error;
  }
}

function isAsyncFunction(action: unknown): boolean {
  return typeof action === "function" && action.constructor.name === "AsyncFunction";
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  return typeof (value as { then?: unknown }).then === "function";
}

function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    sourceFileName: String(row.source_file_name),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapDimension(row: Record<string, unknown>): DimensionRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sheetName: String(row.sheet_name),
    dimensionType: String(row.dimension_type) as DimensionType,
    dimensionName: String(row.dimension_name),
    description: String(row.description),
    accessGroup: String(row.access_group),
    maintenanceGroup: String(row.maintenance_group),
    inheritedDimension: String(row.inherited_dimension),
    sortOrder: Number(row.sort_order),
    metadata: parseJson(String(row.metadata_json ?? "{}"), {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapMember(row: Record<string, unknown>): DimensionMemberRecord {
  return {
    id: String(row.id),
    dimensionId: String(row.dimension_id),
    memberKey: String(row.member_key),
    description: String(row.description),
    properties: parseJson(String(row.properties_json ?? "{}"), {}),
    rowOrder: Number(row.row_order),
    sourceRowNumber: Number(row.source_row_number),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapRelationship(row: Record<string, unknown>): DimensionRelationshipRecord {
  return {
    id: String(row.id),
    dimensionId: String(row.dimension_id),
    parentKey: String(row.parent_key),
    childKey: String(row.child_key),
    aggregationWeight: nullableNumber(row.aggregation_weight),
    percentConsol: nullableNumber(row.percent_consol),
    percentOwnership: nullableNumber(row.percent_ownership),
    ownershipType: String(row.ownership_type),
    properties: parseJson(String(row.properties_json ?? "{}"), {}),
    operation: String(row.operation ?? "") as DimensionRelationshipRecord["operation"],
    operationSource: String(row.operation_source ?? ""),
    operationNotes: String(row.operation_notes ?? ""),
    rowOrder: Number(row.row_order),
    sourceRowNumber: Number(row.source_row_number),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapVaryingPropertyValue(row: Record<string, unknown>): VaryingPropertyValueRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    dimensionId: String(row.dimension_id),
    targetType: String(row.target_type) as VaryingPropertyTargetType,
    targetId: String(row.target_id),
    propertyName: String(row.property_name),
    value: String(row.value ?? ""),
    cubeType: String(row.cube_type ?? ""),
    scenarioType: String(row.scenario_type ?? ""),
    timeMember: String(row.time_member ?? ""),
    isDefault: Number(row.is_default) === 1,
    source: String(row.source ?? ""),
    metadata: parseJson(String(row.metadata_json ?? "{}"), {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapProjectSnapshot(row: Record<string, unknown>): ProjectSnapshotRecord {
  const parsed = parseJson<Partial<ProjectSnapshotState>>(String(row.snapshot_json ?? "{}"), {});
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    snapshot: {
      project: parsed.project,
      dimensions: parsed.dimensions ?? [],
      members: parsed.members ?? [],
      relationships: parsed.relationships ?? [],
      varyingPropertyValues: parsed.varyingPropertyValues ?? [],
      validationIssues: parsed.validationIssues ?? []
    },
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapProjectSnapshotSummary(row: Record<string, unknown>): ProjectSnapshotSummaryRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapProjectBaseline(row: Record<string, unknown>): ProjectBaselineRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    sourceType: String(row.source_type) as BaselineSourceType,
    sourceFileName: String(row.source_file_name ?? ""),
    baseline: parseJson(String(row.baseline_json ?? "{}"), {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapMetadataDiffRun(row: Record<string, unknown>): MetadataDiffRunRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    baselineId: String(row.baseline_id),
    status: String(row.status) as MetadataDiffStatus,
    summary: parseJson(String(row.summary_json ?? "{}"), emptyDiffSummary()),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapMetadataDiffItem(row: Record<string, unknown>): MetadataDiffItemRecord {
  return {
    id: String(row.id),
    diffRunId: String(row.diff_run_id),
    dimensionType: String(row.dimension_type) as DimensionType,
    dimensionName: String(row.dimension_name),
    targetType: String(row.target_type) as MetadataDiffItemRecord["targetType"],
    changeType: String(row.change_type) as MetadataDiffItemRecord["changeType"],
    severity: String(row.severity) as MetadataDiffItemRecord["severity"],
    objectKey: String(row.object_key),
    parentKey: String(row.parent_key ?? ""),
    childKey: String(row.child_key ?? ""),
    propertyName: String(row.property_name ?? ""),
    oldValue: String(row.old_value ?? ""),
    newValue: String(row.new_value ?? ""),
    details: parseJson(String(row.details_json ?? "{}"), {})
  };
}

function mapChangeSet(row: Record<string, unknown>): ChangeSetRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    baselineId: String(row.baseline_id ?? ""),
    diffRunId: String(row.diff_run_id ?? ""),
    name: String(row.name),
    description: String(row.description ?? ""),
    status: String(row.status) as ChangeSetStatus,
    targetEnvironment: String(row.target_environment ?? ""),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapChangeSetItem(row: Record<string, unknown>): ChangeSetItemRecord {
  return {
    id: String(row.id),
    changeSetId: String(row.change_set_id),
    diffItemId: String(row.diff_item_id ?? ""),
    itemType: String(row.item_type) as ChangeSetItemRecord["itemType"],
    changeType: String(row.change_type) as ChangeSetItemRecord["changeType"],
    severity: String(row.severity) as ChangeSetItemRecord["severity"],
    dimensionType: String(row.dimension_type) as DimensionType,
    objectKey: String(row.object_key),
    propertyName: String(row.property_name ?? ""),
    oldValue: String(row.old_value ?? ""),
    newValue: String(row.new_value ?? ""),
    details: parseJson(String(row.details_json ?? "{}"), {})
  };
}

function mapChangeSetApproval(row: Record<string, unknown>): ChangeSetApprovalRecord {
  return {
    id: String(row.id),
    changeSetId: String(row.change_set_id),
    action: String(row.action) as ChangeSetApprovalAction,
    comment: String(row.comment ?? ""),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapReleasePackage(row: Record<string, unknown>): ReleasePackageRecord {
  return {
    id: String(row.id),
    changeSetId: String(row.change_set_id),
    packageName: String(row.package_name),
    packagePath: String(row.package_path),
    manifest: parseJson(String(row.manifest_json ?? "{}"), {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapBulkUpdateJob(row: Record<string, unknown>): BulkUpdateJobRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    targetType: String(row.target_type) as BulkUpdateTarget,
    operation: String(row.operation) as BulkUpdateOperation,
    request: parseJson(String(row.request_json ?? "{}"), {} as BulkUpdateRequest),
    summary: parseJson(String(row.summary_json ?? "{}"), {}),
    rollback: parseJson(String(row.rollback_json ?? "[]"), []),
    status: String(row.status) as BulkUpdateJobStatus,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapBulkUpdateItem(row: Record<string, unknown>): BulkUpdateItemRecord {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    targetId: String(row.target_id),
    targetKey: String(row.target_key),
    propertyName: String(row.property_name),
    oldValue: String(row.old_value ?? ""),
    newValue: String(row.new_value ?? ""),
    status: String(row.status) as BulkUpdateItemStatus,
    message: String(row.message ?? "")
  };
}

function mapIssue(row: Record<string, unknown>): ValidationIssue {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    dimensionId: String(row.dimension_id),
    entityType: String(row.entity_type) as ValidationIssue["entityType"],
    entityId: String(row.entity_id),
    severity: String(row.severity) as ValidationIssue["severity"],
    code: String(row.code),
    message: String(row.message),
    fieldName: String(row.field_name),
    rowNumber: row.row_number === null ? null : Number(row.row_number),
    createdAt: String(row.created_at)
  };
}

function emptyDiffSummary(): MetadataDiffSummary {
  return {
    totalItems: 0,
    bySeverity: { error: 0, warning: 0, info: 0 },
    byChangeType: { add: 0, update: 0, delete: 0, move: 0, copy: 0, unchanged: 0, warning: 0 },
    members: { adds: 0, updates: 0, deletes: 0 },
    relationships: { adds: 0, deletes: 0, moves: 0, copies: 0 },
    properties: { updates: 0 },
    warnings: 0,
    errors: 0
  };
}

function createProjectSnapshotRow(
  db: AppDatabase,
  input: { projectId: string; name: string; description: string; snapshot: ProjectSnapshotState; createdBy: string }
): string {
  const id = nanoid();
  db.prepare(`
    INSERT INTO project_snapshots (id, project_id, name, description, snapshot_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.projectId, input.name, input.description, JSON.stringify(input.snapshot), input.createdBy, now());
  return id;
}

function buildProjectSnapshotState(db: AppDatabase, projectId: string): ProjectSnapshotState {
  const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!projectRow) throw new Error("Project not found.");
  return {
    project: mapProject(projectRow),
    dimensions: db.prepare("SELECT * FROM dimensions WHERE project_id = ? ORDER BY sort_order").all(projectId).map(mapDimension),
    members: db.prepare(`
      SELECT m.* FROM dimension_members m
      JOIN dimensions d ON d.id = m.dimension_id
      WHERE d.project_id = ? AND m.is_active = 1
      ORDER BY d.sort_order, m.row_order
    `).all(projectId).map(mapMember),
    relationships: db.prepare(`
      SELECT r.* FROM dimension_relationships r
      JOIN dimensions d ON d.id = r.dimension_id
      WHERE d.project_id = ?
      ORDER BY d.sort_order, r.row_order
    `).all(projectId).map(mapRelationship),
    varyingPropertyValues: db.prepare(`
      SELECT * FROM varying_property_values
      WHERE project_id = ?
      ORDER BY dimension_id, target_type, target_id, property_name, cube_type, scenario_type, time_member, created_at, id
    `).all(projectId).map(mapVaryingPropertyValue),
    validationIssues: db.prepare("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY severity, row_number").all(projectId).map(mapIssue)
  };
}

function deleteProjectMetadata(db: AppDatabase, projectId: string): void {
  db.prepare("DELETE FROM validation_issues WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM varying_property_values WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM dimensions WHERE project_id = ?").run(projectId);
}

function insertSnapshotStateIntoProject(
  db: AppDatabase,
  projectId: string,
  snapshot: ProjectSnapshotState,
  options: { preserveIds: boolean; restoreValidationIssues: boolean }
): Omit<SnapshotRestoreSummary, "mode" | "projectId" | "snapshotId" | "safetySnapshotId"> {
  const timestamp = now();
  const dimensionIdMap = new Map<string, string>();
  const memberIdMap = new Map<string, string>();
  const relationshipIdMap = new Map<string, string>();

  const dimensionStmt = db.prepare(`
    INSERT INTO dimensions (
      id, project_id, sheet_name, dimension_type, dimension_name, description, access_group,
      maintenance_group, inherited_dimension, sort_order, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const dimension of snapshot.dimensions) {
    const id = options.preserveIds ? dimension.id : nanoid();
    dimensionIdMap.set(dimension.id, id);
    dimensionStmt.run(
      id,
      projectId,
      dimension.sheetName,
      dimension.dimensionType,
      dimension.dimensionName,
      dimension.description,
      dimension.accessGroup,
      dimension.maintenanceGroup,
      dimension.inheritedDimension,
      dimension.sortOrder,
      JSON.stringify(dimension.metadata ?? {}),
      options.preserveIds ? dimension.createdAt : timestamp,
      timestamp
    );
  }

  const memberStmt = db.prepare(`
    INSERT INTO dimension_members (
      id, dimension_id, member_key, description, properties_json, row_order,
      source_row_number, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const member of snapshot.members) {
    const dimensionId = dimensionIdMap.get(member.dimensionId);
    if (!dimensionId) continue;
    const id = options.preserveIds ? member.id : nanoid();
    memberIdMap.set(member.id, id);
    memberStmt.run(
      id,
      dimensionId,
      member.memberKey,
      member.description,
      JSON.stringify(member.properties ?? {}),
      member.rowOrder,
      member.sourceRowNumber,
      member.isActive ? 1 : 0,
      options.preserveIds ? member.createdAt : timestamp,
      timestamp
    );
  }

  const relationshipStmt = db.prepare(`
    INSERT INTO dimension_relationships (
      id, dimension_id, parent_key, child_key, aggregation_weight, percent_consol,
      percent_ownership, ownership_type, properties_json, operation, operation_source,
      operation_notes, row_order, source_row_number,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const relationship of snapshot.relationships) {
    const dimensionId = dimensionIdMap.get(relationship.dimensionId);
    if (!dimensionId) continue;
    const id = options.preserveIds ? relationship.id : nanoid();
    relationshipIdMap.set(relationship.id, id);
    relationshipStmt.run(
      id,
      dimensionId,
      relationship.parentKey,
      relationship.childKey,
      relationship.aggregationWeight,
      relationship.percentConsol,
      relationship.percentOwnership,
      relationship.ownershipType,
      JSON.stringify(relationship.properties ?? {}),
      relationship.operation || null,
      relationship.operationSource || null,
      relationship.operationNotes || null,
      relationship.rowOrder,
      relationship.sourceRowNumber,
      options.preserveIds ? relationship.createdAt : timestamp,
      timestamp
    );
  }

  const varyingValues = snapshot.varyingPropertyValues ?? [];
  const varyingStmt = db.prepare(`
    INSERT INTO varying_property_values (
      id, project_id, dimension_id, target_type, target_id, property_name, value,
      cube_type, scenario_type, time_member, is_default, source, metadata_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let varyingPropertiesRestored = 0;
  for (const value of varyingValues) {
    const dimensionId = dimensionIdMap.get(value.dimensionId);
    const targetId = remapSnapshotTargetId(value.targetType, value.targetId, dimensionIdMap, memberIdMap, relationshipIdMap);
    if (!dimensionId || !targetId) continue;
    varyingStmt.run(
      options.preserveIds ? value.id : nanoid(),
      projectId,
      dimensionId,
      value.targetType,
      targetId,
      value.propertyName,
      value.value,
      value.cubeType,
      value.scenarioType,
      value.timeMember,
      value.isDefault ? 1 : 0,
      value.source,
      JSON.stringify(value.metadata ?? {}),
      options.preserveIds ? value.createdAt : timestamp,
      timestamp
    );
    varyingPropertiesRestored += 1;
  }

  if (options.restoreValidationIssues) {
    insertSnapshotValidationIssues(db, projectId, snapshot.validationIssues ?? [], timestamp);
  }

  return {
    dimensionsRestored: snapshot.dimensions.length,
    membersRestored: snapshot.members.filter((member) => dimensionIdMap.has(member.dimensionId)).length,
    relationshipsRestored: snapshot.relationships.filter((relationship) => dimensionIdMap.has(relationship.dimensionId)).length,
    varyingPropertiesRestored
  };
}

function remapSnapshotTargetId(
  targetType: VaryingPropertyTargetType,
  targetId: string,
  dimensionIdMap: Map<string, string>,
  memberIdMap: Map<string, string>,
  relationshipIdMap: Map<string, string>
): string | null {
  if (targetType === "dimension") return dimensionIdMap.get(targetId) ?? null;
  if (targetType === "member") return memberIdMap.get(targetId) ?? null;
  return relationshipIdMap.get(targetId) ?? null;
}

function insertSnapshotValidationIssues(db: AppDatabase, projectId: string, issues: ValidationIssue[], timestamp: string): void {
  const stmt = db.prepare(`
    INSERT INTO validation_issues (
      id, project_id, dimension_id, entity_type, entity_id, severity, code,
      message, field_name, row_number, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const issue of issues) {
    stmt.run(
      issue.id,
      projectId,
      issue.dimensionId,
      issue.entityType,
      issue.entityId,
      issue.severity,
      issue.code,
      issue.message,
      issue.fieldName,
      issue.rowNumber,
      issue.createdAt || timestamp
    );
  }
}

function normalizeVaryingPropertyInput(input: VaryingPropertyValueInput): Required<VaryingPropertyValueInput> {
  return {
    projectId: String(input.projectId),
    dimensionId: String(input.dimensionId),
    targetType: input.targetType,
    targetId: String(input.targetId),
    propertyName: String(input.propertyName ?? "").trim(),
    value: String(input.value ?? ""),
    cubeType: String(input.cubeType ?? "").trim(),
    scenarioType: String(input.scenarioType ?? "").trim(),
    timeMember: String(input.timeMember ?? "").trim(),
    isDefault: Boolean(input.isDefault),
    source: String(input.source ?? ""),
    metadata: input.metadata ?? {}
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
