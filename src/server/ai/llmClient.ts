import type { AIConfigSection } from "../../shared/aiTypes";

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMClient {
  complete(prompt: string, options?: LLMCompletionOptions): Promise<string>;
  isAvailable(): boolean;
}

export function createLLMClient(config: AIConfigSection): LLMClient {
  if (!config.enabled || config.provider === 'none' || !config.apiKey) {
    return new NoopLLMClient();
  }
  return new NoopLLMClient();
}

class NoopLLMClient implements LLMClient {
  complete(_prompt: string, _options?: LLMCompletionOptions): Promise<string> {
    return Promise.resolve("");
  }
  isAvailable(): boolean {
    return false;
  }
}
