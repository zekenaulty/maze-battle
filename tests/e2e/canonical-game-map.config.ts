import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_MAP_RUN ?? 'canonical-game-map';
export default defineConfig({
  testDir: '.', testMatch: /earned-(game|room)-map\.spec\.ts$/, workers: 1, retries: 0, timeout: 120_000,
  outputDir: `../../test-results/${run}`, reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5220', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-game-map.vite.ts --configLoader runner --host 127.0.0.1 --port 5220 --strictPort',
    url: 'http://127.0.0.1:5220', reuseExistingServer: false, cwd: process.cwd() },
});
