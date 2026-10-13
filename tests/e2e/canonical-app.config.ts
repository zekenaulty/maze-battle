import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'canonical-app.spec.ts', workers: 1, retries: 0, timeout: 120_000,
  outputDir: '../../test-results/canonical-app', reporter: [['list'], ['json', { outputFile: '../../test-results/canonical-app/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5223', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-app.vite.ts --configLoader runner --host 127.0.0.1 --port 5223 --strictPort',
    url: 'http://127.0.0.1:5223', reuseExistingServer: false, cwd: process.cwd() },
});
