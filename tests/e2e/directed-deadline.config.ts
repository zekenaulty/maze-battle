import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.',
  testMatch: ['directed-storage*.spec.ts', 'directed-play*.spec.ts', 'directed-navigation.spec.ts', 'directed-stream*.spec.ts'],
  outputDir: '../../test-results/pr1-directed-deadline', timeout: 120_000, workers: 1,
  webServer: {
    command: 'npm run dev -- --config tests/e2e/directed-storage.vite.config.ts --host 127.0.0.1 --port 5182 --strictPort',
    url: 'http://127.0.0.1:5182/tests/e2e/directed-storage-fixture.html',
    reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: 'http://127.0.0.1:5182', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
