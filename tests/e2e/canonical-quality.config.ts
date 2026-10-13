import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'canonical-quality.spec.ts', workers: 1, retries: 0, timeout: 90_000,
  tsconfig: './canonical-quality-fixture.tsconfig.json', outputDir: '../../test-results/canonical-quality',
  reporter: [['list'], ['json', { outputFile: '../../test-results/canonical-quality/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5212', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-quality-fixture.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5212/tests/e2e/canonical-quality-fixture.html', reuseExistingServer: false, cwd: process.cwd() },
});
