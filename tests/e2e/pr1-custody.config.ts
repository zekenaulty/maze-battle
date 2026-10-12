import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: ['pr1-custody.spec.ts', 'game.spec.ts', 'refinement.spec.ts', 'inventory-refinement.spec.ts'], workers: 2,
  outputDir: '../../test-results/pr1-custody',
  use: { baseURL: 'http://127.0.0.1:5176', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176', reuseExistingServer: true },
});
