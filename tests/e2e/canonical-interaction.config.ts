import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: '.', testMatch: 'canonical-interaction*.spec.ts',
  workers: 1, retries: 0, timeout: 120_000, tsconfig: './canonical-interaction.tsconfig.json',
  outputDir: '../../test-results/canonical-interaction',
  reporter: [['list'], ['json', { outputFile: 'test-results/canonical-interaction/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5293', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-interaction.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5293/tests/e2e/canonical-interaction.html', reuseExistingServer: false, cwd: process.cwd() } });
