import { test as base, expect } from '@playwright/test';
import type {} from './canonical-verified-ack.fixture';
const origin = 'http://127.0.0.1:5243';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const external: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (route.request().url() === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-verified-ack.html'); await page.waitForFunction(() => !!window.verifiedAck);
  await use();
  expect(external, 'No provider or service attempts').toEqual([]); expect(errors, 'No hidden browser errors').toEqual([]);
}, { auto: true }] });
export { expect };
