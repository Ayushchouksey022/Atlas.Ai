import { describe, it, expect } from 'vitest';
import { validateDummy } from './index';

describe('@repo/schemas', () => {
  it('should validate valid data', () => {
    const data = { id: 'test-1', name: 'Example' };
    expect(validateDummy(data)).toEqual(data);
  });

  it('should reject invalid data', () => {
    expect(() => validateDummy({ id: 123 })).toThrow();
  });
});
