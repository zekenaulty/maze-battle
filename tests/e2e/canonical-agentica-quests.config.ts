import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_AGENTICA_QUESTS_RUN ?? 'canonical-agentica-quests';
export default defineConfig({
  testDir: '.', testMatch: /canonical-agentica-quests.*\.spec\.ts$/, workers: 1, retries: 0, timeout: 90_000,
  tsconfig: './canonical-agentica-quests.tsconfig.json', outputDir: `../../test-results/${run}`,
  reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5295', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-agentica-quests.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5295/tests/e2e/canonical-agentica-quests.html', reuseExistingServer: false, cwd: process.cwd(),
  },
});
