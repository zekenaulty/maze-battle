import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import type {} from './canonical-exploration-prefix.entry';
export { expect } from '@playwright/test';

export async function reload(page: Page) {
  await page.reload(); await page.waitForFunction(() => !!window.canonicalExplorationPrefix);
}
export async function attach(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}
export const test = base.extend<{ prefixReady: void }>({ prefixReady: [async ({ page }, use) => {
  const forbidden: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5418') return route.continue();
    forbidden.push(route.request().url()); return route.abort();
  });
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://127.0.0.1:5418') { socket.connectToServer(); return; }
    forbidden.push(socket.url()); socket.close();
  });
  await page.goto('http://127.0.0.1:5418/tests/e2e/canonical-exploration-prefix.html');
  await page.waitForFunction(() => !!window.canonicalExplorationPrefix);
  try { await use(); } finally { expect(forbidden, 'No provider/service traffic').toEqual([]); expect(errors).toEqual([]); }
}, { auto: true }] });
