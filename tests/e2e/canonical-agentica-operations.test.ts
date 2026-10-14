import { test as base, expect } from '@playwright/test';
import type {} from './canonical-agentica-operations.fixture';
const origin = 'http://127.0.0.1:5242';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const external: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (route.request().url() === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-agentica-operations.html'); await page.waitForFunction(() => !!window.canonicalAgenticaOperations);
  await use(); await page.evaluate(() => window.canonicalAgenticaOperations?.stop());
  expect(external, 'No SDK transport or provider attempts').toEqual([]); expect(errors, 'No hidden browser errors').toEqual([]);
}, { auto: true }] });
export { expect };
