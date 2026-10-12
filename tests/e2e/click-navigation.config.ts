import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: ['click-navigation.spec.ts', 'click-perception.spec.ts'], workers: 1, retries: 0,
  timeout: 45_000, outputDir: '../../test-results/click-navigation',
  reporter: [['list'], ['json', { outputFile: '../../test-results/click-navigation/browser-results.json' }]],
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js --config tests/click-navigation.config.ts --configLoader runner --host 127.0.0.1 --port 5203 --strictPort',
    url: 'http://127.0.0.1:5203', reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:5203', browserName: 'chromium',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
