import { Router } from "express";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { finished } from "node:stream/promises";
import { join } from "node:path";
import { assertProjectExportWithinMemberLimit } from "../../shared/exportLimits";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  renderChangeSetManifest,
  renderDiffReportCsv,
  renderReleaseNotesMarkdown,
  renderRollbackNotesMarkdown,
  renderValidationReportCsv,
  selectXmlExportModeForChangeSet,
  summarizeValidationIssues
} from "../../shared/releasePackage";
import type { ChangeSetDetail, ChangeSetStatus, ReleasePackageMode } from "../../shared/types";
import { writeProjectXmlToWritable } from "../../shared/xmlExport";
import type { Repositories } from "../db/repositories";
import { runProjectValidation } from "../helpers/runValidation";
import { sendExportLimitError } from "../exportGuards";

type RouterDeps = { repos: Repositories; config: AppConfig; getAI?: unknown };

export function createChangeSetsRouter({ repos, config }: RouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    res.json(repos.changeSets.listByProject(project.id));
  });

  router.post("/", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const body = req.body ?? {};
    const requestedDiffRunId = String(body.diffRunId ?? "").trim();
    const diffRun = requestedDiffRunId
      ? repos.diffRuns.get(project.id, requestedDiffRunId)
      : repos.diffRuns.getLatest(project.id);
    if (!diffRun) return res.status(400).json({ error: "diffRunId is required when no diff run exists" });
    const selectedItemIds = Array.isArray(body.selectedItemIds)
      ? new Set(body.selectedItemIds.map((value: unknown) => String(value)))
      : null;
    const diffItems = repos.diffRuns.listItems(diffRun.id)
      .filter((item) => !selectedItemIds || selectedItemIds.has(item.id));
    const changeSet = repos.changeSets.create({
      projectId: project.id,
      baselineId: diffRun.baselineId,
      diffRunId: diffRun.id,
      name: String(body.name ?? "").trim() || `Change set ${new Date().toISOString()}`,
      description: String(body.description ?? ""),
      targetEnvironment: String(body.targetEnvironment ?? ""),
      items: diffItems,
      createdBy: "local-admin"
    });
    repos.audit.record({ projectId: project.id, action: "changeSet.create", entityType: "changeSet", entityId: changeSet.id, after: changeSet });
    res.status(201).json(repos.changeSets.getDetail(project.id, changeSet.id));
  });

  router.get("/:changeSetId", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, (req.params as Record<string, string>).changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    res.json(detail);
  });

  router.patch("/:changeSetId", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const status = parseChangeSetStatus(req.body?.status);
    const updated = repos.changeSets.update(project.id, (req.params as Record<string, string>).changeSetId, {
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      description: typeof req.body?.description === "string" ? req.body.description : undefined,
      targetEnvironment: typeof req.body?.targetEnvironment === "string" ? req.body.targetEnvironment : undefined,
      status
    });
    if (!updated) return res.status(404).json({ error: "change set not found" });
    repos.audit.record({ projectId: project.id, action: "changeSet.update", entityType: "changeSet", entityId: updated.id, after: updated });
    res.json(repos.changeSets.getDetail(project.id, updated.id));
  });

  router.post("/:changeSetId/validate", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, (req.params as Record<string, string>).changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    const issues = runProjectValidation(repos, config, project.id);
    const validationSummary = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
    const updated = validationSummary.blockingIssues === 0
      ? repos.changeSets.update(project.id, detail.changeSet.id, { status: "validated" })
      : detail.changeSet;
    repos.changeSets.recordApproval(project.id, detail.changeSet.id, {
      action: "comment",
      comment: validationSummary.blockingIssues === 0 ? "Validation completed with no blocking issues." : `Validation completed with ${validationSummary.blockingIssues} blocking issue(s).`,
      createdBy: "local-admin"
    });
    repos.audit.record({ projectId: project.id, action: "changeSet.validate", entityType: "changeSet", entityId: detail.changeSet.id, after: validationSummary });
    res.json({
      ...repos.changeSets.getDetail(project.id, detail.changeSet.id),
      changeSet: updated ?? detail.changeSet,
      validationSummary,
      issues
    });
  });

  router.post("/:changeSetId/approve", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, (req.params as Record<string, string>).changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    const issues = runProjectValidation(repos, config, project.id);
    const validationSummary = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
    const bypassValidation = Boolean(req.body?.bypassValidation);
    if (validationSummary.blockingIssues > 0 && !bypassValidation) {
      return res.status(409).json({ error: "blocking validation issues prevent approval", validationSummary, issues });
    }
    const comment = String(req.body?.comment ?? "");
    const approval = repos.changeSets.recordApproval(project.id, detail.changeSet.id, {
      action: "approve",
      comment: bypassValidation ? `[Validation bypass] ${comment}`.trim() : comment,
      createdBy: "local-admin"
    });
    const updated = repos.changeSets.update(project.id, detail.changeSet.id, { status: "approved" });
    repos.audit.record({ projectId: project.id, action: "changeSet.approve", entityType: "changeSet", entityId: detail.changeSet.id, after: { approval, validationSummary, bypassValidation } });
    res.json({ ...repos.changeSets.getDetail(project.id, detail.changeSet.id), changeSet: updated ?? detail.changeSet, validationSummary, issues });
  });

  router.post("/:changeSetId/reject", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, (req.params as Record<string, string>).changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    const approval = repos.changeSets.recordApproval(project.id, detail.changeSet.id, {
      action: "reject",
      comment: String(req.body?.comment ?? ""),
      createdBy: "local-admin"
    });
    const updated = repos.changeSets.update(project.id, detail.changeSet.id, { status: "rejected" });
    repos.audit.record({ projectId: project.id, action: "changeSet.reject", entityType: "changeSet", entityId: detail.changeSet.id, after: approval });
    res.json({ ...repos.changeSets.getDetail(project.id, detail.changeSet.id), changeSet: updated ?? detail.changeSet });
  });

  router.post("/:changeSetId/package", async (req, res, next) => {
    try {
      const project = repos.projects.get((req.params as Record<string, string>).projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const detail = repos.changeSets.getDetail(project.id, (req.params as Record<string, string>).changeSetId);
      if (!detail) return res.status(404).json({ error: "change set not found" });
      if (detail.changeSet.status !== "approved" && detail.changeSet.status !== "exported") {
        return res.status(409).json({ error: "change set must be approved before packaging" });
      }

      assertProjectExportWithinMemberLimit(repos, project.id, "change-set-xml", config);

      const issues = runProjectValidation(repos, config, project.id);
      const validationSummary = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
      const mode = selectXmlExportModeForChangeSet(detail, parsePackageMode(req.body?.mode));
      const packageName = safeFileSegment(String(req.body?.packageName ?? "").trim() || `${detail.changeSet.name}-${new Date().toISOString()}`);
      const packagePath = join(config.paths.exportsDirectory, "release-packages", `${packageName}-${detail.changeSet.id.slice(0, 8)}`);
      const packagedDetail: ChangeSetDetail = {
        ...detail,
        changeSet: { ...detail.changeSet, status: "exported" }
      };
      const files = ["01-summary.md", "02-change-set.json", "03-diff-report.csv", "04-validation-report.csv", "05-metadata.xml", "06-rollback-notes.md", "manifest.json"];
      const manifest = renderChangeSetManifest(packagedDetail, {
        packageName,
        packagePath,
        mode,
        files,
        validationSummary
      });
      mkdirSync(packagePath, { recursive: true });
      writeFileSync(join(packagePath, "01-summary.md"), renderReleaseNotesMarkdown(packagedDetail));
      writeFileSync(join(packagePath, "02-change-set.json"), JSON.stringify(packagedDetail, null, 2));
      writeFileSync(join(packagePath, "03-diff-report.csv"), renderDiffReportCsv(packagedDetail.items));
      writeFileSync(join(packagePath, "04-validation-report.csv"), renderValidationReportCsv(issues));
      const snapshot = readSnapshot(repos, project.id);
      const xmlOptions = {
        oneStreamVersionFallback: config.application.oneStreamVersionFallback,
        prettyPrint: config.export.xml.prettyPrint,
        skipBlankMemberRows: config.export.xml.skipBlankMemberRows,
        skipFormulaErrors: config.export.xml.skipFormulaErrors,
        includeDimensionSourceAttributes: config.export.xml.includeDimensionSourceAttributes
      };
      const xmlStream = createWriteStream(join(packagePath, "05-metadata.xml"));
      writeProjectXmlToWritable(xmlStream, snapshot, xmlOptions);
      xmlStream.end();
      await finished(xmlStream);
      writeFileSync(join(packagePath, "06-rollback-notes.md"), renderRollbackNotesMarkdown(packagedDetail));
      writeFileSync(join(packagePath, "manifest.json"), JSON.stringify(manifest, null, 2));
      const packageRecord = repos.changeSets.createReleasePackage({
        changeSetId: detail.changeSet.id,
        packageName,
        packagePath,
        manifest,
        createdBy: "local-admin"
      });
      const updated = repos.changeSets.update(project.id, detail.changeSet.id, { status: "exported" });
      repos.audit.record({ projectId: project.id, action: "changeSet.package", entityType: "changeSet", entityId: detail.changeSet.id, after: { package: packageRecord, manifest } });
      res.status(201).json({
        ...repos.changeSets.getDetail(project.id, detail.changeSet.id),
        changeSet: updated ?? packagedDetail.changeSet,
        package: packageRecord,
        manifest,
        validationSummary
      });
    } catch (error) {
      if (sendExportLimitError(res, error)) return;
      next(error);
    }
  });

  router.get("/:changeSetId/package", (req, res) => {
    const project = repos.projects.get((req.params as Record<string, string>).projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const detail = repos.changeSets.getDetail(project.id, (req.params as Record<string, string>).changeSetId);
    if (!detail) return res.status(404).json({ error: "change set not found" });
    if (!detail.latestPackage) return res.status(404).json({ error: "release package not found" });
    res.json({ changeSet: detail.changeSet, package: detail.latestPackage, manifest: detail.latestPackage.manifest });
  });

  return router;
}

function readSnapshot(repos: Repositories, projectId: string) {
  const project = repos.projects.get(projectId);
  if (!project) throw Object.assign(new Error("project not found"), { status: 404 });
  return {
    project,
    dimensions: repos.dimensions.listByProject(project.id),
    members: repos.members.listByProject(project.id),
    relationships: repos.relationships.listByProject(project.id),
    varyingPropertyValues: repos.varyingProperties.listVaryingPropertyValues(project.id)
  };
}

function parseChangeSetStatus(value: unknown): ChangeSetStatus | undefined {
  if (value === "draft" || value === "validated" || value === "approved" || value === "exported" || value === "rejected") return value;
  return undefined;
}

function parsePackageMode(value: unknown): ReleasePackageMode {
  if (value === "full" || value === "additive" || value === "propertyUpdate" || value === "relationshipDelete" || value === "moveCopy" || value === "breakBuild") return value;
  return "full";
}

function safeFileSegment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "release-package";
}
