import { test, expect } from '@playwright/test';
import type {} from './storage-baseline-fixture';

for (const depth of [1, 32, 256, 512]) test(`native ordinary-game baseline at ${depth} retained floors`, async ({ page, context }, info) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5208') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto('/tests/e2e/storage-baseline-fixture.html');
  await page.waitForFunction(() => !!window.storageBaseline);
  const result = await page.evaluate(value => window.storageBaseline.run(value), depth);
  await info.attach('native-storage-baseline', { contentType: 'application/json', body: JSON.stringify({ ...result, browser: context.browser()!.version() }, null, 2) });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  for (const sample of result.samples) {
    expect(sample.operations.every(o => o.status === 'success')).toBe(true);
    expect(sample.transactions.every(t => t.outcome === 'complete')).toBe(true);
    expect(sample.operations.filter(o => o.store === 'saves' && o.method === 'put')).toHaveLength(1);
  }
});
