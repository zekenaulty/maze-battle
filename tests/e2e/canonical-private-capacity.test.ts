import { test as base } from '@playwright/test';
import type {} from './canonical-private-capacity.fixture';
export { expect } from '@playwright/test';
export const test = base.extend<{ capacityReady: void }>({
  capacityReady: [async ({ page }, use) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5440' ? route.continue() : route.abort());
    await page.goto('/tests/e2e/canonical-private-capacity.html');
    await page.waitForFunction(() => !!window.privateCapacityFixture);
    await use();
  }, { auto: true }],
});
