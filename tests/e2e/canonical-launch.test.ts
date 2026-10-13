import { test as base } from '@playwright/test';
import type {} from './canonical-launch.fixture';
export { expect } from '@playwright/test';
export const test = base.extend<{ launchReady: void }>({ launchReady: [async ({ page }, use) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5234' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-launch.html'); await page.waitForFunction(() => !!window.canonicalLaunch); await use();
}, { auto: true }] });
