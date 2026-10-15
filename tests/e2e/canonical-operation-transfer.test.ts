import { test as base, expect, type Page } from '@playwright/test';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaOperationEntry, HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type {} from './canonical-operation-transfer.fixture';
const origin = 'http://127.0.0.1:5258';
export const test = base.extend<{ providerFree: void }>({ providerFree: [async ({ page, context }, use) => {
  const external: string[] = [], errors: string[] = [], consoleIssues: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleIssues.push(m.text()); });
  await context.route('**/*', route => {
    if (route.request().url() === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-operation-transfer.html'); await page.waitForFunction(() => !!window.canonicalOperationTransfer);
  await use(); await page.evaluate(() => window.canonicalOperationTransfer?.stop());
  expect(external, 'No WebSocket, provider or external requests').toEqual([]); expect(errors).toEqual([]);
  expect(consoleIssues.filter(s => !s.includes('net::ERR_FAILED') && !s.includes('409 (Conflict)')),
    'Only deliberately lost HTTP replies and injected service refusal may log errors').toEqual([]);
}, { auto: true }] });
export { expect };

/** Contract fixture, not a claim of real service execution. All browser SDK HTTP uses these routes. */
export async function service(page: Page, initial: AgenticaOperationEntry) {
  let entry = structuredClone(initial), lose = false, hold = false, capacity = false, release: (() => void) | undefined;
  let corrupt: ((value: AgenticaOperationEntry) => void) | undefined;
  const sent: HostOperationEvent[] = [];
  await page.route(`${origin}/api/operations?**`, route => route.fulfill({ json: [entry] }));
  await page.route(`${origin}/api/operations/events`, async route => {
    const e = route.request().postDataJSON() as HostOperationEvent, prior = entry.latestEvent;
    sent.push(structuredClone(e));
    if (capacity) { capacity = false; return route.fulfill({ status: 409, json: { code: 'operation.storage_limit', message: 'Fixture retention full' } }); }
    expect(e.hostId).toBe(entry.request.hostId); expect(e.sessionId).toBe(entry.request.sessionId);
    expect(e.actionId).toBe(entry.action.actionId); expect(e.operationId).toBe(entry.admission!.operation!.operationId);
    if (!prior || canonicalJson(e) !== canonicalJson(prior)) {
      expect(entry.state).toBe('parked'); expect(e.sequence).toBe((prior?.sequence ?? 0) + 1); expect(e.sessionEpoch).toBe(entry.activeEpoch);
      expect(e.observation.revision).toBeGreaterThanOrEqual(prior?.observation.revision ?? entry.admission!.afterRevision);
      if (e.kind === 'transfer') { expect(Number(e.nextSessionEpoch)).toBeGreaterThan(Number(entry.activeEpoch)); entry.activeEpoch = e.nextSessionEpoch!; }
      if (e.kind === 'cancelled' || e.kind === 'blocked') entry.state = e.kind;
      entry.latestEvent = structuredClone(e);
    }
    if (lose) { lose = false; return route.abort(); }
    const reply = structuredClone(entry); corrupt?.(reply); corrupt = undefined;
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
    return route.fulfill({ json: reply });
  });
  return { sent, get entry() { return structuredClone(entry); }, loseReply() { lose = true; },
    holdReply() { hold = true; }, releaseReply() { release?.(); },
    refuseCapacity() { capacity = true; },
    corruptReply(change: (value: AgenticaOperationEntry) => void) { corrupt = change; } };
}
export async function initialized(page: Page) {
  const seed = await page.evaluate(() => window.canonicalOperationTransfer.boot()), remote = await service(page, seed.entry);
  expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse())).toEqual({ status: 'confirmed' });
  expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse())).toEqual({ status: 'custody-confirmed' });
  const original = await page.evaluate(() => window.canonicalOperationTransfer.state());
  return { seed, remote, original };
}
export async function takeover(page: Page, seed: Awaited<ReturnType<typeof initialized>>['seed']) {
  await page.evaluate(() => window.canonicalOperationTransfer.stop());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalOperationTransfer);
  await page.evaluate(seed => window.canonicalOperationTransfer.resume(seed), seed);
}
export async function authorize(page: Page) {
  for (const expected of ['transfer-acknowledged', 'kernel-adopted', 'kernel-adopted', 'navigation-authorized'])
    expect((await page.evaluate(() => window.canonicalOperationTransfer.transferPulse())).status).toBe(expected);
}
