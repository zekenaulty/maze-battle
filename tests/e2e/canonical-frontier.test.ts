import { test as base } from '@playwright/test';
import type {} from './canonical-frontier.fixture';
export { expect } from '@playwright/test';

export const test = base.extend<{ frontierReady: void }>({ frontierReady: [async ({ page }, use) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5290' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-frontier.html');
  await page.waitForFunction(() => !!window.canonicalFrontier);
  await use();
}, { auto: true }] });
