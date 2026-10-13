import { test as base } from '@playwright/test';
import type {} from './canonical-fixture';
export { expect } from '@playwright/test';
export const test = base.extend<{ canonicalReady: void }>({
  canonicalReady: [async ({ page }, use) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5209' ? route.continue() : route.abort());
    await page.goto('/tests/e2e/canonical-fixture.html');
    await page.waitForFunction(() => !!window.canonical);
    await use();
  }, { auto: true }],
});
