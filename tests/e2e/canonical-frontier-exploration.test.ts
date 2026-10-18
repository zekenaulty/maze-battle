import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import type {} from './canonical-frontier-exploration.entry';
export { expect } from '@playwright/test';

export async function openExploration(page: Page) {
  const forbidden: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === 'http://127.0.0.1:5291') return route.continue();
    forbidden.push(url); return route.abort();
  });
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://127.0.0.1:5291') socket.connectToServer();
    else { forbidden.push(socket.url()); socket.close(); }
  });
  await page.goto('http://127.0.0.1:5291/tests/e2e/canonical-frontier-exploration.html');
  await page.waitForFunction(() => !!window.canonicalFrontierExploration);
  return () => { expect(forbidden, 'No outbound provider/service traffic').toEqual([]); expect(errors).toEqual([]); };
}
export async function reloadExploration(page: Page) {
  await page.reload(); await page.waitForFunction(() => !!window.canonicalFrontierExploration);
}
export async function attachEvidence(info: TestInfo, name: string, evidence: unknown) {
  await info.attach(name, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
}
export const test = base.extend<{ explorationReady: void }>({ explorationReady: [async ({ page }, use) => {
  const audit = await openExploration(page);
  try { await use(); } finally { audit(); }
}, { auto: true }] });
