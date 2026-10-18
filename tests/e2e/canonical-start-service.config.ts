import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: /canonical-start-service(?:\.app-start|\.app-continue|\.app-adopt|\.app-recovery|\.app-pending|\.transfer|\.decision(?:-recovery|-stop|-adoption|-adoption-replay|-adoption-restart|-reload|-pending|-pending-replay|-pending-interim)?)?\.spec\.ts$/, workers: 1, retries: 0, timeout: 60_000,
  tsconfig: './canonical-start-service.tsconfig.json', outputDir: '../../test-results/canonical-start-service',
  reporter: [['list'], ['json']],
  use: { baseURL: 'http://127.0.0.1:5258', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-start-service.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5258/tests/e2e/canonical-start-service.html', reuseExistingServer: false, cwd: process.cwd(),
  },
});
