import { test as base, expect, type Page } from '@playwright/test';
import type {} from './canonical-decision.fixture';
const origin = 'http://127.0.0.1:5262';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const forbidden: string[] = [], errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    forbidden.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { forbidden.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-decision.html'); await page.waitForFunction(() => !!window.canonicalDecision);
  await use(); await page.evaluate(() => window.canonicalDecision?.stop());
  expect(forbidden, 'No service, provider, external HTTP, or WebSocket calls').toEqual([]); expect(errors).toEqual([]);
}, { auto: true }] });
export { expect };
export async function arrived(page: Page) {
  const seed = await page.evaluate(() => window.canonicalDecision.boot());
  for (let i = 1; i <= 3; i++) {
    const progress = await page.evaluate(() => window.canonicalDecision.advance());
    expect(progress.steps).toBe(i); expect(progress.sequence).toBe(i); expect(progress.status).toBe(i === 3 ? 'arrived' : 'running');
  }
  await page.evaluate(() => window.canonicalDecision.settle()); return seed;
}
export async function prepare(page: Page) {
  await page.evaluate(async () => { const c = window.canonicalDecision; await c.prepare(await c.publish()); });
  return page.evaluate(() => window.canonicalDecision.state());
}
export async function reload(page: Page, seed: Awaited<ReturnType<typeof arrived>>) {
  await page.evaluate(() => window.canonicalDecision.stop());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalDecision);
  await page.evaluate(seed => window.canonicalDecision.bind(seed), seed);
}
