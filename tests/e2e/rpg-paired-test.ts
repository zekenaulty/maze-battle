import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import type {} from './rpg-agentica-paired-fixture';

export const service = 'http://127.0.0.1:5092', provider = 'http://127.0.0.1:5093';
export const test = base.extend<{ audit: void }>({ audit: [async ({ page, context, request }, use, info) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (['http://127.0.0.1:5212', service].includes(new URL(route.request().url()).origin)) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket(/.*/, ws => {
    if (['ws://127.0.0.1:5212', 'ws://127.0.0.1:5092'].includes(new URL(ws.url()).origin)) ws.connectToServer();
    else { external.push(ws.url()); ws.close(); }
  });
  try { await use(); } finally {
    if (info.status !== info.expectedStatus) {
      const retained = await page.evaluate(() => window.rpgPaired?.snapshot()).catch(error => ({ error: String(error) }));
      await info.attach('retained-checkpoint', { contentType: 'application/json', body: JSON.stringify(retained) });
      const planner = await request.get(`${provider}/evidence`).then(response => response.json()).catch(error => ({ error: String(error) }));
      await info.attach('planner-checkpoint', { contentType: 'application/json', body: JSON.stringify(planner) });
    }
    await page.evaluate(() => window.rpgPaired?.close()).catch(() => {});
    await info.attach('environment', { contentType: 'application/json', body: JSON.stringify({ errors, external, browser: context.browser()!.version() }) });
    expect(errors).toEqual([]); expect(external).toEqual([]);
  }
}, { auto: true }] });
export const open = async (page: Page) => {
  await page.goto('/tests/e2e/rpg-agentica-paired-fixture.html'); await page.waitForFunction(() => !!window.rpgPaired);
};
export const snapshot = (page: Page) => page.evaluate(() => window.rpgPaired.snapshot());
export async function operations(request: APIRequestContext, sessionId: string) {
  const response = await request.get(`${service}/api/operations?hostId=maze-battle&sessionId=${encodeURIComponent(sessionId)}`);
  expect(response.ok()).toBe(true); return response.json();
}
export async function calls(request: APIRequestContext, scope: string) {
  const response = await request.get(`${provider}/evidence`); expect(response.ok()).toBe(true);
  const evidence = await response.json(); expect(evidence.errors).toEqual([]);
  return evidence.calls.filter((call: { scope: string }) => call.scope === scope);
}
