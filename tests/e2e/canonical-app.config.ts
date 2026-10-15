import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../test-results/canonical-app/', import.meta.url));
export default defineConfig({
  testDir: fileURLToPath(new URL('./', import.meta.url)), testMatch: 'canonical-app*.spec.ts', workers: 1, retries: 0, timeout: 120_000,
  outputDir: output, reporter: [['list'], ['json', { outputFile: output + '/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5223', trace: 'retain-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-app.vite.ts --configLoader runner --host 127.0.0.1 --port 5223 --strictPort',
    url: 'http://127.0.0.1:5223', reuseExistingServer: false, cwd: root },
});
