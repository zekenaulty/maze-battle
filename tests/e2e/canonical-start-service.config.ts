import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { browserOrigin } from '../agentica-start-service/service.mjs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: '.', testMatch: /canonical-start-service(?:\.app-start|\.app-continue|\.app-adopt|\.app-frontier|\.app-room|\.app-room-journey|\.active-journey|\.app-history|\.app-chest|\.app-return|\.app-corpus|\.app-planner|\.corpus-recovery|\.corpus-delivery|\.corpus-preacceptance|\.corpus-preack|\.app-journal|\.app-recovery|\.app-pending|\.transfer|\.decision(?:-recovery|-stop|-adoption|-adoption-replay|-adoption-restart|-reload|-pending|-pending-replay|-pending-interim)?)?\.spec\.ts$/, workers: 1, retries: 0, timeout: 60_000,
  tsconfig: './canonical-start-service.tsconfig.json', outputDir: '../../test-results/canonical-start-service',
  reporter: [['list'], ['json']],
  use: { baseURL: browserOrigin, serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-start-service.vite.ts --configLoader runner',
    url: browserOrigin + '/tests/e2e/canonical-start-service.html', reuseExistingServer: false, cwd: process.cwd(),
  },
});
