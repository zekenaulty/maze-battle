import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'directed-stream*.spec.ts', outputDir: '../../test-results/directed-stream',
  timeout: 120_000, workers: 1,
  webServer: {
    command: 'npm run dev -- --config tests/e2e/directed-stream.vite.config.ts --host 127.0.0.1 --port 5193 --strictPort',
    url: 'http://127.0.0.1:5193/tests/e2e/directed-stream-fixture.html', reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: 'http://127.0.0.1:5193', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined,
    trace: 'retain-on-failure' },
});
