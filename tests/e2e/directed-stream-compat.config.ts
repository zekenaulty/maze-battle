import { defineConfig } from '@playwright/test';
import config from './directed-stream.config';

export default defineConfig({ ...config,
  testMatch: ['stream-persistence.spec.ts', 'stream-persistence-races.spec.ts',
    'stream-persistence-migration.spec.ts', 'stream-persistence-failures.spec.ts'],
  outputDir: '../../test-results/directed-stream-compat',
});
