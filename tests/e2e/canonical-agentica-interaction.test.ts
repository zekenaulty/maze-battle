import { test as base, expect, type TestInfo } from '@playwright/test';
import type {} from './canonical-agentica-interaction.fixture';

const origin = 'http://127.0.0.1:5294';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const external: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    // A test must explicitly install the fake operation peer; no real local API is reachable.
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    external.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-agentica-interaction.html');
  await page.waitForFunction(() => !!window.canonicalAgenticaInteraction);
  try { await use(); }
  finally {
    await page.evaluate(() => window.canonicalAgenticaInteraction?.stop());
    expect(external, 'No SDK connect, unhandled API, or provider requests').toEqual([]);
    expect(errors, 'No hidden browser errors').toEqual([]);
  }
}, { auto: true }] });
export { expect };
export async function evidence(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}
