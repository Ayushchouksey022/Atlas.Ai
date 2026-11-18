import { DummyType } from '@repo/schemas';

export interface LLMProviderMetadata {
  name: string;
  tier: 'fast' | 'strong';
  context?: DummyType;
}

export function getLLMProviderInfo(name: string, tier: 'fast' | 'strong'): LLMProviderMetadata {
  return { name, tier };
}
