import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.LAUNCH_SCENARIO_TEST_PORT ?? 5271);
if ([5078, 5184, 5188].includes(port)) throw new Error('Reserved service port.');
export default defineConfig({
  testDir: '.', testMatch: 'launch-scenario.spec.ts', outputDir: '../../test-results/launch-scenario',
  timeout: 120_000, workers: 1,
  webServer: {
    command: `npm run dev -- --config tests/e2e/launch-scenario.vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/e2e/launch-scenario-fixture.html`, reuseExistingServer: false, cwd: process.cwd(),
  },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
