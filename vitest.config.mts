import { defineConfig } from 'vitest/config';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const rnwPath = require.resolve('react-native-web', {
  paths: [path.resolve(import.meta.dirname, 'apps/mobile-web')],
});

export default defineConfig({
  define: {
    __DEV__: 'true',
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/src/**/*.test.{ts,tsx}',
      'apps/**/src/**/*.test.{ts,tsx}',
      'supabase/functions/**/*.test.{ts,tsx}',
      'evals/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    alias: {
      'react-native': rnwPath,
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
