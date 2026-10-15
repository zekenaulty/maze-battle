import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: '.', testMatch: /canonical-operation-transfer.*\.spec\.ts$/, workers: 2, retries: 0, timeout: 60_000,
  tsconfig: './canonical-operation-transfer.tsconfig.json', outputDir: '../../test-results/canonical-operation-transfer', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5258', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-operation-transfer.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5258/tests/e2e/canonical-operation-transfer.html', reuseExistingServer: false, cwd: process.cwd() },
});
