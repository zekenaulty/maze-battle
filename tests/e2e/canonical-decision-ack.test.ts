import { test as base, expect, type Page } from '@playwright/test';
import type {} from './canonical-decision-ack.fixture';
const origin = 'http://127.0.0.1:5264';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const forbidden: string[] = [], errors: string[] = [], console: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.push(m.text()); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    forbidden.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { forbidden.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-decision-ack.html'); await page.waitForFunction(() => !!window.canonicalDecisionAck);
  await use(); await page.evaluate(() => window.canonicalDecisionAck?.stop());
  expect(forbidden, 'No service, provider, external HTTP or WebSocket calls').toEqual([]); expect(errors).toEqual([]); expect(console).toEqual([]);
}, { auto: true }] });
export { expect };
export async function ready(page: Page, retain = true) {
  const seed = await page.evaluate(() => window.canonicalDecisionAck.boot());
  await page.evaluate(() => window.canonicalDecisionAck.prepare());
  const proof = await page.evaluate(() => window.canonicalDecisionAck.proof());
  if (retain) await page.evaluate(p => window.canonicalDecisionAck.claim(p), proof);
  return { seed, proof };
}
export async function reload(page: Page, seed: Awaited<ReturnType<typeof ready>>['seed'], resume = false) {
  await page.evaluate(() => window.canonicalDecisionAck.stop());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalDecisionAck);
  await page.evaluate(seed => window.canonicalDecisionAck.bind(seed), seed);
  if (resume) await page.evaluate(() => window.canonicalDecisionAck.resume());
}
