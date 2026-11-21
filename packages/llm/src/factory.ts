import type { LLMProvider, ProviderConfig } from './types';
import { MockProvider } from './providers/mock';
import { OpenAIProvider } from './providers/openai';

export interface GetLLMProviderOptions extends ProviderConfig {
  provider?: string;
}

/**
 * Resolves the configured LLM provider.
 * Defaults to MockProvider if LLM_PROVIDER is unset or set to 'mock'.
 */
export function getLLMProvider(options?: GetLLMProviderOptions): LLMProvider {
  const providerName = (
    options?.provider ||
    process.env.LLM_PROVIDER ||
    'mock'
  ).toLowerCase();

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(options);
    case 'mock':
    default:
      return new MockProvider(options);
  }
}
