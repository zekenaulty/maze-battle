import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: fileURLToPath(new URL('./', import.meta.url)), testMatch: ['app-recovery.spec.ts', 'app-recovery-spatial.spec.ts', 'canonical-app.spec.ts'],
  workers: 1, retries: 0, timeout: 120_000, outputDir: root + '/test-results/app-recovery',
  reporter: [['list'], ['json', { outputFile: root + '/test-results/app-recovery/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5288', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/app-recovery.vite.ts --configLoader runner --host 127.0.0.1 --port 5288 --strictPort',
    url: 'http://127.0.0.1:5288', reuseExistingServer: false, cwd: root },
});
