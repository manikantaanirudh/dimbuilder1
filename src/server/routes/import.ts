import { Router } from "express";
import multer from "multer";
import { createReadStream, mkdirSync } from "node:fs";
import type { AppConfig } from "../../shared/appConfigTypes";
import { parseOneStreamXmlFromStream } from "../../shared/xmlImport";
import { parseWorkbook } from "../../shared/workbookParser";
import { validateDimension } from "../../shared/validationEngine";
import type { Repositories } from "../db/repositories";
import { findDefaultMetadataReferencePath, parseMetadataReference } from "../metadataReference";

export function createImportRouter(repos: Repositories, config: AppConfig): Router {
  mkdirSync(config.paths.uploadsDirectory, { recursive: true });
  const upload = multer({ dest: config.paths.uploadsDirectory });
  const router = Router();

  router.post("/workbook", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const metadataReferencePath = config.import.metadataReference.enabled
        ? findDefaultMetadataReferencePath({
            directory: config.paths.metadataDirectory,
            defaultFile: config.paths.defaultMetadataFile
          })
        : null;
      const metadataReference = metadataReferencePath ? await parseMetadataReference(metadataReferencePath) : undefined;
      const parsed = await parseWorkbook(req.file.path, {
        projectName: req.body.projectName || req.file.originalname,
        createdBy: "local-admin",
        config,
        metadataReference
      });

      const project = repos.projects.create({
        name: parsed.project.name,
        description: parsed.project.description,
        sourceFileName: req.file.originalname,
        createdBy: "local-admin"
      });

      const dimensionIdMap = new Map<string, string>();
      for (const dimension of parsed.dimensions) {
        const saved = repos.dimensions.create({ ...dimension, projectId: project.id });
        dimensionIdMap.set(dimension.id, saved.id);
      }

      repos.members.bulkInsert(parsed.members.map((member) => ({ ...member, dimensionId: dimensionIdMap.get(member.dimensionId) ?? member.dimensionId })));
      repos.relationships.bulkInsert(parsed.relationships.map((relationship) => ({ ...relationship, dimensionId: dimensionIdMap.get(relationship.dimensionId) ?? relationship.dimensionId })));

      const dimensions = repos.dimensions.listByProject(project.id);
      const members = repos.members.listByProject(project.id);
      const relationships = repos.relationships.listByProject(project.id);
      const issues = dimensions.flatMap((dimension) =>
        validateDimension({
          project,
          dimension,
          members: members.filter((member) => member.dimensionId === dimension.id),
          relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
          severities: config.validation
        })
      );
      repos.issues.replaceForProject(project.id, issues);
      repos.audit.record({ projectId: project.id, action: "project.import", entityType: "project", entityId: project.id, after: parsed.importSummary });

      res.json({
        project,
        importSummary: {
          ...parsed.importSummary,
          validationIssues: issues.length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/xml", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const stream = createReadStream(req.file.path);
      const parsed = await parseOneStreamXmlFromStream(stream, {
        projectName: req.body.projectName || req.file.originalname.replace(/\.xml$/i, ""),
        sourceFileName: req.file.originalname,
        createdBy: "local-admin"
      });

      const project = repos.transaction(() => {
        const savedProject = repos.projects.create({
          name: parsed.project.name,
          description: parsed.project.description,
          sourceFileName: req.file?.originalname ?? parsed.project.sourceFileName,
          createdBy: "local-admin"
        });

        const dimensionIdMap = new Map<string, string>();
        for (const dimension of parsed.dimensions) {
          const saved = repos.dimensions.create({ ...dimension, projectId: savedProject.id });
          dimensionIdMap.set(dimension.id, saved.id);
        }

        repos.members.bulkInsert(parsed.members.map((member) => ({
          ...member,
          dimensionId: dimensionIdMap.get(member.dimensionId) ?? member.dimensionId
        })));
        repos.relationships.bulkInsert(parsed.relationships.map((relationship) => ({
          ...relationship,
          dimensionId: dimensionIdMap.get(relationship.dimensionId) ?? relationship.dimensionId
        })));

        return savedProject;
      });

      const dimensions = repos.dimensions.listByProject(project.id);
      const members = repos.members.listByProject(project.id);
      const relationships = repos.relationships.listByProject(project.id);
      const issues = dimensions.flatMap((dimension) =>
        validateDimension({
          project,
          dimension,
          members: members.filter((member) => member.dimensionId === dimension.id),
          relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
          severities: config.validation
        })
      );
      repos.issues.replaceForProject(project.id, issues);
      repos.audit.record({ projectId: project.id, action: "project.importXml", entityType: "project", entityId: project.id, after: parsed.importSummary });

      res.json({
        project,
        importSummary: {
          ...parsed.importSummary,
          validationIssues: issues.length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
