export type AIProvider = 'openai' | 'anthropic' | 'azure' | 'local' | 'none';
export type AISuggestionType = 'parent' | 'duplicate' | 'naming' | 'hierarchy' | 'property';
export type AISuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export interface AISuggestion {
  id: string;
  projectId: string;
  dimensionId: string | null;
  suggestionType: AISuggestionType;
  targetMemberKey: string | null;
  suggestion: Record<string, unknown>;
  confidence: number;
  status: AISuggestionStatus;
  actedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AIConversation {
  id: string;
  projectId: string;
  userId: string;
  messages: AIMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ParentSuggestion {
  parentKey: string;
  confidence: number;
  reason: string;
}

export interface DuplicateGroup {
  members: string[];
  similarity: number;
  method: string;
}

export interface NamingAnomaly {
  memberKey: string;
  expectedPattern: string;
  deviation: string;
  confidence: number;
}

export interface HierarchyOptimization {
  parentKey: string;
  action: 'group' | 'flatten' | 'rebalance';
  affectedMembers: string[];
  reason: string;
  confidence: number;
}

export interface PropertySuggestion {
  memberKey: string;
  propertyName: string;
  suggestedValue: string;
  confidence: number;
  reason: string;
}

export interface NLQueryResult {
  answer: string;
  matchedMembers: string[];
  query: string;
  confidence: number;
  intent?: string;
  intentLabel?: string;
  evidence?: string[];
  followUps?: string[];
}

export interface ChatResponse {
  conversationId: string;
  message: AIMessage;
  suggestions?: string[];
}

export interface AIFeatureToggles {
  parentSuggestions: boolean;
  duplicateDetection: boolean;
  namingAnomalies: boolean;
  hierarchyOptimization: boolean;
  propertySuggestions: boolean;
  naturalLanguageQuery: boolean;
}

export interface AIDuplicateDetectionConfig {
  similarityThreshold: number;
  methods: ('levenshtein' | 'soundex' | 'prefix')[];
}

export interface AISuggestionsConfig {
  maxPerAnalysis: number;
  autoRunOnImport: boolean;
}

export interface AIConfigSection {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  features: AIFeatureToggles;
  duplicateDetection: AIDuplicateDetectionConfig;
  suggestions: AISuggestionsConfig;
}

export interface AIAnalysisRequest {
  scope?: {
    dimensionTypes?: string[];
    suggestionTypes?: AISuggestionType[];
  };
}

export interface AIAnalysisResult {
  suggestions: AISuggestion[];
  totalGenerated: number;
  duration: number;
}
