import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'paged-topology*.spec.ts', outputDir: '../../test-results/paged-topology',
  timeout: 60_000,
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197/tests/e2e/paged-topology-fixture.html', reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: 'http://127.0.0.1:5197', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined,
    trace: 'retain-on-failure' },
});
