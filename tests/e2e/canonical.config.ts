import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'canonical-*.spec.ts', workers: 1, retries: 0, timeout: 60_000,
  testIgnore: 'canonical-roles.spec.ts',
  outputDir: '../../test-results/canonical', reporter: [['list'], ['json', { outputFile: '../../test-results/canonical/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5209', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/click-navigation.config.ts --configLoader runner --host 127.0.0.1 --port 5209 --strictPort',
    url: 'http://127.0.0.1:5209', reuseExistingServer: false, cwd: process.cwd() },
});
