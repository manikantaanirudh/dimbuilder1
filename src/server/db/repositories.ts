import { nanoid } from "nanoid";
import type { AppDatabase } from "./database";
import type {
  DashboardSummary,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType,
  ProjectRecord,
  ValidationIssue
} from "../../shared/types";

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

export function createRepositories(db: AppDatabase) {
  return {
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
              percent_ownership, ownership_type, properties_json, row_order, source_row_number,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      update(id: string, input: { parentKey: string; childKey: string; properties: Record<string, unknown> }): void {
        db.prepare(`
          UPDATE dimension_relationships
          SET parent_key = ?, child_key = ?, properties_json = ?, updated_at = ?
          WHERE id = ?
        `).run(input.parentKey, input.childKey, JSON.stringify(input.properties), now(), id);
      },
      delete(id: string): void {
        db.prepare("DELETE FROM dimension_relationships WHERE id = ?").run(id);
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
      }
    }
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

function runInTransaction(db: AppDatabase, action: () => void): void {
  db.exec("BEGIN");
  try {
    action();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
    rowOrder: Number(row.row_order),
    sourceRowNumber: Number(row.source_row_number),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
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

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
