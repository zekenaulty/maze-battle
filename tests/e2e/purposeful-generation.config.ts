import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: '.', testMatch: 'purposeful-generation.spec.ts', workers: 1, retries: 0, timeout: 120_000,
  outputDir: '../../test-results/purposeful-generation',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../test-results/purposeful-generation/results.json', import.meta.url)) }]],
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5209 --strictPort',
    url: 'http://127.0.0.1:5209', reuseExistingServer: false, cwd: fileURLToPath(new URL('../../', import.meta.url)) },
  use: { baseURL: 'http://127.0.0.1:5209', viewport: { width: 1440, height: 960 }, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : undefined } });
