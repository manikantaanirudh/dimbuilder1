import { Router, type NextFunction, type Request, type Response } from "express";
import multer, { type MulterError } from "multer";
import { createReadStream, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  buildMetadataCsvCommitPlan,
  inspectMetadataCsvFile,
  previewMetadataCsvImport,
  type MetadataCsvFormDefaults,
  type MetadataCsvImportContext
} from "../../shared/metadataCsvImport";
import { parseMetadataCsvColumnMapping } from "../../shared/metadataCsvMapping";
import { parseOneStreamXmlFromStream } from "../../shared/xmlImport";
import { parseWorkbook } from "../../shared/workbookParser";
import { validateDimension } from "../../shared/validationEngine";
import type { Repositories } from "../db/repositories";
import { findDefaultMetadataReferencePath, parseMetadataReference } from "../metadataReference";
import { applyMetadataCsvCommitPlan } from "../metadataCsvCommit";

const ALLOWED_EXTENSIONS = /\.(xlsx|xls|xml|csv|txt|tsv)$/i;

function resolveUploadMaxBytes(config: AppConfig): number {
  const uploadMaxMb = config.operations?.uploadMaxMb ?? 25;
  return Math.max(1, uploadMaxMb) * 1024 * 1024;
}

function readCsvFormDefaults(body: Record<string, unknown>): MetadataCsvFormDefaults {
  return {
    projectName: typeof body.projectName === "string" ? body.projectName : undefined,
    dimensionType: typeof body.dimensionType === "string" ? body.dimensionType : undefined,
    dimensionName: typeof body.dimensionName === "string" ? body.dimensionName : undefined,
    defaultAccountType: typeof body.defaultAccountType === "string" ? body.defaultAccountType : undefined
  };
}

async function buildCsvImportContext(
  repos: Repositories,
  config: AppConfig,
  csvContent: string,
  body: Record<string, unknown>
): Promise<MetadataCsvImportContext> {
  const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined;
  const mode = projectId ? "existingProject" : "newProject";
  const formDefaults = readCsvFormDefaults(body);
  const columnMapping = parseMetadataCsvColumnMapping(body.columnMapping);
  const context: MetadataCsvImportContext = {
    csvContent,
    formDefaults,
    columnMapping,
    enabledDimensionTypes: config.dimensions.enabledTypes,
    mode
  };

  if (mode === "existingProject") {
    const project = await repos.projects.get(projectId!);
    if (!project) {
      throw new Error("Project not found.");
    }
    context.projectId = project.id;
    const [existingDimensions, existingMembers, existingRelationships] = await Promise.all([
      await repos.dimensions.listByProject(project.id),
      await repos.members.listByProject(project.id),
      await repos.relationships.listByProject(project.id)
    ]);
    context.existingDimensions = existingDimensions;
    context.existingMembers = existingMembers;
    context.existingRelationships = existingRelationships;
  }

  return context;
}

