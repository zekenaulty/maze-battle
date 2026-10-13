import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'earned-game-map.spec.ts', workers: 1, retries: 0, timeout: 120_000,
  outputDir: '../../test-results/canonical-game-map', reporter: [['list'], ['json', { outputFile: '../../test-results/canonical-game-map/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5220', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-game-map.vite.ts --configLoader runner --host 127.0.0.1 --port 5220 --strictPort',
    url: 'http://127.0.0.1:5220', reuseExistingServer: false, cwd: process.cwd() },
});
