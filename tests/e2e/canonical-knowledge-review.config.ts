import { defineConfig } from '@playwright/test';
import base from './canonical.config';

// Local review runs also require the two canonical fixture origin guards at 5213.
// The review spec itself runs unchanged in the parent's canonical config at 5209.
export default defineConfig(base, {
  testMatch: 'canonical-knowledge-review.spec.ts',
  outputDir: '../../test-results/canonical-knowledge-review',
  reporter: [['list'], ['json', { outputFile: '../../test-results/canonical-knowledge-review/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5213' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/click-navigation.config.ts --configLoader runner --host 127.0.0.1 --port 5213 --strictPort',
    url: 'http://127.0.0.1:5213', reuseExistingServer: false, cwd: process.cwd(),
  },
});
