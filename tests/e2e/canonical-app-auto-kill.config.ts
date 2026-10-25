import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.AUTO_KILL_OUTPUT ?? `${root}/test-results/app-auto-kill-d189639`;
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: fileURLToPath(new URL('./', import.meta.url)), testMatch: 'canonical-app-auto-kill.spec.ts',
  workers: 1, retries: 0, timeout: 600_000, outputDir: `${output}/artifacts`,
  reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
  use: { baseURL: 'http://127.0.0.1:5496', actionTimeout: 10_000, trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-app-auto-kill.vite.ts --configLoader runner --host 127.0.0.1 --port 5496 --strictPort',
    url: 'http://127.0.0.1:5496', reuseExistingServer: false, cwd: root },
});
