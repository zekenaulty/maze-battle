import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromeExecutablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const launchOptions = existsSync(chromeExecutablePath) ? { executablePath: chromeExecutablePath } : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:5174',
    launchOptions,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
