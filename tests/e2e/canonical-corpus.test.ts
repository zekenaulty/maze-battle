import { expect, type Browser, type TestInfo } from '@playwright/test';
import type {} from './canonical-corpus.fixture';
import { CORPUS_TIME } from './canonical-corpus.layout';
import { installCorpusControl } from './canonical-corpus.control';
export { test, expect } from '@playwright/test';
export async function corpusBrowser(browser: Browser, options: { controlled?: boolean } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
  const external: string[] = [], errors: string[] = [], origin = 'http://127.0.0.1:5266';
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    external.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  if (options.controlled) await context.addInitScript(installCorpusControl);
  await page.clock.setFixedTime(CORPUS_TIME);
  await page.goto(`${origin}/tests/e2e/canonical-corpus.html`);
  await page.waitForFunction(() => !!window.canonicalCorpus);
  return { page, async close() {
    try {
      await page.evaluate(() => window.canonicalCorpus?.stop());
      expect(external, 'No provider, service or WebSocket traffic').toEqual([]);
      expect(errors, 'No hidden browser errors').toEqual([]);
    } finally { await context.close(); }
  } };
}
export async function evidence(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}
