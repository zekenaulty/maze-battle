import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './restoration-3d.config';
export default defineConfig({ ...base, testMatch: 'auto-camera-3d.spec.ts', timeout: 120_000,
  outputDir: '../../test-results/auto-camera-3d',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../test-results/auto-camera-3d/results.json', import.meta.url)) }]] });
