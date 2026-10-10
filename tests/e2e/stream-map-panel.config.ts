import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'stream-map-panel.spec.ts', outputDir: '../../test-results/stream-map-panel', timeout: 90_000,
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199/tests/e2e/stream-map-panel.html', reuseExistingServer: false, cwd: process.cwd() },
  use: { baseURL: 'http://127.0.0.1:5199', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
