import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', workers: 1, timeout: 90_000, retries: 0,
  testMatch: ['pr1-capacity.spec.ts', 'd1-native-scale.spec.ts', 'pr1-custody.spec.ts',
    'game.spec.ts', 'refinement.spec.ts', 'inventory-refinement.spec.ts'],
  outputDir: '../../test-results/d1-regression',
  use: { baseURL: 'http://127.0.0.1:5202', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5202 --strictPort',
    url: 'http://127.0.0.1:5202', reuseExistingServer: false, cwd: process.cwd() },
});
