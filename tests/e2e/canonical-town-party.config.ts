import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: ['town-party.canonical.spec.ts', 'movement.canonical.spec.ts'], workers: 1, retries: 0, timeout: 60_000,
  outputDir: '../../test-results/canonical-town-party', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5221', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/click-navigation.config.ts --configLoader runner --host 127.0.0.1 --port 5221 --strictPort',
    url: 'http://127.0.0.1:5221', reuseExistingServer: false, cwd: process.cwd() },
});
