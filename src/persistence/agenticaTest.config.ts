import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: 'agentica*.browser.ts', outputDir: '../../test-results/agentica-storage', timeout: 60_000,
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5201 --strictPort',
    url: 'http://127.0.0.1:5201/src/persistence/agenticaTest.fixture.html', reuseExistingServer: false, cwd: process.cwd() },
  use: { baseURL: 'http://127.0.0.1:5201', launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined, trace: 'retain-on-failure' },
});
