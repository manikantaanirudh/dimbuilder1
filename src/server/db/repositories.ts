import { nanoid } from "nanoid";
import { sortDimensionsByType } from "../../shared/dimensionTypeOrder";
import type { PropertyDefaultResolutionEntry } from "../../shared/effectiveProperties";
import {
  toPropertyDefaultDisplayRow,
  toPropertyDefaultResolutionEntries,
  type PropertyDefaultCatalogRecord,
  type PropertyDefaultDisplayRow
} from "../../shared/propertyDefaultResolver";
import type { AppDatabase } from "./database";
import { isAppDatabase } from "./database";
import type { DbClient } from "./dbClient";
import { appDatabaseAsDbClient } from "./migrations";
import { booleanValue } from "./sql";
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStepActionRecord,
  WorkflowNotification,
  WorkflowStepAction
} from "../../shared/workflowTypes";
import type {
  CreateEnvironmentInput,
  DeploymentDimensionResult,
  DeploymentRecord,
  DeploymentStatus,
  Environment,
  EnvironmentSafe,
  UpdateEnvironmentInput
} from "../../shared/environmentTypes";
import type {
  PromotionPipeline,
  PromotionStage,
  EnvironmentSyncStatus,
  EnvironmentOverride,
  PromotionRecord,
  SyncStatus
} from "../../shared/multiEnvTypes";

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  auth_provider: string;
  auth_provider_id: string | null;
  avatar_url: string | null;
  role: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface PropertyDefaultProfileRecord {
  id: string;
  projectId: string;
  name: string;
  sourceFileName: string;
  sourceXmlHash: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDefaultValueRecord {
  id: string;
  profileId: string;
  dimensionType: string;
  targetLevel: "dimension" | "member" | "relationship";
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
  confidence: number;
  sampleCount: number;
  nonBlankCount: number;
  distinctCount: number;
  sourceDimensionNames: string[];
  updatedAt: string;
}

export type { PropertyDefaultCatalogRecord, PropertyDefaultDisplayRow };

export interface ProjectPermissionRow {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  granted_by: string | null;
  granted_at: string;
}

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
import type {
  AISuggestion,
  AISuggestionStatus,
  AISuggestionType,
  AIConversation,
  AIMessage
} from "../../shared/aiTypes";
import type {
  CrossDimensionRule,
  CrossDimensionRuleType,
  CrossDimensionMapping,
  CrossDimensionMappingType
} from "../../shared/crossDimensionTypes";
import type {
  Template,
  TemplateCategory,
  TemplateIndustry,
  TemplateData,
  TemplateApplication
} from "../../shared/templateTypes";
import type {
  ReportDefinition,
  ReportType,
  ReportFormat,
  ReportConfig,
  ReportRun,
  ReportRunStatus,
  MetadataHealthSnapshot
} from "../../shared/reportingTypes";
import type {
  VcsCommit,
  VcsBranch,
  VcsBranchStatus,
  VcsTag,
  ProjectSnapshot
} from "../../shared/vcsTypes";
import type {
  ScheduledJob, JobExecution, JobStatus, JobExecutionStatus,
  QualityRule, QualityGate, MigrationProject, WebhookConfig,
  SyncQueueEntry, EditLock
} from "../../shared/tier3Types";
import type {
  Tenant, TenantConfig, CollaborationComment,
  AuditLogEntry, RetentionPolicy
} from "../../shared/tier4Types";

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

interface CreateRepositoriesOptions {
  syncDb?: AppDatabase;
}

export function createRepositories(dbOrClient: AppDatabase | DbClient, options: CreateRepositoriesOptions = {}) {
  const client: DbClient = isAppDatabase(dbOrClient)
    ? appDatabaseAsDbClient(dbOrClient)
    : dbOrClient;
  const syncDb: AppDatabase | null = isAppDatabase(dbOrClient) ? dbOrClient : options.syncDb ?? null;
  const db = syncDb as AppDatabase;

  return {
    async transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
      return client.transaction(async (txClient) => {
        const txRepos = createRepositories(txClient, { syncDb: syncDb ?? undefined });
        return fn(txRepos);
      });
    },
    projects: {
      async create(input: CreateProjectInput): Promise<ProjectRecord> {
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

        await client.exec(`
          INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [project.id, project.name, project.description, project.sourceFileName, project.createdBy, project.createdAt, project.updatedAt]);

        return project;
      },
      async list(): Promise<ProjectRecord[]> {
        const rows = await client.query<Record<string, unknown>>("SELECT * FROM projects ORDER BY updated_at DESC");
        return rows.map(mapProject);
      },
      async get(projectId: string): Promise<ProjectRecord | null> {
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM projects WHERE id = ?", [projectId]);
        return row ? mapProject(row) : null;
      },
      async delete(projectId: string): Promise<void> {
        await client.exec("DELETE FROM projects WHERE id = ?", [projectId]);
      },
      async update(projectId: string, input: { name?: string; description?: string }): Promise<ProjectRecord | null> {
        const project = await this.get(projectId);
        if (!project) return null;
        const name = input.name !== undefined ? input.name.trim() : project.name;
        const description = input.description !== undefined ? input.description : project.description;
        const updatedAt = now();
        await client.exec("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?", [name, description, updatedAt, projectId]);
        return { ...project, name, description, updatedAt };
      },
      async summary(projectId: string): Promise<DashboardSummary> {
        const dimensions = await this.getDimensions(projectId);
        const activeMembers = booleanValue(client.dialect, true);
        const [dimensionCount, memberCount, relationshipCount, errorCount, warningCount] = await Promise.all([
          client.queryOne<{ count: number | string }>("SELECT COUNT(*) AS count FROM dimensions WHERE project_id = ?", [projectId]),
          client.queryOne<{ count: number | string }>(`
            SELECT COUNT(*) AS count FROM dimension_members m
            JOIN dimensions d ON d.id = m.dimension_id
            WHERE d.project_id = ? AND m.is_active = ?
          `, [projectId, activeMembers]),
          client.queryOne<{ count: number | string }>(`
            SELECT COUNT(*) AS count FROM dimension_relationships r
            JOIN dimensions d ON d.id = r.dimension_id
            WHERE d.project_id = ?
          `, [projectId]),
          client.queryOne<{ count: number | string }>("SELECT COUNT(*) AS count FROM validation_issues WHERE project_id = ? AND severity = 'error'", [projectId]),
          client.queryOne<{ count: number | string }>("SELECT COUNT(*) AS count FROM validation_issues WHERE project_id = ? AND severity = 'warning'", [projectId])
        ]);
        return {
          totalDimensions: Number(dimensionCount?.count ?? 0),
          totalMembers: Number(memberCount?.count ?? 0),
          totalRelationships: Number(relationshipCount?.count ?? 0),
          validationErrors: Number(errorCount?.count ?? 0),
          validationWarnings: Number(warningCount?.count ?? 0),
          recentDimensions: dimensions.slice(0, 5)
        };
      },
      async getDimensions(projectId: string): Promise<DimensionRecord[]> {
        const rows = await client.query<Record<string, unknown>>(
          "SELECT * FROM dimensions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 5",
          [projectId]
        );
        return rows.map(mapDimension);
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
        const dimensions = db.prepare("SELECT * FROM dimensions WHERE project_id = ?").all(projectId).map(mapDimension);
        return sortDimensionsByType(dimensions);
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
      },
      delete(dimensionId: string): boolean {
        const current = this.get(dimensionId);
        if (!current) return false;
        runInTransactionSync(db, () => {
          db.prepare("DELETE FROM edit_locks WHERE dimension_id = ?").run(dimensionId);
          db.prepare("DELETE FROM collaboration_comments WHERE dimension_id = ?").run(dimensionId);
          db.prepare("DELETE FROM ai_suggestions WHERE dimension_id = ?").run(dimensionId);
          db.prepare("DELETE FROM dimensions WHERE id = ?").run(dimensionId);
        });
        return true;
      }
    },
    members: {
      bulkInsert(records: DimensionMemberRecord[]): void {
        runInTransactionSync(db, () => {
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
      countByProject(projectId: string): number {
        return Number(db.prepare(`
          SELECT COUNT(*) AS count
          FROM dimension_members m
          JOIN dimensions d ON d.id = m.dimension_id
          WHERE d.project_id = ? AND m.is_active = 1
        `).get(projectId)?.count ?? 0);
      },
      listAllByDimension(dimensionId: string): DimensionMemberRecord[] {
        return db.prepare(`
          SELECT * FROM dimension_members
          WHERE dimension_id = ? AND is_active = 1
          ORDER BY row_order
        `).all(dimensionId).map(mapMember);
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
      getById(id: string): DimensionMemberRecord | undefined {
        const row = db.prepare("SELECT * FROM dimension_members WHERE id = ? AND is_active = 1").get(id);
        return row ? mapMember(row) : undefined;
      },
      softDelete(id: string): void {
        db.prepare("UPDATE dimension_members SET is_active = 0, updated_at = ? WHERE id = ?").run(now(), id);
      },
      softDeleteMany(ids: string[]): number {
        if (ids.length === 0) return 0;
        const placeholders = ids.map(() => "?").join(", ");
        const result = db.prepare(`
          UPDATE dimension_members
          SET is_active = 0, updated_at = ?
          WHERE id IN (${placeholders}) AND is_active = 1
        `).run(now(), ...ids);
        return Number(result.changes ?? 0);
      },
      listByIds(dimensionId: string, ids: string[]): DimensionMemberRecord[] {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => "?").join(", ");
        return db.prepare(`
          SELECT * FROM dimension_members
          WHERE dimension_id = ? AND id IN (${placeholders}) AND is_active = 1
          ORDER BY row_order
        `).all(dimensionId, ...ids).map(mapMember);
      }
    },
    relationships: {
      bulkInsert(records: DimensionRelationshipRecord[]): void {
        runInTransactionSync(db, () => {
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
      listAllByDimension(dimensionId: string): DimensionRelationshipRecord[] {
        return db.prepare(`
          SELECT * FROM dimension_relationships
          WHERE dimension_id = ?
          ORDER BY row_order
        `).all(dimensionId).map(mapRelationship);
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
      getById(id: string): DimensionRelationshipRecord | undefined {
        const row = db.prepare("SELECT * FROM dimension_relationships WHERE id = ?").get(id);
        return row ? mapRelationship(row) : undefined;
      },
      delete(id: string): void {
        db.prepare("DELETE FROM dimension_relationships WHERE id = ?").run(id);
      },
      deleteMany(ids: string[]): number {
        if (ids.length === 0) return 0;
        const placeholders = ids.map(() => "?").join(", ");
        const result = db.prepare(`DELETE FROM dimension_relationships WHERE id IN (${placeholders})`).run(...ids);
        return Number(result.changes ?? 0);
      },
      deleteForMemberKeys(dimensionId: string, memberKeys: string[]): number {
        if (memberKeys.length === 0) return 0;
        const placeholders = memberKeys.map(() => "?").join(", ");
        const result = db.prepare(`
          DELETE FROM dimension_relationships
          WHERE dimension_id = ?
            AND (parent_key IN (${placeholders}) OR child_key IN (${placeholders}))
        `).run(dimensionId, ...memberKeys, ...memberKeys);
        return Number(result.changes ?? 0);
      },
      listByIds(dimensionId: string, ids: string[]): DimensionRelationshipRecord[] {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => "?").join(", ");
        return db.prepare(`
          SELECT * FROM dimension_relationships
          WHERE dimension_id = ? AND id IN (${placeholders})
          ORDER BY row_order
        `).all(dimensionId, ...ids).map(mapRelationship);
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
        return runInTransactionSync(db, () => {
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
        return runInTransactionSync(db, () => {
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
        runInTransactionSync(db, () => {
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
    validationOverrides: {
      listByProject(projectId: string): Array<{ id: string; ruleCode: string; severity: string; updatedAt: string }> {
        return db.prepare("SELECT * FROM project_validation_overrides WHERE project_id = ? ORDER BY rule_code").all(projectId).map((row: any) => ({
          id: row.id,
          ruleCode: row.rule_code,
          severity: row.severity,
          updatedAt: row.updated_at
        }));
      },
      upsert(projectId: string, ruleCode: string, severity: string): void {
        const existing = db.prepare("SELECT id FROM project_validation_overrides WHERE project_id = ? AND rule_code = ?").get(projectId, ruleCode);
        if (existing) {
          db.prepare("UPDATE project_validation_overrides SET severity = ?, updated_at = ? WHERE project_id = ? AND rule_code = ?")
            .run(severity, now(), projectId, ruleCode);
        } else {
          db.prepare("INSERT INTO project_validation_overrides (id, project_id, rule_code, severity, updated_at) VALUES (?, ?, ?, ?, ?)")
            .run(nanoid(), projectId, ruleCode, severity, now());
        }
      },
      deleteByProject(projectId: string, ruleCode: string): void {
        db.prepare("DELETE FROM project_validation_overrides WHERE project_id = ? AND rule_code = ?").run(projectId, ruleCode);
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
      buildState(projectId: string): ProjectSnapshotState {
        return buildProjectSnapshotState(db, projectId);
      },
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
        return runInTransactionSync(db, () => {
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
        return runInTransactionSync(db, () => {
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
        return runInTransactionSync(db, () => {
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
        return runInTransactionSync(db, () => {
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
    },
    users: {
      findUserByEmail(email: string): UserRow | undefined {
        return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
      },
      findUserById(id: string): UserRow | undefined {
        return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
      },
      findUserByProviderId(provider: string, providerId: string): UserRow | undefined {
        return db.prepare("SELECT * FROM users WHERE auth_provider = ? AND auth_provider_id = ?").get(provider, providerId) as UserRow | undefined;
      },
      createUser(input: { id: string; email: string; displayName: string; passwordHash?: string; authProvider: string; authProviderId?: string; role: string }): void {
        const timestamp = now();
        db.prepare(`
          INSERT INTO users (id, email, display_name, password_hash, auth_provider, auth_provider_id, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          input.id,
          input.email,
          input.displayName,
          input.passwordHash ?? null,
          input.authProvider,
          input.authProviderId ?? null,
          input.role,
          timestamp,
          timestamp
        );
      },
      updateUser(id: string, updates: { displayName?: string; role?: string; isActive?: number; lastLoginAt?: string; avatarUrl?: string; authProvider?: string; authProviderId?: string }): void {
        const fields: string[] = [];
        const values: unknown[] = [];
        if (updates.displayName !== undefined) { fields.push("display_name = ?"); values.push(updates.displayName); }
        if (updates.role !== undefined) { fields.push("role = ?"); values.push(updates.role); }
        if (updates.isActive !== undefined) { fields.push("is_active = ?"); values.push(updates.isActive); }
        if (updates.lastLoginAt !== undefined) { fields.push("last_login_at = ?"); values.push(updates.lastLoginAt); }
        if (updates.avatarUrl !== undefined) { fields.push("avatar_url = ?"); values.push(updates.avatarUrl); }
        if (updates.authProvider !== undefined) { fields.push("auth_provider = ?"); values.push(updates.authProvider); }
        if (updates.authProviderId !== undefined) { fields.push("auth_provider_id = ?"); values.push(updates.authProviderId); }
        if (fields.length === 0) return;
        fields.push("updated_at = ?");
        values.push(now());
        values.push(id);
        db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      },
      listUsers(): UserRow[] {
        return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as unknown as UserRow[];
      }
    },
    sessions: {
      createSession(input: { id: string; userId: string; refreshTokenHash: string; expiresAt: string }): void {
        db.prepare(`
          INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(input.id, input.userId, input.refreshTokenHash, input.expiresAt, now());
      },
      findSessionByUserId(userId: string): SessionRow | undefined {
        return db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId) as SessionRow | undefined;
      },
      deleteSessionsByUserId(userId: string): void {
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      },
      deleteExpiredSessions(): number {
        const result = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now()) as { changes: number };
        return result.changes;
      }
    },
    projectPermissions: {
      getProjectPermissions(projectId: string): ProjectPermissionRow[] {
        return db.prepare("SELECT * FROM project_permissions WHERE project_id = ?").all(projectId) as unknown as ProjectPermissionRow[];
      },
      getUserProjectPermission(projectId: string, userId: string): ProjectPermissionRow | undefined {
        return db.prepare("SELECT * FROM project_permissions WHERE project_id = ? AND user_id = ?").get(projectId, userId) as ProjectPermissionRow | undefined;
      },
      setProjectPermission(input: { id: string; projectId: string; userId: string; role: string; grantedBy: string }): void {
        db.prepare(`
          INSERT OR REPLACE INTO project_permissions (id, project_id, user_id, role, granted_by, granted_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(input.id, input.projectId, input.userId, input.role, input.grantedBy, now());
      },
      removeProjectPermission(id: string): void {
        db.prepare("DELETE FROM project_permissions WHERE id = ?").run(id);
      }
    },
    workflows: {
      definitions: {
        create(input: { name: string; description?: string; dimensionTypes?: string; steps: unknown[]; autoAdvanceRules?: Record<string, unknown>; createdBy: string }): WorkflowDefinition {
          const id = nanoid();
          const timestamp = now();
          db.prepare(`
            INSERT INTO workflow_definitions (id, name, description, dimension_types, steps_json, auto_advance_rules_json, is_active, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
          `).run(
            id,
            input.name,
            input.description ?? "",
            input.dimensionTypes ?? "*",
            JSON.stringify(input.steps),
            JSON.stringify(input.autoAdvanceRules ?? {}),
            input.createdBy,
            timestamp,
            timestamp
          );
          return this.get(id)!;
        },
        list(): WorkflowDefinition[] {
          return db.prepare("SELECT * FROM workflow_definitions WHERE is_active = 1 ORDER BY name").all().map(mapWorkflowDefinition);
        },
        listAll(): WorkflowDefinition[] {
          return db.prepare("SELECT * FROM workflow_definitions ORDER BY name").all().map(mapWorkflowDefinition);
        },
        get(id: string): WorkflowDefinition | null {
          const row = db.prepare("SELECT * FROM workflow_definitions WHERE id = ?").get(id);
          return row ? mapWorkflowDefinition(row) : null;
        },
        update(id: string, input: { name?: string; description?: string; dimensionTypes?: string; steps?: unknown[]; autoAdvanceRules?: Record<string, unknown>; isActive?: boolean }): WorkflowDefinition | null {
          const current = this.get(id);
          if (!current) return null;
          db.prepare(`
            UPDATE workflow_definitions
            SET name = ?, description = ?, dimension_types = ?, steps_json = ?, auto_advance_rules_json = ?, is_active = ?, updated_at = ?
            WHERE id = ?
          `).run(
            input.name ?? current.name,
            input.description ?? current.description,
            input.dimensionTypes ?? current.dimensionTypes,
            input.steps ? JSON.stringify(input.steps) : JSON.stringify(current.steps),
            input.autoAdvanceRules ? JSON.stringify(input.autoAdvanceRules) : JSON.stringify(current.autoAdvanceRules),
            input.isActive !== undefined ? (input.isActive ? 1 : 0) : (current.isActive ? 1 : 0),
            now(),
            id
          );
          return this.get(id);
        }
      },
      instances: {
        create(input: { definitionId: string; changeSetId: string; projectId: string; submittedBy: string }): WorkflowInstance {
          const id = nanoid();
          const timestamp = now();
          db.prepare(`
            INSERT INTO workflow_instances (id, definition_id, change_set_id, project_id, current_step_index, status, submitted_by, submitted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, 'in_progress', ?, ?, ?, ?)
          `).run(id, input.definitionId, input.changeSetId, input.projectId, input.submittedBy, timestamp, timestamp, timestamp);
          return this.get(id)!;
        },
        get(id: string): WorkflowInstance | null {
          const row = db.prepare("SELECT * FROM workflow_instances WHERE id = ?").get(id);
          return row ? mapWorkflowInstance(row) : null;
        },
        getByChangeSet(changeSetId: string): WorkflowInstance | null {
          const row = db.prepare("SELECT * FROM workflow_instances WHERE change_set_id = ? ORDER BY created_at DESC LIMIT 1").get(changeSetId);
          return row ? mapWorkflowInstance(row) : null;
        },
        listByProject(projectId: string, status?: string): WorkflowInstance[] {
          if (status) {
            return db.prepare("SELECT * FROM workflow_instances WHERE project_id = ? AND status = ? ORDER BY created_at DESC").all(projectId, status).map(mapWorkflowInstance);
          }
          return db.prepare("SELECT * FROM workflow_instances WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(mapWorkflowInstance);
        },
        listPendingForUser(userId: string, userRole: string): WorkflowInstance[] {
          const instances = db.prepare("SELECT * FROM workflow_instances WHERE status = 'in_progress' ORDER BY created_at DESC").all().map(mapWorkflowInstance);
          return instances.filter((instance) => {
            const def = db.prepare("SELECT * FROM workflow_definitions WHERE id = ?").get(instance.definitionId);
            if (!def) return false;
            const definition = mapWorkflowDefinition(def);
            const currentStep = definition.steps[instance.currentStepIndex];
            if (!currentStep) return false;
            if (currentStep.requiredRole !== userRole && userRole !== "admin") return false;
            if (instance.submittedBy === userId) return false;
            return true;
          });
        },
        updateStatus(id: string, status: string, completedAt?: string): void {
          if (completedAt) {
            db.prepare("UPDATE workflow_instances SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(status, completedAt, now(), id);
          } else {
            db.prepare("UPDATE workflow_instances SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
          }
        },
        advanceStep(id: string, newStepIndex: number): void {
          db.prepare("UPDATE workflow_instances SET current_step_index = ?, updated_at = ? WHERE id = ?").run(newStepIndex, now(), id);
        }
      },
      stepActions: {
        record(input: { instanceId: string; stepIndex: number; action: WorkflowStepAction; actorId: string; comment?: string }): WorkflowStepActionRecord {
          const id = nanoid();
          const timestamp = now();
          db.prepare(`
            INSERT INTO workflow_step_actions (id, instance_id, step_index, action, actor_id, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id, input.instanceId, input.stepIndex, input.action, input.actorId, input.comment ?? "", timestamp);
          return { id, instanceId: input.instanceId, stepIndex: input.stepIndex, action: input.action, actorId: input.actorId, comment: input.comment ?? "", createdAt: timestamp };
        },
        listByInstance(instanceId: string): WorkflowStepActionRecord[] {
          return db.prepare("SELECT * FROM workflow_step_actions WHERE instance_id = ? ORDER BY created_at, id").all(instanceId).map(mapWorkflowStepAction);
        },
        countApprovalsForStep(instanceId: string, stepIndex: number): number {
          const row = db.prepare("SELECT COUNT(*) as cnt FROM workflow_step_actions WHERE instance_id = ? AND step_index = ? AND action = 'approve'").get(instanceId, stepIndex) as { cnt: number } | undefined;
          return row?.cnt ?? 0;
        }
      },
      notifications: {
        create(input: { instanceId: string; recipientId: string; channel?: string; subject: string; body: string }): WorkflowNotification {
          const id = nanoid();
          const timestamp = now();
          db.prepare(`
            INSERT INTO workflow_notifications (id, instance_id, recipient_id, channel, subject, body, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
          `).run(id, input.instanceId, input.recipientId, input.channel ?? "in_app", input.subject, input.body, timestamp);
          return { id, instanceId: input.instanceId, recipientId: input.recipientId, channel: input.channel ?? "in_app", subject: input.subject, body: input.body, isRead: false, createdAt: timestamp };
        },
        listByRecipient(recipientId: string): WorkflowNotification[] {
          return db.prepare("SELECT * FROM workflow_notifications WHERE recipient_id = ? ORDER BY created_at DESC").all(recipientId).map(mapWorkflowNotification);
        },
        markRead(id: string): void {
          db.prepare("UPDATE workflow_notifications SET is_read = 1 WHERE id = ?").run(id);
        },
        listByInstance(instanceId: string): WorkflowNotification[] {
          return db.prepare("SELECT * FROM workflow_notifications WHERE instance_id = ? ORDER BY created_at DESC").all(instanceId).map(mapWorkflowNotification);
        }
      },
      getEligibleReviewers(requiredRole: string): { id: string; email: string; displayName: string; role: string }[] {
        const roleHierarchy: Record<string, string[]> = {
          viewer: ["viewer", "reviewer", "author", "admin"],
          reviewer: ["reviewer", "admin"],
          author: ["author", "admin"],
          admin: ["admin"]
        };
        const eligibleRoles = roleHierarchy[requiredRole] ?? [requiredRole];
        const placeholders = eligibleRoles.map(() => "?").join(", ");
        return db.prepare(`SELECT id, email, display_name, role FROM users WHERE is_active = 1 AND role IN (${placeholders})`).all(...eligibleRoles).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          email: String(row.email),
          displayName: String(row.display_name),
          role: String(row.role)
        }));
      }
    },
    environments: {
      list(): EnvironmentSafe[] {
        return db.prepare("SELECT * FROM environments ORDER BY name ASC").all().map(mapEnvironmentSafe);
      },
      getById(id: string): Environment | null {
        const row = db.prepare("SELECT * FROM environments WHERE id = ?").get(id);
        return row ? mapEnvironment(row) : null;
      },
      getSafe(id: string): EnvironmentSafe | null {
        const row = db.prepare("SELECT * FROM environments WHERE id = ?").get(id);
        return row ? mapEnvironmentSafe(row) : null;
      },
      create(input: CreateEnvironmentInput & { createdBy: string }): EnvironmentSafe {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO environments (id, name, type, base_url, client_id, client_secret, tenant_id, app_name, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(id, input.name, input.type, input.baseUrl, input.clientId, input.clientSecret, input.tenantId ?? "", input.appName ?? "", input.createdBy, timestamp, timestamp);
        return { id, name: input.name, type: input.type, baseUrl: input.baseUrl, clientId: input.clientId, tenantId: input.tenantId ?? "", appName: input.appName ?? "", isActive: true, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      update(id: string, input: UpdateEnvironmentInput): EnvironmentSafe | null {
        const existing = this.getById(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const type = input.type ?? existing.type;
        const baseUrl = input.baseUrl ?? existing.baseUrl;
        const clientId = input.clientId ?? existing.clientId;
        const clientSecret = input.clientSecret ?? existing.clientSecret;
        const tenantId = input.tenantId ?? existing.tenantId;
        const appName = input.appName ?? existing.appName;
        const isActive = input.isActive ?? existing.isActive;
        const updatedAt = now();
        db.prepare(`
          UPDATE environments SET name = ?, type = ?, base_url = ?, client_id = ?, client_secret = ?, tenant_id = ?, app_name = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(name, type, baseUrl, clientId, clientSecret, tenantId, appName, isActive ? 1 : 0, updatedAt, id);
        return { id, name, type, baseUrl, clientId, tenantId, appName, isActive, createdBy: existing.createdBy, createdAt: existing.createdAt, updatedAt };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM environments WHERE id = ?").run(id);
      }
    },
    deployments: {
      create(input: { environmentId: string; projectId: string; changeSetId?: string; status: DeploymentStatus; xmlPayload: string; comment: string; initiatedBy: string; dimensionResults: DeploymentDimensionResult[] }): DeploymentRecord {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO deployment_history (id, environment_id, project_id, change_set_id, status, xml_payload, comment, initiated_by, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.environmentId, input.projectId, input.changeSetId ?? null, input.status, input.xmlPayload, input.comment, input.initiatedBy, timestamp, input.status === "success" || input.status === "failed" ? timestamp : null);

        const dimStmt = db.prepare(`
          INSERT INTO deployment_dimension_results (id, deployment_id, dimension_type, dimension_name, status, message)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const r of input.dimensionResults) {
          dimStmt.run(nanoid(), id, r.dimensionType, r.dimensionName, r.status, r.message);
        }

        return {
          id,
          environmentId: input.environmentId,
          projectId: input.projectId,
          changeSetId: input.changeSetId ?? null,
          status: input.status,
          dimensionResults: input.dimensionResults,
          xmlPayload: input.xmlPayload,
          comment: input.comment,
          initiatedBy: input.initiatedBy,
          createdAt: timestamp,
          completedAt: input.status === "success" || input.status === "failed" ? timestamp : null
        };
      },
      list(filters: { projectId?: string; environmentId?: string } = {}): Omit<DeploymentRecord, "xmlPayload" | "dimensionResults">[] {
        let sql = "SELECT id, environment_id, project_id, change_set_id, status, comment, initiated_by, created_at, completed_at FROM deployment_history WHERE 1=1";
        const params: unknown[] = [];
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        if (filters.environmentId) { sql += " AND environment_id = ?"; params.push(filters.environmentId); }
        sql += " ORDER BY created_at DESC";
        return db.prepare(sql).all(...params).map(mapDeploymentSummary);
      },
      getById(id: string): DeploymentRecord | null {
        const row = db.prepare("SELECT * FROM deployment_history WHERE id = ?").get(id);
        if (!row) return null;
        const deployment = mapDeployment(row);
        const dimRows = db.prepare("SELECT * FROM deployment_dimension_results WHERE deployment_id = ?").all(id);
        deployment.dimensionResults = dimRows.map(mapDeploymentDimensionResult);
        return deployment;
      },
      updateStatus(id: string, status: DeploymentStatus): void {
        const completedAt = status === "success" || status === "failed" ? now() : null;
        db.prepare("UPDATE deployment_history SET status = ?, completed_at = ? WHERE id = ?").run(status, completedAt, id);
      }
    },
    connectors: {
      list(): ConnectorDefinitionRow[] {
        return db.prepare("SELECT * FROM connector_definitions ORDER BY name ASC").all().map(mapConnectorDefinition);
      },
      getById(id: string): ConnectorDefinitionRow | null {
        const row = db.prepare("SELECT * FROM connector_definitions WHERE id = ?").get(id);
        return row ? mapConnectorDefinition(row) : null;
      },
      create(input: { name: string; connectorType: string; connectionConfig: Record<string, unknown>; extractionConfig: Record<string, unknown>; createdBy: string }): ConnectorDefinitionRow {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO connector_definitions (id, name, connector_type, connection_config_json, extraction_config_json, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(id, input.name, input.connectorType, JSON.stringify(input.connectionConfig), JSON.stringify(input.extractionConfig), input.createdBy, timestamp, timestamp);
        return { id, name: input.name, connectorType: input.connectorType, connectionConfig: input.connectionConfig, extractionConfig: input.extractionConfig, isActive: true, lastTestedAt: null, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      update(id: string, input: { name?: string; connectionConfig?: Record<string, unknown>; extractionConfig?: Record<string, unknown>; isActive?: boolean }): ConnectorDefinitionRow | null {
        const existing = this.getById(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const connectionConfig = input.connectionConfig ?? existing.connectionConfig;
        const extractionConfig = input.extractionConfig ?? existing.extractionConfig;
        const isActive = input.isActive ?? existing.isActive;
        const updatedAt = now();
        db.prepare(`
          UPDATE connector_definitions SET name = ?, connection_config_json = ?, extraction_config_json = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(name, JSON.stringify(connectionConfig), JSON.stringify(extractionConfig), isActive ? 1 : 0, updatedAt, id);
        return { ...existing, name, connectionConfig, extractionConfig, isActive, updatedAt };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM connector_definitions WHERE id = ?").run(id);
      },
      setLastTested(id: string): void {
        db.prepare("UPDATE connector_definitions SET last_tested_at = ? WHERE id = ?").run(now(), id);
      }
    },
    mappingRules: {
      listByConnector(connectorId: string): MappingRuleRow[] {
        return db.prepare("SELECT * FROM mapping_rules WHERE connector_id = ? ORDER BY name ASC").all(connectorId).map(mapMappingRule);
      },
      getById(id: string): MappingRuleRow | null {
        const row = db.prepare("SELECT * FROM mapping_rules WHERE id = ?").get(id);
        return row ? mapMappingRule(row) : null;
      },
      create(input: { connectorId: string; name: string; sourceEntity: string; targetDimensionType: string; fieldMappings: unknown[]; hierarchyRules?: unknown; filterRules?: unknown[]; conflictResolution?: string; createdBy: string }): MappingRuleRow {
        const id = nanoid();
        const timestamp = now();
        const conflictResolution = input.conflictResolution ?? "source_wins";
        db.prepare(`
          INSERT INTO mapping_rules (id, connector_id, name, source_entity, target_dimension_type, field_mappings_json, hierarchy_rules_json, filter_rules_json, conflict_resolution, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(id, input.connectorId, input.name, input.sourceEntity, input.targetDimensionType, JSON.stringify(input.fieldMappings), input.hierarchyRules ? JSON.stringify(input.hierarchyRules) : null, JSON.stringify(input.filterRules ?? []), conflictResolution, input.createdBy, timestamp, timestamp);
        return { id, connectorId: input.connectorId, name: input.name, sourceEntity: input.sourceEntity, targetDimensionType: input.targetDimensionType, fieldMappings: input.fieldMappings as FieldMappingJson[], hierarchyRules: (input.hierarchyRules as HierarchyRuleJson) ?? null, filterRules: (input.filterRules ?? []) as FilterRuleJson[], conflictResolution, isActive: true, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      update(id: string, input: { name?: string; sourceEntity?: string; targetDimensionType?: string; fieldMappings?: unknown[]; hierarchyRules?: unknown; filterRules?: unknown[]; conflictResolution?: string; isActive?: boolean }): MappingRuleRow | null {
        const existing = this.getById(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const sourceEntity = input.sourceEntity ?? existing.sourceEntity;
        const targetDimensionType = input.targetDimensionType ?? existing.targetDimensionType;
        const fieldMappings = input.fieldMappings ?? existing.fieldMappings;
        const hierarchyRules = input.hierarchyRules !== undefined ? input.hierarchyRules : existing.hierarchyRules;
        const filterRules = input.filterRules ?? existing.filterRules;
        const conflictResolution = input.conflictResolution ?? existing.conflictResolution;
        const isActive = input.isActive ?? existing.isActive;
        const updatedAt = now();
        db.prepare(`
          UPDATE mapping_rules SET name = ?, source_entity = ?, target_dimension_type = ?, field_mappings_json = ?, hierarchy_rules_json = ?, filter_rules_json = ?, conflict_resolution = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(name, sourceEntity, targetDimensionType, JSON.stringify(fieldMappings), hierarchyRules ? JSON.stringify(hierarchyRules) : null, JSON.stringify(filterRules), conflictResolution, isActive ? 1 : 0, updatedAt, id);
        return { ...existing, name, sourceEntity, targetDimensionType, fieldMappings: fieldMappings as FieldMappingJson[], hierarchyRules: (hierarchyRules as HierarchyRuleJson) ?? null, filterRules: filterRules as FilterRuleJson[], conflictResolution, isActive, updatedAt };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM mapping_rules WHERE id = ?").run(id);
      }
    },
    syncJobs: {
      list(filters: { connectorId?: string; projectId?: string } = {}): SyncJobRow[] {
        let sql = "SELECT * FROM sync_jobs WHERE 1=1";
        const params: unknown[] = [];
        if (filters.connectorId) { sql += " AND connector_id = ?"; params.push(filters.connectorId); }
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        sql += " ORDER BY created_at DESC";
        return db.prepare(sql).all(...params).map(mapSyncJob);
      },
      getById(id: string): SyncJobRow | null {
        const row = db.prepare("SELECT * FROM sync_jobs WHERE id = ?").get(id);
        return row ? mapSyncJob(row) : null;
      },
      create(input: { connectorId: string; mappingRuleId: string; projectId: string; scheduleCron?: string; autoApprove?: boolean; createdBy: string }): SyncJobRow {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO sync_jobs (id, connector_id, mapping_rule_id, project_id, schedule_cron, auto_approve, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(id, input.connectorId, input.mappingRuleId, input.projectId, input.scheduleCron ?? null, input.autoApprove ? 1 : 0, input.createdBy, timestamp, timestamp);
        return { id, connectorId: input.connectorId, mappingRuleId: input.mappingRuleId, projectId: input.projectId, scheduleCron: input.scheduleCron ?? null, autoApprove: input.autoApprove ?? false, isActive: true, lastRunAt: null, nextRunAt: null, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      updateLastRun(id: string): void {
        db.prepare("UPDATE sync_jobs SET last_run_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), id);
      }
    },
    syncRuns: {
      listByJob(jobId: string): SyncRunRow[] {
        return db.prepare("SELECT * FROM sync_runs WHERE job_id = ? ORDER BY created_at DESC").all(jobId).map(mapSyncRun);
      },
      getById(id: string): SyncRunRow | null {
        const row = db.prepare("SELECT * FROM sync_runs WHERE id = ?").get(id);
        return row ? mapSyncRun(row) : null;
      },
      create(input: { jobId: string }): SyncRunRow {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO sync_runs (id, job_id, status, started_at, created_at)
          VALUES (?, ?, 'running', ?, ?)
        `).run(id, input.jobId, timestamp, timestamp);
        return { id, jobId: input.jobId, status: "running", sourceRecordsRead: 0, membersCreated: 0, membersUpdated: 0, membersDeleted: 0, relationshipsCreated: 0, relationshipsUpdated: 0, conflictsDetected: 0, conflictsResolved: 0, errorMessage: null, startedAt: timestamp, completedAt: null, createdAt: timestamp };
      },
      complete(id: string, result: { status: string; sourceRecordsRead: number; membersCreated: number; membersUpdated: number; membersDeleted: number; relationshipsCreated: number; relationshipsUpdated: number; conflictsDetected: number; conflictsResolved: number; errorMessage?: string }): void {
        const completedAt = now();
        db.prepare(`
          UPDATE sync_runs SET status = ?, source_records_read = ?, members_created = ?, members_updated = ?, members_deleted = ?, relationships_created = ?, relationships_updated = ?, conflicts_detected = ?, conflicts_resolved = ?, error_message = ?, completed_at = ?
          WHERE id = ?
        `).run(result.status, result.sourceRecordsRead, result.membersCreated, result.membersUpdated, result.membersDeleted, result.relationshipsCreated, result.relationshipsUpdated, result.conflictsDetected, result.conflictsResolved, result.errorMessage ?? null, completedAt, id);
      }
    },
    memberSourceRegistry: {
      listByProject(projectId: string, dimensionType?: string): MemberSourceRow[] {
        if (dimensionType) {
          return db.prepare("SELECT * FROM member_source_registry WHERE project_id = ? AND dimension_type = ? ORDER BY member_key").all(projectId, dimensionType).map(mapMemberSource);
        }
        return db.prepare("SELECT * FROM member_source_registry WHERE project_id = ? ORDER BY dimension_type, member_key").all(projectId).map(mapMemberSource);
      },
      upsert(input: { projectId: string; dimensionType: string; memberKey: string; sourceSystem: string; sourceId?: string }): MemberSourceRow {
        const timestamp = now();
        const existing = db.prepare("SELECT * FROM member_source_registry WHERE project_id = ? AND dimension_type = ? AND member_key = ?").get(input.projectId, input.dimensionType, input.memberKey);
        if (existing) {
          db.prepare("UPDATE member_source_registry SET source_system = ?, source_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ?").run(input.sourceSystem, input.sourceId ?? null, timestamp, timestamp, String(existing.id));
          return { id: String(existing.id), projectId: input.projectId, dimensionType: input.dimensionType, memberKey: input.memberKey, sourceSystem: input.sourceSystem, sourceId: input.sourceId ?? null, lastSyncedAt: timestamp, createdAt: String(existing.created_at), updatedAt: timestamp };
        }
        const id = nanoid();
        db.prepare(`
          INSERT INTO member_source_registry (id, project_id, dimension_type, member_key, source_system, source_id, last_synced_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.projectId, input.dimensionType, input.memberKey, input.sourceSystem, input.sourceId ?? null, timestamp, timestamp, timestamp);
        return { id, projectId: input.projectId, dimensionType: input.dimensionType, memberKey: input.memberKey, sourceSystem: input.sourceSystem, sourceId: input.sourceId ?? null, lastSyncedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
      }
    },
    impactAnalyses: {
      create(input: { projectId: string; changeSetId?: string; analysisType: string; scope: unknown; environmentId?: string; results: unknown; severity: string; summary: string; createdBy: string }): { id: string; projectId: string; changeSetId: string | null; analysisType: string; scope: unknown; environmentId: string | null; results: unknown; severity: string; summary: string; createdBy: string; createdAt: string } {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO impact_analyses (id, project_id, change_set_id, analysis_type, scope_json, environment_id, results_json, severity, summary, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.projectId, input.changeSetId ?? null, input.analysisType, JSON.stringify(input.scope), input.environmentId ?? null, JSON.stringify(input.results), input.severity, input.summary, input.createdBy, timestamp);
        return { id, projectId: input.projectId, changeSetId: input.changeSetId ?? null, analysisType: input.analysisType, scope: input.scope, environmentId: input.environmentId ?? null, results: input.results, severity: input.severity, summary: input.summary, createdBy: input.createdBy, createdAt: timestamp };
      },
      listByProject(projectId: string): { id: string; projectId: string; changeSetId: string | null; analysisType: string; severity: string; summary: string; createdBy: string; createdAt: string }[] {
        return db.prepare("SELECT id, project_id, change_set_id, analysis_type, severity, summary, created_by, created_at FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({
          id: String(row.id),
          projectId: String(row.project_id),
          changeSetId: row.change_set_id ? String(row.change_set_id) : null,
          analysisType: String(row.analysis_type),
          severity: String(row.severity),
          summary: String(row.summary),
          createdBy: String(row.created_by),
          createdAt: String(row.created_at)
        }));
      },
      findById(id: string): { id: string; projectId: string; changeSetId: string | null; analysisType: string; scope: unknown; environmentId: string | null; results: unknown; severity: string; summary: string; createdBy: string; createdAt: string } | null {
        const row = db.prepare("SELECT * FROM impact_analyses WHERE id = ?").get(id);
        if (!row) return null;
        return {
          id: String(row.id),
          projectId: String(row.project_id),
          changeSetId: row.change_set_id ? String(row.change_set_id) : null,
          analysisType: String(row.analysis_type),
          scope: parseJson(String(row.scope_json ?? "{}"), {}),
          environmentId: row.environment_id ? String(row.environment_id) : null,
          results: parseJson(String(row.results_json ?? "{}"), {}),
          severity: String(row.severity),
          summary: String(row.summary),
          createdBy: String(row.created_by),
          createdAt: String(row.created_at)
        };
      }
    },
    promotionPipelines: {
      list(): PromotionPipeline[] {
        return db.prepare("SELECT * FROM promotion_pipelines ORDER BY name ASC").all().map(mapPromotionPipeline);
      },
      getById(id: string): PromotionPipeline | null {
        const row = db.prepare("SELECT * FROM promotion_pipelines WHERE id = ?").get(id);
        return row ? mapPromotionPipeline(row) : null;
      },
      create(input: { name: string; stages: PromotionStage[]; createdBy: string }): PromotionPipeline {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO promotion_pipelines (id, name, stages_json, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)
        `).run(id, input.name, JSON.stringify(input.stages), input.createdBy, timestamp, timestamp);
        return { id, name: input.name, stages: input.stages, isActive: true, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      update(id: string, input: { name?: string; stages?: PromotionStage[]; isActive?: boolean }): PromotionPipeline | null {
        const existing = this.getById(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const stages = input.stages ?? existing.stages;
        const isActive = input.isActive ?? existing.isActive;
        const updatedAt = now();
        db.prepare(`
          UPDATE promotion_pipelines SET name = ?, stages_json = ?, is_active = ?, updated_at = ? WHERE id = ?
        `).run(name, JSON.stringify(stages), isActive ? 1 : 0, updatedAt, id);
        return { ...existing, name, stages, isActive, updatedAt };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM promotion_pipelines WHERE id = ?").run(id);
      }
    },
    environmentSyncStatus: {
      listByProject(projectId: string): EnvironmentSyncStatus[] {
        return db.prepare("SELECT * FROM environment_sync_status WHERE project_id = ? ORDER BY environment_id, dimension_type").all(projectId).map(mapEnvironmentSyncStatus);
      },
      listByEnvironment(environmentId: string, projectId?: string): EnvironmentSyncStatus[] {
        if (projectId) {
          return db.prepare("SELECT * FROM environment_sync_status WHERE environment_id = ? AND project_id = ? ORDER BY dimension_type").all(environmentId, projectId).map(mapEnvironmentSyncStatus);
        }
        return db.prepare("SELECT * FROM environment_sync_status WHERE environment_id = ? ORDER BY project_id, dimension_type").all(environmentId).map(mapEnvironmentSyncStatus);
      },
      upsert(input: { environmentId: string; projectId: string; dimensionType: string; lastDeployedAt?: string | null; localVersionHash: string; syncStatus: SyncStatus }): EnvironmentSyncStatus {
        const timestamp = now();
        const existing = db.prepare("SELECT id FROM environment_sync_status WHERE environment_id = ? AND project_id = ? AND dimension_type = ?").get(input.environmentId, input.projectId, input.dimensionType);
        if (existing) {
          db.prepare(`
            UPDATE environment_sync_status SET local_version_hash = ?, sync_status = ?, checked_at = ?, last_deployed_at = COALESCE(?, last_deployed_at)
            WHERE environment_id = ? AND project_id = ? AND dimension_type = ?
          `).run(input.localVersionHash, input.syncStatus, timestamp, input.lastDeployedAt ?? null, input.environmentId, input.projectId, input.dimensionType);
          const row = db.prepare("SELECT * FROM environment_sync_status WHERE environment_id = ? AND project_id = ? AND dimension_type = ?").get(input.environmentId, input.projectId, input.dimensionType);
          return mapEnvironmentSyncStatus(row!);
        }
        const id = nanoid();
        db.prepare(`
          INSERT INTO environment_sync_status (id, environment_id, project_id, dimension_type, last_deployed_at, local_version_hash, sync_status, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.environmentId, input.projectId, input.dimensionType, input.lastDeployedAt ?? null, input.localVersionHash, input.syncStatus, timestamp);
        return { id, environmentId: input.environmentId, projectId: input.projectId, dimensionType: input.dimensionType, lastDeployedAt: input.lastDeployedAt ?? null, localVersionHash: input.localVersionHash, syncStatus: input.syncStatus, checkedAt: timestamp };
      }
    },
    environmentOverrides: {
      list(filters: { environmentId?: string; projectId?: string } = {}): EnvironmentOverride[] {
        let sql = "SELECT * FROM environment_overrides WHERE 1=1";
        const params: unknown[] = [];
        if (filters.environmentId) { sql += " AND environment_id = ?"; params.push(filters.environmentId); }
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        sql += " ORDER BY dimension_type, member_key, property_name";
        return db.prepare(sql).all(...params).map(mapEnvironmentOverride);
      },
      getById(id: string): EnvironmentOverride | null {
        const row = db.prepare("SELECT * FROM environment_overrides WHERE id = ?").get(id);
        return row ? mapEnvironmentOverride(row) : null;
      },
      create(input: { environmentId: string; projectId: string; dimensionType: string; memberKey: string; propertyName: string; overrideValue: string; reason?: string; createdBy: string }): EnvironmentOverride {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO environment_overrides (id, environment_id, project_id, dimension_type, member_key, property_name, override_value, reason, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.environmentId, input.projectId, input.dimensionType, input.memberKey, input.propertyName, input.overrideValue, input.reason ?? "", input.createdBy, timestamp, timestamp);
        return { id, environmentId: input.environmentId, projectId: input.projectId, dimensionType: input.dimensionType, memberKey: input.memberKey, propertyName: input.propertyName, overrideValue: input.overrideValue, reason: input.reason ?? "", createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      update(id: string, input: { overrideValue?: string; reason?: string }): EnvironmentOverride | null {
        const existing = this.getById(id);
        if (!existing) return null;
        const overrideValue = input.overrideValue ?? existing.overrideValue;
        const reason = input.reason ?? existing.reason;
        const updatedAt = now();
        db.prepare("UPDATE environment_overrides SET override_value = ?, reason = ?, updated_at = ? WHERE id = ?").run(overrideValue, reason, updatedAt, id);
        return { ...existing, overrideValue, reason, updatedAt };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM environment_overrides WHERE id = ?").run(id);
      }
    },
    promotionHistory: {
      list(filters: { pipelineId?: string; projectId?: string } = {}): PromotionRecord[] {
        let sql = "SELECT * FROM promotion_history WHERE 1=1";
        const params: unknown[] = [];
        if (filters.pipelineId) { sql += " AND pipeline_id = ?"; params.push(filters.pipelineId); }
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        sql += " ORDER BY promoted_at DESC";
        return db.prepare(sql).all(...params).map(mapPromotionHistory);
      },
      create(input: { pipelineId: string; projectId: string; fromEnvironmentId: string; toEnvironmentId: string; deploymentId?: string | null; status: PromotionRecord["status"]; promotedBy: string }): PromotionRecord {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO promotion_history (id, pipeline_id, project_id, from_environment_id, to_environment_id, deployment_id, status, promoted_by, promoted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.pipelineId, input.projectId, input.fromEnvironmentId, input.toEnvironmentId, input.deploymentId ?? null, input.status, input.promotedBy, timestamp);
        return { id, pipelineId: input.pipelineId, projectId: input.projectId, fromEnvironmentId: input.fromEnvironmentId, toEnvironmentId: input.toEnvironmentId, deploymentId: input.deploymentId ?? null, status: input.status, promotedBy: input.promotedBy, promotedAt: timestamp };
      },
      updateStatus(id: string, status: PromotionRecord["status"], deploymentId?: string): void {
        if (deploymentId) {
          db.prepare("UPDATE promotion_history SET status = ?, deployment_id = ? WHERE id = ?").run(status, deploymentId, id);
        } else {
          db.prepare("UPDATE promotion_history SET status = ? WHERE id = ?").run(status, id);
        }
      }
    },
    aiSuggestions: {
      create(input: { projectId: string; dimensionId?: string; suggestionType: AISuggestionType; targetMemberKey?: string; suggestion: Record<string, unknown>; confidence: number }): AISuggestion {
        const id = nanoid();
        const timestamp = now();
        const record: AISuggestion = {
          id,
          projectId: input.projectId,
          dimensionId: input.dimensionId ?? null,
          suggestionType: input.suggestionType,
          targetMemberKey: input.targetMemberKey ?? null,
          suggestion: input.suggestion,
          confidence: input.confidence,
          status: 'pending',
          actedBy: null,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        db.prepare(`
          INSERT INTO ai_suggestions (id, project_id, dimension_id, suggestion_type, target_member_key, suggestion_json, confidence, status, acted_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, record.projectId, record.dimensionId, record.suggestionType, record.targetMemberKey, JSON.stringify(record.suggestion), record.confidence, record.status, record.actedBy, record.createdAt, record.updatedAt);
        return record;
      },
      listByProject(projectId: string, filters?: { type?: AISuggestionType; status?: AISuggestionStatus }): AISuggestion[] {
        let sql = "SELECT * FROM ai_suggestions WHERE project_id = ?";
        const params: unknown[] = [projectId];
        if (filters?.type) { sql += " AND suggestion_type = ?"; params.push(filters.type); }
        if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }
        sql += " ORDER BY created_at DESC";
        return db.prepare(sql).all(...params).map(mapAISuggestion);
      },
      updateStatus(id: string, status: AISuggestionStatus, actedBy: string): AISuggestion | null {
        const existing = db.prepare("SELECT * FROM ai_suggestions WHERE id = ?").get(id);
        if (!existing) return null;
        const timestamp = now();
        db.prepare("UPDATE ai_suggestions SET status = ?, acted_by = ?, updated_at = ? WHERE id = ?").run(status, actedBy, timestamp, id);
        return { ...mapAISuggestion(existing), status, actedBy, updatedAt: timestamp };
      },
      deleteByProject(projectId: string): void {
        db.prepare("DELETE FROM ai_suggestions WHERE project_id = ?").run(projectId);
      },
      get(id: string): AISuggestion | null {
        const row = db.prepare("SELECT * FROM ai_suggestions WHERE id = ?").get(id);
        return row ? mapAISuggestion(row) : null;
      }
    },
    aiConversations: {
      create(input: { projectId: string; userId: string; message: AIMessage }): AIConversation {
        const id = nanoid();
        const timestamp = now();
        const messages = [input.message];
        db.prepare(`
          INSERT INTO ai_conversations (id, project_id, user_id, messages_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, input.projectId, input.userId, JSON.stringify(messages), timestamp, timestamp);
        return { id, projectId: input.projectId, userId: input.userId, messages, createdAt: timestamp, updatedAt: timestamp };
      },
      get(id: string): AIConversation | null {
        const row = db.prepare("SELECT * FROM ai_conversations WHERE id = ?").get(id);
        return row ? mapAIConversation(row) : null;
      },
      listByProject(projectId: string): AIConversation[] {
        return db.prepare("SELECT * FROM ai_conversations WHERE project_id = ? ORDER BY updated_at DESC").all(projectId).map(mapAIConversation);
      },
      appendMessage(id: string, message: AIMessage): AIConversation | null {
        const existing = this.get(id);
        if (!existing) return null;
        const messages = [...existing.messages, message];
        const timestamp = now();
        db.prepare("UPDATE ai_conversations SET messages_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(messages), timestamp, id);
        return { ...existing, messages, updatedAt: timestamp };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM ai_conversations WHERE id = ?").run(id);
      }
    },
    crossDimensionRules: {
      create(input: { projectId: string; name: string; sourceDimensionType: string; targetDimensionType: string; ruleType: CrossDimensionRuleType; ruleConfig?: Record<string, unknown>; severity?: string; createdBy: string }): CrossDimensionRule {
        const id = nanoid();
        const timestamp = now();
        const rule: CrossDimensionRule = {
          id,
          projectId: input.projectId,
          name: input.name,
          sourceDimensionType: input.sourceDimensionType,
          targetDimensionType: input.targetDimensionType,
          ruleType: input.ruleType,
          ruleConfig: input.ruleConfig ?? {},
          severity: (input.severity as CrossDimensionRule['severity']) || 'warning',
          isActive: true,
          createdBy: input.createdBy,
          createdAt: timestamp
        };
        db.prepare(`
          INSERT INTO cross_dimension_rules (id, project_id, name, source_dimension_type, target_dimension_type, rule_type, rule_config_json, severity, is_active, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, rule.projectId, rule.name, rule.sourceDimensionType, rule.targetDimensionType, rule.ruleType, JSON.stringify(rule.ruleConfig), rule.severity, 1, rule.createdBy, rule.createdAt);
        return rule;
      },
      listByProject(projectId: string): CrossDimensionRule[] {
        return db.prepare("SELECT * FROM cross_dimension_rules WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(mapCrossDimensionRule);
      },
      get(id: string): CrossDimensionRule | null {
        const row = db.prepare("SELECT * FROM cross_dimension_rules WHERE id = ?").get(id);
        return row ? mapCrossDimensionRule(row) : null;
      },
      update(id: string, input: { name?: string; ruleConfig?: Record<string, unknown>; severity?: string; isActive?: boolean }): CrossDimensionRule | null {
        const existing = this.get(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const ruleConfig = input.ruleConfig ?? existing.ruleConfig;
        const severity = (input.severity as CrossDimensionRule['severity']) ?? existing.severity;
        const isActive = input.isActive ?? existing.isActive;
        db.prepare("UPDATE cross_dimension_rules SET name = ?, rule_config_json = ?, severity = ?, is_active = ? WHERE id = ?")
          .run(name, JSON.stringify(ruleConfig), severity, isActive ? 1 : 0, id);
        return { ...existing, name, ruleConfig, severity, isActive };
      },
      delete(id: string): void {
        db.prepare("DELETE FROM cross_dimension_rules WHERE id = ?").run(id);
      }
    },
    crossDimensionMappings: {
      create(input: { projectId: string; sourceDimensionType: string; sourceMemberKey: string; targetDimensionType: string; targetMemberKey: string; mappingType: CrossDimensionMappingType }): CrossDimensionMapping {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO cross_dimension_mappings (id, project_id, source_dimension_type, source_member_key, target_dimension_type, target_member_key, mapping_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.projectId, input.sourceDimensionType, input.sourceMemberKey, input.targetDimensionType, input.targetMemberKey, input.mappingType, timestamp);
        return { id, ...input, createdAt: timestamp };
      },
      listByProject(projectId: string): CrossDimensionMapping[] {
        return db.prepare("SELECT * FROM cross_dimension_mappings WHERE project_id = ? ORDER BY source_dimension_type, source_member_key").all(projectId).map(mapCrossDimensionMapping);
      },
      listByMember(projectId: string, memberKey: string): CrossDimensionMapping[] {
        return db.prepare("SELECT * FROM cross_dimension_mappings WHERE project_id = ? AND (source_member_key = ? OR target_member_key = ?)").all(projectId, memberKey, memberKey).map(mapCrossDimensionMapping);
      },
      delete(id: string): void {
        db.prepare("DELETE FROM cross_dimension_mappings WHERE id = ?").run(id);
      }
    },
    templates: {
      create(input: { name: string; description?: string; category?: TemplateCategory; industry?: TemplateIndustry; dimensionTypes: string[]; templateData: TemplateData; tags?: string[]; isPublic?: boolean; createdBy: string }): Template {
        const id = nanoid();
        const timestamp = now();
        const template: Template = {
          id,
          name: input.name,
          description: input.description ?? '',
          category: input.category ?? 'custom',
          industry: input.industry ?? null,
          dimensionTypes: input.dimensionTypes,
          templateData: input.templateData,
          tags: input.tags ?? [],
          version: '1.0.0',
          isPublic: input.isPublic ?? false,
          usageCount: 0,
          createdBy: input.createdBy,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        db.prepare(`
          INSERT INTO templates (id, name, description, category, industry, dimension_types_json, template_data_json, tags_json, version, is_public, usage_count, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, template.name, template.description, template.category, template.industry, JSON.stringify(template.dimensionTypes), JSON.stringify(template.templateData), JSON.stringify(template.tags), template.version, template.isPublic ? 1 : 0, 0, template.createdBy, template.createdAt, template.updatedAt);
        return template;
      },
      list(filters?: { category?: TemplateCategory; industry?: TemplateIndustry; search?: string }): Template[] {
        let sql = "SELECT * FROM templates WHERE 1=1";
        const params: unknown[] = [];
        if (filters?.category) { sql += " AND category = ?"; params.push(filters.category); }
        if (filters?.industry) { sql += " AND industry = ?"; params.push(filters.industry); }
        if (filters?.search) { sql += " AND (name LIKE ? OR description LIKE ? OR tags_json LIKE ?)"; const s = `%${filters.search}%`; params.push(s, s, s); }
        sql += " ORDER BY usage_count DESC, updated_at DESC";
        return db.prepare(sql).all(...params).map(mapTemplate);
      },
      get(id: string): Template | null {
        const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(id);
        return row ? mapTemplate(row) : null;
      },
      incrementUsage(id: string): void {
        db.prepare("UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?").run(now(), id);
      },
      delete(id: string): void {
        db.prepare("DELETE FROM templates WHERE id = ?").run(id);
      }
    },
    templateApplications: {
      create(input: { templateId: string; projectId: string; appliedBy: string; renameMapping?: Record<string, string> }): TemplateApplication {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`
          INSERT INTO template_applications (id, template_id, project_id, applied_by, rename_mapping_json, applied_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, input.templateId, input.projectId, input.appliedBy, input.renameMapping ? JSON.stringify(input.renameMapping) : null, timestamp);
        return { id, templateId: input.templateId, projectId: input.projectId, appliedBy: input.appliedBy, renameMapping: input.renameMapping ?? null, appliedAt: timestamp };
      },
      listByProject(projectId: string): TemplateApplication[] {
        return db.prepare("SELECT * FROM template_applications WHERE project_id = ? ORDER BY applied_at DESC").all(projectId).map(mapTemplateApplication);
      },
      listByTemplate(templateId: string): TemplateApplication[] {
        return db.prepare("SELECT * FROM template_applications WHERE template_id = ? ORDER BY applied_at DESC").all(templateId).map(mapTemplateApplication);
      }
    },
    reportDefinitions: {
      create(input: { name: string; reportType: ReportType; config?: ReportConfig; scheduleCron?: string; format?: ReportFormat; recipients?: string[]; createdBy: string }): ReportDefinition {
        const id = nanoid();
        const timestamp = now();
        const def: ReportDefinition = {
          id, name: input.name, reportType: input.reportType,
          config: input.config ?? {}, scheduleCron: input.scheduleCron ?? null,
          format: input.format ?? 'json', recipients: input.recipients ?? [],
          createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp
        };
        db.prepare(`INSERT INTO report_definitions (id, name, report_type, config_json, schedule_cron, format, recipients_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, def.name, def.reportType, JSON.stringify(def.config), def.scheduleCron, def.format, JSON.stringify(def.recipients), def.createdBy, def.createdAt, def.updatedAt);
        return def;
      },
      list(filters?: { reportType?: ReportType }): ReportDefinition[] {
        let sql = "SELECT * FROM report_definitions";
        const params: unknown[] = [];
        if (filters?.reportType) { sql += " WHERE report_type = ?"; params.push(filters.reportType); }
        sql += " ORDER BY updated_at DESC";
        return db.prepare(sql).all(...params).map(mapReportDefinition);
      },
      get(id: string): ReportDefinition | null {
        const row = db.prepare("SELECT * FROM report_definitions WHERE id = ?").get(id);
        return row ? mapReportDefinition(row) : null;
      },
      delete(id: string): void {
        db.prepare("DELETE FROM report_definitions WHERE id = ?").run(id);
      }
    },
    reportRuns: {
      create(input: { definitionId: string; status?: ReportRunStatus; outputData?: Record<string, unknown> }): ReportRun {
        const id = nanoid();
        const timestamp = now();
        const status = input.status ?? 'completed';
        db.prepare(`INSERT INTO report_runs (id, definition_id, status, output_data_json, generated_at) VALUES (?, ?, ?, ?, ?)`)
          .run(id, input.definitionId, status, input.outputData ? JSON.stringify(input.outputData) : null, timestamp);
        return { id, definitionId: input.definitionId, status, outputData: input.outputData ?? null, generatedAt: timestamp };
      },
      listByDefinition(definitionId: string): ReportRun[] {
        return db.prepare("SELECT * FROM report_runs WHERE definition_id = ? ORDER BY generated_at DESC").all(definitionId).map(mapReportRun);
      },
      get(id: string): ReportRun | null {
        const row = db.prepare("SELECT * FROM report_runs WHERE id = ?").get(id);
        return row ? mapReportRun(row) : null;
      }
    },
    healthSnapshots: {
      create(input: Omit<MetadataHealthSnapshot, 'id' | 'capturedAt'>): MetadataHealthSnapshot {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`INSERT INTO metadata_health_snapshots (id, project_id, dimension_type, quality_score, completeness_score, naming_score, validation_error_count, validation_warning_count, member_count, orphan_count, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, input.projectId, input.dimensionType, input.qualityScore, input.completenessScore, input.namingScore, input.validationErrorCount, input.validationWarningCount, input.memberCount, input.orphanCount, timestamp);
        return { id, ...input, capturedAt: timestamp };
      },
      listByProject(projectId: string, dimensionType?: string): MetadataHealthSnapshot[] {
        if (dimensionType) {
          return db.prepare("SELECT * FROM metadata_health_snapshots WHERE project_id = ? AND dimension_type = ? ORDER BY captured_at DESC").all(projectId, dimensionType).map(mapHealthSnapshot);
        }
        return db.prepare("SELECT * FROM metadata_health_snapshots WHERE project_id = ? ORDER BY captured_at DESC").all(projectId).map(mapHealthSnapshot);
      }
    },
    vcsBranches: {
      create(input: { projectId: string; name: string; baseBranchId?: string; createdBy: string }): VcsBranch {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`INSERT INTO vcs_branches (id, project_id, name, status, head_commit_id, base_branch_id, created_by, created_at) VALUES (?, ?, ?, 'active', NULL, ?, ?, ?)`)
          .run(id, input.projectId, input.name, input.baseBranchId ?? null, input.createdBy, timestamp);
        return { id, projectId: input.projectId, name: input.name, status: 'active', headCommitId: null, baseBranchId: input.baseBranchId ?? null, createdBy: input.createdBy, createdAt: timestamp };
      },
      listByProject(projectId: string): VcsBranch[] {
        return db.prepare("SELECT * FROM vcs_branches WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(mapVcsBranch);
      },
      get(id: string): VcsBranch | null {
        const row = db.prepare("SELECT * FROM vcs_branches WHERE id = ?").get(id);
        return row ? mapVcsBranch(row) : null;
      },
      updateHead(id: string, commitId: string): void {
        db.prepare("UPDATE vcs_branches SET head_commit_id = ? WHERE id = ?").run(commitId, id);
      },
      updateStatus(id: string, status: VcsBranchStatus): void {
        db.prepare("UPDATE vcs_branches SET status = ? WHERE id = ?").run(status, id);
      }
    },
    vcsCommits: {
      create(input: { projectId: string; branchId: string; message: string; snapshotData: ProjectSnapshot; parentCommitId?: string; createdBy: string }): VcsCommit {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`INSERT INTO vcs_commits (id, project_id, branch_id, message, snapshot_data_json, parent_commit_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, input.projectId, input.branchId, input.message, JSON.stringify(input.snapshotData), input.parentCommitId ?? null, input.createdBy, timestamp);
        return { id, projectId: input.projectId, branchId: input.branchId, message: input.message, snapshotData: input.snapshotData as unknown as Record<string, unknown>, parentCommitId: input.parentCommitId ?? null, createdBy: input.createdBy, createdAt: timestamp };
      },
      listByBranch(branchId: string): VcsCommit[] {
        return db.prepare("SELECT * FROM vcs_commits WHERE branch_id = ? ORDER BY created_at DESC").all(branchId).map(mapVcsCommit);
      },
      listByProject(projectId: string, limit = 50): VcsCommit[] {
        return db.prepare("SELECT * FROM vcs_commits WHERE project_id = ? ORDER BY created_at DESC LIMIT ?").all(projectId, limit).map(mapVcsCommit);
      },
      get(id: string): VcsCommit | null {
        const row = db.prepare("SELECT * FROM vcs_commits WHERE id = ?").get(id);
        return row ? mapVcsCommit(row) : null;
      }
    },
    vcsTags: {
      create(input: { projectId: string; name: string; commitId: string; description?: string; createdBy: string }): VcsTag {
        const id = nanoid();
        const timestamp = now();
        db.prepare(`INSERT INTO vcs_tags (id, project_id, name, commit_id, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(id, input.projectId, input.name, input.commitId, input.description ?? '', input.createdBy, timestamp);
        return { id, projectId: input.projectId, name: input.name, commitId: input.commitId, description: input.description ?? '', createdBy: input.createdBy, createdAt: timestamp };
      },
      listByProject(projectId: string): VcsTag[] {
        return db.prepare("SELECT * FROM vcs_tags WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(mapVcsTag);
      },
      delete(id: string): void {
        db.prepare("DELETE FROM vcs_tags WHERE id = ?").run(id);
      }
    },
    editLocks: {
      acquire(input: { projectId: string; dimensionId: string; userId: string; durationMinutes?: number }): EditLock {
        const id = nanoid(); const timestamp = now(); const duration = input.durationMinutes ?? 30;
        const expires = new Date(Date.now() + duration * 60 * 1000).toISOString();
        db.prepare("DELETE FROM edit_locks WHERE project_id = ? AND dimension_id = ? AND expires_at < ?").run(input.projectId, input.dimensionId, timestamp);
        db.prepare("INSERT INTO edit_locks (id, project_id, dimension_id, user_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.projectId, input.dimensionId, input.userId, timestamp, expires);
        return { id, projectId: input.projectId, dimensionId: input.dimensionId, userId: input.userId, acquiredAt: timestamp, expiresAt: expires };
      },
      getActive(projectId: string, dimensionId: string): EditLock | null {
        const row = db.prepare("SELECT * FROM edit_locks WHERE project_id = ? AND dimension_id = ? AND expires_at > ? ORDER BY acquired_at DESC LIMIT 1").get(projectId, dimensionId, now());
        if (!row) return null;
        return { id: String(row.id), projectId: String(row.project_id), dimensionId: String(row.dimension_id), userId: String(row.user_id), acquiredAt: String(row.acquired_at), expiresAt: String(row.expires_at) };
      },
      release(projectId: string, dimensionId: string, userId: string): void { db.prepare("DELETE FROM edit_locks WHERE project_id = ? AND dimension_id = ? AND user_id = ?").run(projectId, dimensionId, userId); },
      listByProject(projectId: string): EditLock[] { return db.prepare("SELECT * FROM edit_locks WHERE project_id = ? AND expires_at > ?").all(projectId, now()).map(row => ({ id: String(row.id), projectId: String(row.project_id), dimensionId: String(row.dimension_id), userId: String(row.user_id), acquiredAt: String(row.acquired_at), expiresAt: String(row.expires_at) })); }
    },
    scheduledJobs: {
      create(input: { projectId: string; name: string; triggerType: string; triggerConfig?: Record<string, unknown>; actionType: string; actionConfig?: Record<string, unknown>; createdBy: string }): ScheduledJob {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO scheduled_jobs (id, project_id, name, trigger_type, trigger_config_json, action_type, action_config_json, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)").run(id, input.projectId, input.name, input.triggerType, JSON.stringify(input.triggerConfig ?? {}), input.actionType, JSON.stringify(input.actionConfig ?? {}), input.createdBy, timestamp, timestamp);
        return { id, projectId: input.projectId, name: input.name, triggerType: input.triggerType as ScheduledJob['triggerType'], triggerConfig: input.triggerConfig ?? {}, actionType: input.actionType, actionConfig: input.actionConfig ?? {}, status: 'active', lastRunAt: null, nextRunAt: null, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      listByProject(projectId: string): ScheduledJob[] { return db.prepare("SELECT * FROM scheduled_jobs WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), triggerType: String(row.trigger_type) as ScheduledJob['triggerType'], triggerConfig: parseJson(String(row.trigger_config_json ?? "{}"), {}), actionType: String(row.action_type), actionConfig: parseJson(String(row.action_config_json ?? "{}"), {}), status: String(row.status) as JobStatus, lastRunAt: row.last_run_at ? String(row.last_run_at) : null, nextRunAt: row.next_run_at ? String(row.next_run_at) : null, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      get(id: string): ScheduledJob | null { const row = db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id); if (!row) return null; return { id: String(row.id), projectId: String(row.project_id), name: String(row.name), triggerType: String(row.trigger_type) as ScheduledJob['triggerType'], triggerConfig: parseJson(String(row.trigger_config_json ?? "{}"), {}), actionType: String(row.action_type), actionConfig: parseJson(String(row.action_config_json ?? "{}"), {}), status: String(row.status) as JobStatus, lastRunAt: row.last_run_at ? String(row.last_run_at) : null, nextRunAt: row.next_run_at ? String(row.next_run_at) : null, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; },
      delete(id: string): void { db.prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id); }
    },
    jobExecutions: {
      create(input: { jobId: string; status?: JobExecutionStatus; result?: Record<string, unknown>; errorMessage?: string }): JobExecution {
        const id = nanoid(); const timestamp = now(); const status = input.status ?? 'pending';
        db.prepare("INSERT INTO job_executions (id, job_id, status, started_at, completed_at, result_json, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, input.jobId, status, timestamp, status === 'succeeded' || status === 'failed' ? timestamp : null, input.result ? JSON.stringify(input.result) : null, input.errorMessage ?? null);
        return { id, jobId: input.jobId, status, startedAt: timestamp, completedAt: status === 'succeeded' || status === 'failed' ? timestamp : null, result: input.result ?? null, errorMessage: input.errorMessage ?? null };
      },
      listByJob(jobId: string): JobExecution[] { return db.prepare("SELECT * FROM job_executions WHERE job_id = ? ORDER BY started_at DESC").all(jobId).map(row => ({ id: String(row.id), jobId: String(row.job_id), status: String(row.status) as JobExecutionStatus, startedAt: String(row.started_at), completedAt: row.completed_at ? String(row.completed_at) : null, result: row.result_json ? parseJson(String(row.result_json), {}) : null, errorMessage: row.error_message ? String(row.error_message) : null })); }
    },
    qualityRules: {
      create(input: { projectId: string; name: string; category: string; weight?: number; config?: Record<string, unknown>; createdBy: string }): QualityRule {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO quality_rules (id, project_id, name, category, weight, config_json, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(id, input.projectId, input.name, input.category, input.weight ?? 1.0, JSON.stringify(input.config ?? {}), input.createdBy, timestamp);
        return { id, projectId: input.projectId, name: input.name, category: input.category as QualityRule['category'], weight: input.weight ?? 1.0, config: input.config ?? {}, isActive: true, createdBy: input.createdBy, createdAt: timestamp };
      },
      listByProject(projectId: string): QualityRule[] { return db.prepare("SELECT * FROM quality_rules WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), category: String(row.category) as QualityRule['category'], weight: Number(row.weight ?? 1), config: parseJson(String(row.config_json ?? "{}"), {}), isActive: Boolean(row.is_active), createdBy: String(row.created_by), createdAt: String(row.created_at) })); },
      delete(id: string): void { db.prepare("DELETE FROM quality_rules WHERE id = ?").run(id); }
    },
    qualityGates: {
      create(input: { projectId: string; name: string; threshold: number; scope?: string; action?: string; createdBy: string }): QualityGate {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO quality_gates (id, project_id, name, threshold, scope, action, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(id, input.projectId, input.name, input.threshold, input.scope ?? 'project', input.action ?? 'warn', input.createdBy, timestamp);
        return { id, projectId: input.projectId, name: input.name, threshold: input.threshold, scope: (input.scope ?? 'project') as QualityGate['scope'], action: (input.action ?? 'warn') as QualityGate['action'], isActive: true, createdBy: input.createdBy, createdAt: timestamp };
      },
      listByProject(projectId: string): QualityGate[] { return db.prepare("SELECT * FROM quality_gates WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), threshold: Number(row.threshold), scope: String(row.scope ?? 'project') as QualityGate['scope'], action: String(row.action ?? 'warn') as QualityGate['action'], isActive: Boolean(row.is_active), createdBy: String(row.created_by), createdAt: String(row.created_at) })); },
      delete(id: string): void { db.prepare("DELETE FROM quality_gates WHERE id = ?").run(id); }
    },
    migrationProjects: {
      create(input: { projectId: string; name: string; sourceType: string; createdBy: string }): MigrationProject {
        const id = nanoid(); const timestamp = now();
        const progress = { totalDimensions: 0, completedDimensions: 0, totalMembers: 0, mappedMembers: 0, unmappedMembers: 0, gapCount: 0 };
        db.prepare("INSERT INTO migration_projects (id, project_id, name, source_type, status, source_config_json, progress_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', '{}', ?, ?, ?, ?)").run(id, input.projectId, input.name, input.sourceType, JSON.stringify(progress), input.createdBy, timestamp, timestamp);
        return { id, projectId: input.projectId, name: input.name, sourceType: input.sourceType as MigrationProject['sourceType'], status: 'draft', sourceConfig: {}, progress, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      listByProject(projectId: string): MigrationProject[] { return db.prepare("SELECT * FROM migration_projects WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), sourceType: String(row.source_type) as MigrationProject['sourceType'], status: String(row.status) as MigrationProject['status'], sourceConfig: parseJson(String(row.source_config_json ?? "{}"), {}), progress: parseJson(String(row.progress_json ?? "{}"), { totalDimensions: 0, completedDimensions: 0, totalMembers: 0, mappedMembers: 0, unmappedMembers: 0, gapCount: 0 }), createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      delete(id: string): void { db.prepare("DELETE FROM migration_projects WHERE id = ?").run(id); }
    },
    webhookSubscriptions: {
      create(input: { projectId: string; url: string; events: string[]; secret?: string; createdBy: string }): WebhookConfig {
        const id = nanoid(); const timestamp = now(); const secret = input.secret ?? nanoid(32);
        db.prepare("INSERT INTO webhook_subscriptions (id, project_id, url, events_json, secret, is_active, failure_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)").run(id, input.projectId, input.url, JSON.stringify(input.events), secret, input.createdBy, timestamp);
        return { id, projectId: input.projectId, name: input.url, url: input.url, secret, events: input.events, isActive: true, createdAt: timestamp };
      },
      listByProject(projectId: string): WebhookConfig[] { return db.prepare("SELECT * FROM webhook_subscriptions WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.url), url: String(row.url), secret: String(row.secret), events: parseJson<string[]>(String(row.events_json ?? "[]"), []), isActive: Boolean(row.is_active), createdAt: String(row.created_at) })); },
      delete(id: string): void { db.prepare("DELETE FROM webhook_subscriptions WHERE id = ?").run(id); }
    },
    syncQueue: {
      create(input: { projectId: string; operationType: string; entityType: string; entityId: string; payload: Record<string, unknown> }): SyncQueueEntry {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO sync_queue (id, project_id, operation_type, entity_type, entity_id, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)").run(id, input.projectId, input.operationType, input.entityType, input.entityId, JSON.stringify(input.payload), timestamp);
        return { id, projectId: input.projectId, operationType: input.operationType as SyncQueueEntry['operationType'], entityType: input.entityType as SyncQueueEntry['entityType'], entityId: input.entityId, payload: input.payload, status: 'pending', createdAt: timestamp, syncedAt: null };
      },
      listPending(projectId: string): SyncQueueEntry[] { return db.prepare("SELECT * FROM sync_queue WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), operationType: String(row.operation_type) as SyncQueueEntry['operationType'], entityType: String(row.entity_type) as SyncQueueEntry['entityType'], entityId: String(row.entity_id), payload: parseJson(String(row.payload_json ?? "{}"), {}), status: String(row.status) as SyncQueueEntry['status'], createdAt: String(row.created_at), syncedAt: row.synced_at ? String(row.synced_at) : null })); },
      markSynced(id: string): void { db.prepare("UPDATE sync_queue SET status = 'synced', synced_at = ? WHERE id = ?").run(now(), id); },
      countPending(projectId: string): number { return Number(db.prepare("SELECT COUNT(*) as count FROM sync_queue WHERE project_id = ? AND status = 'pending'").get(projectId)?.count ?? 0); }
    },
    generatedDocuments: {
      create(input: { projectId: string; title: string; format: string; content: string; snapshotId?: string; generatedBy: string }): { id: string; projectId: string; title: string; format: string; content: string; snapshotId: string | null; generatedBy: string; generatedAt: string } {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO generated_documents (id, project_id, title, format, content, snapshot_id, generated_by, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.projectId, input.title, input.format, input.content, input.snapshotId ?? null, input.generatedBy, timestamp);
        return { id, projectId: input.projectId, title: input.title, format: input.format, content: input.content, snapshotId: input.snapshotId ?? null, generatedBy: input.generatedBy, generatedAt: timestamp };
      },
      listByProject(projectId: string): Array<{ id: string; title: string; format: string; generatedAt: string }> { return db.prepare("SELECT id, title, format, generated_at FROM generated_documents WHERE project_id = ? ORDER BY generated_at DESC").all(projectId).map(row => ({ id: String(row.id), title: String(row.title), format: String(row.format), generatedAt: String(row.generated_at) })); },
      get(id: string): { id: string; projectId: string; title: string; format: string; content: string; snapshotId: string | null; generatedBy: string; generatedAt: string } | null { const row = db.prepare("SELECT * FROM generated_documents WHERE id = ?").get(id); if (!row) return null; return { id: String(row.id), projectId: String(row.project_id), title: String(row.title), format: String(row.format), content: String(row.content), snapshotId: row.snapshot_id ? String(row.snapshot_id) : null, generatedBy: String(row.generated_by), generatedAt: String(row.generated_at) }; },
      delete(id: string): void { db.prepare("DELETE FROM generated_documents WHERE id = ?").run(id); }
    },
    tenants: {
      create(input: { name: string; slug: string; config?: TenantConfig }): Tenant {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO tenants (id, name, slug, config_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(id, input.name, input.slug, JSON.stringify(input.config ?? {}), timestamp, timestamp);
        return { id, name: input.name, slug: input.slug, config: input.config ?? {}, status: 'active', createdAt: timestamp, updatedAt: timestamp };
      },
      list(): Tenant[] { return db.prepare("SELECT * FROM tenants ORDER BY name ASC").all().map(row => ({ id: String(row.id), name: String(row.name), slug: String(row.slug), config: parseJson(String(row.config_json ?? "{}"), {}), status: String(row.status) as Tenant['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      getBySlug(slug: string): Tenant | null { const row = db.prepare("SELECT * FROM tenants WHERE slug = ?").get(slug); if (!row) return null; return { id: String(row.id), name: String(row.name), slug: String(row.slug), config: parseJson(String(row.config_json ?? "{}"), {}), status: String(row.status) as Tenant['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; },
      delete(id: string): void { db.prepare("DELETE FROM tenants WHERE id = ?").run(id); }
    },
    comments: {
      create(input: { projectId: string; dimensionId: string; memberKey?: string; content: string; authorId: string; authorName: string; mentions?: string[]; parentCommentId?: string }): CollaborationComment {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO collaboration_comments (id, project_id, dimension_id, member_key, content, author_id, author_name, mentions_json, parent_comment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.projectId, input.dimensionId, input.memberKey ?? null, input.content, input.authorId, input.authorName, JSON.stringify(input.mentions ?? []), input.parentCommentId ?? null, timestamp, timestamp);
        return { id, projectId: input.projectId, dimensionId: input.dimensionId, memberKey: input.memberKey ?? null, content: input.content, authorId: input.authorId, authorName: input.authorName, mentions: input.mentions ?? [], parentCommentId: input.parentCommentId ?? null, createdAt: timestamp, updatedAt: timestamp };
      },
      listByProject(projectId: string): CollaborationComment[] { return db.prepare("SELECT * FROM collaboration_comments WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(row => ({ id: String(row.id), projectId: String(row.project_id), dimensionId: String(row.dimension_id), memberKey: row.member_key ? String(row.member_key) : null, content: String(row.content), authorId: String(row.author_id), authorName: String(row.author_name ?? ''), mentions: parseJson<string[]>(String(row.mentions_json ?? "[]"), []), parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      delete(id: string): void { db.prepare("DELETE FROM collaboration_comments WHERE id = ?").run(id); }
    },
    auditLog: {
      create(input: { tenantId?: string; projectId?: string; userId: string; action: string; entityType: string; entityId: string; changes?: Record<string, unknown>; ipAddress?: string }): AuditLogEntry {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO audit_log (id, tenant_id, project_id, user_id, action, entity_type, entity_id, changes_json, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.tenantId ?? null, input.projectId ?? null, input.userId, input.action, input.entityType, input.entityId, JSON.stringify(input.changes ?? {}), input.ipAddress ?? null, timestamp);
        return { id, tenantId: input.tenantId ?? null, projectId: input.projectId ?? null, userId: input.userId, action: input.action, entityType: input.entityType, entityId: input.entityId, changes: input.changes ?? {}, ipAddress: input.ipAddress ?? null, timestamp };
      },
      listByProject(projectId: string, limit = 100): AuditLogEntry[] { return db.prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?").all(projectId, limit).map(row => ({ id: String(row.id), tenantId: row.tenant_id ? String(row.tenant_id) : null, projectId: row.project_id ? String(row.project_id) : null, userId: String(row.user_id), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id), changes: parseJson(String(row.changes_json ?? "{}"), {}), ipAddress: row.ip_address ? String(row.ip_address) : null, timestamp: String(row.timestamp) })); },
      countByProject(projectId: string): number { return Number(db.prepare("SELECT COUNT(*) as count FROM audit_log WHERE project_id = ?").get(projectId)?.count ?? 0); }
    },
    retentionPolicies: {
      create(input: { tenantId?: string; entityType: string; retentionDays: number }): RetentionPolicy {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT INTO retention_policies (id, tenant_id, entity_type, retention_days, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(id, input.tenantId ?? null, input.entityType, input.retentionDays, timestamp);
        return { id, tenantId: input.tenantId ?? null, entityType: input.entityType, retentionDays: input.retentionDays, isActive: true, createdAt: timestamp };
      },
      list(): RetentionPolicy[] { return db.prepare("SELECT * FROM retention_policies ORDER BY created_at DESC").all().map(row => ({ id: String(row.id), tenantId: row.tenant_id ? String(row.tenant_id) : null, entityType: String(row.entity_type), retentionDays: Number(row.retention_days), isActive: Boolean(row.is_active), createdAt: String(row.created_at) })); }
    },
    propertyDefaults: {
      createActiveProfile(input: {
        projectId: string;
        name: string;
        sourceFileName: string;
        sourceXmlHash: string;
        createdBy?: string;
        values: Array<{
          dimensionType: string;
          targetLevel: "dimension" | "member" | "relationship";
          propertyName: string;
          xmlName: string;
          defaultValue: string;
          enabled?: boolean;
          confidence: number;
          sampleCount: number;
          nonBlankCount: number;
          distinctCount: number;
          sourceDimensionNames: string[];
        }>;
      }): { profile: PropertyDefaultProfileRecord; values: PropertyDefaultValueRecord[] } {
        return runInTransactionSync(db, () => {
          const timestamp = now();
          db.prepare("UPDATE property_default_profiles SET is_active = 0, updated_at = ? WHERE project_id = ? AND is_active = 1")
            .run(timestamp, input.projectId);

          const profile: PropertyDefaultProfileRecord = {
            id: nanoid(),
            projectId: input.projectId,
            name: input.name,
            sourceFileName: input.sourceFileName,
            sourceXmlHash: input.sourceXmlHash,
            isActive: true,
            createdBy: input.createdBy ?? "local-admin",
            createdAt: timestamp,
            updatedAt: timestamp
          };

          db.prepare(`
            INSERT INTO property_default_profiles (
              id, project_id, name, source_file_name, source_xml_hash, is_active, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
          `).run(
            profile.id,
            profile.projectId,
            profile.name,
            profile.sourceFileName,
            profile.sourceXmlHash,
            profile.createdBy,
            profile.createdAt,
            profile.updatedAt
          );

          const insertValue = db.prepare(`
            INSERT INTO property_default_values (
              id, profile_id, dimension_type, target_level, property_name, xml_name, default_value, enabled,
              confidence, sample_count, non_blank_count, distinct_count, source_dimension_names_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const values: PropertyDefaultValueRecord[] = input.values.map((value) => {
            const record: PropertyDefaultValueRecord = {
              id: nanoid(),
              profileId: profile.id,
              dimensionType: value.dimensionType,
              targetLevel: value.targetLevel,
              propertyName: value.propertyName,
              xmlName: value.xmlName,
              defaultValue: value.defaultValue,
              enabled: value.enabled ?? true,
              confidence: value.confidence,
              sampleCount: value.sampleCount,
              nonBlankCount: value.nonBlankCount,
              distinctCount: value.distinctCount,
              sourceDimensionNames: value.sourceDimensionNames,
              updatedAt: timestamp
            };
            insertValue.run(
              record.id,
              record.profileId,
              record.dimensionType,
              record.targetLevel,
              record.propertyName,
              record.xmlName,
              record.defaultValue,
              record.enabled ? 1 : 0,
              record.confidence,
              record.sampleCount,
              record.nonBlankCount,
              record.distinctCount,
              JSON.stringify(record.sourceDimensionNames),
              record.updatedAt
            );
            return record;
          });

          return { profile, values };
        });
      },
      getActiveProfile(projectId: string): PropertyDefaultProfileRecord | null {
        const row = db.prepare(
          "SELECT * FROM property_default_profiles WHERE project_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1"
        ).get(projectId);
        return row ? mapPropertyDefaultProfile(row) : null;
      },
      listValues(projectId: string, dimensionType?: string): PropertyDefaultValueRecord[] {
        const profile = this.getActiveProfile(projectId);
        if (!profile) return [];
        if (dimensionType) {
          return db.prepare(
            "SELECT * FROM property_default_values WHERE profile_id = ? AND dimension_type = ? ORDER BY target_level, property_name"
          ).all(profile.id, dimensionType).map(mapPropertyDefaultValue);
        }
        return db.prepare(
          "SELECT * FROM property_default_values WHERE profile_id = ? ORDER BY dimension_type, target_level, property_name"
        ).all(profile.id).map(mapPropertyDefaultValue);
      },
      getValueById(defaultId: string): PropertyDefaultValueRecord | null {
        const row = db.prepare("SELECT * FROM property_default_values WHERE id = ?").get(defaultId);
        return row ? mapPropertyDefaultValue(row) : null;
      },
      updateValue(
        defaultId: string,
        input: { defaultValue?: string; enabled?: boolean }
      ): PropertyDefaultValueRecord | null {
        const existing = this.getValueById(defaultId);
        if (!existing) return null;
        const updatedAt = now();
        const defaultValue = input.defaultValue !== undefined ? input.defaultValue : existing.defaultValue;
        const enabled = input.enabled !== undefined ? input.enabled : existing.enabled;
        db.prepare(`
          UPDATE property_default_values
          SET default_value = ?, enabled = ?, updated_at = ?
          WHERE id = ?
        `).run(defaultValue, enabled ? 1 : 0, updatedAt, defaultId);
        db.prepare("UPDATE property_default_profiles SET updated_at = ? WHERE id = ?")
          .run(updatedAt, existing.profileId);
        return { ...existing, defaultValue, enabled, updatedAt };
      },
      listCatalog(dimensionType?: string): PropertyDefaultCatalogRecord[] {
        if (dimensionType) {
          return db.prepare(
            "SELECT * FROM property_default_catalog WHERE dimension_type = ? ORDER BY target_level, property_name"
          ).all(dimensionType).map(mapPropertyDefaultCatalog);
        }
        return db.prepare(
          "SELECT * FROM property_default_catalog ORDER BY dimension_type, target_level, property_name"
        ).all().map(mapPropertyDefaultCatalog);
      },
      getCatalogById(catalogId: string): PropertyDefaultCatalogRecord | null {
        const row = db.prepare("SELECT * FROM property_default_catalog WHERE id = ?").get(catalogId);
        return row ? mapPropertyDefaultCatalog(row) : null;
      },
      updateCatalog(
        catalogId: string,
        input: { defaultValue?: string; enabled?: boolean }
      ): PropertyDefaultCatalogRecord | null {
        const existing = this.getCatalogById(catalogId);
        if (!existing) return null;
        const updatedAt = now();
        const defaultValue = input.defaultValue !== undefined ? input.defaultValue : existing.defaultValue;
        const enabled = input.enabled !== undefined ? input.enabled : existing.enabled;
        db.prepare(`
          UPDATE property_default_catalog
          SET default_value = ?, enabled = ?, updated_at = ?
          WHERE id = ?
        `).run(defaultValue, enabled ? 1 : 0, updatedAt, catalogId);
        return { ...existing, defaultValue, enabled, updatedAt };
      },
      listDisplayRows(_projectId: string, dimensionType?: string): PropertyDefaultDisplayRow[] {
        return this.listCatalog(dimensionType).map(toPropertyDefaultDisplayRow);
      },
      listOverrides(projectId: string, dimensionType?: string): PropertyDefaultOverrideRecord[] {
        if (dimensionType) {
          return db.prepare(
            "SELECT * FROM property_default_overrides WHERE project_id = ? AND dimension_type = ? ORDER BY target_level, property_name"
          ).all(projectId, dimensionType).map(mapPropertyDefaultOverride);
        }
        return db.prepare(
          "SELECT * FROM property_default_overrides WHERE project_id = ? ORDER BY dimension_type, target_level, property_name"
        ).all(projectId).map(mapPropertyDefaultOverride);
      },
      getOverrideById(overrideId: string): PropertyDefaultOverrideRecord | null {
        const row = db.prepare("SELECT * FROM property_default_overrides WHERE id = ?").get(overrideId);
        return row ? mapPropertyDefaultOverride(row) : null;
      },
      upsertOverride(input: {
        projectId: string;
        dimensionType: string;
        targetLevel: "dimension" | "member" | "relationship";
        propertyName: string;
        xmlName: string;
        defaultValue: string;
        enabled: boolean;
      }): PropertyDefaultOverrideRecord {
        const updatedAt = now();
        const existing = db.prepare(`
          SELECT id FROM property_default_overrides
          WHERE project_id = ? AND dimension_type = ? AND target_level = ? AND property_name = ?
        `).get(input.projectId, input.dimensionType, input.targetLevel, input.propertyName) as { id: string } | undefined;

        if (existing) {
          db.prepare(`
            UPDATE property_default_overrides
            SET default_value = ?, enabled = ?, xml_name = ?, updated_at = ?
            WHERE id = ?
          `).run(input.defaultValue, input.enabled ? 1 : 0, input.xmlName, updatedAt, existing.id);
          return this.getOverrideById(existing.id)!;
        }

        const record: PropertyDefaultOverrideRecord = {
          id: nanoid(),
          projectId: input.projectId,
          dimensionType: input.dimensionType as PropertyDefaultOverrideRecord["dimensionType"],
          targetLevel: input.targetLevel,
          propertyName: input.propertyName,
          xmlName: input.xmlName,
          defaultValue: input.defaultValue,
          enabled: input.enabled,
          updatedAt
        };
        db.prepare(`
          INSERT INTO property_default_overrides (
            id, project_id, dimension_type, target_level, property_name, xml_name, default_value, enabled, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.id,
          record.projectId,
          record.dimensionType,
          record.targetLevel,
          record.propertyName,
          record.xmlName,
          record.defaultValue,
          record.enabled ? 1 : 0,
          record.updatedAt
        );
        return record;
      },
      getEffectiveDefaultsForExport(_projectId: string): PropertyDefaultResolutionEntry[] {
        return toPropertyDefaultResolutionEntries(this.listCatalog());
      }
    },
    projectMembers: {
      add(input: { projectId: string; userId: string; role: string; grantedBy: string }): { id: string; projectId: string; userId: string; role: string; grantedBy: string; grantedAt: string } {
        const id = nanoid(); const timestamp = now();
        db.prepare("INSERT OR REPLACE INTO project_members (id, project_id, user_id, role, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.projectId, input.userId, input.role, input.grantedBy, timestamp);
        return { id, projectId: input.projectId, userId: input.userId, role: input.role, grantedBy: input.grantedBy, grantedAt: timestamp };
      },
      remove(projectId: string, userId: string): void { db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(projectId, userId); },
      listByProject(projectId: string): Array<{ id: string; projectId: string; userId: string; role: string; grantedBy: string; grantedAt: string }> {
        return db.prepare("SELECT * FROM project_members WHERE project_id = ? ORDER BY granted_at DESC").all(projectId).map(row => ({
          id: String(row.id), projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), grantedBy: String(row.granted_by), grantedAt: String(row.granted_at)
        }));
      },
      getUserRole(projectId: string, userId: string): string | null {
        const row = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId) as Record<string, unknown> | undefined;
        return row ? String(row.role) : null;
      },
      listByUser(userId: string): Array<{ id: string; projectId: string; userId: string; role: string; grantedBy: string; grantedAt: string }> {
        return db.prepare("SELECT * FROM project_members WHERE user_id = ? ORDER BY granted_at DESC").all(userId).map(row => ({
          id: String(row.id), projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), grantedBy: String(row.granted_by), grantedAt: String(row.granted_at)
        }));
      }
    }
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

function runInTransactionSync<T>(db: AppDatabase, action: () => T): T {
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
  const metadata = parseJson(String(row.metadata_json ?? "{}"), {}) as Record<string, unknown>;
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
    revertToDefaultScenarioType: Boolean(metadata.revertToDefaultScenarioType),
    source: String(row.source ?? ""),
    metadata,
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
    bySeverity: { error: 0, warning: 0, info: 0, off: 0 },
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
    dimensions: sortDimensionsByType(
      db.prepare("SELECT * FROM dimensions WHERE project_id = ?").all(projectId).map(mapDimension)
    ),
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
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (input.revertToDefaultScenarioType) {
    metadata.revertToDefaultScenarioType = true;
  }
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
    revertToDefaultScenarioType: Boolean(input.revertToDefaultScenarioType),
    source: String(input.source ?? ""),
    metadata
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapWorkflowDefinition(row: Record<string, unknown>): WorkflowDefinition {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    dimensionTypes: String(row.dimension_types ?? "*"),
    steps: parseJson(String(row.steps_json ?? "[]"), []),
    autoAdvanceRules: parseJson(String(row.auto_advance_rules_json ?? "{}"), {}),
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapWorkflowInstance(row: Record<string, unknown>): WorkflowInstance {
  return {
    id: String(row.id),
    definitionId: String(row.definition_id),
    changeSetId: String(row.change_set_id),
    projectId: String(row.project_id),
    currentStepIndex: Number(row.current_step_index ?? 0),
    status: String(row.status) as WorkflowInstance["status"],
    submittedBy: String(row.submitted_by),
    submittedAt: String(row.submitted_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapWorkflowStepAction(row: Record<string, unknown>): WorkflowStepActionRecord {
  return {
    id: String(row.id),
    instanceId: String(row.instance_id),
    stepIndex: Number(row.step_index),
    action: String(row.action) as WorkflowStepAction,
    actorId: String(row.actor_id),
    comment: String(row.comment ?? ""),
    createdAt: String(row.created_at)
  };
}

function mapWorkflowNotification(row: Record<string, unknown>): WorkflowNotification {
  return {
    id: String(row.id),
    instanceId: String(row.instance_id),
    recipientId: String(row.recipient_id),
    channel: String(row.channel ?? "in_app"),
    subject: String(row.subject),
    body: String(row.body),
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at)
  };
}

function mapEnvironment(row: Record<string, unknown>): Environment {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as Environment["type"],
    baseUrl: String(row.base_url ?? ""),
    clientId: String(row.client_id ?? ""),
    clientSecret: String(row.client_secret ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    appName: String(row.app_name ?? ""),
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapEnvironmentSafe(row: Record<string, unknown>): EnvironmentSafe {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as Environment["type"],
    baseUrl: String(row.base_url ?? ""),
    clientId: String(row.client_id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    appName: String(row.app_name ?? ""),
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapDeployment(row: Record<string, unknown>): DeploymentRecord {
  return {
    id: String(row.id),
    environmentId: String(row.environment_id),
    projectId: String(row.project_id),
    changeSetId: row.change_set_id ? String(row.change_set_id) : null,
    status: String(row.status) as DeploymentStatus,
    dimensionResults: [],
    xmlPayload: String(row.xml_payload ?? ""),
    comment: String(row.comment ?? ""),
    initiatedBy: String(row.initiated_by),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

function mapDeploymentSummary(row: Record<string, unknown>): Omit<DeploymentRecord, "xmlPayload" | "dimensionResults"> {
  return {
    id: String(row.id),
    environmentId: String(row.environment_id),
    projectId: String(row.project_id),
    changeSetId: row.change_set_id ? String(row.change_set_id) : null,
    status: String(row.status) as DeploymentStatus,
    comment: String(row.comment ?? ""),
    initiatedBy: String(row.initiated_by),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

function mapDeploymentDimensionResult(row: Record<string, unknown>): DeploymentDimensionResult {
  return {
    dimensionType: String(row.dimension_type),
    dimensionName: String(row.dimension_name),
    status: String(row.status) as DeploymentDimensionResult["status"],
    message: String(row.message ?? "")
  };
}

// --- Connector types and mappers ---

interface FieldMappingJson { source: string; target: string; transform?: string }
interface HierarchyRuleJson { parentField: string; parentTransform?: string; rootParent: string }
interface FilterRuleJson { field: string; operator: string; values: string[] }

export interface ConnectorDefinitionRow {
  id: string;
  name: string;
  connectorType: string;
  connectionConfig: Record<string, unknown>;
  extractionConfig: Record<string, unknown>;
  isActive: boolean;
  lastTestedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MappingRuleRow {
  id: string;
  connectorId: string;
  name: string;
  sourceEntity: string;
  targetDimensionType: string;
  fieldMappings: FieldMappingJson[];
  hierarchyRules: HierarchyRuleJson | null;
  filterRules: FilterRuleJson[];
  conflictResolution: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJobRow {
  id: string;
  connectorId: string;
  mappingRuleId: string;
  projectId: string;
  scheduleCron: string | null;
  autoApprove: boolean;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRunRow {
  id: string;
  jobId: string;
  status: string;
  sourceRecordsRead: number;
  membersCreated: number;
  membersUpdated: number;
  membersDeleted: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface MemberSourceRow {
  id: string;
  projectId: string;
  dimensionType: string;
  memberKey: string;
  sourceSystem: string;
  sourceId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapConnectorDefinition(row: Record<string, unknown>): ConnectorDefinitionRow {
  return {
    id: String(row.id),
    name: String(row.name),
    connectorType: String(row.connector_type),
    connectionConfig: parseJson(String(row.connection_config_json ?? "{}"), {}),
    extractionConfig: parseJson(String(row.extraction_config_json ?? "{}"), {}),
    isActive: Boolean(row.is_active),
    lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapMappingRule(row: Record<string, unknown>): MappingRuleRow {
  return {
    id: String(row.id),
    connectorId: String(row.connector_id),
    name: String(row.name),
    sourceEntity: String(row.source_entity),
    targetDimensionType: String(row.target_dimension_type),
    fieldMappings: parseJson(String(row.field_mappings_json ?? "[]"), []),
    hierarchyRules: row.hierarchy_rules_json ? parseJson(String(row.hierarchy_rules_json), null) : null,
    filterRules: parseJson(String(row.filter_rules_json ?? "[]"), []),
    conflictResolution: String(row.conflict_resolution ?? "source_wins"),
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapSyncJob(row: Record<string, unknown>): SyncJobRow {
  return {
    id: String(row.id),
    connectorId: String(row.connector_id),
    mappingRuleId: String(row.mapping_rule_id),
    projectId: String(row.project_id),
    scheduleCron: row.schedule_cron ? String(row.schedule_cron) : null,
    autoApprove: Boolean(row.auto_approve),
    isActive: Boolean(row.is_active),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapSyncRun(row: Record<string, unknown>): SyncRunRow {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    status: String(row.status),
    sourceRecordsRead: Number(row.source_records_read ?? 0),
    membersCreated: Number(row.members_created ?? 0),
    membersUpdated: Number(row.members_updated ?? 0),
    membersDeleted: Number(row.members_deleted ?? 0),
    relationshipsCreated: Number(row.relationships_created ?? 0),
    relationshipsUpdated: Number(row.relationships_updated ?? 0),
    conflictsDetected: Number(row.conflicts_detected ?? 0),
    conflictsResolved: Number(row.conflicts_resolved ?? 0),
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at)
  };
}

function mapMemberSource(row: Record<string, unknown>): MemberSourceRow {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    dimensionType: String(row.dimension_type),
    memberKey: String(row.member_key),
    sourceSystem: String(row.source_system),
    sourceId: row.source_id ? String(row.source_id) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapPromotionPipeline(row: Record<string, unknown>): PromotionPipeline {
  return {
    id: String(row.id),
    name: String(row.name),
    stages: parseJson<PromotionStage[]>(String(row.stages_json ?? "[]"), []),
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapEnvironmentSyncStatus(row: Record<string, unknown>): EnvironmentSyncStatus {
  return {
    id: String(row.id),
    environmentId: String(row.environment_id),
    projectId: String(row.project_id),
    dimensionType: String(row.dimension_type),
    lastDeployedAt: row.last_deployed_at ? String(row.last_deployed_at) : null,
    localVersionHash: String(row.local_version_hash ?? ""),
    syncStatus: String(row.sync_status ?? "unknown") as SyncStatus,
    checkedAt: String(row.checked_at)
  };
}

function mapEnvironmentOverride(row: Record<string, unknown>): EnvironmentOverride {
  return {
    id: String(row.id),
    environmentId: String(row.environment_id),
    projectId: String(row.project_id),
    dimensionType: String(row.dimension_type),
    memberKey: String(row.member_key),
    propertyName: String(row.property_name),
    overrideValue: String(row.override_value ?? ""),
    reason: String(row.reason ?? ""),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapPropertyDefaultProfile(row: Record<string, unknown>): PropertyDefaultProfileRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    sourceFileName: String(row.source_file_name ?? ""),
    sourceXmlHash: String(row.source_xml_hash ?? ""),
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by ?? "local-admin"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapPropertyDefaultCatalog(row: Record<string, unknown>): PropertyDefaultCatalogRecord {
  return {
    id: String(row.id),
    dimensionType: String(row.dimension_type) as PropertyDefaultCatalogRecord["dimensionType"],
    targetLevel: String(row.target_level) as PropertyDefaultCatalogRecord["targetLevel"],
    propertyName: String(row.property_name),
    xmlName: String(row.xml_name),
    defaultValue: String(row.default_value ?? ""),
    enabled: Boolean(row.enabled),
    updatedAt: String(row.updated_at)
  };
}

interface PropertyDefaultOverrideRecord {
  id: string;
  projectId: string;
  dimensionType: string;
  targetLevel: "dimension" | "member" | "relationship";
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
  updatedAt: string;
}

function mapPropertyDefaultOverride(row: Record<string, unknown>): PropertyDefaultOverrideRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    dimensionType: String(row.dimension_type) as PropertyDefaultOverrideRecord["dimensionType"],
    targetLevel: String(row.target_level) as PropertyDefaultOverrideRecord["targetLevel"],
    propertyName: String(row.property_name),
    xmlName: String(row.xml_name),
    defaultValue: String(row.default_value ?? ""),
    enabled: Boolean(row.enabled),
    updatedAt: String(row.updated_at)
  };
}

function mapPropertyDefaultValue(row: Record<string, unknown>): PropertyDefaultValueRecord {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    dimensionType: String(row.dimension_type),
    targetLevel: String(row.target_level) as PropertyDefaultValueRecord["targetLevel"],
    propertyName: String(row.property_name),
    xmlName: String(row.xml_name),
    defaultValue: String(row.default_value ?? ""),
    enabled: Boolean(row.enabled),
    confidence: Number(row.confidence ?? 0),
    sampleCount: Number(row.sample_count ?? 0),
    nonBlankCount: Number(row.non_blank_count ?? 0),
    distinctCount: Number(row.distinct_count ?? 0),
    sourceDimensionNames: parseJson<string[]>(String(row.source_dimension_names_json ?? "[]"), []),
    updatedAt: String(row.updated_at)
  };
}

function mapPromotionHistory(row: Record<string, unknown>): PromotionRecord {
  return {
    id: String(row.id),
    pipelineId: String(row.pipeline_id),
    projectId: String(row.project_id),
    fromEnvironmentId: String(row.from_environment_id),
    toEnvironmentId: String(row.to_environment_id),
    deploymentId: row.deployment_id ? String(row.deployment_id) : null,
    status: String(row.status) as PromotionRecord["status"],
    promotedBy: String(row.promoted_by),
    promotedAt: String(row.promoted_at)
  };
}

function mapAISuggestion(row: Record<string, unknown>): AISuggestion {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    dimensionId: row.dimension_id ? String(row.dimension_id) : null,
    suggestionType: String(row.suggestion_type) as AISuggestionType,
    targetMemberKey: row.target_member_key ? String(row.target_member_key) : null,
    suggestion: parseJson(String(row.suggestion_json ?? "{}"), {}),
    confidence: Number(row.confidence ?? 0),
    status: String(row.status ?? "pending") as AISuggestionStatus,
    actedBy: row.acted_by ? String(row.acted_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapAIConversation(row: Record<string, unknown>): AIConversation {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    messages: parseJson<AIMessage[]>(String(row.messages_json ?? "[]"), []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapCrossDimensionRule(row: Record<string, unknown>): CrossDimensionRule {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    sourceDimensionType: String(row.source_dimension_type),
    targetDimensionType: String(row.target_dimension_type),
    ruleType: String(row.rule_type) as CrossDimensionRuleType,
    ruleConfig: parseJson(String(row.rule_config_json ?? "{}"), {}),
    severity: String(row.severity ?? "warning") as CrossDimensionRule['severity'],
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapCrossDimensionMapping(row: Record<string, unknown>): CrossDimensionMapping {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sourceDimensionType: String(row.source_dimension_type),
    sourceMemberKey: String(row.source_member_key),
    targetDimensionType: String(row.target_dimension_type),
    targetMemberKey: String(row.target_member_key),
    mappingType: String(row.mapping_type) as CrossDimensionMappingType,
    createdAt: String(row.created_at)
  };
}

function mapTemplate(row: Record<string, unknown>): Template {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    category: String(row.category ?? 'custom') as TemplateCategory,
    industry: row.industry ? String(row.industry) as TemplateIndustry : null,
    dimensionTypes: parseJson<string[]>(String(row.dimension_types_json ?? "[]"), []),
    templateData: parseJson<TemplateData>(String(row.template_data_json ?? "{}"), { dimensions: [] }),
    tags: parseJson<string[]>(String(row.tags_json ?? "[]"), []),
    version: String(row.version ?? '1.0.0'),
    isPublic: Boolean(row.is_public),
    usageCount: Number(row.usage_count ?? 0),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTemplateApplication(row: Record<string, unknown>): TemplateApplication {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    projectId: String(row.project_id),
    appliedBy: String(row.applied_by),
    renameMapping: row.rename_mapping_json ? parseJson<Record<string, string>>(String(row.rename_mapping_json), {}) : null,
    appliedAt: String(row.applied_at)
  };
}

function mapReportDefinition(row: Record<string, unknown>): ReportDefinition {
  return {
    id: String(row.id),
    name: String(row.name),
    reportType: String(row.report_type) as ReportType,
    config: parseJson<ReportConfig>(String(row.config_json ?? "{}"), {}),
    scheduleCron: row.schedule_cron ? String(row.schedule_cron) : null,
    format: String(row.format ?? 'json') as ReportFormat,
    recipients: parseJson<string[]>(String(row.recipients_json ?? "[]"), []),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapReportRun(row: Record<string, unknown>): ReportRun {
  return {
    id: String(row.id),
    definitionId: String(row.definition_id),
    status: String(row.status) as ReportRunStatus,
    outputData: row.output_data_json ? parseJson<Record<string, unknown>>(String(row.output_data_json), {}) : null,
    generatedAt: String(row.generated_at)
  };
}

function mapHealthSnapshot(row: Record<string, unknown>): MetadataHealthSnapshot {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    dimensionType: String(row.dimension_type),
    qualityScore: Number(row.quality_score ?? 0),
    completenessScore: Number(row.completeness_score ?? 0),
    namingScore: Number(row.naming_score ?? 0),
    validationErrorCount: Number(row.validation_error_count ?? 0),
    validationWarningCount: Number(row.validation_warning_count ?? 0),
    memberCount: Number(row.member_count ?? 0),
    orphanCount: Number(row.orphan_count ?? 0),
    capturedAt: String(row.captured_at)
  };
}

function mapVcsBranch(row: Record<string, unknown>): VcsBranch {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    status: String(row.status) as VcsBranchStatus,
    headCommitId: row.head_commit_id ? String(row.head_commit_id) : null,
    baseBranchId: row.base_branch_id ? String(row.base_branch_id) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapVcsCommit(row: Record<string, unknown>): VcsCommit {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    branchId: String(row.branch_id),
    message: String(row.message),
    snapshotData: parseJson(String(row.snapshot_data_json ?? "{}"), {}),
    parentCommitId: row.parent_commit_id ? String(row.parent_commit_id) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}

function mapVcsTag(row: Record<string, unknown>): VcsTag {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    commitId: String(row.commit_id),
    description: String(row.description ?? ''),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  };
}
