import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './canonical-app-auto-kill.config';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.TOWN_INVENTORY_OUTPUT ?? `${root}/test-results/app-town-inventory-a2d49d1`;
export default defineConfig({
  ...base, testMatch: 'canonical-app-town-inventory.spec.ts', timeout: 60_000, globalTimeout: 120_000,
  outputDir: `${output}/artifacts`, reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5498' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-app-town-inventory.vite.ts --configLoader runner --host 127.0.0.1 --port 5498 --strictPort',
    url: 'http://127.0.0.1:5498', reuseExistingServer: false, cwd: root },
});
