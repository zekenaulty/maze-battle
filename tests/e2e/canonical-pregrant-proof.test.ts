import { test as base, expect } from '@playwright/test';
import type {} from './canonical-pregrant-proof.fixture';
const origin = 'http://127.0.0.1:5268';
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
  await page.goto('/tests/e2e/canonical-pregrant-proof.html'); await page.waitForFunction(() => !!window.canonicalPregrantProof);
  await use(); await page.evaluate(() => window.canonicalPregrantProof?.stop());
  expect(forbidden, 'No service, provider, external HTTP, or WebSocket calls').toEqual([]); expect(errors).toEqual([]);
}, { auto: true }] });
export { expect };
