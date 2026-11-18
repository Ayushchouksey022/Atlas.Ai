import { describe, it, expect } from 'vitest';
import { getLLMProviderInfo } from './index';

describe('@repo/llm', () => {
  it('should return provider info', () => {
    const info = getLLMProviderInfo('test-provider', 'fast');
    expect(info).toEqual({ name: 'test-provider', tier: 'fast' });
  });
});
