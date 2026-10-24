import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: /canonical-agentica-transport\.(review\.test|commutation\.spec)\.ts$/, workers: 1, retries: 0, timeout: 45_000,
  tsconfig: './canonical-agentica-transport.tsconfig.json',
  outputDir: '../../test-results/canonical-agentica-transport-review', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5243', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-agentica-transport.vite.ts --configLoader runner --port 5243',
    url: 'http://127.0.0.1:5243/tests/e2e/canonical-agentica-transport.html', reuseExistingServer: false, cwd: process.cwd(),
  },
});
