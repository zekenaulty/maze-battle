import { test as base, expect, type Page } from '@playwright/test';
import type {} from './canonical-granted-recovery.fixture';

const origin = 'http://127.0.0.1:5268';
export const test = base.extend<{ recoveryPage: void }>({ recoveryPage: [async ({ context, page }, use) => {
  const errors: string[] = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) throw Error('Unexpected real network: ' + url.href);
    if (url.pathname === '/@vite/client') return route.fulfill({ contentType: 'application/javascript', body: '' });
    return route.continue();
  });
  await boot(page);
  await use();
  await page.evaluate(() => window.canonicalGrantedRecovery.dispose());
  expect(errors).toEqual([]);
}, { auto: true }] });
export async function boot(page: Page) {
  await page.goto('/tests/e2e/canonical-granted-recovery.html');
  await page.waitForFunction(() => !!window.canonicalGrantedRecovery);
  return page.evaluate(() => window.canonicalGrantedRecovery.boot());
}
export async function ready(page: Page) {
  return page.evaluate(async () => {
    const c = window.canonicalGrantedRecovery, original = await c.seed(); c.closeTransport(); await c.attach(); return original;
  });
}
export async function state(page: Page) { return page.evaluate(() => window.canonicalGrantedRecovery.snapshot()); }
export { expect };
