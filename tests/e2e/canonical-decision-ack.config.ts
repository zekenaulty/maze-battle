import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: '.', testMatch: /canonical-decision-ack.*\.cases\.ts$/, workers: 2, retries: 0, timeout: 60_000,
  tsconfig: './canonical-decision-ack.tsconfig.json', outputDir: '../../test-results/canonical-decision-ack',
  reporter: [['list'], ['json', { outputFile: '../../test-results/canonical-decision-ack-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5264', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-decision-ack.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5264/tests/e2e/canonical-decision-ack.html', reuseExistingServer: false, cwd: process.cwd() } });
