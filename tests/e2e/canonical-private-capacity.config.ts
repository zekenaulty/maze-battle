import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_CAPACITY_RUN ?? 'canonical-private-capacity';
export default defineConfig({ testDir: '.', testMatch: /canonical-private-capacity\.(admission|recovery|guards)\.spec\.ts$/,
  workers: 1, retries: 0, timeout: 60_000, tsconfig: './canonical-private-capacity.tsconfig.json',
  outputDir: resolve('test-results', run), reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5440', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-private-capacity.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5440/tests/e2e/canonical-private-capacity.html', reuseExistingServer: false, cwd: process.cwd() },
});
