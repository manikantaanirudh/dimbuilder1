import { Router } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  applyMappingsToDimension,
  buildIssuePack,
  buildPreview,
  detectDecisions,
  hasUnresolvedDecisions,
  renderIssuePackMarkdown,
  summarizeSource,
  suggestMappings,
  type MigrationMapping,
  type MigrationSession,
  type MigrationSourceType
} from "../../shared/migrationCockpit";
import {
  parseGenericCSV,
  parseHyperionEPMA,
  parseHyperionHFM,
  parseSAPBPC,
  type MigrationParseResult
} from "../migration/migrationParsers";
import type { DimensionMemberRecord, DimensionRelationshipRecord, DimensionType } from "../../shared/types";
import type { Repositories } from "../db/repositories";

const VALID_SOURCES: MigrationSourceType[] = ["hfm", "epma", "sapbpc", "csv"];

/**
 * Migration Cockpit (TASK-17). A preview-first guided workflow over the existing migration parsers:
 * parse -> map -> preview -> validate -> commit -> issue pack. Sessions are persisted as files; the
 * raw source content is stored so preview and commit are reproducible.
 */
export function createMigrationRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  const dir = (projectId: string) => join(config.paths.exportsDirectory, "migration", projectId);
  const sessionPath = (projectId: string, sessionId: string) => join(dir(projectId), `${sessionId}.json`);
  const contentPath = (projectId: string, sessionId: string) => join(dir(projectId), `${sessionId}.source.txt`);

  function readSession(projectId: string, sessionId: string): MigrationSession | null {
    const path = sessionPath(projectId, sessionId);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, "utf8")) as MigrationSession; } catch { return null; }
  }
  function writeSession(session: MigrationSession): void {
    mkdirSync(dir(session.projectId), { recursive: true });
    writeFileSync(sessionPath(session.projectId, session.id), JSON.stringify(session, null, 2));
  }
  function reparse(projectId: string, session: MigrationSession): MigrationParseResult {
    const content = readFileSync(contentPath(projectId, session.id), "utf8");
    return parseSource(session.sourceType, content);
  }

  router.post("/:projectId/migration/sessions", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const sourceType = body.sourceType as MigrationSourceType;
    if (!VALID_SOURCES.includes(sourceType)) return res.status(400).json({ error: "sourceType must be hfm, epma, sapbpc, or csv" });
    const content = typeof body.content === "string" ? body.content : "";
    if (!content) return res.status(400).json({ error: "content is required" });

    const parsed = parseSource(sourceType, content);
    const fileName = typeof body.fileName === "string" ? body.fileName : "migration-source";
    const summary = summarizeSource(sourceType, fileName, parsed);
    const mappings = suggestMappings(summary);
    const decisions = detectDecisions(summary, mappings);

    const session: MigrationSession = {
      id: `migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: project.id,
      sourceType,
      fileName,
      createdAt: new Date().toISOString(),
      status: "parsed",
      summary,
      mappings,
      decisions
    };
    mkdirSync(dir(project.id), { recursive: true });
    writeFileSync(contentPath(project.id, session.id), content);
    writeSession(session);
    repos.audit.record({ projectId: project.id, action: "migration.session.create", entityType: "project", entityId: project.id, after: { sessionId: session.id, sourceType } });
    res.status(201).json({ session });
  });

  router.get("/:projectId/migration/sessions/:sessionId", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const session = readSession(project.id, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "session not found" });
    res.json({ session });
  });

  router.post("/:projectId/migration/sessions/:sessionId/mappings", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const session = readSession(project.id, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "session not found" });

    const mappings = Array.isArray(req.body?.mappings) ? (req.body.mappings as MigrationMapping[]) : session.mappings;
    const resolutions = (req.body?.decisionResolutions ?? {}) as Record<string, string>;
    session.mappings = mappings;
    session.decisions = detectDecisions(session.summary, mappings).map((d) => {
      const resolution = resolutions[d.id];
      return resolution ? { ...d, resolved: true, resolution } : d;
    });
    session.status = "mapped";
    writeSession(session);
    res.json({ session });
  });

  router.post("/:projectId/migration/sessions/:sessionId/preview", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const session = readSession(project.id, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "session not found" });
    const parsed = reparse(project.id, session);
    const preview = buildPreview(parsed, session.mappings);
    session.status = "previewed";
    writeSession(session);
    res.json({ preview, unresolvedDecisions: session.decisions.filter((d) => !d.resolved).length });
  });

  router.post("/:projectId/migration/sessions/:sessionId/commit", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const session = readSession(project.id, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "session not found" });

    const override = req.body?.override === true;
    if (hasUnresolvedDecisions(session.decisions) && !override) {
      return res.status(409).json({ error: "unresolved decisions block commit", unresolved: session.decisions.filter((d) => !d.resolved) });
    }

    const parsed = reparse(project.id, session);
    let createdMembers = 0;
    let createdRelationships = 0;
    let createdDimensions = 0;

    for (const sourceDimension of parsed.dimensions) {
      const mapped = applyMappingsToDimension(sourceDimension, session.mappings);
      const existing = repos.dimensions.listByProject(project.id).find(
        (d) => d.dimensionName.toLowerCase() === mapped.dimensionName.toLowerCase()
      );
      const dimension = existing ?? repos.dimensions.create({
        projectId: project.id,
        sheetName: "",
        dimensionType: (mapped.dimensionType || "UD1") as DimensionType,
        dimensionName: mapped.dimensionName,
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: repos.dimensions.listByProject(project.id).length + 1,
        metadata: {}
      });
      if (!existing) createdDimensions += 1;

      const existingKeys = new Set(repos.members.listByDimension(dimension.id, { offset: 0, limit: 100000 }).map((m) => m.memberKey.toLowerCase()));
      const newMembers: DimensionMemberRecord[] = [];
      mapped.members.forEach((member, index) => {
        if (existingKeys.has(member.memberKey.toLowerCase())) return;
        newMembers.push({
          id: `mem-${dimension.id}-${Date.now()}-${index}`,
          dimensionId: dimension.id,
          memberKey: member.memberKey,
          description: member.properties.Description ?? member.description ?? "",
          properties: member.properties,
          rowOrder: index + 1,
          sourceRowNumber: index + 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        existingKeys.add(member.memberKey.toLowerCase());
      });
      if (newMembers.length > 0) { repos.members.bulkInsert(newMembers); createdMembers += newMembers.length; }

      const newRelationships: DimensionRelationshipRecord[] = mapped.relationships.map((rel, index) => ({
        id: `rel-${dimension.id}-${Date.now()}-${index}`,
        dimensionId: dimension.id,
        parentKey: rel.parentKey,
        childKey: rel.childKey,
        aggregationWeight: null,
        percentConsol: null,
        percentOwnership: null,
        ownershipType: "",
        properties: {},
        rowOrder: index + 1,
        sourceRowNumber: index + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
      if (newRelationships.length > 0) { repos.relationships.bulkInsert(newRelationships); createdRelationships += newRelationships.length; }
    }

    session.status = "committed";
    writeSession(session);
    repos.audit.record({ projectId: project.id, action: "migration.session.commit", entityType: "project", entityId: project.id, after: { sessionId: session.id, createdMembers, createdRelationships, createdDimensions } });
    res.status(201).json({ committed: { dimensions: createdDimensions, members: createdMembers, relationships: createdRelationships } });
  });

  router.get("/:projectId/migration/sessions/:sessionId/issue-pack", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const session = readSession(project.id, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "session not found" });
    const validationIssueCount = repos.issues.listByProject(project.id).length;
    const pack = buildIssuePack(session, validationIssueCount);
    if (req.query.format === "markdown") {
      res.type("text/markdown").send(renderIssuePackMarkdown(pack));
      return;
    }
    res.json({ issuePack: pack });
  });

  return router;
}

function parseSource(sourceType: MigrationSourceType, content: string): MigrationParseResult {
  switch (sourceType) {
    case "hfm": return parseHyperionHFM(content);
    case "epma": return parseHyperionEPMA(content);
    case "sapbpc": return parseSAPBPC(content);
    case "csv": return parseGenericCSV(content);
  }
}
