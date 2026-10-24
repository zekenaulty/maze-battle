import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const output = resolve('test-results', process.env.MAZE_ENDURANCE_RUN ?? 'canonical-generated-endurance');
export default defineConfig({
  testDir: '.', testMatch: 'canonical-generated-endurance.*.spec.ts', workers: 1, retries: 0,
  timeout: 600_000, tsconfig: './canonical-generated-endurance.tsconfig.json',
  outputDir: resolve(output, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: resolve(output, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5474', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/canonical-generated-endurance.vite.ts --configLoader runner --host 127.0.0.1 --port 5474 --strictPort',
    url: 'http://127.0.0.1:5474', reuseExistingServer: false, cwd: resolve('.') },
});
