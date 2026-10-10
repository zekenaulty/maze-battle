import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.DIRECTED_TEST_PORT ?? 5176);
export default defineConfig({
  testDir: '.', testMatch: 'directed-storage*.spec.ts',
  outputDir: './directed-storage-results', timeout: 60_000, workers: 1,
  webServer: {
    command: `npm run dev -- --config tests/e2e/directed-storage.vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/e2e/directed-storage-fixture.html`,
    reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: `http://127.0.0.1:${port}`,
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined, trace: 'retain-on-failure' },
});
