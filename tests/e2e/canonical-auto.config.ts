import { defineConfig } from '@playwright/test';
import config from './canonical-town-party.config';
export default defineConfig({ ...config, testMatch: 'auto*.canonical.spec.ts', timeout: 120_000,
  outputDir: '../../test-results/canonical-auto' });
