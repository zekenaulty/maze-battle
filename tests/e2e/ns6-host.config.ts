import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.NS6_HOST_TEST_PORT ?? 5183);
export default defineConfig({
  testDir: '.',
  testMatch: ['directed-storage*.spec.ts', 'directed-navigation.spec.ts', 'directed-stream*.spec.ts', 'directed-host*.spec.ts'],
  outputDir: '../../test-results/ns6-host', timeout: 120000, workers: 1,
  webServer: {
    command: `npm run dev -- --config tests/e2e/directed-storage.vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/e2e/directed-storage-fixture.html`,
    reuseExistingServer: false, cwd: process.cwd(),
    env: { VITE_MAZE_TRAVEL_STEPS: '64', VITE_MAZE_TRAVEL_REPLANS: '4', VITE_MAZE_TRAVEL_DURATION_MS: '120000' },
  },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
