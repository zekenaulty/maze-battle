import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_LIVE_CORPUS_RUN ?? 'live-corpus-preflight';
export default defineConfig({
  testDir: '.', testMatch: 'preflight.spec.ts', tsconfig: './tsconfig.json', workers: 1, retries: 0, timeout: 60_000,
  outputDir: resolve('test-results', run, 'browser'), reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5488', serviceWorkers: 'block', trace: 'retain-on-failure', viewport: { width: 1280, height: 900 },
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/live-corpus/vite.config.ts --configLoader runner',
    url: 'http://127.0.0.1:5488/tests/live-corpus/setup.html', reuseExistingServer: false, cwd: process.cwd() },
});
