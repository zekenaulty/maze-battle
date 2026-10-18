import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from './canonical-agentica-operations.config';

const run = process.env.MAZE_OPERATION_REVIEW_RUN ?? 'operation-review';
export default defineConfig({ ...base,
  grep: /review:|ack missing-receipt fails closed during read and next advance/,
  tsconfig: './operation-review.tsconfig.json', outputDir: `../../test-results/${run}`,
  reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/operation-review.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5242/tests/e2e/canonical-agentica-operations.html', reuseExistingServer: false, cwd: process.cwd() },
});
