import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: ['directed-play.spec.ts', 'directed-navigation.spec.ts'],
  outputDir: '../../test-results/directed-play', workers: 1, timeout: 60000,
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176', reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:5176', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined },
});
