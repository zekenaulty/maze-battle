import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// Dedicated port and no reuse: browser evidence must come from this worktree.
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/topology-e2e',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort',
    url: 'http://127.0.0.1:5187',
    reuseExistingServer: false,
    cwd: process.cwd(),
  },
  use: {
    baseURL: 'http://127.0.0.1:5187',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined,
    trace: 'retain-on-failure',
  },
});
