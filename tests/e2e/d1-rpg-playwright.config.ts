import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'd1-rpg-*.spec.ts', workers: 1, retries: 0,
  timeout: 90_000, outputDir: '../../test-results/d1-rpg-browser',
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --config tests/e2e/d1-rpg-vite.config.ts --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199', reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:5199', browserName: 'chromium',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    locale: 'en-US', timezoneId: 'UTC',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile-emulation', use: { ...devices['Pixel 7'] } },
  ],
});
