import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import type {} from './canonical-interaction.fixture';
export { expect } from '@playwright/test';

export async function reloadInteraction(page: Page) {
  await page.reload(); await page.waitForFunction(() => !!window.canonicalInteraction);
}
export async function evidence(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}
export const test = base.extend<{ interactionReady: void }>({ interactionReady: [async ({ page }, use) => {
  const forbidden: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === 'http://127.0.0.1:5293') return route.continue();
    forbidden.push(url); return route.abort();
  });
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://127.0.0.1:5293') socket.connectToServer();
    else { forbidden.push(socket.url()); socket.close(); }
  });
  await page.goto('/tests/e2e/canonical-interaction.html');
  await page.waitForFunction(() => !!window.canonicalInteraction);
  try { await use(); } finally {
    expect(forbidden, 'No outbound provider/service traffic').toEqual([]); expect(errors).toEqual([]);
  }
}, { auto: true }] });
