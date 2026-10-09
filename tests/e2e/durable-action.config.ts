import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'durable-action*.spec.ts', outputDir: '../../test-results/durable-action',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5195 --strictPort',
    url: 'http://127.0.0.1:5195/tests/e2e/durable-action-fixture.html', reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: 'http://127.0.0.1:5195', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined,
    trace: 'retain-on-failure' },
});
