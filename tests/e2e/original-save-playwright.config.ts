import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'original-save-import.spec.ts', workers: 2,
  outputDir: '../../test-results/original-save-import',
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181', reuseExistingServer: false,
  },
  use: {
    ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5181',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: 'retain-on-failure',
  },
});
