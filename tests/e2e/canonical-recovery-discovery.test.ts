import { test as base, expect } from '@playwright/test';
import type {} from './canonical-recovery-discovery.fixture';
const origin = 'http://127.0.0.1:5270';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const forbidden: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    forbidden.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { forbidden.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-recovery-discovery.html');
  await page.waitForFunction(() => !!window.canonicalRecoveryDiscovery);
  await use(); await page.evaluate(() => window.canonicalRecoveryDiscovery.stop());
  expect(forbidden).toEqual([]); expect(errors).toEqual([]);
}, { auto: true }] });
export { expect };
export function readOnly(result: { unchanged: boolean; modes: string[]; error?: string }) {
  expect(result.error).toBeUndefined(); expect(result.unchanged).toBe(true);
  expect(result.modes.length).toBeGreaterThan(0); expect(result.modes.every(mode => mode === 'readonly')).toBe(true);
}
