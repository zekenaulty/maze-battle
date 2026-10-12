import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: ['rpg-command-agentica-events.spec.ts', 'rpg-command-agentica-client.spec.ts'], workers: 1, retries: 0, timeout: 45_000,
  outputDir: '../../test-results/rpg-agentica-events',
  reporter: [['list'], ['json', { outputFile: '../../test-results/rpg-agentica-events/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5207', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5207 --strictPort',
    url: 'http://127.0.0.1:5207', reuseExistingServer: false, cwd: process.cwd() },
});
