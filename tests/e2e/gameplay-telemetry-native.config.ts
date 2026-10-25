import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const run = process.env.MAZE_TELEMETRY_RUN ??= `r5-telemetry-native-${Date.now()}`;
export default defineConfig({ testDir: '.', testMatch: 'gameplay-telemetry-native.spec.ts', workers: 1, retries: 0, timeout: 60_000,
  metadata: { sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    trackedDelta: execFileSync('git', ['diff', 'HEAD', '--name-only'], { encoding: 'utf8' }).trim(), runtime: process.version },
  tsconfig: './gameplay-telemetry-native.tsconfig.json', outputDir: resolve('test-results', run),
  reporter: [['list'], ['json', { outputFile: resolve('test-results', run, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:5581', serviceWorkers: 'block', trace: 'retain-on-failure',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/e2e/gameplay-telemetry-native.vite.ts --configLoader runner',
    url: 'http://127.0.0.1:5581/tests/e2e/gameplay-telemetry-native.html', reuseExistingServer: false, cwd: process.cwd() },
});
