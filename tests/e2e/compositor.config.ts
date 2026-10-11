import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'compositor.spec.ts', workers: 1,
  timeout: 90_000, retries: 0,
  outputDir: '../../test-results/issue-5',
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --config tests/e2e/compositor.vite.config.ts --host 127.0.0.1 --port 5201 --strictPort',
    url: 'http://127.0.0.1:5201/tests/e2e/compositor-fixture.html',
    reuseExistingServer: false,
  },
  use: {
    browserName: 'chromium', baseURL: 'http://127.0.0.1:5201',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    viewport: { width: 900, height: 740 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'dpr-1', use: { deviceScaleFactor: 1 } },
    { name: 'dpr-2', use: { deviceScaleFactor: 2 } },
  ],
});
