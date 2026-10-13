import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'canonical-roles.spec.ts', workers: 1, retries: 0, timeout: 60_000,
  tsconfig: './canonical-role-fixture.tsconfig.json',
  outputDir: '../../test-results/canonical-roles',
  reporter: [['list'], ['json', { outputFile: 'test-results/canonical-roles/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5210', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-role-fixture.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5210/tests/e2e/canonical-role-fixture.html', reuseExistingServer: false, cwd: process.cwd() },
});
