import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_PARITY_RUN ?? 'canonical-controller-parity';
export default defineConfig({ testDir: '.', testMatch: /canonical-controller-parity(?:\.assertions)?\.spec\.ts$/, workers: 1, retries: 0, timeout: 180_000,
  tsconfig: './canonical-controller-parity.tsconfig.json', outputDir: `../../test-results/${run}`,
  reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { serviceWorkers: 'block', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-controller-parity.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5466/tests/e2e/canonical-controller-parity.html', reuseExistingServer: false, cwd: process.cwd() },
});
