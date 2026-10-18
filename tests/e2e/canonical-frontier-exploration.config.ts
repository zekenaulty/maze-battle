import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: '.',
  // Explicit names keep this lane out of the older 5290 configuration's *.spec.ts glob.
  testMatch: ['canonical-frontier-exploration.scenes.ts', 'canonical-frontier-exploration.replay.ts'],
  workers: 1, retries: 0, timeout: 120_000, tsconfig: './canonical-frontier.tsconfig.json',
  outputDir: '../../test-results/canonical-frontier-exploration',
  reporter: [['list'], ['json', { outputFile: 'test-results/canonical-frontier-exploration/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5291', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-frontier-exploration.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5291/tests/e2e/canonical-frontier-exploration.html', reuseExistingServer: false, cwd: process.cwd() } });
