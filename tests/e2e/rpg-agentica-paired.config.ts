import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'rpg-agentica-paired.spec.ts', outputDir: '../../test-results/rpg-paired',
  timeout: 60000, expect: { timeout: 15000 }, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: resolve('test-results/rpg-paired-report.json') }]],
  webServer: [
    { command: 'node scripts/rpg-paired-host.mjs', cwd: process.cwd(), url: 'http://127.0.0.1:5092/api/health', reuseExistingServer: false, timeout: 30000 },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5212 --strictPort', cwd: process.cwd(), url: 'http://127.0.0.1:5212/tests/e2e/rpg-agentica-paired-fixture.html',
      reuseExistingServer: false, timeout: 30000 },
  ],
  use: { baseURL: 'http://127.0.0.1:5212', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
