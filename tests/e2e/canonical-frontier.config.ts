import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: '.', testMatch: 'canonical-frontier*.spec.ts', workers: 1, retries: 0, timeout: 60_000,
  tsconfig: './canonical-frontier.tsconfig.json', outputDir: '../../test-results/canonical-frontier',
  reporter: [['list'], ['json', { outputFile: 'test-results/canonical-frontier/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5290', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-frontier.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5290/tests/e2e/canonical-frontier.html', reuseExistingServer: false, cwd: process.cwd() } });
