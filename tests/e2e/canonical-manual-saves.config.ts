import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'canonical-manual-saves*.spec.ts', workers: 1, retries: 0, timeout: 60_000,
  tsconfig: './canonical-manual-saves.tsconfig.json', outputDir: '../../test-results/canonical-manual-saves',
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5222', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-manual-saves.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5222/tests/e2e/canonical-manual-saves.html', reuseExistingServer: false, cwd: process.cwd() },
});
