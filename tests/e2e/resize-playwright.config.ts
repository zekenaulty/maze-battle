import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'screens-resize.spec.ts', workers: 1,
  timeout: 90_000, retries: 0,
  outputDir: '../../test-results/d1-resize',
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --config tests/e2e/resize-session.vite.config.ts --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197', reuseExistingServer: false,
  },
  use: {
    browserName: 'chromium', baseURL: 'http://127.0.0.1:5197',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    locale: 'en-US', timezoneId: 'UTC',
  },
});
