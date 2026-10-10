import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'stream-persistence*.spec.ts', outputDir: '../../test-results/stream-persistence', timeout: 120_000,
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198/tests/e2e/stream-persistence-fixture.html', reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: 'http://127.0.0.1:5198', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined, trace: 'retain-on-failure' },
});
