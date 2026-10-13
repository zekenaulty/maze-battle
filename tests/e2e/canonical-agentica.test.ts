import { test as base } from '@playwright/test';
import type {} from './canonical-agentica.fixture';
export { expect } from '@playwright/test';
export const test = base.extend<{ recordsReady: void }>({
  recordsReady: [async ({ page }, use) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5231' ? route.continue() : route.abort());
    await page.goto('/tests/e2e/canonical-agentica.html');
    await page.waitForFunction(() => !!window.agenticaRecords); await use();
  }, { auto: true }],
});
