import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './canonical-app.config';

const output = fileURLToPath(new URL(`../../test-results/auto-exclusive-preparation/native-${Date.now()}/`, import.meta.url));
export default defineConfig({ ...base, testMatch: 'canonical-app-auto.spec.ts',
  outputDir: output, reporter: [['list'], ['json', { outputFile: output + 'results.json' }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5430' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-app.vite.ts --configLoader runner --host 127.0.0.1 --port 5430 --strictPort',
    url: 'http://127.0.0.1:5430', reuseExistingServer: false, cwd: fileURLToPath(new URL('../../', import.meta.url)) },
});
