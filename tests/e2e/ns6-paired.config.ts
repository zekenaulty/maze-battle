import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'ns6-paired.spec.ts', outputDir: '../../test-results/ns6-paired', timeout: 180000, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/ns6-paired-report.json' }]],
  webServer: [
    { command: 'node scripts/ns6-paired-host.mjs', cwd: process.cwd(), url: 'http://127.0.0.1:5085/api/health', reuseExistingServer: false, timeout: 60000 },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5185 --strictPort', cwd: process.cwd(), url: 'http://127.0.0.1:5185', reuseExistingServer: false,
      env: { VITE_MAZE_TRAVEL_STEPS: '256', VITE_MAZE_TRAVEL_REPLANS: '16', VITE_MAZE_TRAVEL_DURATION_MS: '120000' } },
  ],
  use: { baseURL: 'http://127.0.0.1:5185', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
