import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'storage-baseline.spec.ts', workers: 1, retries: 0, timeout: 120_000,
  outputDir: '../../test-results/storage-baseline', reporter: [['list'], ['json', { outputFile: '../../test-results/storage-baseline/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5208', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/click-navigation.config.ts --configLoader runner --host 127.0.0.1 --port 5208 --strictPort',
    url: 'http://127.0.0.1:5208', reuseExistingServer: false, cwd: process.cwd() },
});
