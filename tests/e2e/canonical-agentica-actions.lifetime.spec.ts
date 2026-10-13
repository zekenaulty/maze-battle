import { test, expect } from '@playwright/test';
import type {} from './canonical-agentica-actions.fixture';

let external: string[], errors: string[];
test.beforeEach(async ({ page, context }) => {
  external = []; errors = [];
  const origin = 'http://127.0.0.1:5236';
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (route.request().url() === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-agentica-actions.html');
  await page.waitForFunction(() => !!window.canonicalAgenticaActions);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.canonicalAgenticaActions?.stop());
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('old fresh pending permission cannot admit after same-owner stop/start', async ({ page }) => {
  const r = await page.evaluate(() => window.canonicalAgenticaActions.lifetime.pendingRestart());
  expect(r.signals).toEqual({ oldAborted: true, replaced: true, currentAborted: false, controlled: true });
  expect(r.restarted).toEqual(r.before);
  expect(r.attempted.error?.name).toBe('AbortError'); expect(r.attempted.value).toBeNull();
  expect(r.after).toEqual(r.before); expect(r.after.original!.result).toBeNull();
  expect(r.after.operation).toBeNull(); expect(r.after.destination).toBeNull();
});

test('negative control: discarding both lifetime fences permits the old pending admission', async ({ page }) => {
  const r = await page.evaluate(() => window.canonicalAgenticaActions.lifetime.pendingRestart(true));
  expect(r.restarted).toEqual(r.before); expect(r.signals.oldAborted).toBe(true);
  expect(r.attempted.error).toBeNull(); expect(r.attempted.value?.disposition).toBe('applied');
  expect(r.after.operation?.state).toBe('admitted'); expect(r.after.original?.result).toEqual(r.attempted.value);
  expect(r.after.head.revision).toBe(r.before.head.revision + 1);
  expect(r.after.head.checkpoint).toEqual(r.before.head.checkpoint);
});

for (const stage of ['reserve', 'effect'] as const) {
  test(`suspended post-await ${stage} submit cannot enter the restarted writer`, async ({ page }) => {
    const r = await page.evaluate(stage => window.canonicalAgenticaActions.lifetime.suspendedSubmit(stage), stage);
    expect(r.forwardedOriginalSignal).toBe(true); expect(r.signals.oldAborted).toBe(true);
    expect(r.restarted).toEqual(r.before);
    expect(r.attempted.error?.message).toBe('Discarded stale host lifetime'); expect(r.executorCalls).toBe(0);
    expect(r.after).toEqual(r.before); expect(r.after.operation).toBeNull(); expect(r.after.destination).toBeNull();
    if (stage === 'reserve') expect(r.after.original).toBeNull();
    else expect(r.after.original!.result).toBeNull();
  });
}

test('new hooks cannot mint freshness for retained pending but can execute a new action', async ({ page }) => {
  const r = await page.evaluate(() => window.canonicalAgenticaActions.lifetime.pendingColdHooks());
  expect(r.signals.oldAborted).toBe(true); expect(r.attempted.disposition).toBe('unresolved');
  expect(r.reconciled).toBeNull(); expect(r.after).toEqual(r.before);
  expect(r.after.operation).toBeNull(); expect(r.after.original!.result).toBeNull();
  expect(r.control.disposition).toBe('applied'); expect(r.fresh.operation?.state).toBe('admitted');
  expect(r.fresh.head.owner).toBe(r.before.head.owner); expect(r.fresh.head.epoch).toBe(r.before.head.epoch);
});

test('an effect already queued in the old lifetime never reaches its executor after restart', async ({ page }) => {
  const r = await page.evaluate(() => window.canonicalAgenticaActions.lifetime.queuedBeforeRestart());
  expect(r.signals.oldAborted).toBe(true); expect(r.signals.controlled).toBe(true);
  expect(r.barrier.error?.name).toBe('AbortError'); expect(r.attempted.error?.name).toBe('AbortError');
  expect(r.executorCalls).toBe(0); expect(r.after).toEqual(r.before);
  expect(r.after.operation).toBeNull(); expect(r.after.original!.result).toBeNull();
});

test('aborted old hooks retain completed load/save verification and exact read-only replay', async ({ page }) => {
  const r = await page.evaluate(() => window.canonicalAgenticaActions.lifetime.completedOldHooks());
  expect(r.signals.oldAborted).toBe(true); expect(r.result.disposition).toBe('applied');
  expect(r.loaded?.status).toBe('completed'); expect(r.loaded?.result).toEqual(r.result);
  expect(r.replay).toEqual(r.result); expect(r.reconciled).toEqual(r.result);
  expect(r.rejected.error?.message).toContain('SDK cannot manufacture a completed host effect');
  expect(r.after).toEqual(r.before);
});
