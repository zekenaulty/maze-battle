import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.MAZE_RECOVERY_TEST_PORT ?? 5197);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.', testMatch: 'game-reset.spec.ts', workers: 1, retries: 0,
  outputDir: '../../test-results/game-reset',
  use: { baseURL: origin, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config tests/click-navigation.config.ts --configLoader runner --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: origin, reuseExistingServer: false,
  },
});
