import { defineConfig } from 'vitest/config';
import './tests/support/env';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
    globalSetup: ['./tests/support/global-setup.ts'],
    setupFiles: ['./tests/support/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
