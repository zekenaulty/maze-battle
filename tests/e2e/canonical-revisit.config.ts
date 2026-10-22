import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL(`../../test-results/${process.env.MAZE_REVISIT_RUN ?? 'canonical-revisit'}/`, import.meta.url));
export default defineConfig({
  testDir: fileURLToPath(new URL('./', import.meta.url)), testMatch: 'canonical-revisit*.spec.ts',
  workers: 1, retries: 0, timeout: 240_000, outputDir: output,
  reporter: [['list'], ['json', { outputFile: output + '/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5277', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-revisit.vite.ts --configLoader runner --host 127.0.0.1 --port 5277 --strictPort',
    url: 'http://127.0.0.1:5277', reuseExistingServer: false, cwd: root },
});
