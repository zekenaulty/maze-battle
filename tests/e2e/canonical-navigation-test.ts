import { test as base } from '@playwright/test';
import type {} from './canonical-navigation.fixture';
export { expect } from '@playwright/test';
export const test = base.extend<{ navigationReady: void }>({ navigationReady: [async ({ page }, use) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5222' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-navigation.html'); await page.waitForFunction(() => !!window.canonicalNavigation); await use();
}, { auto: true }] });
