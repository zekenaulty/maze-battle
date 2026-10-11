import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.DIRECTED_ISSUES_TEST_PORT ?? 5187);
export default defineConfig({
  testDir: '.', testMatch: ['directed-play*.spec.ts', 'directed-navigation.spec.ts'],
  outputDir: '../../test-results/directed-issues', workers: 1, timeout: 60000,
  webServer: {
    command: `npm run dev -- --config tests/e2e/directed-storage.vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
