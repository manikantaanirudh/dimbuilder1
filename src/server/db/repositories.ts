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
import { normalizeBoolean, normalizeWriteResult } from "./migrationUtils";
import { booleanValue, upsertSql, type SqlDialect } from "./sql";
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
  ProjectVersionRecord,
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

function sqliteOrUpsert(
  dialect: SqlDialect,
  table: string,
  columns: string[],
  conflictTarget: string[],
  updateColumns: string[]
): string {
  if (dialect === "sqlite") {
    return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  }
  return upsertSql(table, columns, conflictTarget, updateColumns);
}

function buildRepositories(dbOrClient: AppDatabase | DbClient) {
  const client: DbClient = isAppDatabase(dbOrClient)
    ? appDatabaseAsDbClient(dbOrClient)
    : dbOrClient;

  return {
    async transaction<T>(fn: (txRepos: any) => Promise<T>): Promise<T> {
      return client.transaction(async (txClient) => {
        const txRepos = buildRepositories(txClient);
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
          updatedAt: createdAt,
          versionNumber: 1,
          versionLabel: "v1",
          seededAt: createdAt
        };

        await client.exec(`
          INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at, version_number, version_label, seeded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [project.id, project.name, project.description, project.sourceFileName, project.createdBy, project.createdAt, project.updatedAt, 1, "v1", createdAt]);

        return project;
      },
      async updateVersion(projectId: string, input: { versionNumber: number; versionLabel: string; sourceFileName: string; seededAt: string }): Promise<ProjectRecord | null> {
        const project = await this.get(projectId);
        if (!project) return null;
        const updatedAt = now();
        await client.exec(`
          UPDATE projects
          SET version_number = ?, version_label = ?, source_file_name = ?, seeded_at = ?, updated_at = ?
          WHERE id = ?
        `, [input.versionNumber, input.versionLabel, input.sourceFileName, input.seededAt, updatedAt, projectId]);
        return {
          ...project,
          versionNumber: input.versionNumber,
          versionLabel: input.versionLabel,
          sourceFileName: input.sourceFileName,
          seededAt: input.seededAt,
          updatedAt
        };
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
        const [dimensionCount, memberCount, relationshipCount, errorCount, warningCount, memberStats, relationshipStats] = await Promise.all([
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
          client.queryOne<{ count: number | string }>("SELECT COUNT(*) AS count FROM validation_issues WHERE project_id = ? AND severity = 'warning'", [projectId]),
          client.query<{ dimension_id: string; member_count: number | string }>(`
            SELECT d.id AS dimension_id, COUNT(m.id) AS member_count
            FROM dimensions d
            LEFT JOIN dimension_members m ON m.dimension_id = d.id AND m.is_active = ?
            WHERE d.project_id = ?
            GROUP BY d.id
          `, [activeMembers, projectId]),
          client.query<{ dimension_id: string; relationship_count: number | string }>(`
            SELECT d.id AS dimension_id, COUNT(r.id) AS relationship_count
            FROM dimensions d
            LEFT JOIN dimension_relationships r ON r.dimension_id = d.id
            WHERE d.project_id = ?
            GROUP BY d.id
          `, [projectId])
        ]);
        const relationshipCountByDimension = new Map(
          relationshipStats.map((row) => [row.dimension_id, Number(row.relationship_count ?? 0)])
        );
        const dimensionStats = memberStats.map((row) => ({
          dimensionId: row.dimension_id,
          memberCount: Number(row.member_count ?? 0),
          relationshipCount: relationshipCountByDimension.get(row.dimension_id) ?? 0
        }));
        return {
          totalDimensions: Number(dimensionCount?.count ?? 0),
          totalMembers: Number(memberCount?.count ?? 0),
          totalRelationships: Number(relationshipCount?.count ?? 0),
          validationErrors: Number(errorCount?.count ?? 0),
          validationWarnings: Number(warningCount?.count ?? 0),
          recentDimensions: dimensions.slice(0, 5),
          dimensionStats
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
      async create(input: Omit<DimensionRecord, "id" | "createdAt" | "updatedAt">): Promise<DimensionRecord> {
        const createdAt = now();
        const dimension: DimensionRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };

        await client.exec(`
          INSERT INTO dimensions (
            id, project_id, sheet_name, dimension_type, dimension_name, description, access_group,
            maintenance_group, inherited_dimension, sort_order, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
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
        ]);

        return dimension;
      },
      async listByProject(projectId: string): Promise<DimensionRecord[]> {
        return (await client.query<Record<string, unknown>>(
          "SELECT * FROM dimensions WHERE project_id = ? ORDER BY sort_order",
          [projectId]
        )).map(mapDimension);
      },
      async get(dimensionId: string): Promise<DimensionRecord | null> {
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM dimensions WHERE id = ?", [dimensionId]);
        return row ? mapDimension(row) : null;
      },
      async update(dimensionId: string, input: Partial<Pick<DimensionRecord, "dimensionName" | "description" | "accessGroup" | "maintenanceGroup" | "inheritedDimension" | "metadata">>): Promise<void> {
        const current = await this.get(dimensionId);
        if (!current) return;
        await client.exec(`
          UPDATE dimensions
          SET dimension_name = ?, description = ?, access_group = ?, maintenance_group = ?,
              inherited_dimension = ?, metadata_json = ?, updated_at = ?
          WHERE id = ?
        `, [
          input.dimensionName ?? current.dimensionName,
          input.description ?? current.description,
          input.accessGroup ?? current.accessGroup,
          input.maintenanceGroup ?? current.maintenanceGroup,
          input.inheritedDimension ?? current.inheritedDimension,
          JSON.stringify(input.metadata ?? current.metadata),
          now(),
          dimensionId
        ]);
      },
      async delete(dimensionId: string): Promise<boolean> {
        const current = await this.get(dimensionId);
        if (!current) return false;
        await client.transaction(async (tx) => {
          await tx.exec("DELETE FROM edit_locks WHERE dimension_id = ?", [dimensionId]);
          await tx.exec("DELETE FROM collaboration_comments WHERE dimension_id = ?", [dimensionId]);
          await tx.exec("DELETE FROM ai_suggestions WHERE dimension_id = ?", [dimensionId]);
          await tx.exec("DELETE FROM dimensions WHERE id = ?", [dimensionId]);
        });
        return true;
      }
    },
    members: {
      async bulkInsert(records: DimensionMemberRecord[]): Promise<void> {
        await bulkInsertMembers(client, records);
      },
      async shiftOrders(dimensionId: string): Promise<void> {
        await client.exec("UPDATE dimension_members SET row_order = row_order + 1 WHERE dimension_id = ?", [dimensionId]);
      },
      async create(input: Omit<DimensionMemberRecord, "id" | "createdAt" | "updatedAt">): Promise<DimensionMemberRecord> {
        const createdAt = now();
        const record: DimensionMemberRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };
        await this.bulkInsert([record]);
        return record;
      },
      async listByDimension(dimensionId: string, paging = { offset: 0, limit: 200 }): Promise<DimensionMemberRecord[]> {
        const activeMembers = booleanValue(client.dialect, true);
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM dimension_members
          WHERE dimension_id = ? AND is_active = ?
          ORDER BY row_order
          LIMIT ? OFFSET ?
        `, [dimensionId, activeMembers, paging.limit, paging.offset]);
        return rows.map(mapMember);
      },
      async listByProject(projectId: string): Promise<DimensionMemberRecord[]> {
        const activeMembers = booleanValue(client.dialect, true);
        const rows = await client.query<Record<string, unknown>>(`
          SELECT m.* FROM dimension_members m
          JOIN dimensions d ON d.id = m.dimension_id
          WHERE d.project_id = ? AND m.is_active = ?
          ORDER BY d.sort_order, m.row_order
        `, [projectId, activeMembers]);
        return rows.map(mapMember);
      },
      async findByProjectMemberKey(projectId: string, memberKey: string): Promise<DimensionMemberRecord[]> {
        const activeMembers = booleanValue(client.dialect, true);
        const rows = await client.query<Record<string, unknown>>(`
          SELECT m.* FROM dimension_members m
          JOIN dimensions d ON d.id = m.dimension_id
          WHERE d.project_id = ? AND m.is_active = ? AND LOWER(TRIM(m.member_key)) = LOWER(TRIM(?))
          ORDER BY d.sort_order, m.row_order
        `, [projectId, activeMembers, memberKey]);
        return rows.map(mapMember);
      },
      async countByProject(projectId: string): Promise<number> {
        const activeMembers = booleanValue(client.dialect, true);
        const row = await client.queryOne<{ count: number | string }>(`
          SELECT COUNT(*) AS count
          FROM dimension_members m
          JOIN dimensions d ON d.id = m.dimension_id
          WHERE d.project_id = ? AND m.is_active = ?
        `, [projectId, activeMembers]);
        return Number(row?.count ?? 0);
      },
      async listAllByDimension(dimensionId: string): Promise<DimensionMemberRecord[]> {
        const activeMembers = booleanValue(client.dialect, true);
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM dimension_members
          WHERE dimension_id = ? AND is_active = ?
          ORDER BY row_order
        `, [dimensionId, activeMembers]);
        return rows.map(mapMember);
      },
      async countByDimension(dimensionId: string): Promise<number> {
        const activeMembers = booleanValue(client.dialect, true);
        const row = await client.queryOne<{ count: number | string }>(
          "SELECT COUNT(*) AS count FROM dimension_members WHERE dimension_id = ? AND is_active = ?",
          [dimensionId, activeMembers]
        );
        return Number(row?.count ?? 0);
      },
      async update(id: string, input: { memberKey: string; properties: Record<string, unknown> }): Promise<void> {
        const description = String(input.properties.Description ?? "");
        await client.exec(`
          UPDATE dimension_members
          SET member_key = ?, description = ?, properties_json = ?, updated_at = ?
          WHERE id = ?
        `, [input.memberKey, description, JSON.stringify(input.properties), now(), id]);
      },
      async getById(id: string): Promise<DimensionMemberRecord | undefined> {
        const activeMembers = booleanValue(client.dialect, true);
        const row = await client.queryOne<Record<string, unknown>>(
          "SELECT * FROM dimension_members WHERE id = ? AND is_active = ?",
          [id, activeMembers]
        );
        return row ? mapMember(row) : undefined;
      },
      async softDelete(id: string): Promise<void> {
        const inactive = booleanValue(client.dialect, false);
        await client.exec(
          "UPDATE dimension_members SET is_active = ?, updated_at = ? WHERE id = ?",
          [inactive, now(), id]
        );
      },
      async softDeleteMany(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const inactive = booleanValue(client.dialect, false);
        const activeMembers = booleanValue(client.dialect, true);
        const placeholders = ids.map(() => "?").join(", ");
        const result = await client.run(`
          UPDATE dimension_members
          SET is_active = ?, updated_at = ?
          WHERE id IN (${placeholders}) AND is_active = ?
        `, [inactive, now(), ...ids, activeMembers]);
        return normalizeWriteResult(client.dialect, result).changes;
      },
      async listByIds(dimensionId: string, ids: string[]): Promise<DimensionMemberRecord[]> {
        if (ids.length === 0) return [];
        const activeMembers = booleanValue(client.dialect, true);
        const placeholders = ids.map(() => "?").join(", ");
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM dimension_members
          WHERE dimension_id = ? AND id IN (${placeholders}) AND is_active = ?
          ORDER BY row_order
        `, [dimensionId, ...ids, activeMembers]);
        return rows.map(mapMember);
      }
    },
    relationships: {
      async bulkInsert(records: DimensionRelationshipRecord[]): Promise<void> {
        await bulkInsertRelationships(client, records);
      },
      async shiftOrders(dimensionId: string): Promise<void> {
        await client.exec("UPDATE dimension_relationships SET row_order = row_order + 1 WHERE dimension_id = ?", [dimensionId]);
      },
      async create(input: Omit<DimensionRelationshipRecord, "id" | "createdAt" | "updatedAt">): Promise<DimensionRelationshipRecord> {
        const createdAt = now();
        const record: DimensionRelationshipRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };
        await this.bulkInsert([record]);
        return record;
      },
      async listByDimension(dimensionId: string, paging = { offset: 0, limit: 200 }): Promise<DimensionRelationshipRecord[]> {
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM dimension_relationships
          WHERE dimension_id = ?
          ORDER BY row_order
          LIMIT ? OFFSET ?
        `, [dimensionId, paging.limit, paging.offset]);
        return rows.map(mapRelationship);
      },
      async listByProject(projectId: string): Promise<DimensionRelationshipRecord[]> {
        const rows = await client.query<Record<string, unknown>>(`
          SELECT r.* FROM dimension_relationships r
          JOIN dimensions d ON d.id = r.dimension_id
          WHERE d.project_id = ?
          ORDER BY d.sort_order, r.row_order
        `, [projectId]);
        return rows.map(mapRelationship);
      },
      async listAllByDimension(dimensionId: string): Promise<DimensionRelationshipRecord[]> {
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM dimension_relationships
          WHERE dimension_id = ?
          ORDER BY row_order
        `, [dimensionId]);
        return rows.map(mapRelationship);
      },
      async countByDimension(dimensionId: string): Promise<number> {
        const row = await client.queryOne<{ count: number | string }>(
          "SELECT COUNT(*) AS count FROM dimension_relationships WHERE dimension_id = ?",
          [dimensionId]
        );
        return Number(row?.count ?? 0);
      },
      async update(id: string, input: {
        parentKey: string;
        childKey: string;
        properties: Record<string, unknown>;
        operation?: DimensionRelationshipRecord["operation"];
        operationSource?: string;
        operationNotes?: string;
      }): Promise<void> {
        const current = await client.queryOne<Record<string, unknown>>(
          "SELECT * FROM dimension_relationships WHERE id = ?",
          [id]
        );
        const nextAggregationWeight = nullableNumber(input.properties["Aggregation Weight"] ?? current?.aggregation_weight);
        const nextPercentConsol = nullableNumber(input.properties["Percent Consol"] ?? current?.percent_consol);
        const nextPercentOwnership = nullableNumber(input.properties["Percent Ownership"] ?? current?.percent_ownership);
        const nextOwnershipType = input.properties["Ownership Type"] !== undefined
          ? String(input.properties["Ownership Type"] ?? "")
          : String(current?.ownership_type ?? "");
        await client.exec(`
          UPDATE dimension_relationships
          SET parent_key = ?, child_key = ?, aggregation_weight = ?, percent_consol = ?,
              percent_ownership = ?, ownership_type = ?, properties_json = ?,
              operation = ?, operation_source = ?, operation_notes = ?, updated_at = ?
          WHERE id = ?
        `, [
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
        ]);
      },
      async getById(id: string): Promise<DimensionRelationshipRecord | undefined> {
        const row = await client.queryOne<Record<string, unknown>>(
          "SELECT * FROM dimension_relationships WHERE id = ?",
          [id]
        );
        return row ? mapRelationship(row) : undefined;
      },
      async delete(id: string): Promise<void> {
        await client.exec("DELETE FROM dimension_relationships WHERE id = ?", [id]);
      },
      async deleteMany(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map(() => "?").join(", ");
        const result = await client.run(`DELETE FROM dimension_relationships WHERE id IN (${placeholders})`, ids);
        return normalizeWriteResult(client.dialect, result).changes;
      },
      async deleteForMemberKeys(dimensionId: string, memberKeys: string[]): Promise<number> {
        if (memberKeys.length === 0) return 0;
        const placeholders = memberKeys.map(() => "?").join(", ");
        const result = await client.run(`
          DELETE FROM dimension_relationships
          WHERE dimension_id = ?
            AND (parent_key IN (${placeholders}) OR child_key IN (${placeholders}))
        `, [dimensionId, ...memberKeys, ...memberKeys]);
        return normalizeWriteResult(client.dialect, result).changes;
      },
      async listByIds(dimensionId: string, ids: string[]): Promise<DimensionRelationshipRecord[]> {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => "?").join(", ");
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM dimension_relationships
          WHERE dimension_id = ? AND id IN (${placeholders})
          ORDER BY row_order
        `, [dimensionId, ...ids]);
        return rows.map(mapRelationship);
      }
    },
    varyingProperties: {
      async listVaryingPropertyValues(projectId: string, filters: VaryingPropertyValueFilters = {}): Promise<VaryingPropertyValueRecord[]>{
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
        return (await client.query(`
          SELECT * FROM varying_property_values
          WHERE ${conditions.join(" AND ")}
          ORDER BY dimension_id, target_type, target_id, property_name, cube_type, scenario_type, time_member, created_at, id
        `, [...values])).map(mapVaryingPropertyValue);
      },
      async listVaryingPropertyValuesForTarget(projectId: string, targetType: VaryingPropertyTargetType, targetId: string): Promise<VaryingPropertyValueRecord[]> {
        return await this.listVaryingPropertyValues(projectId, { targetType, targetId });
      },
      async upsertVaryingPropertyValue(input: VaryingPropertyValueInput): Promise<VaryingPropertyValueRecord>{
        const timestamp = now();
        const id = nanoid();
        const normalized = normalizeVaryingPropertyInput(input);
        await client.exec(`
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
        `, [id,
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
          timestamp]);
        const row = await this.findByUniqueContext(normalized);
        if (!row) throw new Error("Failed to upsert varying property value.");
        return row;
      },
      async updateVaryingPropertyValue(projectId: string, valueId: string, input: Partial<VaryingPropertyValueInput>): Promise<VaryingPropertyValueRecord | null>{
        const current = await this.getVaryingPropertyValue(projectId, valueId);
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
        await client.exec(`
          UPDATE varying_property_values
          SET dimension_id = ?, target_type = ?, target_id = ?, property_name = ?, value = ?,
              cube_type = ?, scenario_type = ?, time_member = ?, is_default = ?,
              source = ?, metadata_json = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
        `, [next.dimensionId,
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
          valueId]);
        return await this.getVaryingPropertyValue(projectId, valueId);
      },
      async deleteVaryingPropertyValue(projectId: string, valueId: string): Promise<void>{
        await client.exec("DELETE FROM varying_property_values WHERE project_id = ? AND id = ?", [projectId, valueId]);
      },
      async replaceVaryingPropertyValuesForTarget(
        projectId: string,
        targetType: VaryingPropertyTargetType,
        targetId: string,
        values: VaryingPropertyValueInput[]
      ): Promise<VaryingPropertyValueRecord[]>{
        return client.transaction(async (tx) => {
          const txRepos = createRepositories(tx);
          await tx.exec("DELETE FROM varying_property_values WHERE project_id = ? AND target_type = ? AND target_id = ?", [projectId, targetType, targetId]);
          const results: VaryingPropertyValueRecord[] = [];
          for (const value of values) {
            results.push(await txRepos.varyingProperties.upsertVaryingPropertyValue({ ...value, projectId, targetType, targetId }));
          }
          return results;
        });
      },
      getEffectivePropertyValue(baseValue: unknown, varyingValues: VaryingPropertyValueRecord[], context: VaryingPropertyContext): string {
        return getEffectivePropertyValue(baseValue, varyingValues, context);
      },
      async getVaryingPropertyValue(projectId: string, valueId: string): Promise<VaryingPropertyValueRecord | null>{
        const row = (await client.queryOne("SELECT * FROM varying_property_values WHERE project_id = ? AND id = ?", [projectId, valueId]));
        return row ? mapVaryingPropertyValue(row) : null;
      },
      async findByUniqueContext(input: VaryingPropertyValueInput): Promise<VaryingPropertyValueRecord | null>{
        const normalized = normalizeVaryingPropertyInput(input);
        const row = (await client.queryOne(`
          SELECT * FROM varying_property_values
          WHERE project_id = ? AND target_type = ? AND target_id = ? AND property_name = ?
            AND cube_type = ? AND scenario_type = ? AND time_member = ?
        `, [normalized.projectId,
          normalized.targetType,
          normalized.targetId,
          normalized.propertyName,
          normalized.cubeType,
          normalized.scenarioType,
          normalized.timeMember]));
        return row ? mapVaryingPropertyValue(row) : null;
      }
    },
    bulkUpdates: {
      async createJobWithItems(input: {
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
      }): Promise<{ job: BulkUpdateJobRecord; items: BulkUpdateItemRecord[] }> {
        return client.transaction(async (tx) => {
          const txRepos = createRepositories(tx);
          const id = nanoid();
          const createdAt = now();
          await tx.exec(`
            INSERT INTO bulk_update_jobs (
              id, project_id, target_type, operation, request_json, summary_json,
              rollback_json, status, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [id,
            input.projectId,
            input.targetType,
            input.operation,
            JSON.stringify(input.request),
            JSON.stringify(input.summary),
            JSON.stringify(input.rollback ?? []),
            input.status,
            input.createdBy ?? "local-admin",
            createdAt]);

          for (const item of input.items) {
            await tx.exec(`
            INSERT INTO bulk_update_items (
              id, job_id, target_id, target_key, property_name, old_value,
              new_value, status, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [nanoid(),
              id,
              item.targetId,
              item.targetKey,
              item.propertyName,
              item.oldValue,
              item.newValue,
              item.status,
              item.message ?? ""]);
          }

          const detail = await txRepos.bulkUpdates.getJobDetail(input.projectId, id);
          if (!detail) throw new Error("Failed to create bulk update job.");
          return detail;
        });
      },
      async listJobs(projectId: string): Promise<BulkUpdateJobRecord[]>{
        return (await client.query(`
          SELECT * FROM bulk_update_jobs
          WHERE project_id = ?
          ORDER BY created_at DESC, id
        `, [projectId])).map(mapBulkUpdateJob);
      },
      async getJob(projectId: string, jobId: string): Promise<BulkUpdateJobRecord | null>{
        const row = (await client.queryOne("SELECT * FROM bulk_update_jobs WHERE project_id = ? AND id = ?", [projectId, jobId]));
        return row ? mapBulkUpdateJob(row) : null;
      },
      async listItems(jobId: string): Promise<BulkUpdateItemRecord[]>{
        return (await client.query(`
          SELECT * FROM bulk_update_items
          WHERE job_id = ?
          ORDER BY target_key, property_name, id
        `, [jobId])).map(mapBulkUpdateItem);
      },
      async getJobDetail(projectId: string, jobId: string): Promise<{ job: BulkUpdateJobRecord; items: BulkUpdateItemRecord[] } | null> {
        const job = await this.getJob(projectId, jobId);
        if (!job) return null;
        return { job, items: await this.listItems(job.id) };
      },
      async markRolledBack(projectId: string, jobId: string): Promise<{ job: BulkUpdateJobRecord; items: BulkUpdateItemRecord[] } | null> {
        const job = await this.getJob(projectId, jobId);
        if (!job || job.status !== "applied") return null;
        await client.exec("UPDATE bulk_update_jobs SET status = ? WHERE project_id = ? AND id = ?", ["rolledBack", projectId, jobId]);
        await client.exec("UPDATE bulk_update_items SET status = ? WHERE job_id = ?", ["rolledBack", jobId]);
        return this.getJobDetail(projectId, jobId);
      }
    },
    issues: {
      async replaceForProject(projectId: string, issues: ValidationIssue[]): Promise<void>{
        return client.transaction(async (tx) => {
          await tx.exec("DELETE FROM validation_issues WHERE project_id = ?", [projectId]);
          for (const issue of issues) {
            await tx.exec(`
            INSERT INTO validation_issues (
              id, project_id, dimension_id, entity_type, entity_id, severity, code,
              message, field_name, row_number, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [issue.id,
              issue.projectId,
              issue.dimensionId,
              issue.entityType,
              issue.entityId,
              issue.severity,
              issue.code,
              issue.message,
              issue.fieldName,
              issue.rowNumber,
              issue.createdAt]);
          }
        });
      },
      async listByProject(projectId: string): Promise<ValidationIssue[]>{
        return (await client.query("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY severity, row_number", [projectId])).map(mapIssue);
      },
      async listValidationIssuesForProject(projectId: string): Promise<ValidationIssue[]>{
        return (await client.query("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY severity, row_number", [projectId])).map(mapIssue);
      },
      async hasBlockingValidationIssues(projectId: string, blockedSeverities: string[]): Promise<boolean>{
        if (blockedSeverities.length === 0) return false;
        const placeholders = blockedSeverities.map(() => "?").join(", ");
        const row = (await client.queryOne(`
          SELECT COUNT(*) AS count
          FROM validation_issues
          WHERE project_id = ? AND severity IN (${placeholders})
        `, [projectId, ...blockedSeverities])) as { count?: number } | undefined;
        return Number(row?.count ?? 0) > 0;
      },
      async hasValidationRun(projectId: string): Promise<boolean>{
        const row = (await client.queryOne(`
          SELECT COUNT(*) AS count
          FROM audit_logs
          WHERE project_id = ?
            AND action IN ('validation.run', 'project.import', 'project.importXml', 'changeSet.validate', 'changeSet.approve', 'changeSet.package')
        `, [projectId])) as { count?: number } | undefined;
        return Number(row?.count ?? 0) > 0;
      }
    },
    validationOverrides: {
      async listByProject(projectId: string): Promise<Array<{ id: string; ruleCode: string; severity: string; updatedAt: string }>> {
        return (await client.query("SELECT * FROM project_validation_overrides WHERE project_id = ? ORDER BY rule_code", [projectId])).map((row: any) => ({
          id: row.id,
          ruleCode: row.rule_code,
          severity: row.severity,
          updatedAt: row.updated_at
        }));
      },
      async upsert(projectId: string, ruleCode: string, severity: string): Promise<void>{
        const existing = (await client.queryOne("SELECT id FROM project_validation_overrides WHERE project_id = ? AND rule_code = ?", [projectId, ruleCode]));
        if (existing) {
          await client.exec("UPDATE project_validation_overrides SET severity = ?, updated_at = ? WHERE project_id = ? AND rule_code = ?", [severity, now(), projectId, ruleCode]);
        } else {
          await client.exec("INSERT INTO project_validation_overrides (id, project_id, rule_code, severity, updated_at) VALUES (?, ?, ?, ?, ?)", [nanoid(), projectId, ruleCode, severity, now()]);
        }
      },
      async deleteByProject(projectId: string, ruleCode: string): Promise<void>{
        await client.exec("DELETE FROM project_validation_overrides WHERE project_id = ? AND rule_code = ?", [projectId, ruleCode]);
      }
    },
    validationWaivers: {
      async listByProject(projectId: string): Promise<Array<{
        id: string;
        projectId: string;
        issueId: string;
        ruleCode: string;
        dimensionId: string;
        memberKey: string;
        reason: string;
        userId: string;
        createdAt: string;
        revokedAt: string | null;
      }>> {
        return (await client.query(
          "SELECT * FROM validation_waivers WHERE project_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
          [projectId]
        )).map((row) => ({
          id: String(row.id),
          projectId: String(row.project_id),
          issueId: String(row.issue_id),
          ruleCode: String(row.rule_code),
          dimensionId: String(row.dimension_id ?? ""),
          memberKey: String(row.member_key ?? ""),
          reason: String(row.reason),
          userId: String(row.user_id),
          createdAt: String(row.created_at),
          revokedAt: row.revoked_at ? String(row.revoked_at) : null
        }));
      },
      async create(input: {
        projectId: string;
        issueId: string;
        ruleCode: string;
        reason: string;
        dimensionId?: string;
        memberKey?: string;
        userId?: string;
      }): Promise<{ id: string }> {
        const id = nanoid();
        const createdAt = now();
        await client.exec(
          "INSERT INTO validation_waivers (id, project_id, issue_id, rule_code, dimension_id, member_key, reason, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
          [
            id,
            input.projectId,
            input.issueId,
            input.ruleCode,
            input.dimensionId ?? "",
            input.memberKey ?? "",
            input.reason,
            input.userId ?? "local-admin",
            createdAt
          ]
        );
        return { id };
      },
      async revoke(projectId: string, waiverId: string): Promise<boolean> {
        const result = await client.run(
          "UPDATE validation_waivers SET revoked_at = ? WHERE id = ? AND project_id = ? AND revoked_at IS NULL",
          [now(), waiverId, projectId]
        );
        return normalizeWriteResult(client.dialect, result).changes > 0;
      }
    },
    audit: {
      async record(input: { projectId: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; userId?: string }): Promise<void>{
        await client.exec(`
          INSERT INTO audit_logs (id, project_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [nanoid(),
          input.projectId,
          input.userId ?? "local-admin",
          input.action,
          input.entityType,
          input.entityId,
          JSON.stringify(input.before ?? {}),
          JSON.stringify(input.after ?? {}),
          now()]);
      },
      async listByProject(projectId: string, limit = 100): Promise<Array<{
        id: string;
        userId: string;
        action: string;
        entityType: string;
        entityId: string;
        changes: Record<string, unknown>;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        timestamp: string;
      }>> {
        const rows = await client.query<Record<string, unknown>>(`
          SELECT id, user_id, action, entity_type, entity_id, before_json, after_json, created_at
          FROM audit_logs
          WHERE project_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `, [projectId, limit]);

        return rows.map((row) => {
          const before = parseJson(String(row.before_json ?? "{}"), {}) as Record<string, unknown>;
          const after = parseJson(String(row.after_json ?? "{}"), {}) as Record<string, unknown>;
          const changes = Object.keys(after).length > 0 ? after : before;
          return {
            id: String(row.id),
            userId: String(row.user_id),
            action: String(row.action),
            entityType: String(row.entity_type),
            entityId: String(row.entity_id),
            changes,
            before,
            after,
            timestamp: String(row.created_at)
          };
        });
      }
    },
    snapshots: {
      async buildState(projectId: string): Promise<ProjectSnapshotState>{
        return await buildProjectSnapshotState(client, projectId);
      },
      async create(input: { projectId: string; name: string; description: string; snapshot: unknown; createdBy?: string }): Promise<string>{
        const id = nanoid();
        await client.exec(`
          INSERT INTO project_snapshots (id, project_id, name, description, snapshot_json, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, input.projectId, input.name, input.description, JSON.stringify(input.snapshot), input.createdBy ?? "local-admin", now()]);
        return id;
      },
      async listByProject(projectId: string): Promise<ProjectSnapshotSummaryRecord[]>{
        return (await client.query(`
          SELECT id, project_id, name, description, created_by, created_at FROM project_snapshots
          WHERE project_id = ?
          ORDER BY created_at DESC, id
        `, [projectId])).map(mapProjectSnapshotSummary);
      },
      async get(projectId: string, snapshotId: string): Promise<ProjectSnapshotRecord | null>{
        const row = (await client.queryOne("SELECT * FROM project_snapshots WHERE project_id = ? AND id = ?", [projectId, snapshotId]));
        return row ? mapProjectSnapshot(row) : null;
      },
      async restoreSnapshotIntoProject(projectId: string, snapshotId: string, options: { createdBy?: string; restoreValidationIssues?: boolean } = {}): Promise<SnapshotRestoreSummary>{
        return client.transaction(async (tx) => {
          const snapshot = await this.get(projectId, snapshotId);
          if (!snapshot) throw new Error("Snapshot not found.");
          const safetySnapshotId = await createProjectSnapshotRow(tx, {
            projectId,
            name: `Safety snapshot before restore ${new Date().toISOString()}`,
            description: `Automatic safety snapshot created before restoring ${snapshot.name}.`,
            snapshot: await buildProjectSnapshotState(client, projectId),
            createdBy: options.createdBy ?? "local-admin"
          });

          await deleteProjectMetadata(tx, projectId);
          await insertSnapshotStateIntoProject(tx, projectId, snapshot.snapshot, {
            preserveIds: true,
            restoreValidationIssues: Boolean(options.restoreValidationIssues)
          });
          await tx.exec("UPDATE projects SET updated_at = ? WHERE id = ?", [now(), projectId]);

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
      async createProjectFromSnapshot(snapshotId: string, newProjectName: string, options: { createdBy?: string; description?: string } = {}): Promise<{ project: ProjectRecord; summary: SnapshotRestoreSummary }> {
        return client.transaction(async (tx) => {
          const row = (await tx.queryOne("SELECT * FROM project_snapshots WHERE id = ?", [snapshotId]));
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
          await tx.exec(`
            INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [project.id, project.name, project.description, project.sourceFileName, project.createdBy, project.createdAt, project.updatedAt]);

          const summary = await insertSnapshotStateIntoProject(tx, project.id, snapshot.snapshot, {
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
      async create(input: { projectId: string; name: string; sourceType: BaselineSourceType; sourceFileName?: string; baseline: unknown; createdBy?: string }): Promise<ProjectBaselineRecord>{
        const id = nanoid();
        const createdAt = now();
        await client.exec(`
          INSERT INTO project_baselines (id, project_id, name, source_type, source_file_name, baseline_json, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id,
          input.projectId,
          input.name,
          input.sourceType,
          input.sourceFileName ?? "",
          JSON.stringify(input.baseline),
          input.createdBy ?? "local-admin",
          createdAt]);
        const baseline = await this.get(input.projectId, id);
        if (!baseline) throw new Error("Failed to create project baseline.");
        return baseline;
      },
      async listByProject(projectId: string): Promise<ProjectBaselineRecord[]>{
        return (await client.query("SELECT * FROM project_baselines WHERE project_id = ? ORDER BY created_at DESC, name", [projectId])).map(mapProjectBaseline);
      },
      async get(projectId: string, baselineId: string): Promise<ProjectBaselineRecord | null>{
        const row = (await client.queryOne("SELECT * FROM project_baselines WHERE project_id = ? AND id = ?", [projectId, baselineId]));
        return row ? mapProjectBaseline(row) : null;
      }
    },
    projectVersions: {
      async create(input: {
        projectId: string;
        versionNumber: number;
        versionLabel: string;
        sourceFileName: string;
        createdBy?: string;
        summary?: Record<string, unknown>;
        snapshot?: Record<string, unknown>;
      }): Promise<ProjectVersionRecord> {
        const id = nanoid();
        const seededAt = now();
        const createdBy = input.createdBy ?? "local-admin";
        const record: ProjectVersionRecord = {
          id,
          projectId: input.projectId,
          versionNumber: input.versionNumber,
          versionLabel: input.versionLabel,
          sourceFileName: input.sourceFileName,
          seededAt,
          createdBy,
          summary: input.summary ?? {},
          snapshot: input.snapshot
        };
        await client.exec(`
          INSERT INTO project_versions (id, project_id, version_number, version_label, source_file_name, seeded_at, created_by, summary_json, snapshot_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          input.projectId,
          input.versionNumber,
          input.versionLabel,
          input.sourceFileName,
          seededAt,
          createdBy,
          JSON.stringify(input.summary ?? {}),
          JSON.stringify(input.snapshot ?? {})
        ]);
        return record;
      },
      async listByProject(projectId: string): Promise<ProjectVersionRecord[]> {
        const rows = await client.query<Record<string, unknown>>(`
          SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number DESC
        `, [projectId]);
        return rows.map(mapProjectVersion);
      },
      async getByVersion(projectId: string, versionNumber: number): Promise<ProjectVersionRecord | null> {
        const row = await client.queryOne<Record<string, unknown>>(`
          SELECT * FROM project_versions WHERE project_id = ? AND version_number = ?
        `, [projectId, versionNumber]);
        return row ? mapProjectVersion(row) : null;
      }
    },
    diffRuns: {
      async createWithItems(input: {
        projectId: string;
        baselineId: string;
        status: MetadataDiffStatus;
        summary: MetadataDiffSummary;
        items: Array<Omit<MetadataDiffItemRecord, "id" | "diffRunId">>;
        createdBy?: string;
      }): Promise<{ run: MetadataDiffRunRecord; items: MetadataDiffItemRecord[] }> {
        return client.transaction(async (tx) => {
          const runId = nanoid();
          const createdAt = now();
          await tx.exec(`
            INSERT INTO metadata_diff_runs (id, project_id, baseline_id, status, summary_json, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [runId,
            input.projectId,
            input.baselineId,
            input.status,
            JSON.stringify(input.summary),
            input.createdBy ?? "local-admin",
            createdAt]);

          for (const item of input.items) {
            await tx.exec(`
            INSERT INTO metadata_diff_items (
              id, diff_run_id, dimension_type, dimension_name, target_type, change_type,
              severity, object_key, parent_key, child_key, property_name, old_value,
              new_value, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [nanoid(),
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
              JSON.stringify(item.details)]);
          }

          const run = await this.get(input.projectId, runId);
          if (!run) throw new Error("Failed to create metadata diff run.");
          return {
            run,
            items: await this.listItems(runId)
          };
        });
      },
      async get(projectId: string, diffRunId: string): Promise<MetadataDiffRunRecord | null>{
        const row = (await client.queryOne("SELECT * FROM metadata_diff_runs WHERE project_id = ? AND id = ?", [projectId, diffRunId]));
        return row ? mapMetadataDiffRun(row) : null;
      },
      async listByProject(projectId: string): Promise<MetadataDiffRunRecord[]>{
        return (await client.query("SELECT * FROM metadata_diff_runs WHERE project_id = ? ORDER BY created_at DESC, id", [projectId])).map(mapMetadataDiffRun);
      },
      async getLatest(projectId: string): Promise<MetadataDiffRunRecord | null>{
        const row = (await client.queryOne("SELECT * FROM metadata_diff_runs WHERE project_id = ? ORDER BY created_at DESC, id LIMIT 1", [projectId]));
        return row ? mapMetadataDiffRun(row) : null;
      },
      async listItems(diffRunId: string): Promise<MetadataDiffItemRecord[]>{
        return (await client.query(`
          SELECT * FROM metadata_diff_items
          WHERE diff_run_id = ?
          ORDER BY dimension_name, target_type, change_type, object_key, property_name, parent_key, child_key, id
        `, [diffRunId])).map(mapMetadataDiffItem);
      }
    },
    changeSets: {
      async create(input: {
        projectId: string;
        baselineId?: string;
        diffRunId?: string;
        name: string;
        description?: string;
        targetEnvironment?: string;
        status?: ChangeSetStatus;
        items?: MetadataDiffItemRecord[];
        createdBy?: string;
      }): Promise<ChangeSetRecord>{
        return client.transaction(async (tx) => {
          const id = nanoid();
          const timestamp = now();
          await tx.exec(`
            INSERT INTO change_sets (
              id, project_id, baseline_id, diff_run_id, name, description, status,
              target_environment, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [id,
            input.projectId,
            input.baselineId || null,
            input.diffRunId || null,
            input.name,
            input.description ?? "",
            input.status ?? "draft",
            input.targetEnvironment ?? "",
            input.createdBy ?? "local-admin",
            timestamp,
            timestamp]);

          for (const item of input.items ?? []) {
            await tx.exec(`
            INSERT INTO change_set_items (
              id, change_set_id, diff_item_id, item_type, change_type, severity,
              dimension_type, object_key, property_name, old_value, new_value,
              details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [nanoid(),
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
              })]);
          }

          const created = await this.get(input.projectId, id);
          if (!created) throw new Error("Failed to create change set.");
          return created;
        });
      },
      async listByProject(projectId: string): Promise<ChangeSetRecord[]>{
        return (await client.query("SELECT * FROM change_sets WHERE project_id = ? ORDER BY created_at DESC, name", [projectId])).map(mapChangeSet);
      },
      async get(projectId: string, changeSetId: string): Promise<ChangeSetRecord | null>{
        const row = (await client.queryOne("SELECT * FROM change_sets WHERE project_id = ? AND id = ?", [projectId, changeSetId]));
        return row ? mapChangeSet(row) : null;
      },
      async getDetail(projectId: string, changeSetId: string): Promise<{
        changeSet: ChangeSetRecord;
        items: ChangeSetItemRecord[];
        approvals: ChangeSetApprovalRecord[];
        latestPackage: ReleasePackageRecord | null;
      } | null> {
        const changeSet = await this.get(projectId, changeSetId);
        if (!changeSet) return null;
        return {
          changeSet,
          items: await this.listItems(changeSet.id),
          approvals: await this.listApprovals(changeSet.id),
          latestPackage: await this.getLatestReleasePackage(changeSet.id)
        };
      },
      async update(projectId: string, changeSetId: string, input: Partial<Pick<ChangeSetRecord, "name" | "description" | "status" | "targetEnvironment">>): Promise<ChangeSetRecord | null>{
        const current = await this.get(projectId, changeSetId);
        if (!current) return null;
        await client.exec(`
          UPDATE change_sets
          SET name = ?, description = ?, status = ?, target_environment = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
        `, [input.name ?? current.name,
          input.description ?? current.description,
          input.status ?? current.status,
          input.targetEnvironment ?? current.targetEnvironment,
          now(),
          projectId,
          changeSetId]);
        return await this.get(projectId, changeSetId);
      },
      async listItems(changeSetId: string): Promise<ChangeSetItemRecord[]>{
        return (await client.query(`
          SELECT * FROM change_set_items
          WHERE change_set_id = ?
          ORDER BY dimension_type, item_type, change_type, object_key, property_name, id
        `, [changeSetId])).map(mapChangeSetItem);
      },
      async recordApproval(projectId: string, changeSetId: string, input: { action: ChangeSetApprovalAction; comment?: string; createdBy?: string }): Promise<ChangeSetApprovalRecord>{
        const changeSet = await this.get(projectId, changeSetId);
        if (!changeSet) throw new Error("change set not found");
        const approval: ChangeSetApprovalRecord = {
          id: nanoid(),
          changeSetId,
          action: input.action,
          comment: input.comment ?? "",
          createdBy: input.createdBy ?? "local-admin",
          createdAt: now()
        };
        await client.exec(`
          INSERT INTO change_set_approvals (id, change_set_id, action, comment, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [approval.id, approval.changeSetId, approval.action, approval.comment, approval.createdBy, approval.createdAt]);
        return approval;
      },
      async listApprovals(changeSetId: string): Promise<ChangeSetApprovalRecord[]>{
        return (await client.query("SELECT * FROM change_set_approvals WHERE change_set_id = ? ORDER BY created_at, id", [changeSetId])).map(mapChangeSetApproval);
      },
      async createReleasePackage(input: { changeSetId: string; packageName: string; packagePath: string; manifest: unknown; createdBy?: string }): Promise<ReleasePackageRecord>{
        const id = nanoid();
        await client.exec(`
          INSERT INTO release_packages (id, change_set_id, package_name, package_path, manifest_json, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id,
          input.changeSetId,
          input.packageName,
          input.packagePath,
          JSON.stringify(input.manifest ?? {}),
          input.createdBy ?? "local-admin",
          now()]);
        const row = (await client.queryOne("SELECT * FROM release_packages WHERE id = ?", [id]));
        if (!row) throw new Error("Failed to create release package.");
        return mapReleasePackage(row);
      },
      async getLatestReleasePackage(changeSetId: string): Promise<ReleasePackageRecord | null>{
        const row = (await client.queryOne("SELECT * FROM release_packages WHERE change_set_id = ? ORDER BY created_at DESC, id LIMIT 1", [changeSetId]));
        return row ? mapReleasePackage(row) : null;
      }
    },
    users: {
      async findUserByEmail(email: string): Promise<UserRow | undefined>{
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM users WHERE email = ?", [email]);
        return row ? (row as unknown as UserRow) : undefined;
      },
      async findUserById(id: string): Promise<UserRow | undefined>{
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM users WHERE id = ?", [id]);
        return row ? (row as unknown as UserRow) : undefined;
      },
      async findUserByProviderId(provider: string, providerId: string): Promise<UserRow | undefined>{
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM users WHERE auth_provider = ? AND auth_provider_id = ?", [provider, providerId]);
        return row ? (row as unknown as UserRow) : undefined;
      },
      async createUser(input: { id: string; email: string; displayName: string; passwordHash?: string; authProvider: string; authProviderId?: string; role: string }): Promise<void>{
        const timestamp = now();
        await client.exec(`
          INSERT INTO users (id, email, display_name, password_hash, auth_provider, auth_provider_id, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `, [input.id,
          input.email,
          input.displayName,
          input.passwordHash ?? null,
          input.authProvider,
          input.authProviderId ?? null,
          input.role,
          timestamp,
          timestamp]);
      },
      async updateUser(id: string, updates: { displayName?: string; role?: string; isActive?: number; lastLoginAt?: string; avatarUrl?: string; authProvider?: string; authProviderId?: string }): Promise<void>{
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
        await client.exec(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, [...values]);
      },
      async listUsers(): Promise<UserRow[]>{
        return (await client.query("SELECT * FROM users ORDER BY created_at DESC", [])) as unknown as UserRow[];
      }
    },
    sessions: {
      async createSession(input: { id: string; userId: string; refreshTokenHash: string; expiresAt: string }): Promise<void>{
        await client.exec(`
          INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [input.id, input.userId, input.refreshTokenHash, input.expiresAt, now()]);
      },
      async findSessionByUserId(userId: string): Promise<SessionRow | undefined>{
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", [userId]);
        return row ? (row as unknown as SessionRow) : undefined;
      },
      async deleteSessionsByUserId(userId: string): Promise<void>{
        await client.exec("DELETE FROM sessions WHERE user_id = ?", [userId]);
      },
      async deleteExpiredSessions(): Promise<number>{
        const result = await client.run("DELETE FROM sessions WHERE expires_at < ?", [now()]);
        const changes = normalizeWriteResult(client.dialect, result).changes;
        return changes;
      }
    },
    projectPermissions: {
      async getProjectPermissions(projectId: string): Promise<ProjectPermissionRow[]>{
        return (await client.query("SELECT * FROM project_permissions WHERE project_id = ?", [projectId])) as unknown as ProjectPermissionRow[];
      },
      async getUserProjectPermission(projectId: string, userId: string): Promise<ProjectPermissionRow | undefined>{
        const row = await client.queryOne<Record<string, unknown>>("SELECT * FROM project_permissions WHERE project_id = ? AND user_id = ?", [projectId, userId]);
        return row ? (row as unknown as ProjectPermissionRow) : undefined;
      },
      async setProjectPermission(input: { id: string; projectId: string; userId: string; role: string; grantedBy: string }): Promise<void>{
        await client.exec(
          sqliteOrUpsert(client.dialect, "project_permissions", ["id", "project_id", "user_id", "role", "granted_by", "granted_at"], ["project_id", "user_id"], ["id", "role", "granted_by", "granted_at"]),
          [input.id, input.projectId, input.userId, input.role, input.grantedBy, now()]
        );
      },
      async removeProjectPermission(id: string): Promise<void>{
        await client.exec("DELETE FROM project_permissions WHERE id = ?", [id]);
      }
    },
    workflows: {
      definitions: {
        async create(input: { name: string; description?: string; dimensionTypes?: string; steps: unknown[]; autoAdvanceRules?: Record<string, unknown>; createdBy: string }): Promise<WorkflowDefinition> {
          const id = nanoid();
          const timestamp = now();
          await client.exec(`
            INSERT INTO workflow_definitions (id, name, description, dimension_types, steps_json, auto_advance_rules_json, is_active, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
          `, [id,
            input.name,
            input.description ?? "",
            input.dimensionTypes ?? "*",
            JSON.stringify(input.steps),
            JSON.stringify(input.autoAdvanceRules ?? {}),
            input.createdBy,
            timestamp,
            timestamp]);
          const created = await this.get(id);
          if (!created) throw new Error("Failed to create workflow definition.");
          return created;
        },
        async list(): Promise<WorkflowDefinition[]> {
          return (await client.query("SELECT * FROM workflow_definitions WHERE is_active = 1 ORDER BY name", [])).map(mapWorkflowDefinition);
        },
        async listAll(): Promise<WorkflowDefinition[]> {
          return (await client.query("SELECT * FROM workflow_definitions ORDER BY name", [])).map(mapWorkflowDefinition);
        },
        async get(id: string): Promise<WorkflowDefinition | null> {
          const row = (await client.queryOne("SELECT * FROM workflow_definitions WHERE id = ?", [id]));
          return row ? mapWorkflowDefinition(row) : null;
        },
        async update(id: string, input: { name?: string; description?: string; dimensionTypes?: string; steps?: unknown[]; autoAdvanceRules?: Record<string, unknown>; isActive?: boolean }): Promise<WorkflowDefinition | null> {
          const current = await this.get(id);
          if (!current) return null;
          await client.exec(`
            UPDATE workflow_definitions
            SET name = ?, description = ?, dimension_types = ?, steps_json = ?, auto_advance_rules_json = ?, is_active = ?, updated_at = ?
            WHERE id = ?
          `, [input.name ?? current.name,
            input.description ?? current.description,
            input.dimensionTypes ?? current.dimensionTypes,
            input.steps ? JSON.stringify(input.steps) : JSON.stringify(current.steps),
            input.autoAdvanceRules ? JSON.stringify(input.autoAdvanceRules) : JSON.stringify(current.autoAdvanceRules),
            input.isActive !== undefined ? (input.isActive ? 1 : 0) : (current.isActive ? 1 : 0),
            now(),
            id]);
          return await this.get(id);
        }
      },
      instances: {
        async create(input: { definitionId: string; changeSetId: string; projectId: string; submittedBy: string }): Promise<WorkflowInstance> {
          const id = nanoid();
          const timestamp = now();
          await client.exec(`
            INSERT INTO workflow_instances (id, definition_id, change_set_id, project_id, current_step_index, status, submitted_by, submitted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, 'in_progress', ?, ?, ?, ?)
          `, [id, input.definitionId, input.changeSetId, input.projectId, input.submittedBy, timestamp, timestamp, timestamp]);
          const created = await this.get(id);
          if (!created) throw new Error("Failed to create workflow definition.");
          return created;
        },
        async get(id: string): Promise<WorkflowInstance | null> {
          const row = (await client.queryOne("SELECT * FROM workflow_instances WHERE id = ?", [id]));
          return row ? mapWorkflowInstance(row) : null;
        },
        async getByChangeSet(changeSetId: string): Promise<WorkflowInstance | null> {
          const row = (await client.queryOne("SELECT * FROM workflow_instances WHERE change_set_id = ? ORDER BY created_at DESC LIMIT 1", [changeSetId]));
          return row ? mapWorkflowInstance(row) : null;
        },
        async listByProject(projectId: string, status?: string): Promise<WorkflowInstance[]> {
          if (status) {
            return (await client.query("SELECT * FROM workflow_instances WHERE project_id = ? AND status = ? ORDER BY created_at DESC", [projectId, status])).map(mapWorkflowInstance);
          }
          return (await client.query("SELECT * FROM workflow_instances WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(mapWorkflowInstance);
        },
        async listPendingForUser(userId: string, userRole: string): Promise<WorkflowInstance[]> {
          const instances = (await client.query("SELECT * FROM workflow_instances WHERE status = 'in_progress' ORDER BY created_at DESC", [])).map(mapWorkflowInstance);
          const pending: WorkflowInstance[] = [];
          for (const instance of instances) {
            const def = await client.queryOne("SELECT * FROM workflow_definitions WHERE id = ?", [instance.definitionId]);
            if (!def) continue;
            const definition = mapWorkflowDefinition(def);
            const currentStep = definition.steps[instance.currentStepIndex];
            if (!currentStep) continue;
            if (currentStep.requiredRole !== userRole && userRole !== "admin") continue;
            if (instance.submittedBy === userId) continue;
            pending.push(instance);
          }
          return pending;
        },
        async updateStatus(id: string, status: string, completedAt?: string): Promise<void> {
          if (completedAt) {
            await client.exec("UPDATE workflow_instances SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", [status, completedAt, now(), id]);
          } else {
            await client.exec("UPDATE workflow_instances SET status = ?, updated_at = ? WHERE id = ?", [status, now(), id]);
          }
        },
        async advanceStep(id: string, newStepIndex: number): Promise<void> {
          await client.exec("UPDATE workflow_instances SET current_step_index = ?, updated_at = ? WHERE id = ?", [newStepIndex, now(), id]);
        }
      },
      stepActions: {
        async record(input: { instanceId: string; stepIndex: number; action: WorkflowStepAction; actorId: string; comment?: string }): Promise<WorkflowStepActionRecord> {
          const id = nanoid();
          const timestamp = now();
          await client.exec(`
            INSERT INTO workflow_step_actions (id, instance_id, step_index, action, actor_id, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [id, input.instanceId, input.stepIndex, input.action, input.actorId, input.comment ?? "", timestamp]);
          return { id, instanceId: input.instanceId, stepIndex: input.stepIndex, action: input.action, actorId: input.actorId, comment: input.comment ?? "", createdAt: timestamp };
        },
        async listByInstance(instanceId: string): Promise<WorkflowStepActionRecord[]> {
          return (await client.query("SELECT * FROM workflow_step_actions WHERE instance_id = ? ORDER BY created_at, id", [instanceId])).map(mapWorkflowStepAction);
        },
        async countApprovalsForStep(instanceId: string, stepIndex: number): Promise<number> {
          const row = (await client.queryOne("SELECT COUNT(*) as cnt FROM workflow_step_actions WHERE instance_id = ? AND step_index = ? AND action = 'approve'", [instanceId, stepIndex])) as { cnt: number } | undefined;
          return row?.cnt ?? 0;
        }
      },
      notifications: {
        async create(input: { instanceId: string; recipientId: string; channel?: string; subject: string; body: string }): Promise<WorkflowNotification> {
          const id = nanoid();
          const timestamp = now();
          await client.exec(`
            INSERT INTO workflow_notifications (id, instance_id, recipient_id, channel, subject, body, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
          `, [id, input.instanceId, input.recipientId, input.channel ?? "in_app", input.subject, input.body, timestamp]);
          return { id, instanceId: input.instanceId, recipientId: input.recipientId, channel: input.channel ?? "in_app", subject: input.subject, body: input.body, isRead: false, createdAt: timestamp };
        },
        async listByRecipient(recipientId: string): Promise<WorkflowNotification[]> {
          return (await client.query("SELECT * FROM workflow_notifications WHERE recipient_id = ? ORDER BY created_at DESC", [recipientId])).map(mapWorkflowNotification);
        },
        async markRead(id: string): Promise<void> {
          await client.exec("UPDATE workflow_notifications SET is_read = 1 WHERE id = ?", [id]);
        },
        async listByInstance(instanceId: string): Promise<WorkflowNotification[]> {
          return (await client.query("SELECT * FROM workflow_notifications WHERE instance_id = ? ORDER BY created_at DESC", [instanceId])).map(mapWorkflowNotification);
        }
      },
      async getEligibleReviewers(requiredRole: string): Promise<{ id: string; email: string; displayName: string; role: string }[]> {
        const roleHierarchy: Record<string, string[]> = {
          viewer: ["viewer", "reviewer", "author", "admin"],
          reviewer: ["reviewer", "admin"],
          author: ["author", "admin"],
          admin: ["admin"]
        };
        const eligibleRoles = roleHierarchy[requiredRole] ?? [requiredRole];
        const placeholders = eligibleRoles.map(() => "?").join(", ");
        return (await client.query(`SELECT id, email, display_name, role FROM users WHERE is_active = 1 AND role IN (${placeholders})`, [...eligibleRoles])).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          email: String(row.email),
          displayName: String(row.display_name),
          role: String(row.role)
        }));
      }
    },
    environments: {
      async list(): Promise<EnvironmentSafe[]>{
        return (await client.query("SELECT * FROM environments ORDER BY name ASC", [])).map(mapEnvironmentSafe);
      },
      async getById(id: string): Promise<Environment | null>{
        const row = (await client.queryOne("SELECT * FROM environments WHERE id = ?", [id]));
        return row ? mapEnvironment(row) : null;
      },
      async getSafe(id: string): Promise<EnvironmentSafe | null>{
        const row = (await client.queryOne("SELECT * FROM environments WHERE id = ?", [id]));
        return row ? mapEnvironmentSafe(row) : null;
      },
      async create(input: CreateEnvironmentInput & { createdBy: string }): Promise<EnvironmentSafe>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO environments (id, name, type, base_url, client_id, client_secret, tenant_id, app_name, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `, [id, input.name, input.type, input.baseUrl, input.clientId, input.clientSecret, input.tenantId ?? "", input.appName ?? "", input.createdBy, timestamp, timestamp]);
        return { id, name: input.name, type: input.type, baseUrl: input.baseUrl, clientId: input.clientId, tenantId: input.tenantId ?? "", appName: input.appName ?? "", isActive: true, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async update(id: string, input: UpdateEnvironmentInput): Promise<EnvironmentSafe | null>{
        const existing = await this.getById(id);
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
        await client.exec(`
          UPDATE environments SET name = ?, type = ?, base_url = ?, client_id = ?, client_secret = ?, tenant_id = ?, app_name = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `, [name, type, baseUrl, clientId, clientSecret, tenantId, appName, isActive ? 1 : 0, updatedAt, id]);
        return { id, name, type, baseUrl, clientId, tenantId, appName, isActive, createdBy: existing.createdBy, createdAt: existing.createdAt, updatedAt };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM environments WHERE id = ?", [id]);
      }
    },
    deployments: {
      async create(input: { environmentId: string; projectId: string; changeSetId?: string; status: DeploymentStatus; xmlPayload: string; comment: string; initiatedBy: string; dimensionResults: DeploymentDimensionResult[] }): Promise<DeploymentRecord>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO deployment_history (id, environment_id, project_id, change_set_id, status, xml_payload, comment, initiated_by, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.environmentId, input.projectId, input.changeSetId ?? null, input.status, input.xmlPayload, input.comment, input.initiatedBy, timestamp, input.status === "success" || input.status === "failed" ? timestamp : null]);

        for (const r of input.dimensionResults) {
            await client.exec(`
          INSERT INTO deployment_dimension_results (id, deployment_id, dimension_type, dimension_name, status, message)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [nanoid(), id, r.dimensionType, r.dimensionName, r.status, r.message]);
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
      async list(filters: { projectId?: string; environmentId?: string } = {}): Promise<Omit<DeploymentRecord, "xmlPayload" | "dimensionResults">[]>{
        let sql = "SELECT id, environment_id, project_id, change_set_id, status, comment, initiated_by, created_at, completed_at FROM deployment_history WHERE 1=1";
        const params: unknown[] = [];
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        if (filters.environmentId) { sql += " AND environment_id = ?"; params.push(filters.environmentId); }
        sql += " ORDER BY created_at DESC";
        return (await client.query(sql, [...params])).map(mapDeploymentSummary);
      },
      async getById(id: string): Promise<DeploymentRecord | null>{
        const row = (await client.queryOne("SELECT * FROM deployment_history WHERE id = ?", [id]));
        if (!row) return null;
        const deployment = mapDeployment(row);
        const dimRows = (await client.query("SELECT * FROM deployment_dimension_results WHERE deployment_id = ?", [id]));
        deployment.dimensionResults = dimRows.map(mapDeploymentDimensionResult);
        return deployment;
      },
      async updateStatus(id: string, status: DeploymentStatus): Promise<void>{
        const completedAt = status === "success" || status === "failed" ? now() : null;
        await client.exec("UPDATE deployment_history SET status = ?, completed_at = ? WHERE id = ?", [status, completedAt, id]);
      }
    },
    connectors: {
      async list(): Promise<ConnectorDefinitionRow[]>{
        return (await client.query("SELECT * FROM connector_definitions ORDER BY name ASC", [])).map(mapConnectorDefinition);
      },
      async getById(id: string): Promise<ConnectorDefinitionRow | null>{
        const row = (await client.queryOne("SELECT * FROM connector_definitions WHERE id = ?", [id]));
        return row ? mapConnectorDefinition(row) : null;
      },
      async create(input: { name: string; connectorType: string; connectionConfig: Record<string, unknown>; extractionConfig: Record<string, unknown>; createdBy: string }): Promise<ConnectorDefinitionRow>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO connector_definitions (id, name, connector_type, connection_config_json, extraction_config_json, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        `, [id, input.name, input.connectorType, JSON.stringify(input.connectionConfig), JSON.stringify(input.extractionConfig), input.createdBy, timestamp, timestamp]);
        return { id, name: input.name, connectorType: input.connectorType, connectionConfig: input.connectionConfig, extractionConfig: input.extractionConfig, isActive: true, lastTestedAt: null, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async update(id: string, input: { name?: string; connectionConfig?: Record<string, unknown>; extractionConfig?: Record<string, unknown>; isActive?: boolean }): Promise<ConnectorDefinitionRow | null>{
        const existing = await this.getById(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const connectionConfig = input.connectionConfig ?? existing.connectionConfig;
        const extractionConfig = input.extractionConfig ?? existing.extractionConfig;
        const isActive = input.isActive ?? existing.isActive;
        const updatedAt = now();
        await client.exec(`
          UPDATE connector_definitions SET name = ?, connection_config_json = ?, extraction_config_json = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `, [name, JSON.stringify(connectionConfig), JSON.stringify(extractionConfig), isActive ? 1 : 0, updatedAt, id]);
        return { ...existing, name, connectionConfig, extractionConfig, isActive, updatedAt };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM connector_definitions WHERE id = ?", [id]);
      },
      async setLastTested(id: string): Promise<void>{
        await client.exec("UPDATE connector_definitions SET last_tested_at = ? WHERE id = ?", [now(), id]);
      }
    },
    mappingRules: {
      async listByConnector(connectorId: string): Promise<MappingRuleRow[]>{
        return (await client.query("SELECT * FROM mapping_rules WHERE connector_id = ? ORDER BY name ASC", [connectorId])).map(mapMappingRule);
      },
      async getById(id: string): Promise<MappingRuleRow | null>{
        const row = (await client.queryOne("SELECT * FROM mapping_rules WHERE id = ?", [id]));
        return row ? mapMappingRule(row) : null;
      },
      async create(input: { connectorId: string; name: string; sourceEntity: string; targetDimensionType: string; fieldMappings: unknown[]; hierarchyRules?: unknown; filterRules?: unknown[]; conflictResolution?: string; createdBy: string }): Promise<MappingRuleRow>{
        const id = nanoid();
        const timestamp = now();
        const conflictResolution = input.conflictResolution ?? "source_wins";
        await client.exec(`
          INSERT INTO mapping_rules (id, connector_id, name, source_entity, target_dimension_type, field_mappings_json, hierarchy_rules_json, filter_rules_json, conflict_resolution, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `, [id, input.connectorId, input.name, input.sourceEntity, input.targetDimensionType, JSON.stringify(input.fieldMappings), input.hierarchyRules ? JSON.stringify(input.hierarchyRules) : null, JSON.stringify(input.filterRules ?? []), conflictResolution, input.createdBy, timestamp, timestamp]);
        return { id, connectorId: input.connectorId, name: input.name, sourceEntity: input.sourceEntity, targetDimensionType: input.targetDimensionType, fieldMappings: input.fieldMappings as FieldMappingJson[], hierarchyRules: (input.hierarchyRules as HierarchyRuleJson) ?? null, filterRules: (input.filterRules ?? []) as FilterRuleJson[], conflictResolution, isActive: true, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async update(id: string, input: { name?: string; sourceEntity?: string; targetDimensionType?: string; fieldMappings?: unknown[]; hierarchyRules?: unknown; filterRules?: unknown[]; conflictResolution?: string; isActive?: boolean }): Promise<MappingRuleRow | null>{
        const existing = await this.getById(id);
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
        await client.exec(`
          UPDATE mapping_rules SET name = ?, source_entity = ?, target_dimension_type = ?, field_mappings_json = ?, hierarchy_rules_json = ?, filter_rules_json = ?, conflict_resolution = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `, [name, sourceEntity, targetDimensionType, JSON.stringify(fieldMappings), hierarchyRules ? JSON.stringify(hierarchyRules) : null, JSON.stringify(filterRules), conflictResolution, isActive ? 1 : 0, updatedAt, id]);
        return { ...existing, name, sourceEntity, targetDimensionType, fieldMappings: fieldMappings as FieldMappingJson[], hierarchyRules: (hierarchyRules as HierarchyRuleJson) ?? null, filterRules: filterRules as FilterRuleJson[], conflictResolution, isActive, updatedAt };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM mapping_rules WHERE id = ?", [id]);
      }
    },
    syncJobs: {
      async list(filters: { connectorId?: string; projectId?: string } = {}): Promise<SyncJobRow[]>{
        let sql = "SELECT * FROM sync_jobs WHERE 1=1";
        const params: unknown[] = [];
        if (filters.connectorId) { sql += " AND connector_id = ?"; params.push(filters.connectorId); }
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        sql += " ORDER BY created_at DESC";
        return (await client.query(sql, [...params])).map(mapSyncJob);
      },
      async getById(id: string): Promise<SyncJobRow | null>{
        const row = (await client.queryOne("SELECT * FROM sync_jobs WHERE id = ?", [id]));
        return row ? mapSyncJob(row) : null;
      },
      async create(input: { connectorId: string; mappingRuleId: string; projectId: string; scheduleCron?: string; autoApprove?: boolean; createdBy: string }): Promise<SyncJobRow>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO sync_jobs (id, connector_id, mapping_rule_id, project_id, schedule_cron, auto_approve, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `, [id, input.connectorId, input.mappingRuleId, input.projectId, input.scheduleCron ?? null, input.autoApprove ? 1 : 0, input.createdBy, timestamp, timestamp]);
        return { id, connectorId: input.connectorId, mappingRuleId: input.mappingRuleId, projectId: input.projectId, scheduleCron: input.scheduleCron ?? null, autoApprove: input.autoApprove ?? false, isActive: true, lastRunAt: null, nextRunAt: null, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async updateLastRun(id: string): Promise<void>{
        await client.exec("UPDATE sync_jobs SET last_run_at = ?, updated_at = ? WHERE id = ?", [now(), now(), id]);
      }
    },
    syncRuns: {
      async listByJob(jobId: string): Promise<SyncRunRow[]>{
        return (await client.query("SELECT * FROM sync_runs WHERE job_id = ? ORDER BY created_at DESC", [jobId])).map(mapSyncRun);
      },
      async getById(id: string): Promise<SyncRunRow | null>{
        const row = (await client.queryOne("SELECT * FROM sync_runs WHERE id = ?", [id]));
        return row ? mapSyncRun(row) : null;
      },
      async create(input: { jobId: string }): Promise<SyncRunRow>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO sync_runs (id, job_id, status, started_at, created_at)
          VALUES (?, ?, 'running', ?, ?)
        `, [id, input.jobId, timestamp, timestamp]);
        return { id, jobId: input.jobId, status: "running", sourceRecordsRead: 0, membersCreated: 0, membersUpdated: 0, membersDeleted: 0, relationshipsCreated: 0, relationshipsUpdated: 0, conflictsDetected: 0, conflictsResolved: 0, errorMessage: null, startedAt: timestamp, completedAt: null, createdAt: timestamp };
      },
      async complete(id: string, result: { status: string; sourceRecordsRead: number; membersCreated: number; membersUpdated: number; membersDeleted: number; relationshipsCreated: number; relationshipsUpdated: number; conflictsDetected: number; conflictsResolved: number; errorMessage?: string }): Promise<void>{
        const completedAt = now();
        await client.exec(`
          UPDATE sync_runs SET status = ?, source_records_read = ?, members_created = ?, members_updated = ?, members_deleted = ?, relationships_created = ?, relationships_updated = ?, conflicts_detected = ?, conflicts_resolved = ?, error_message = ?, completed_at = ?
          WHERE id = ?
        `, [result.status, result.sourceRecordsRead, result.membersCreated, result.membersUpdated, result.membersDeleted, result.relationshipsCreated, result.relationshipsUpdated, result.conflictsDetected, result.conflictsResolved, result.errorMessage ?? null, completedAt, id]);
      }
    },
    memberSourceRegistry: {
      async listByProject(projectId: string, dimensionType?: string): Promise<MemberSourceRow[]>{
        if (dimensionType) {
          return (await client.query("SELECT * FROM member_source_registry WHERE project_id = ? AND dimension_type = ? ORDER BY member_key", [projectId, dimensionType])).map(mapMemberSource);
        }
        return (await client.query("SELECT * FROM member_source_registry WHERE project_id = ? ORDER BY dimension_type, member_key", [projectId])).map(mapMemberSource);
      },
      async upsert(input: { projectId: string; dimensionType: string; memberKey: string; sourceSystem: string; sourceId?: string }): Promise<MemberSourceRow>{
        const timestamp = now();
        const existing = (await client.queryOne("SELECT * FROM member_source_registry WHERE project_id = ? AND dimension_type = ? AND member_key = ?", [input.projectId, input.dimensionType, input.memberKey]));
        if (existing) {
          await client.exec("UPDATE member_source_registry SET source_system = ?, source_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ?", [input.sourceSystem, input.sourceId ?? null, timestamp, timestamp, String(existing.id)]);
          return { id: String(existing.id), projectId: input.projectId, dimensionType: input.dimensionType, memberKey: input.memberKey, sourceSystem: input.sourceSystem, sourceId: input.sourceId ?? null, lastSyncedAt: timestamp, createdAt: String(existing.created_at), updatedAt: timestamp };
        }
        const id = nanoid();
        await client.exec(`
          INSERT INTO member_source_registry (id, project_id, dimension_type, member_key, source_system, source_id, last_synced_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.projectId, input.dimensionType, input.memberKey, input.sourceSystem, input.sourceId ?? null, timestamp, timestamp, timestamp]);
        return { id, projectId: input.projectId, dimensionType: input.dimensionType, memberKey: input.memberKey, sourceSystem: input.sourceSystem, sourceId: input.sourceId ?? null, lastSyncedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
      }
    },
    impactAnalyses: {
      async create(input: { projectId: string; changeSetId?: string; analysisType: string; scope: unknown; environmentId?: string; results: unknown; severity: string; summary: string; createdBy: string }): Promise<{ id: string; projectId: string; changeSetId: string | null; analysisType: string; scope: unknown; environmentId: string | null; results: unknown; severity: string; summary: string; createdBy: string; createdAt: string }> {
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO impact_analyses (id, project_id, change_set_id, analysis_type, scope_json, environment_id, results_json, severity, summary, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.projectId, input.changeSetId ?? null, input.analysisType, JSON.stringify(input.scope), input.environmentId ?? null, JSON.stringify(input.results), input.severity, input.summary, input.createdBy, timestamp]);
        return { id, projectId: input.projectId, changeSetId: input.changeSetId ?? null, analysisType: input.analysisType, scope: input.scope, environmentId: input.environmentId ?? null, results: input.results, severity: input.severity, summary: input.summary, createdBy: input.createdBy, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<{ id: string; projectId: string; changeSetId: string | null; analysisType: string; severity: string; summary: string; createdBy: string; createdAt: string }[]> {
        return (await client.query("SELECT id, project_id, change_set_id, analysis_type, severity, summary, created_by, created_at FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({
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
      async findById(id: string): Promise<{ id: string; projectId: string; changeSetId: string | null; analysisType: string; scope: unknown; environmentId: string | null; results: unknown; severity: string; summary: string; createdBy: string; createdAt: string } | null> {
        const row = (await client.queryOne("SELECT * FROM impact_analyses WHERE id = ?", [id]));
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
      async list(): Promise<PromotionPipeline[]>{
        return (await client.query("SELECT * FROM promotion_pipelines ORDER BY name ASC", [])).map(mapPromotionPipeline);
      },
      async getById(id: string): Promise<PromotionPipeline | null>{
        const row = (await client.queryOne("SELECT * FROM promotion_pipelines WHERE id = ?", [id]));
        return row ? mapPromotionPipeline(row) : null;
      },
      async create(input: { name: string; stages: PromotionStage[]; createdBy: string }): Promise<PromotionPipeline>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO promotion_pipelines (id, name, stages_json, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)
        `, [id, input.name, JSON.stringify(input.stages), input.createdBy, timestamp, timestamp]);
        return { id, name: input.name, stages: input.stages, isActive: true, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async update(id: string, input: { name?: string; stages?: PromotionStage[]; isActive?: boolean }): Promise<PromotionPipeline | null>{
        const existing = await this.getById(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const stages = input.stages ?? existing.stages;
        const isActive = input.isActive ?? existing.isActive;
        const updatedAt = now();
        await client.exec(`
          UPDATE promotion_pipelines SET name = ?, stages_json = ?, is_active = ?, updated_at = ? WHERE id = ?
        `, [name, JSON.stringify(stages), isActive ? 1 : 0, updatedAt, id]);
        return { ...existing, name, stages, isActive, updatedAt };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM promotion_pipelines WHERE id = ?", [id]);
      }
    },
    environmentSyncStatus: {
      async listByProject(projectId: string): Promise<EnvironmentSyncStatus[]>{
        return (await client.query("SELECT * FROM environment_sync_status WHERE project_id = ? ORDER BY environment_id, dimension_type", [projectId])).map(mapEnvironmentSyncStatus);
      },
      async listByEnvironment(environmentId: string, projectId?: string): Promise<EnvironmentSyncStatus[]>{
        if (projectId) {
          return (await client.query("SELECT * FROM environment_sync_status WHERE environment_id = ? AND project_id = ? ORDER BY dimension_type", [environmentId, projectId])).map(mapEnvironmentSyncStatus);
        }
        return (await client.query("SELECT * FROM environment_sync_status WHERE environment_id = ? ORDER BY project_id, dimension_type", [environmentId])).map(mapEnvironmentSyncStatus);
      },
      async upsert(input: { environmentId: string; projectId: string; dimensionType: string; lastDeployedAt?: string | null; localVersionHash: string; syncStatus: SyncStatus }): Promise<EnvironmentSyncStatus>{
        const timestamp = now();
        const existing = (await client.queryOne("SELECT id FROM environment_sync_status WHERE environment_id = ? AND project_id = ? AND dimension_type = ?", [input.environmentId, input.projectId, input.dimensionType]));
        if (existing) {
          await client.exec(`
            UPDATE environment_sync_status SET local_version_hash = ?, sync_status = ?, checked_at = ?, last_deployed_at = COALESCE(?, last_deployed_at)
            WHERE environment_id = ? AND project_id = ? AND dimension_type = ?
          `, [input.localVersionHash, input.syncStatus, timestamp, input.lastDeployedAt ?? null, input.environmentId, input.projectId, input.dimensionType]);
          const row = (await client.queryOne("SELECT * FROM environment_sync_status WHERE environment_id = ? AND project_id = ? AND dimension_type = ?", [input.environmentId, input.projectId, input.dimensionType]));
          return mapEnvironmentSyncStatus(row!);
        }
        const id = nanoid();
        await client.exec(`
          INSERT INTO environment_sync_status (id, environment_id, project_id, dimension_type, last_deployed_at, local_version_hash, sync_status, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.environmentId, input.projectId, input.dimensionType, input.lastDeployedAt ?? null, input.localVersionHash, input.syncStatus, timestamp]);
        return { id, environmentId: input.environmentId, projectId: input.projectId, dimensionType: input.dimensionType, lastDeployedAt: input.lastDeployedAt ?? null, localVersionHash: input.localVersionHash, syncStatus: input.syncStatus, checkedAt: timestamp };
      }
    },
    environmentOverrides: {
      async list(filters: { environmentId?: string; projectId?: string } = {}): Promise<EnvironmentOverride[]>{
        let sql = "SELECT * FROM environment_overrides WHERE 1=1";
        const params: unknown[] = [];
        if (filters.environmentId) { sql += " AND environment_id = ?"; params.push(filters.environmentId); }
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        sql += " ORDER BY dimension_type, member_key, property_name";
        return (await client.query(sql, [...params])).map(mapEnvironmentOverride);
      },
      async getById(id: string): Promise<EnvironmentOverride | null>{
        const row = (await client.queryOne("SELECT * FROM environment_overrides WHERE id = ?", [id]));
        return row ? mapEnvironmentOverride(row) : null;
      },
      async create(input: { environmentId: string; projectId: string; dimensionType: string; memberKey: string; propertyName: string; overrideValue: string; reason?: string; createdBy: string }): Promise<EnvironmentOverride>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO environment_overrides (id, environment_id, project_id, dimension_type, member_key, property_name, override_value, reason, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.environmentId, input.projectId, input.dimensionType, input.memberKey, input.propertyName, input.overrideValue, input.reason ?? "", input.createdBy, timestamp, timestamp]);
        return { id, environmentId: input.environmentId, projectId: input.projectId, dimensionType: input.dimensionType, memberKey: input.memberKey, propertyName: input.propertyName, overrideValue: input.overrideValue, reason: input.reason ?? "", createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async update(id: string, input: { overrideValue?: string; reason?: string }): Promise<EnvironmentOverride | null>{
        const existing = await this.getById(id);
        if (!existing) return null;
        const overrideValue = input.overrideValue ?? existing.overrideValue;
        const reason = input.reason ?? existing.reason;
        const updatedAt = now();
        await client.exec("UPDATE environment_overrides SET override_value = ?, reason = ?, updated_at = ? WHERE id = ?", [overrideValue, reason, updatedAt, id]);
        return { ...existing, overrideValue, reason, updatedAt };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM environment_overrides WHERE id = ?", [id]);
      }
    },
    promotionHistory: {
      async list(filters: { pipelineId?: string; projectId?: string } = {}): Promise<PromotionRecord[]>{
        let sql = "SELECT * FROM promotion_history WHERE 1=1";
        const params: unknown[] = [];
        if (filters.pipelineId) { sql += " AND pipeline_id = ?"; params.push(filters.pipelineId); }
        if (filters.projectId) { sql += " AND project_id = ?"; params.push(filters.projectId); }
        sql += " ORDER BY promoted_at DESC";
        return (await client.query(sql, [...params])).map(mapPromotionHistory);
      },
      async create(input: { pipelineId: string; projectId: string; fromEnvironmentId: string; toEnvironmentId: string; deploymentId?: string | null; status: PromotionRecord["status"]; promotedBy: string }): Promise<PromotionRecord>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO promotion_history (id, pipeline_id, project_id, from_environment_id, to_environment_id, deployment_id, status, promoted_by, promoted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.pipelineId, input.projectId, input.fromEnvironmentId, input.toEnvironmentId, input.deploymentId ?? null, input.status, input.promotedBy, timestamp]);
        return { id, pipelineId: input.pipelineId, projectId: input.projectId, fromEnvironmentId: input.fromEnvironmentId, toEnvironmentId: input.toEnvironmentId, deploymentId: input.deploymentId ?? null, status: input.status, promotedBy: input.promotedBy, promotedAt: timestamp };
      },
      async updateStatus(id: string, status: PromotionRecord["status"], deploymentId?: string): Promise<void>{
        if (deploymentId) {
          await client.exec("UPDATE promotion_history SET status = ?, deployment_id = ? WHERE id = ?", [status, deploymentId, id]);
        } else {
          await client.exec("UPDATE promotion_history SET status = ? WHERE id = ?", [status, id]);
        }
      }
    },
    aiSuggestions: {
      async create(input: { projectId: string; dimensionId?: string; suggestionType: AISuggestionType; targetMemberKey?: string; suggestion: Record<string, unknown>; confidence: number }): Promise<AISuggestion>{
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
        await client.exec(`
          INSERT INTO ai_suggestions (id, project_id, dimension_id, suggestion_type, target_member_key, suggestion_json, confidence, status, acted_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, record.projectId, record.dimensionId, record.suggestionType, record.targetMemberKey, JSON.stringify(record.suggestion), record.confidence, record.status, record.actedBy, record.createdAt, record.updatedAt]);
        return record;
      },
      async listByProject(projectId: string, filters?: { type?: AISuggestionType; status?: AISuggestionStatus }): Promise<AISuggestion[]>{
        let sql = "SELECT * FROM ai_suggestions WHERE project_id = ?";
        const params: unknown[] = [projectId];
        if (filters?.type) { sql += " AND suggestion_type = ?"; params.push(filters.type); }
        if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }
        sql += " ORDER BY created_at DESC";
        return (await client.query(sql, [...params])).map(mapAISuggestion);
      },
      async updateStatus(id: string, status: AISuggestionStatus, actedBy: string): Promise<AISuggestion | null>{
        const existing = (await client.queryOne("SELECT * FROM ai_suggestions WHERE id = ?", [id]));
        if (!existing) return null;
        const timestamp = now();
        await client.exec("UPDATE ai_suggestions SET status = ?, acted_by = ?, updated_at = ? WHERE id = ?", [status, actedBy, timestamp, id]);
        return { ...mapAISuggestion(existing), status, actedBy, updatedAt: timestamp };
      },
      async deleteByProject(projectId: string): Promise<void>{
        await client.exec("DELETE FROM ai_suggestions WHERE project_id = ?", [projectId]);
      },
      async get(id: string): Promise<AISuggestion | null>{
        const row = (await client.queryOne("SELECT * FROM ai_suggestions WHERE id = ?", [id]));
        return row ? mapAISuggestion(row) : null;
      }
    },
    aiConversations: {
      async create(input: { projectId: string; userId: string; message: AIMessage }): Promise<AIConversation>{
        const id = nanoid();
        const timestamp = now();
        const messages = [input.message];
        await client.exec(`
          INSERT INTO ai_conversations (id, project_id, user_id, messages_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, input.projectId, input.userId, JSON.stringify(messages), timestamp, timestamp]);
        return { id, projectId: input.projectId, userId: input.userId, messages, createdAt: timestamp, updatedAt: timestamp };
      },
      async get(id: string): Promise<AIConversation | null>{
        const row = (await client.queryOne("SELECT * FROM ai_conversations WHERE id = ?", [id]));
        return row ? mapAIConversation(row) : null;
      },
      async listByProject(projectId: string): Promise<AIConversation[]>{
        return (await client.query("SELECT * FROM ai_conversations WHERE project_id = ? ORDER BY updated_at DESC", [projectId])).map(mapAIConversation);
      },
      async appendMessage(id: string, message: AIMessage): Promise<AIConversation | null>{
        const existing = await this.get(id);
        if (!existing) return null;
        const messages = [...existing.messages, message];
        const timestamp = now();
        await client.exec("UPDATE ai_conversations SET messages_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(messages), timestamp, id]);
        return { ...existing, messages, updatedAt: timestamp };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM ai_conversations WHERE id = ?", [id]);
      }
    },
    crossDimensionRules: {
      async create(input: { projectId: string; name: string; sourceDimensionType: string; targetDimensionType: string; ruleType: CrossDimensionRuleType; ruleConfig?: Record<string, unknown>; severity?: string; createdBy: string }): Promise<CrossDimensionRule>{
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
        await client.exec(`
          INSERT INTO cross_dimension_rules (id, project_id, name, source_dimension_type, target_dimension_type, rule_type, rule_config_json, severity, is_active, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, rule.projectId, rule.name, rule.sourceDimensionType, rule.targetDimensionType, rule.ruleType, JSON.stringify(rule.ruleConfig), rule.severity, 1, rule.createdBy, rule.createdAt]);
        return rule;
      },
      async listByProject(projectId: string): Promise<CrossDimensionRule[]>{
        return (await client.query("SELECT * FROM cross_dimension_rules WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(mapCrossDimensionRule);
      },
      async get(id: string): Promise<CrossDimensionRule | null>{
        const row = (await client.queryOne("SELECT * FROM cross_dimension_rules WHERE id = ?", [id]));
        return row ? mapCrossDimensionRule(row) : null;
      },
      async update(id: string, input: { name?: string; ruleConfig?: Record<string, unknown>; severity?: string; isActive?: boolean }): Promise<CrossDimensionRule | null>{
        const existing = await this.get(id);
        if (!existing) return null;
        const name = input.name ?? existing.name;
        const ruleConfig = input.ruleConfig ?? existing.ruleConfig;
        const severity = (input.severity as CrossDimensionRule['severity']) ?? existing.severity;
        const isActive = input.isActive ?? existing.isActive;
        await client.exec("UPDATE cross_dimension_rules SET name = ?, rule_config_json = ?, severity = ?, is_active = ? WHERE id = ?", [name, JSON.stringify(ruleConfig), severity, isActive ? 1 : 0, id]);
        return { ...existing, name, ruleConfig, severity, isActive };
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM cross_dimension_rules WHERE id = ?", [id]);
      }
    },
    crossDimensionMappings: {
      async create(input: { projectId: string; sourceDimensionType: string; sourceMemberKey: string; targetDimensionType: string; targetMemberKey: string; mappingType: CrossDimensionMappingType }): Promise<CrossDimensionMapping>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO cross_dimension_mappings (id, project_id, source_dimension_type, source_member_key, target_dimension_type, target_member_key, mapping_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, input.projectId, input.sourceDimensionType, input.sourceMemberKey, input.targetDimensionType, input.targetMemberKey, input.mappingType, timestamp]);
        return { id, ...input, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<CrossDimensionMapping[]>{
        return (await client.query("SELECT * FROM cross_dimension_mappings WHERE project_id = ? ORDER BY source_dimension_type, source_member_key", [projectId])).map(mapCrossDimensionMapping);
      },
      async listByMember(projectId: string, memberKey: string): Promise<CrossDimensionMapping[]>{
        return (await client.query("SELECT * FROM cross_dimension_mappings WHERE project_id = ? AND (source_member_key = ? OR target_member_key = ?)", [projectId, memberKey, memberKey])).map(mapCrossDimensionMapping);
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM cross_dimension_mappings WHERE id = ?", [id]);
      }
    },
    templates: {
      async create(input: { name: string; description?: string; category?: TemplateCategory; industry?: TemplateIndustry; dimensionTypes: string[]; templateData: TemplateData; tags?: string[]; isPublic?: boolean; createdBy: string }): Promise<Template>{
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
        await client.exec(`
          INSERT INTO templates (id, name, description, category, industry, dimension_types_json, template_data_json, tags_json, version, is_public, usage_count, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, template.name, template.description, template.category, template.industry, JSON.stringify(template.dimensionTypes), JSON.stringify(template.templateData), JSON.stringify(template.tags), template.version, template.isPublic ? 1 : 0, 0, template.createdBy, template.createdAt, template.updatedAt]);
        return template;
      },
      async list(filters?: { category?: TemplateCategory; industry?: TemplateIndustry; search?: string }): Promise<Template[]>{
        let sql = "SELECT * FROM templates WHERE 1=1";
        const params: unknown[] = [];
        if (filters?.category) { sql += " AND category = ?"; params.push(filters.category); }
        if (filters?.industry) { sql += " AND industry = ?"; params.push(filters.industry); }
        if (filters?.search) { sql += " AND (name LIKE ? OR description LIKE ? OR tags_json LIKE ?)"; const s = `%${filters.search}%`; params.push(s, s, s); }
        sql += " ORDER BY usage_count DESC, updated_at DESC";
        return (await client.query(sql, [...params])).map(mapTemplate);
      },
      async get(id: string): Promise<Template | null>{
        const row = (await client.queryOne("SELECT * FROM templates WHERE id = ?", [id]));
        return row ? mapTemplate(row) : null;
      },
      async incrementUsage(id: string): Promise<void>{
        await client.exec("UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?", [now(), id]);
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM templates WHERE id = ?", [id]);
      }
    },
    templateApplications: {
      async create(input: { templateId: string; projectId: string; appliedBy: string; renameMapping?: Record<string, string> }): Promise<TemplateApplication>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`
          INSERT INTO template_applications (id, template_id, project_id, applied_by, rename_mapping_json, applied_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, input.templateId, input.projectId, input.appliedBy, input.renameMapping ? JSON.stringify(input.renameMapping) : null, timestamp]);
        return { id, templateId: input.templateId, projectId: input.projectId, appliedBy: input.appliedBy, renameMapping: input.renameMapping ?? null, appliedAt: timestamp };
      },
      async listByProject(projectId: string): Promise<TemplateApplication[]>{
        return (await client.query("SELECT * FROM template_applications WHERE project_id = ? ORDER BY applied_at DESC", [projectId])).map(mapTemplateApplication);
      },
      async listByTemplate(templateId: string): Promise<TemplateApplication[]>{
        return (await client.query("SELECT * FROM template_applications WHERE template_id = ? ORDER BY applied_at DESC", [templateId])).map(mapTemplateApplication);
      }
    },
    reportDefinitions: {
      async create(input: { name: string; reportType: ReportType; config?: ReportConfig; scheduleCron?: string; format?: ReportFormat; recipients?: string[]; createdBy: string }): Promise<ReportDefinition>{
        const id = nanoid();
        const timestamp = now();
        const def: ReportDefinition = {
          id, name: input.name, reportType: input.reportType,
          config: input.config ?? {}, scheduleCron: input.scheduleCron ?? null,
          format: input.format ?? 'json', recipients: input.recipients ?? [],
          createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp
        };
        await client.exec(`INSERT INTO report_definitions (id, name, report_type, config_json, schedule_cron, format, recipients_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, def.name, def.reportType, JSON.stringify(def.config), def.scheduleCron, def.format, JSON.stringify(def.recipients), def.createdBy, def.createdAt, def.updatedAt]);
        return def;
      },
      async list(filters?: { reportType?: ReportType }): Promise<ReportDefinition[]>{
        let sql = "SELECT * FROM report_definitions";
        const params: unknown[] = [];
        if (filters?.reportType) { sql += " WHERE report_type = ?"; params.push(filters.reportType); }
        sql += " ORDER BY updated_at DESC";
        return (await client.query(sql, [...params])).map(mapReportDefinition);
      },
      async get(id: string): Promise<ReportDefinition | null>{
        const row = (await client.queryOne("SELECT * FROM report_definitions WHERE id = ?", [id]));
        return row ? mapReportDefinition(row) : null;
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM report_definitions WHERE id = ?", [id]);
      }
    },
    reportRuns: {
      async create(input: { definitionId: string; status?: ReportRunStatus; outputData?: Record<string, unknown> }): Promise<ReportRun>{
        const id = nanoid();
        const timestamp = now();
        const status = input.status ?? 'completed';
        await client.exec(`INSERT INTO report_runs (id, definition_id, status, output_data_json, generated_at) VALUES (?, ?, ?, ?, ?)`, [id, input.definitionId, status, input.outputData ? JSON.stringify(input.outputData) : null, timestamp]);
        return { id, definitionId: input.definitionId, status, outputData: input.outputData ?? null, generatedAt: timestamp };
      },
      async listByDefinition(definitionId: string): Promise<ReportRun[]>{
        return (await client.query("SELECT * FROM report_runs WHERE definition_id = ? ORDER BY generated_at DESC", [definitionId])).map(mapReportRun);
      },
      async get(id: string): Promise<ReportRun | null>{
        const row = (await client.queryOne("SELECT * FROM report_runs WHERE id = ?", [id]));
        return row ? mapReportRun(row) : null;
      }
    },
    healthSnapshots: {
      async create(input: Omit<MetadataHealthSnapshot, 'id' | 'capturedAt'>): Promise<MetadataHealthSnapshot>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`INSERT INTO metadata_health_snapshots (id, project_id, dimension_type, quality_score, completeness_score, naming_score, validation_error_count, validation_warning_count, member_count, orphan_count, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.projectId, input.dimensionType, input.qualityScore, input.completenessScore, input.namingScore, input.validationErrorCount, input.validationWarningCount, input.memberCount, input.orphanCount, timestamp]);
        return { id, ...input, capturedAt: timestamp };
      },
      async listByProject(projectId: string, dimensionType?: string): Promise<MetadataHealthSnapshot[]>{
        if (dimensionType) {
          return (await client.query("SELECT * FROM metadata_health_snapshots WHERE project_id = ? AND dimension_type = ? ORDER BY captured_at DESC", [projectId, dimensionType])).map(mapHealthSnapshot);
        }
        return (await client.query("SELECT * FROM metadata_health_snapshots WHERE project_id = ? ORDER BY captured_at DESC", [projectId])).map(mapHealthSnapshot);
      }
    },
    vcsBranches: {
      async create(input: { projectId: string; name: string; baseBranchId?: string; createdBy: string }): Promise<VcsBranch>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`INSERT INTO vcs_branches (id, project_id, name, status, head_commit_id, base_branch_id, created_by, created_at) VALUES (?, ?, ?, 'active', NULL, ?, ?, ?)`, [id, input.projectId, input.name, input.baseBranchId ?? null, input.createdBy, timestamp]);
        return { id, projectId: input.projectId, name: input.name, status: 'active', headCommitId: null, baseBranchId: input.baseBranchId ?? null, createdBy: input.createdBy, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<VcsBranch[]>{
        return (await client.query("SELECT * FROM vcs_branches WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(mapVcsBranch);
      },
      async get(id: string): Promise<VcsBranch | null>{
        const row = (await client.queryOne("SELECT * FROM vcs_branches WHERE id = ?", [id]));
        return row ? mapVcsBranch(row) : null;
      },
      async updateHead(id: string, commitId: string): Promise<void>{
        await client.exec("UPDATE vcs_branches SET head_commit_id = ? WHERE id = ?", [commitId, id]);
      },
      async updateStatus(id: string, status: VcsBranchStatus): Promise<void>{
        await client.exec("UPDATE vcs_branches SET status = ? WHERE id = ?", [status, id]);
      }
    },
    vcsCommits: {
      async create(input: { projectId: string; branchId: string; message: string; snapshotData: ProjectSnapshot; parentCommitId?: string; createdBy: string }): Promise<VcsCommit>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`INSERT INTO vcs_commits (id, project_id, branch_id, message, snapshot_data_json, parent_commit_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.projectId, input.branchId, input.message, JSON.stringify(input.snapshotData), input.parentCommitId ?? null, input.createdBy, timestamp]);
        return { id, projectId: input.projectId, branchId: input.branchId, message: input.message, snapshotData: input.snapshotData as unknown as Record<string, unknown>, parentCommitId: input.parentCommitId ?? null, createdBy: input.createdBy, createdAt: timestamp };
      },
      async listByBranch(branchId: string): Promise<VcsCommit[]>{
        return (await client.query("SELECT * FROM vcs_commits WHERE branch_id = ? ORDER BY created_at DESC", [branchId])).map(mapVcsCommit);
      },
      async listByProject(projectId: string, limit = 50): Promise<VcsCommit[]>{
        return (await client.query("SELECT * FROM vcs_commits WHERE project_id = ? ORDER BY created_at DESC LIMIT ?", [projectId, limit])).map(mapVcsCommit);
      },
      async get(id: string): Promise<VcsCommit | null>{
        const row = (await client.queryOne("SELECT * FROM vcs_commits WHERE id = ?", [id]));
        return row ? mapVcsCommit(row) : null;
      }
    },
    vcsTags: {
      async create(input: { projectId: string; name: string; commitId: string; description?: string; createdBy: string }): Promise<VcsTag>{
        const id = nanoid();
        const timestamp = now();
        await client.exec(`INSERT INTO vcs_tags (id, project_id, name, commit_id, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.projectId, input.name, input.commitId, input.description ?? '', input.createdBy, timestamp]);
        return { id, projectId: input.projectId, name: input.name, commitId: input.commitId, description: input.description ?? '', createdBy: input.createdBy, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<VcsTag[]>{
        return (await client.query("SELECT * FROM vcs_tags WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(mapVcsTag);
      },
      async delete(id: string): Promise<void>{
        await client.exec("DELETE FROM vcs_tags WHERE id = ?", [id]);
      }
    },
    editLocks: {
      async acquire(input: { projectId: string; dimensionId: string; userId: string; durationMinutes?: number }): Promise<EditLock>{
        const id = nanoid(); const timestamp = now(); const duration = input.durationMinutes ?? 30;
        const expires = new Date(Date.now() + duration * 60 * 1000).toISOString();
        await client.exec("DELETE FROM edit_locks WHERE project_id = ? AND dimension_id = ? AND expires_at < ?", [input.projectId, input.dimensionId, timestamp]);
        await client.exec("INSERT INTO edit_locks (id, project_id, dimension_id, user_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)", [id, input.projectId, input.dimensionId, input.userId, timestamp, expires]);
        return { id, projectId: input.projectId, dimensionId: input.dimensionId, userId: input.userId, acquiredAt: timestamp, expiresAt: expires };
      },
      async getActive(projectId: string, dimensionId: string): Promise<EditLock | null>{
        const row = (await client.queryOne("SELECT * FROM edit_locks WHERE project_id = ? AND dimension_id = ? AND expires_at > ? ORDER BY acquired_at DESC LIMIT 1", [projectId, dimensionId, now()]));
        if (!row) return null;
        return { id: String(row.id), projectId: String(row.project_id), dimensionId: String(row.dimension_id), userId: String(row.user_id), acquiredAt: String(row.acquired_at), expiresAt: String(row.expires_at) };
      },
      async release(projectId: string, dimensionId: string, userId: string): Promise<void>{ await client.exec("DELETE FROM edit_locks WHERE project_id = ? AND dimension_id = ? AND user_id = ?", [projectId, dimensionId, userId]); },
      async listByProject(projectId: string): Promise<EditLock[]>{ return (await client.query("SELECT * FROM edit_locks WHERE project_id = ? AND expires_at > ?", [projectId, now()])).map(row => ({ id: String(row.id), projectId: String(row.project_id), dimensionId: String(row.dimension_id), userId: String(row.user_id), acquiredAt: String(row.acquired_at), expiresAt: String(row.expires_at) })); }
    },
    scheduledJobs: {
      async create(input: { projectId: string; name: string; triggerType: string; triggerConfig?: Record<string, unknown>; actionType: string; actionConfig?: Record<string, unknown>; createdBy: string }): Promise<ScheduledJob>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO scheduled_jobs (id, project_id, name, trigger_type, trigger_config_json, action_type, action_config_json, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)", [id, input.projectId, input.name, input.triggerType, JSON.stringify(input.triggerConfig ?? {}), input.actionType, JSON.stringify(input.actionConfig ?? {}), input.createdBy, timestamp, timestamp]);
        return { id, projectId: input.projectId, name: input.name, triggerType: input.triggerType as ScheduledJob['triggerType'], triggerConfig: input.triggerConfig ?? {}, actionType: input.actionType, actionConfig: input.actionConfig ?? {}, status: 'active', lastRunAt: null, nextRunAt: null, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async listByProject(projectId: string): Promise<ScheduledJob[]>{ return (await client.query("SELECT * FROM scheduled_jobs WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), triggerType: String(row.trigger_type) as ScheduledJob['triggerType'], triggerConfig: parseJson(String(row.trigger_config_json ?? "{}"), {}), actionType: String(row.action_type), actionConfig: parseJson(String(row.action_config_json ?? "{}"), {}), status: String(row.status) as JobStatus, lastRunAt: row.last_run_at ? String(row.last_run_at) : null, nextRunAt: row.next_run_at ? String(row.next_run_at) : null, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      async get(id: string): Promise<ScheduledJob | null>{ const row = (await client.queryOne("SELECT * FROM scheduled_jobs WHERE id = ?", [id])); if (!row) return null; return { id: String(row.id), projectId: String(row.project_id), name: String(row.name), triggerType: String(row.trigger_type) as ScheduledJob['triggerType'], triggerConfig: parseJson(String(row.trigger_config_json ?? "{}"), {}), actionType: String(row.action_type), actionConfig: parseJson(String(row.action_config_json ?? "{}"), {}), status: String(row.status) as JobStatus, lastRunAt: row.last_run_at ? String(row.last_run_at) : null, nextRunAt: row.next_run_at ? String(row.next_run_at) : null, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM scheduled_jobs WHERE id = ?", [id]); }
    },
    jobExecutions: {
      async create(input: { jobId: string; status?: JobExecutionStatus; result?: Record<string, unknown>; errorMessage?: string }): Promise<JobExecution>{
        const id = nanoid(); const timestamp = now(); const status = input.status ?? 'pending';
        await client.exec("INSERT INTO job_executions (id, job_id, status, started_at, completed_at, result_json, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, input.jobId, status, timestamp, status === 'succeeded' || status === 'failed' ? timestamp : null, input.result ? JSON.stringify(input.result) : null, input.errorMessage ?? null]);
        return { id, jobId: input.jobId, status, startedAt: timestamp, completedAt: status === 'succeeded' || status === 'failed' ? timestamp : null, result: input.result ?? null, errorMessage: input.errorMessage ?? null };
      },
      async listByJob(jobId: string): Promise<JobExecution[]>{ return (await client.query("SELECT * FROM job_executions WHERE job_id = ? ORDER BY started_at DESC", [jobId])).map(row => ({ id: String(row.id), jobId: String(row.job_id), status: String(row.status) as JobExecutionStatus, startedAt: String(row.started_at), completedAt: row.completed_at ? String(row.completed_at) : null, result: row.result_json ? parseJson(String(row.result_json), {}) : null, errorMessage: row.error_message ? String(row.error_message) : null })); }
    },
    qualityRules: {
      async create(input: { projectId: string; name: string; category: string; weight?: number; config?: Record<string, unknown>; createdBy: string }): Promise<QualityRule>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO quality_rules (id, project_id, name, category, weight, config_json, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)", [id, input.projectId, input.name, input.category, input.weight ?? 1.0, JSON.stringify(input.config ?? {}), input.createdBy, timestamp]);
        return { id, projectId: input.projectId, name: input.name, category: input.category as QualityRule['category'], weight: input.weight ?? 1.0, config: input.config ?? {}, isActive: true, createdBy: input.createdBy, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<QualityRule[]>{ return (await client.query("SELECT * FROM quality_rules WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), category: String(row.category) as QualityRule['category'], weight: Number(row.weight ?? 1), config: parseJson(String(row.config_json ?? "{}"), {}), isActive: Boolean(row.is_active), createdBy: String(row.created_by), createdAt: String(row.created_at) })); },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM quality_rules WHERE id = ?", [id]); }
    },
    qualityGates: {
      async create(input: { projectId: string; name: string; threshold: number; scope?: string; action?: string; createdBy: string }): Promise<QualityGate>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO quality_gates (id, project_id, name, threshold, scope, action, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)", [id, input.projectId, input.name, input.threshold, input.scope ?? 'project', input.action ?? 'warn', input.createdBy, timestamp]);
        return { id, projectId: input.projectId, name: input.name, threshold: input.threshold, scope: (input.scope ?? 'project') as QualityGate['scope'], action: (input.action ?? 'warn') as QualityGate['action'], isActive: true, createdBy: input.createdBy, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<QualityGate[]>{ return (await client.query("SELECT * FROM quality_gates WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), threshold: Number(row.threshold), scope: String(row.scope ?? 'project') as QualityGate['scope'], action: String(row.action ?? 'warn') as QualityGate['action'], isActive: Boolean(row.is_active), createdBy: String(row.created_by), createdAt: String(row.created_at) })); },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM quality_gates WHERE id = ?", [id]); }
    },
    migrationProjects: {
      async create(input: { projectId: string; name: string; sourceType: string; createdBy: string }): Promise<MigrationProject>{
        const id = nanoid(); const timestamp = now();
        const progress = { totalDimensions: 0, completedDimensions: 0, totalMembers: 0, mappedMembers: 0, unmappedMembers: 0, gapCount: 0 };
        await client.exec("INSERT INTO migration_projects (id, project_id, name, source_type, status, source_config_json, progress_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', '{}', ?, ?, ?, ?)", [id, input.projectId, input.name, input.sourceType, JSON.stringify(progress), input.createdBy, timestamp, timestamp]);
        return { id, projectId: input.projectId, name: input.name, sourceType: input.sourceType as MigrationProject['sourceType'], status: 'draft', sourceConfig: {}, progress, createdBy: input.createdBy, createdAt: timestamp, updatedAt: timestamp };
      },
      async listByProject(projectId: string): Promise<MigrationProject[]>{ return (await client.query("SELECT * FROM migration_projects WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.name), sourceType: String(row.source_type) as MigrationProject['sourceType'], status: String(row.status) as MigrationProject['status'], sourceConfig: parseJson(String(row.source_config_json ?? "{}"), {}), progress: parseJson(String(row.progress_json ?? "{}"), { totalDimensions: 0, completedDimensions: 0, totalMembers: 0, mappedMembers: 0, unmappedMembers: 0, gapCount: 0 }), createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM migration_projects WHERE id = ?", [id]); }
    },
    webhookSubscriptions: {
      async create(input: { projectId: string; url: string; events: string[]; secret?: string; createdBy: string }): Promise<WebhookConfig>{
        const id = nanoid(); const timestamp = now(); const secret = input.secret ?? nanoid(32);
        await client.exec("INSERT INTO webhook_subscriptions (id, project_id, url, events_json, secret, is_active, failure_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)", [id, input.projectId, input.url, JSON.stringify(input.events), secret, input.createdBy, timestamp]);
        return { id, projectId: input.projectId, name: input.url, url: input.url, secret, events: input.events, isActive: true, createdAt: timestamp };
      },
      async listByProject(projectId: string): Promise<WebhookConfig[]>{ return (await client.query("SELECT * FROM webhook_subscriptions WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), name: String(row.url), url: String(row.url), secret: String(row.secret), events: parseJson<string[]>(String(row.events_json ?? "[]"), []), isActive: Boolean(row.is_active), createdAt: String(row.created_at) })); },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM webhook_subscriptions WHERE id = ?", [id]); }
    },
    syncQueue: {
      async create(input: { projectId: string; operationType: string; entityType: string; entityId: string; payload: Record<string, unknown> }): Promise<SyncQueueEntry>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO sync_queue (id, project_id, operation_type, entity_type, entity_id, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)", [id, input.projectId, input.operationType, input.entityType, input.entityId, JSON.stringify(input.payload), timestamp]);
        return { id, projectId: input.projectId, operationType: input.operationType as SyncQueueEntry['operationType'], entityType: input.entityType as SyncQueueEntry['entityType'], entityId: input.entityId, payload: input.payload, status: 'pending', createdAt: timestamp, syncedAt: null };
      },
      async listPending(projectId: string): Promise<SyncQueueEntry[]>{ return (await client.query("SELECT * FROM sync_queue WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), operationType: String(row.operation_type) as SyncQueueEntry['operationType'], entityType: String(row.entity_type) as SyncQueueEntry['entityType'], entityId: String(row.entity_id), payload: parseJson(String(row.payload_json ?? "{}"), {}), status: String(row.status) as SyncQueueEntry['status'], createdAt: String(row.created_at), syncedAt: row.synced_at ? String(row.synced_at) : null })); },
      async markSynced(id: string): Promise<void>{ await client.exec("UPDATE sync_queue SET status = 'synced', synced_at = ? WHERE id = ?", [now(), id]); },
      async countPending(projectId: string): Promise<number>{ return Number((await client.queryOne("SELECT COUNT(*) as count FROM sync_queue WHERE project_id = ? AND status = 'pending'", [projectId]))?.count ?? 0); }
    },
    generatedDocuments: {
      async create(input: { projectId: string; title: string; format: string; content: string; snapshotId?: string; generatedBy: string }): Promise<{ id: string; projectId: string; title: string; format: string; content: string; snapshotId: string | null; generatedBy: string; generatedAt: string }> {
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO generated_documents (id, project_id, title, format, content, snapshot_id, generated_by, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, input.projectId, input.title, input.format, input.content, input.snapshotId ?? null, input.generatedBy, timestamp]);
        return { id, projectId: input.projectId, title: input.title, format: input.format, content: input.content, snapshotId: input.snapshotId ?? null, generatedBy: input.generatedBy, generatedAt: timestamp };
      },
      async listByProject(projectId: string): Promise<Array<{ id: string; title: string; format: string; generatedAt: string }>> { return (await client.query("SELECT id, title, format, generated_at FROM generated_documents WHERE project_id = ? ORDER BY generated_at DESC", [projectId])).map(row => ({ id: String(row.id), title: String(row.title), format: String(row.format), generatedAt: String(row.generated_at) })); },
      async get(id: string): Promise<{ id: string; projectId: string; title: string; format: string; content: string; snapshotId: string | null; generatedBy: string; generatedAt: string } | null> { const row = (await client.queryOne("SELECT * FROM generated_documents WHERE id = ?", [id])); if (!row) return null; return { id: String(row.id), projectId: String(row.project_id), title: String(row.title), format: String(row.format), content: String(row.content), snapshotId: row.snapshot_id ? String(row.snapshot_id) : null, generatedBy: String(row.generated_by), generatedAt: String(row.generated_at) }; },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM generated_documents WHERE id = ?", [id]); }
    },
    tenants: {
      async create(input: { name: string; slug: string; config?: TenantConfig }): Promise<Tenant>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO tenants (id, name, slug, config_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)", [id, input.name, input.slug, JSON.stringify(input.config ?? {}), timestamp, timestamp]);
        return { id, name: input.name, slug: input.slug, config: input.config ?? {}, status: 'active', createdAt: timestamp, updatedAt: timestamp };
      },
      async list(): Promise<Tenant[]>{ return (await client.query("SELECT * FROM tenants ORDER BY name ASC", [])).map(row => ({ id: String(row.id), name: String(row.name), slug: String(row.slug), config: parseJson(String(row.config_json ?? "{}"), {}), status: String(row.status) as Tenant['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      async getBySlug(slug: string): Promise<Tenant | null>{ const row = (await client.queryOne("SELECT * FROM tenants WHERE slug = ?", [slug])); if (!row) return null; return { id: String(row.id), name: String(row.name), slug: String(row.slug), config: parseJson(String(row.config_json ?? "{}"), {}), status: String(row.status) as Tenant['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM tenants WHERE id = ?", [id]); }
    },
    comments: {
      async create(input: { projectId: string; dimensionId: string; memberKey?: string; content: string; authorId: string; authorName: string; mentions?: string[]; parentCommentId?: string }): Promise<CollaborationComment>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO collaboration_comments (id, project_id, dimension_id, member_key, content, author_id, author_name, mentions_json, parent_comment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, input.projectId, input.dimensionId, input.memberKey ?? null, input.content, input.authorId, input.authorName, JSON.stringify(input.mentions ?? []), input.parentCommentId ?? null, timestamp, timestamp]);
        return { id, projectId: input.projectId, dimensionId: input.dimensionId, memberKey: input.memberKey ?? null, content: input.content, authorId: input.authorId, authorName: input.authorName, mentions: input.mentions ?? [], parentCommentId: input.parentCommentId ?? null, createdAt: timestamp, updatedAt: timestamp };
      },
      async listByProject(projectId: string): Promise<CollaborationComment[]>{ return (await client.query("SELECT * FROM collaboration_comments WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map(row => ({ id: String(row.id), projectId: String(row.project_id), dimensionId: String(row.dimension_id), memberKey: row.member_key ? String(row.member_key) : null, content: String(row.content), authorId: String(row.author_id), authorName: String(row.author_name ?? ''), mentions: parseJson<string[]>(String(row.mentions_json ?? "[]"), []), parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) })); },
      async delete(id: string): Promise<void>{ await client.exec("DELETE FROM collaboration_comments WHERE id = ?", [id]); }
    },
    auditLog: {
      async create(input: { tenantId?: string; projectId?: string; userId: string; action: string; entityType: string; entityId: string; changes?: Record<string, unknown>; ipAddress?: string }): Promise<AuditLogEntry>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO audit_log (id, tenant_id, project_id, user_id, action, entity_type, entity_id, changes_json, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, input.tenantId ?? null, input.projectId ?? null, input.userId, input.action, input.entityType, input.entityId, JSON.stringify(input.changes ?? {}), input.ipAddress ?? null, timestamp]);
        return { id, tenantId: input.tenantId ?? null, projectId: input.projectId ?? null, userId: input.userId, action: input.action, entityType: input.entityType, entityId: input.entityId, changes: input.changes ?? {}, ipAddress: input.ipAddress ?? null, timestamp };
      },
      async listByProject(projectId: string, limit = 100): Promise<AuditLogEntry[]>{ return (await client.query("SELECT * FROM audit_log WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?", [projectId, limit])).map(row => ({ id: String(row.id), tenantId: row.tenant_id ? String(row.tenant_id) : null, projectId: row.project_id ? String(row.project_id) : null, userId: String(row.user_id), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id), changes: parseJson(String(row.changes_json ?? "{}"), {}), ipAddress: row.ip_address ? String(row.ip_address) : null, timestamp: String(row.timestamp) })); },
      async countByProject(projectId: string): Promise<number>{ return Number((await client.queryOne("SELECT COUNT(*) as count FROM audit_log WHERE project_id = ?", [projectId]))?.count ?? 0); }
    },
    retentionPolicies: {
      async create(input: { tenantId?: string; entityType: string; retentionDays: number }): Promise<RetentionPolicy>{
        const id = nanoid(); const timestamp = now();
        await client.exec("INSERT INTO retention_policies (id, tenant_id, entity_type, retention_days, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)", [id, input.tenantId ?? null, input.entityType, input.retentionDays, timestamp]);
        return { id, tenantId: input.tenantId ?? null, entityType: input.entityType, retentionDays: input.retentionDays, isActive: true, createdAt: timestamp };
      },
      async list(): Promise<RetentionPolicy[]>{ return (await client.query("SELECT * FROM retention_policies ORDER BY created_at DESC", [])).map(row => ({ id: String(row.id), tenantId: row.tenant_id ? String(row.tenant_id) : null, entityType: String(row.entity_type), retentionDays: Number(row.retention_days), isActive: Boolean(row.is_active), createdAt: String(row.created_at) })); }
    },
    propertyDefaults: {
      async createActiveProfile(input: {
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
      }): Promise<{ profile: PropertyDefaultProfileRecord; values: PropertyDefaultValueRecord[] }> {
        return client.transaction(async (tx) => {
          const timestamp = now();
          await tx.exec("UPDATE property_default_profiles SET is_active = 0, updated_at = ? WHERE project_id = ? AND is_active = 1", [timestamp, input.projectId]);

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

          await tx.exec(`
            INSERT INTO property_default_profiles (
              id, project_id, name, source_file_name, source_xml_hash, is_active, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
          `, [profile.id,
            profile.projectId,
            profile.name,
            profile.sourceFileName,
            profile.sourceXmlHash,
            profile.createdBy,
            profile.createdAt,
            profile.updatedAt]);

          const values: PropertyDefaultValueRecord[] = [];
          for (const value of input.values) {
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
            await tx.exec(`
              INSERT INTO property_default_values (
                id, profile_id, dimension_type, target_level, property_name, xml_name, default_value, enabled,
                confidence, sample_count, non_blank_count, distinct_count, source_dimension_names_json, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              record.id, record.profileId, record.dimensionType, record.targetLevel, record.propertyName,
              record.xmlName, record.defaultValue, record.enabled ? 1 : 0, record.confidence, record.sampleCount,
              record.nonBlankCount, record.distinctCount, JSON.stringify(record.sourceDimensionNames), record.updatedAt
            ]);
            values.push(record);
          }

          return { profile, values };
        });
      },
      async getActiveProfile(projectId: string): Promise<PropertyDefaultProfileRecord | null>{
        const row = (await client.queryOne(
          "SELECT * FROM property_default_profiles WHERE project_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1"
        , [projectId]));
        return row ? mapPropertyDefaultProfile(row) : null;
      },
      async listValues(projectId: string, dimensionType?: string): Promise<PropertyDefaultValueRecord[]>{
        const profile = await this.getActiveProfile(projectId);
        if (!profile) return [];
        if (dimensionType) {
          return (await client.query(
            "SELECT * FROM property_default_values WHERE profile_id = ? AND dimension_type = ? ORDER BY target_level, property_name"
          , [profile.id, dimensionType])).map(mapPropertyDefaultValue);
        }
        return (await client.query(
          "SELECT * FROM property_default_values WHERE profile_id = ? ORDER BY dimension_type, target_level, property_name"
        , [profile.id])).map(mapPropertyDefaultValue);
      },
      async getValueById(defaultId: string): Promise<PropertyDefaultValueRecord | null>{
        const row = (await client.queryOne("SELECT * FROM property_default_values WHERE id = ?", [defaultId]));
        return row ? mapPropertyDefaultValue(row) : null;
      },
      async updateValue(
        defaultId: string,
        input: { defaultValue?: string; enabled?: boolean }
      ): Promise<PropertyDefaultValueRecord | null>{
        const existing = await this.getValueById(defaultId);
        if (!existing) return null;
        const updatedAt = now();
        const defaultValue = input.defaultValue !== undefined ? input.defaultValue : existing.defaultValue;
        const enabled = input.enabled !== undefined ? input.enabled : existing.enabled;
        await client.exec(`
          UPDATE property_default_values
          SET default_value = ?, enabled = ?, updated_at = ?
          WHERE id = ?
        `, [defaultValue, enabled ? 1 : 0, updatedAt, defaultId]);
        await client.exec("UPDATE property_default_profiles SET updated_at = ? WHERE id = ?", [updatedAt, existing.profileId]);
        return { ...existing, defaultValue, enabled, updatedAt };
      },
      async listCatalog(dimensionType?: string): Promise<PropertyDefaultCatalogRecord[]>{
        if (dimensionType) {
          return (await client.query(
            "SELECT * FROM property_default_catalog WHERE dimension_type = ? ORDER BY target_level, property_name"
          , [dimensionType])).map(mapPropertyDefaultCatalog);
        }
        return (await client.query(
          "SELECT * FROM property_default_catalog ORDER BY dimension_type, target_level, property_name"
        , [])).map(mapPropertyDefaultCatalog);
      },
      async getCatalogById(catalogId: string): Promise<PropertyDefaultCatalogRecord | null>{
        const row = (await client.queryOne("SELECT * FROM property_default_catalog WHERE id = ?", [catalogId]));
        return row ? mapPropertyDefaultCatalog(row) : null;
      },
      async updateCatalog(
        catalogId: string,
        input: { defaultValue?: string; enabled?: boolean }
      ): Promise<PropertyDefaultCatalogRecord | null>{
        const existing = await this.getCatalogById(catalogId);
        if (!existing) return null;
        const updatedAt = now();
        const defaultValue = input.defaultValue !== undefined ? input.defaultValue : existing.defaultValue;
        const enabled = input.enabled !== undefined ? input.enabled : existing.enabled;
        await client.exec(`
          UPDATE property_default_catalog
          SET default_value = ?, enabled = ?, updated_at = ?
          WHERE id = ?
        `, [defaultValue, enabled ? 1 : 0, updatedAt, catalogId]);
        return { ...existing, defaultValue, enabled, updatedAt };
      },
      async listDisplayRows(_projectId: string, dimensionType?: string): Promise<PropertyDefaultDisplayRow[]> {
        return (await this.listCatalog(dimensionType)).map(toPropertyDefaultDisplayRow);
      },
      async listOverrides(projectId: string, dimensionType?: string): Promise<PropertyDefaultOverrideRecord[]>{
        if (dimensionType) {
          return (await client.query(
            "SELECT * FROM property_default_overrides WHERE project_id = ? AND dimension_type = ? ORDER BY target_level, property_name"
          , [projectId, dimensionType])).map(mapPropertyDefaultOverride);
        }
        return (await client.query(
          "SELECT * FROM property_default_overrides WHERE project_id = ? ORDER BY dimension_type, target_level, property_name"
        , [projectId])).map(mapPropertyDefaultOverride);
      },
      async getOverrideById(overrideId: string): Promise<PropertyDefaultOverrideRecord | null>{
        const row = (await client.queryOne("SELECT * FROM property_default_overrides WHERE id = ?", [overrideId]));
        return row ? mapPropertyDefaultOverride(row) : null;
      },
      async upsertOverride(input: {
        projectId: string;
        dimensionType: string;
        targetLevel: "dimension" | "member" | "relationship";
        propertyName: string;
        xmlName: string;
        defaultValue: string;
        enabled: boolean;
      }): Promise<PropertyDefaultOverrideRecord>{
        const updatedAt = now();
        const existing = (await client.queryOne(`
          SELECT id FROM property_default_overrides
          WHERE project_id = ? AND dimension_type = ? AND target_level = ? AND property_name = ?
        `, [input.projectId, input.dimensionType, input.targetLevel, input.propertyName])) as { id: string } | undefined;

        if (existing) {
          await client.exec(`
            UPDATE property_default_overrides
            SET default_value = ?, enabled = ?, xml_name = ?, updated_at = ?
            WHERE id = ?
          `, [input.defaultValue, input.enabled ? 1 : 0, input.xmlName, updatedAt, existing.id]);
          const override = await this.getOverrideById(existing.id);
          if (!override) throw new Error("Failed to upsert property default override.");
          return override;
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
        await client.exec(`
          INSERT INTO property_default_overrides (
            id, project_id, dimension_type, target_level, property_name, xml_name, default_value, enabled, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [record.id,
          record.projectId,
          record.dimensionType,
          record.targetLevel,
          record.propertyName,
          record.xmlName,
          record.defaultValue,
          record.enabled ? 1 : 0,
          record.updatedAt]);
        return record;
      },
      async getEffectiveDefaultsForExport(_projectId: string): Promise<PropertyDefaultResolutionEntry[]>{
        return toPropertyDefaultResolutionEntries(await this.listCatalog());
      }
    },
    projectMembers: {
      async add(input: { projectId: string; userId: string; role: string; grantedBy: string }): Promise<{ id: string; projectId: string; userId: string; role: string; grantedBy: string; grantedAt: string }> {
        const id = nanoid(); const timestamp = now();
        await client.exec(
          sqliteOrUpsert(client.dialect, "project_members", ["id", "project_id", "user_id", "role", "granted_by", "granted_at"], ["project_id", "user_id"], ["id", "role", "granted_by", "granted_at"]),
          [id, input.projectId, input.userId, input.role, input.grantedBy, timestamp]
        );
        return { id, projectId: input.projectId, userId: input.userId, role: input.role, grantedBy: input.grantedBy, grantedAt: timestamp };
      },
      async remove(projectId: string, userId: string): Promise<void>{ await client.exec("DELETE FROM project_members WHERE project_id = ? AND user_id = ?", [projectId, userId]); },
      async listByProject(projectId: string): Promise<Array<{ id: string; projectId: string; userId: string; role: string; grantedBy: string; grantedAt: string }>> {
        return (await client.query("SELECT * FROM project_members WHERE project_id = ? ORDER BY granted_at DESC", [projectId])).map(row => ({
          id: String(row.id), projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), grantedBy: String(row.granted_by), grantedAt: String(row.granted_at)
        }));
      },
      async getUserRole(projectId: string, userId: string): Promise<string | null>{
        const row = (await client.queryOne("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?", [projectId, userId])) as Record<string, unknown> | undefined;
        return row ? String(row.role) : null;
      },
      async listByUser(userId: string): Promise<Array<{ id: string; projectId: string; userId: string; role: string; grantedBy: string; grantedAt: string }>> {
        return (await client.query("SELECT * FROM project_members WHERE user_id = ? ORDER BY granted_at DESC", [userId])).map(row => ({
          id: String(row.id), projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), grantedBy: String(row.granted_by), grantedAt: String(row.granted_at)
        }));
      }
    }
  };
}

export function createRepositories(dbOrClient: AppDatabase | DbClient): Repositories {
  return buildRepositories(dbOrClient);
}

export type Repositories = ReturnType<typeof buildRepositories>;

const BULK_INSERT_BATCH_SIZE = 500;

const MEMBER_INSERT_COLUMNS = [
  "id", "dimension_id", "member_key", "description", "properties_json", "row_order",
  "source_row_number", "is_active", "created_at", "updated_at"
].join(", ");

const RELATIONSHIP_INSERT_COLUMNS = [
  "id", "dimension_id", "parent_key", "child_key", "aggregation_weight", "percent_consol",
  "percent_ownership", "ownership_type", "properties_json", "operation", "operation_source",
  "operation_notes", "row_order", "source_row_number", "created_at", "updated_at"
].join(", ");

function memberInsertParams(record: DimensionMemberRecord, dialect: DbClient["dialect"]): unknown[] {
  return [
    record.id,
    record.dimensionId,
    record.memberKey,
    record.description,
    JSON.stringify(record.properties),
    record.rowOrder,
    record.sourceRowNumber,
    booleanValue(dialect, record.isActive),
    record.createdAt,
    record.updatedAt
  ];
}

function relationshipInsertParams(record: DimensionRelationshipRecord): unknown[] {
  return [
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
  ];
}

async function bulkInsertBatched(
  tx: DbClient,
  table: string,
  columns: string,
  records: unknown[][],
  valuesPerRow: number
): Promise<void> {
  const rowPlaceholder = `(${Array(valuesPerRow).fill("?").join(", ")})`;
  for (let i = 0; i < records.length; i += BULK_INSERT_BATCH_SIZE) {
    const chunk = records.slice(i, i + BULK_INSERT_BATCH_SIZE);
    const placeholders = chunk.map(() => rowPlaceholder).join(", ");
    await tx.exec(
      `INSERT INTO ${table} (${columns}) VALUES ${placeholders}`,
      chunk.flat()
    );
  }
}

async function bulkInsertMembers(client: DbClient, records: DimensionMemberRecord[]): Promise<void> {
  if (records.length === 0) return;
  const rowPlaceholder = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await client.transaction(async (tx) => {
    if (tx.dialect === "postgres") {
      await bulkInsertBatched(
        tx,
        "dimension_members",
        MEMBER_INSERT_COLUMNS,
        records.map((record) => memberInsertParams(record, tx.dialect)),
        10
      );
      return;
    }
    const sql = `INSERT INTO dimension_members (${MEMBER_INSERT_COLUMNS}) VALUES ${rowPlaceholder}`;
    for (const record of records) {
      await tx.exec(sql, memberInsertParams(record, tx.dialect));
    }
  });
}

async function bulkInsertRelationships(client: DbClient, records: DimensionRelationshipRecord[]): Promise<void> {
  if (records.length === 0) return;
  const rowPlaceholder = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await client.transaction(async (tx) => {
    if (tx.dialect === "postgres") {
      await bulkInsertBatched(
        tx,
        "dimension_relationships",
        RELATIONSHIP_INSERT_COLUMNS,
        records.map((record) => relationshipInsertParams(record)),
        16
      );
      return;
    }
    const sql = `INSERT INTO dimension_relationships (${RELATIONSHIP_INSERT_COLUMNS}) VALUES ${rowPlaceholder}`;
    for (const record of records) {
      await tx.exec(sql, relationshipInsertParams(record));
    }
  });
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
    updatedAt: String(row.updated_at),
    versionNumber: row.version_number !== undefined && row.version_number !== null ? Number(row.version_number) : 1,
    versionLabel: String(row.version_label || "v1"),
    seededAt: String(row.seeded_at || row.created_at)
  };
}

function mapProjectVersion(row: Record<string, unknown>): ProjectVersionRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    versionNumber: Number(row.version_number ?? 1),
    versionLabel: String(row.version_label ?? 'v1'),
    sourceFileName: String(row.source_file_name ?? ''),
    seededAt: String(row.seeded_at ?? row.created_at ?? ''),
    createdBy: String(row.created_by ?? 'local-admin'),
    summary: parseJson(String(row.summary_json ?? '{}'), {}),
    snapshot: parseJson(String(row.snapshot_json ?? '{}'), {})
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
    isActive: normalizeBoolean(row.is_active),
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

async function createProjectSnapshotRow(
  client: DbClient,
  input: { projectId: string; name: string; description: string; snapshot: ProjectSnapshotState; createdBy: string }
): Promise<string> {
  const id = nanoid();
  await client.exec(`
    INSERT INTO project_snapshots (id, project_id, name, description, snapshot_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, input.projectId, input.name, input.description, JSON.stringify(input.snapshot), input.createdBy, now()]);
  return id;
}

async function buildProjectSnapshotState(client: DbClient, projectId: string): Promise<ProjectSnapshotState> {
  const projectRow = (await client.queryOne("SELECT * FROM projects WHERE id = ?", [projectId]));
  if (!projectRow) throw new Error("Project not found.");
  return {
    project: mapProject(projectRow),
    dimensions: sortDimensionsByType(
      (await client.query("SELECT * FROM dimensions WHERE project_id = ?", [projectId])).map(mapDimension)
    ),
    members: (await client.query(`
      SELECT m.* FROM dimension_members m
      JOIN dimensions d ON d.id = m.dimension_id
      WHERE d.project_id = ? AND m.is_active = 1
      ORDER BY d.sort_order, m.row_order
    `, [projectId])).map(mapMember),
    relationships: (await client.query(`
      SELECT r.* FROM dimension_relationships r
      JOIN dimensions d ON d.id = r.dimension_id
      WHERE d.project_id = ?
      ORDER BY d.sort_order, r.row_order
    `, [projectId])).map(mapRelationship),
    varyingPropertyValues: (await client.query(`
      SELECT * FROM varying_property_values
      WHERE project_id = ?
      ORDER BY dimension_id, target_type, target_id, property_name, cube_type, scenario_type, time_member, created_at, id
    `, [projectId])).map(mapVaryingPropertyValue),
    validationIssues: (await client.query("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY severity, row_number", [projectId])).map(mapIssue)
  };
}

async function deleteProjectMetadata(client: DbClient, projectId: string): Promise<void> {
  await client.exec("DELETE FROM validation_issues WHERE project_id = ?", [projectId]);
  await client.exec("DELETE FROM varying_property_values WHERE project_id = ?", [projectId]);
  await client.exec("DELETE FROM dimensions WHERE project_id = ?", [projectId]);
}

async function insertSnapshotStateIntoProject(
  client: DbClient,
  projectId: string,
  snapshot: ProjectSnapshotState,
  options: { preserveIds: boolean; restoreValidationIssues: boolean }
): Promise<Omit<SnapshotRestoreSummary, "mode" | "projectId" | "snapshotId" | "safetySnapshotId">> {
  const timestamp = now();
  const dimensionIdMap = new Map<string, string>();
  const memberIdMap = new Map<string, string>();
  const relationshipIdMap = new Map<string, string>();

  for (const dimension of snapshot.dimensions) {
    const id = options.preserveIds ? dimension.id : nanoid();
    dimensionIdMap.set(dimension.id, id);
    await client.exec(`
      INSERT INTO dimensions (
        id, project_id, sheet_name, dimension_type, dimension_name, description, access_group,
        maintenance_group, inherited_dimension, sort_order, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, projectId, dimension.sheetName, dimension.dimensionType, dimension.dimensionName,
      dimension.description, dimension.accessGroup, dimension.maintenanceGroup,
      dimension.inheritedDimension, dimension.sortOrder, JSON.stringify(dimension.metadata ?? {}),
      options.preserveIds ? dimension.createdAt : timestamp, timestamp
    ]);
  }

  const membersToInsert: DimensionMemberRecord[] = [];
  for (const member of snapshot.members) {
    const dimensionId = dimensionIdMap.get(member.dimensionId);
    if (!dimensionId) continue;
    const id = options.preserveIds ? member.id : nanoid();
    memberIdMap.set(member.id, id);
    membersToInsert.push({
      ...member,
      id,
      dimensionId,
      createdAt: options.preserveIds ? member.createdAt : timestamp,
      updatedAt: timestamp
    });
  }
  await bulkInsertMembers(client, membersToInsert);

  const relationshipsToInsert: DimensionRelationshipRecord[] = [];
  for (const relationship of snapshot.relationships) {
    const dimensionId = dimensionIdMap.get(relationship.dimensionId);
    if (!dimensionId) continue;
    const id = options.preserveIds ? relationship.id : nanoid();
    relationshipIdMap.set(relationship.id, id);
    relationshipsToInsert.push({
      ...relationship,
      id,
      dimensionId,
      createdAt: options.preserveIds ? relationship.createdAt : timestamp,
      updatedAt: timestamp
    });
  }
  await bulkInsertRelationships(client, relationshipsToInsert);

  const varyingValues = snapshot.varyingPropertyValues ?? [];
  let varyingPropertiesRestored = 0;
  for (const value of varyingValues) {
    const dimensionId = dimensionIdMap.get(value.dimensionId);
    const targetId = remapSnapshotTargetId(value.targetType, value.targetId, dimensionIdMap, memberIdMap, relationshipIdMap);
    if (!dimensionId || !targetId) continue;
    await client.exec(`
      INSERT INTO varying_property_values (
        id, project_id, dimension_id, target_type, target_id, property_name, value,
        cube_type, scenario_type, time_member, is_default, source, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
      booleanValue(client.dialect, value.isDefault),
      value.source,
      JSON.stringify(value.metadata ?? {}),
      options.preserveIds ? value.createdAt : timestamp,
      timestamp
    ]);
    varyingPropertiesRestored += 1;
  }

  if (options.restoreValidationIssues) {
    await insertSnapshotValidationIssues(client, projectId, snapshot.validationIssues ?? [], timestamp);
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

async function insertSnapshotValidationIssues(
  client: DbClient,
  projectId: string,
  issues: ValidationIssue[],
  timestamp: string
): Promise<void> {
  for (const issue of issues) {
    await client.exec(`
      INSERT INTO validation_issues (
        id, project_id, dimension_id, entity_type, entity_id, severity, code,
        message, field_name, row_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
    ]);
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
