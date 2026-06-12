import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { AIConfigSection, AISuggestionType, AISuggestionStatus } from "../../shared/aiTypes";
import type { Repositories } from "../db/repositories";
import { runFullAnalysis, runParentSuggestion, runDuplicateDetection, runNaturalLanguageQuery } from "../ai/aiEngine";
import { buildProjectAIContext } from "../ai/projectContext";

const defaultAIConfig: AIConfigSection = {
  enabled: true,
  provider: 'none',
  model: '',
  apiKey: '',
  features: {
    parentSuggestions: true,
    duplicateDetection: true,
    namingAnomalies: true,
    hierarchyOptimization: true,
    propertySuggestions: true,
    naturalLanguageQuery: true
  },
  duplicateDetection: { similarityThreshold: 0.85, methods: ['levenshtein', 'soundex', 'prefix'] },
  suggestions: { maxPerAnalysis: 50, autoRunOnImport: true }
};

function getAIConfig(config: AppConfig): AIConfigSection {
  return config.ai ?? defaultAIConfig;
}

export function createAIRouter(repos: Repositories, config: AppConfig): Router {
  const router = Router();

  router.get("/projects/:id/ai/suggestions", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const aiConfig = getAIConfig(config);
    if (!aiConfig.enabled) return res.status(503).json({ error: "AI features are disabled" });

    const type = req.query.type as AISuggestionType | undefined;
    const status = req.query.status as AISuggestionStatus | undefined;
    const suggestions = await repos.aiSuggestions.listByProject(project.id, { type, status });
    res.json(suggestions);
  });

  router.post("/projects/:id/ai/analyze", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const aiConfig = getAIConfig(config);
    if (!aiConfig.enabled) return res.status(503).json({ error: "AI features are disabled" });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const scope = req.body?.scope;
    const startTime = Date.now();
    const results = runFullAnalysis({ dimensions, members, relationships }, aiConfig, scope);
    const duration = Date.now() - startTime;

    const stored: unknown[] = [];

    for (const dup of results.duplicates) {
      const record = await repos.aiSuggestions.create({
        projectId: project.id,
        suggestionType: 'duplicate',
        suggestion: dup as unknown as Record<string, unknown>,
        confidence: dup.similarity
      });
      stored.push(record);
    }

    for (const anomaly of results.namingAnomalies) {
      const dim = dimensions.find(d => {
        const dimMembers = members.filter(m => m.dimensionId === d.id);
        return dimMembers.some(m => m.memberKey === anomaly.memberKey);
      });
      const record = await repos.aiSuggestions.create({
        projectId: project.id,
        dimensionId: dim?.id,
        suggestionType: 'naming',
        targetMemberKey: anomaly.memberKey,
        suggestion: anomaly as unknown as Record<string, unknown>,
        confidence: anomaly.confidence
      });
      stored.push(record);
    }

    for (const opt of results.hierarchyOptimizations) {
      const record = await repos.aiSuggestions.create({
        projectId: project.id,
        suggestionType: 'hierarchy',
        targetMemberKey: opt.parentKey,
        suggestion: opt as unknown as Record<string, unknown>,
        confidence: opt.confidence
      });
      stored.push(record);
    }

    for (const prop of results.propertySuggestions) {
      const dim = dimensions.find(d => {
        const dimMembers = members.filter(m => m.dimensionId === d.id);
        return dimMembers.some(m => m.memberKey === prop.memberKey);
      });
      const record = await repos.aiSuggestions.create({
        projectId: project.id,
        dimensionId: dim?.id,
        suggestionType: 'property',
        targetMemberKey: prop.memberKey,
        suggestion: prop as unknown as Record<string, unknown>,
        confidence: prop.confidence
      });
      stored.push(record);
    }

    res.status(201).json({
      suggestions: stored,
      totalGenerated: stored.length,
      duration
    });
  });

  router.patch("/ai/suggestions/:id", async (req, res) => {
    const schema = z.object({ status: z.enum(['accepted', 'dismissed']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid status", details: parsed.error.issues });

    const userId = req.user?.id ?? "system";
    const updated = await repos.aiSuggestions.updateStatus(req.params.id, parsed.data.status, userId);
    if (!updated) return res.status(404).json({ error: "Suggestion not found" });
    res.json(updated);
  });

  router.post("/projects/:id/ai/suggest-parent", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const aiConfig = getAIConfig(config);
    if (!aiConfig.enabled) return res.status(503).json({ error: "AI features are disabled" });

    const schema = z.object({ memberKey: z.string().min(1), dimensionType: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const suggestions = runParentSuggestion(
      parsed.data.memberKey,
      parsed.data.dimensionType,
      { dimensions, members, relationships }
    );
    res.json(suggestions);
  });

  router.post("/projects/:id/ai/duplicates", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const aiConfig = getAIConfig(config);
    if (!aiConfig.enabled) return res.status(503).json({ error: "AI features are disabled" });

    const threshold = typeof req.body?.threshold === 'number' ? req.body.threshold : undefined;
    const members = await repos.members.listByProject(project.id);
    const dimensions = await repos.dimensions.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const duplicates = runDuplicateDetection({ dimensions, members, relationships }, aiConfig, threshold);
    res.json(duplicates);
  });

  router.post("/projects/:id/ai/query", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const aiConfig = getAIConfig(config);
    if (!aiConfig.enabled || !aiConfig.features.naturalLanguageQuery) {
      return res.status(503).json({ error: "Natural language query is disabled" });
    }

    const schema = z.object({ question: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);

    const result = runNaturalLanguageQuery(
      parsed.data.question,
      { dimensions, members, relationships },
      (await buildProjectAIContext(repos, config, project.id)) ?? undefined
    );
    res.json(result);
  });

  router.post("/projects/:id/ai/chat", async (req, res) => {
    const project = await repos.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const aiConfig = getAIConfig(config);
    if (!aiConfig.enabled) return res.status(503).json({ error: "AI features are disabled" });

    const schema = z.object({ message: z.string().min(1), conversationId: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const userId = req.user?.id ?? "system";
    const timestamp = new Date().toISOString();
    const userMessage = { role: 'user' as const, content: parsed.data.message, timestamp };

    const dimensions = await repos.dimensions.listByProject(project.id);
    const members = await repos.members.listByProject(project.id);
    const relationships = await repos.relationships.listByProject(project.id);
    const queryResult = runNaturalLanguageQuery(
      parsed.data.message,
      { dimensions, members, relationships },
      (await buildProjectAIContext(repos, config, project.id)) ?? undefined
    );

    const assistantMessage = {
      role: 'assistant' as const,
      content: queryResult.answer,
      timestamp: new Date().toISOString()
    };

    let conversation;
    if (parsed.data.conversationId) {
      conversation = await repos.aiConversations.get(parsed.data.conversationId);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      await repos.aiConversations.appendMessage(conversation.id, userMessage);
      conversation = await repos.aiConversations.appendMessage(conversation.id, assistantMessage);
    } else {
      conversation = await repos.aiConversations.create({ projectId: project.id, userId, message: userMessage });
      conversation = await repos.aiConversations.appendMessage(conversation!.id, assistantMessage);
    }

    res.status(201).json({
      conversationId: conversation!.id,
      message: assistantMessage,
      suggestions: queryResult.matchedMembers.length > 0 ? [`Found ${queryResult.matchedMembers.length} matching members`] : undefined
    });
  });

  router.get("/ai/config", (_req, res) => {
    const aiConfig = getAIConfig(config);
    const { apiKey: _, ...safeConfig } = aiConfig;
    res.json({ ...safeConfig, hasApiKey: !!aiConfig.apiKey });
  });

  router.patch("/ai/config", (req, res) => {
    const schema = z.object({
      enabled: z.boolean().optional(),
      provider: z.enum(['openai', 'anthropic', 'azure', 'local', 'none']).optional(),
      model: z.string().optional(),
      features: z.object({
        parentSuggestions: z.boolean().optional(),
        duplicateDetection: z.boolean().optional(),
        namingAnomalies: z.boolean().optional(),
        hierarchyOptimization: z.boolean().optional(),
        propertySuggestions: z.boolean().optional(),
        naturalLanguageQuery: z.boolean().optional()
      }).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const aiConfig = getAIConfig(config);
    const merged = { ...aiConfig, ...parsed.data, features: { ...aiConfig.features, ...parsed.data?.features } };
    const { apiKey: _, ...safeConfig } = merged;
    res.json({ ...safeConfig, hasApiKey: !!aiConfig.apiKey });
  });

  return router;
}
