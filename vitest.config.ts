import { defineConfig } from 'vitest/config';
import path from 'path';

// Vitest config kept separate from vite.config.ts so the app build and the
// test runner stay decoupled. API/business-logic tests run in a Node env.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/api/**/*.ts'],
      exclude: ['src/api/**/*.{test,spec}.ts'],
    },
  },
});
