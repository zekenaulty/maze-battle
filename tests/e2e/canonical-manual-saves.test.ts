import { test as base } from '@playwright/test';
import type {} from './canonical-manual-saves.fixture';
export { expect } from '@playwright/test';
export const test = base.extend<{ savesReady: void }>({
  savesReady: [async ({ page }, use) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5222' ? route.continue() : route.abort());
    await page.goto('/tests/e2e/canonical-manual-saves.html');
    await page.waitForFunction(() => !!window.manualSaves); await use();
  }, { auto: true }],
});
