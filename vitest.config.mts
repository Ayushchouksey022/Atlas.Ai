import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    alias: {
      '@repo/graph': path.resolve(import.meta.dirname, './packages/graph/src'),
      '@repo/schemas': path.resolve(import.meta.dirname, './packages/schemas/src'),
      '@repo/llm': path.resolve(import.meta.dirname, './packages/llm/src'),
    },
  },
});
