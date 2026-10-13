import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.DIRECTED_TEST_PORT ?? 5182);
export default defineConfig({
  testDir: '.',
  testMatch: 'directed-stream*.spec.ts',
  outputDir: '../../test-results/pr1-directed-deadline', timeout: 120_000, workers: 1,
  webServer: {
    command: `npm run dev -- --config tests/e2e/directed-stream.vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/e2e/directed-stream-fixture.html`,
    reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
