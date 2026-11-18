import { describe, it, expect } from 'vitest';
import { isGraphValid } from './index';

describe('@repo/graph', () => {
  it('should validate graph wiring', () => {
    expect(isGraphValid()).toBe(true);
  });
});
