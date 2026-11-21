import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    __DEV__: 'true',
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
    ],
    alias: {
      '@repo/graph': path.resolve(import.meta.dirname, './packages/graph/src'),
      '@repo/schemas': path.resolve(import.meta.dirname, './packages/schemas/src'),
      '@repo/llm': path.resolve(import.meta.dirname, './packages/llm/src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/graph/src/index.ts', 'packages/schemas/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
