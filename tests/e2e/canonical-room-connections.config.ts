import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_CONNECTIONS_RUN ?? 'canonical-room-connections';
export default defineConfig({ testDir: '.', testMatch: /canonical-room-connections\.spec\.ts$/, workers: 1, retries: 0, timeout: 120_000,
  tsconfig: './canonical-room-connections.tsconfig.json', outputDir: `../../test-results/${run}`,
  reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { serviceWorkers: 'block', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-room-connections.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5428/tests/e2e/canonical-room-connections.html', reuseExistingServer: false, cwd: process.cwd() },
});
