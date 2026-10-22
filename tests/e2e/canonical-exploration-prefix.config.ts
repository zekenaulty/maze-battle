import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_PREFIX_RUN ?? 'canonical-exploration-prefix';
export default defineConfig({ testDir: '.', testMatch: 'canonical-exploration-prefix.native.ts',
  workers: 1, retries: 0, timeout: 180_000, tsconfig: './canonical-exploration-prefix.tsconfig.json',
  outputDir: `../../test-results/${run}`,
  reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5418', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-exploration-prefix.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5418/tests/e2e/canonical-exploration-prefix.html', reuseExistingServer: false, cwd: process.cwd() } });
