import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.SCREENS_TEST_PORT ?? 5187);
export default defineConfig({
  testDir: '.',
  testMatch: 'screens.spec.ts',
  workers: 1,
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/tests/e2e/screens-fixture.html`,
    reuseExistingServer: false,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined,
    screenshot: 'only-on-failure',
  },
});
