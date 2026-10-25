import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './canonical-app-auto-kill.config';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.AUTO_ENDURANCE_OUTPUT ?? `${root}/test-results/app-auto-endurance-ce935a3`;
export default defineConfig({
  ...base, testMatch: 'canonical-app-auto-endurance.spec.ts', timeout: 1_200_000,
  outputDir: `${output}/artifacts`, reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5497', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-app-auto-endurance.vite.ts --configLoader runner --host 127.0.0.1 --port 5497 --strictPort',
    url: 'http://127.0.0.1:5497', reuseExistingServer: false, cwd: root },
});
