import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Dedicated worktree server and fresh Playwright profiles; never attach to the live game.
export default defineConfig({
  testDir: '.',
  testMatch: 'expedition-storage.spec.ts',
  outputDir: '../../test-results/expedition-storage',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191/tests/e2e/expedition-storage-fixture.html',
    reuseExistingServer: false,
    cwd: process.cwd(),
  },
  use: {
    baseURL: 'http://127.0.0.1:5191',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined,
    trace: 'retain-on-failure',
  },
});