export function createImportRouter(repos: Repositories, config: AppConfig): Router {
  mkdirSync(config.paths.uploadsDirectory, { recursive: true });
  const upload = multer({
    dest: config.paths.uploadsDirectory,
    limits: { fileSize: resolveUploadMaxBytes(config) },
    fileFilter: (_req, file, cb) => {
      const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
      if (extOk) {
        cb(null, true);
      } else {
        cb(new Error("Only .xlsx, .xls, .xml, .csv, .txt, and .tsv files are allowed"));
      }
    }
  });

  function uploadSingle(fieldName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      upload.single(fieldName)(req, res, (error: unknown) => {
        if (error && typeof error === "object" && "code" in error) {
          const multerError = error as MulterError;
          if (multerError.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({ error: "Upload exceeds configured size limit." });
            return;
          }
        }
        if (error instanceof Error && error.message.includes("Only .xlsx")) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      });
    };
  }

  const router = Router();

  router.post("/csv/inspect", uploadSingle("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const csvContent = readFileSync(req.file.path, "utf8");
      const dimensionTypeRaw = typeof req.body.dimensionType === "string" ? req.body.dimensionType : "Account";
      const dimensionType = config.dimensions.enabledTypes.find(
        (type) => type.toLowerCase() === dimensionTypeRaw.toLowerCase()
      );
      if (!dimensionType) {
        return res.status(400).json({ error: `Unsupported dimension type '${dimensionTypeRaw}'.` });
      }
      const inspection = inspectMetadataCsvFile(csvContent, dimensionType);
      res.json(inspection);
    } catch (error) {
      next(error);
    } finally {
      if (req.file?.path) {
        try {
          unlinkSync(req.file.path);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  router.post("/csv/preview", uploadSingle("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const csvContent = readFileSync(req.file.path, "utf8");
      let context: MetadataCsvImportContext;
      try {
        context = await buildCsvImportContext(repos, config, csvContent, req.body as Record<string, unknown>);
      } catch (error) {
        if (error instanceof Error && error.message === "Project not found.") {
          return res.status(404).json({ error: error.message });
        }
        throw error;
      }
      const preview = previewMetadataCsvImport(context);
      res.json({ preview });
    } catch (error) {
      next(error);
    } finally {
      if (req.file?.path) {
        try {
          unlinkSync(req.file.path);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  router.post("/csv/commit", uploadSingle("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const csvContent = readFileSync(req.file.path, "utf8");
      let context: MetadataCsvImportContext;
      try {
        context = await buildCsvImportContext(repos, config, csvContent, req.body as Record<string, unknown>);
      } catch (error) {
        if (error instanceof Error && error.message === "Project not found.") {
          return res.status(404).json({ error: error.message });
        }
        throw error;
      }
      const { preview, plan } = buildMetadataCsvCommitPlan(context, req.file.originalname);
      if (!preview.ok || !plan) {
        return res.status(400).json({ error: "CSV preview has blocking errors.", preview });
      }

      const result = await applyMetadataCsvCommitPlan(repos, config, plan);
      const project = await repos.projects.get(result.projectId);
      res.json({
        project,
        preview,
        importSummary: result.importSummary
      });
    } catch (error) {
      next(error);
    } finally {
      if (req.file?.path) {
        try {
          unlinkSync(req.file.path);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  router.post("/workbook", uploadSingle("file"), async (req, res, next) => {
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

      const project = await repos.transaction(async (tx) => {
        const savedProject = await tx.projects.create({
          name: parsed.project.name,
          description: parsed.project.description,
          sourceFileName: req.file.originalname,
          createdBy: "local-admin"
        });

        const dimensionIdMap = new Map<string, string>();
        for (const dimension of parsed.dimensions) {
          const saved = await tx.dimensions.create({ ...dimension, projectId: savedProject.id });
          dimensionIdMap.set(dimension.id, saved.id);
        }

        await tx.members.bulkInsert(parsed.members.map((member) => ({
          ...member,
          dimensionId: dimensionIdMap.get(member.dimensionId) ?? member.dimensionId
        })));
        await tx.relationships.bulkInsert(parsed.relationships.map((relationship) => ({
          ...relationship,
          dimensionId: dimensionIdMap.get(relationship.dimensionId) ?? relationship.dimensionId
        })));

        return savedProject;
      });

      const [dimensions, members, relationships] = await Promise.all([
        await repos.dimensions.listByProject(project.id),
        await repos.members.listByProject(project.id),
        await repos.relationships.listByProject(project.id)
      ]);
      const issues = dimensions.flatMap((dimension) =>
        validateDimension({
          project,
          dimension,
          members: members.filter((member) => member.dimensionId === dimension.id),
          relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
          severities: config.validation
        })
      );
      await repos.issues.replaceForProject(project.id, issues);
      await repos.audit.record({ projectId: project.id, action: "project.import", entityType: "project", entityId: project.id, after: parsed.importSummary });

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

  router.post("/xml", uploadSingle("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const stream = createReadStream(req.file.path);
      const parsed = await parseOneStreamXmlFromStream(stream, {
        projectName: req.body.projectName || req.file.originalname.replace(/\.xml$/i, ""),
        sourceFileName: req.file.originalname,
        createdBy: "local-admin"
      });

      const project = await repos.transaction(async (tx) => {
        const savedProject = await tx.projects.create({
          name: parsed.project.name,
          description: parsed.project.description,
          sourceFileName: req.file?.originalname ?? parsed.project.sourceFileName,
          createdBy: "local-admin"
        });

        const dimensionIdMap = new Map<string, string>();
        for (const dimension of parsed.dimensions) {
          const saved = await tx.dimensions.create({ ...dimension, projectId: savedProject.id });
          dimensionIdMap.set(dimension.id, saved.id);
        }

        await tx.members.bulkInsert(parsed.members.map((member) => ({
          ...member,
          dimensionId: dimensionIdMap.get(member.dimensionId) ?? member.dimensionId
        })));
        await tx.relationships.bulkInsert(parsed.relationships.map((relationship) => ({
          ...relationship,
          dimensionId: dimensionIdMap.get(relationship.dimensionId) ?? relationship.dimensionId
        })));

        return savedProject;
      });

      const [dimensions, members, relationships] = await Promise.all([
        await repos.dimensions.listByProject(project.id),
        await repos.members.listByProject(project.id),
        await repos.relationships.listByProject(project.id)
      ]);
      const issues = dimensions.flatMap((dimension) =>
        validateDimension({
          project,
          dimension,
          members: members.filter((member) => member.dimensionId === dimension.id),
          relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id),
          severities: config.validation
        })
      );
      await repos.issues.replaceForProject(project.id, issues);
      await repos.audit.record({ projectId: project.id, action: "project.importXml", entityType: "project", entityId: project.id, after: parsed.importSummary });

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
