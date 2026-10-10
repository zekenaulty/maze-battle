import { expect, test } from '@playwright/test';
import type {} from './durable-action-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/durable-action-fixture.html');
  await page.waitForFunction(() => !!window.durable);
  await page.evaluate(() => window.durable.setup());
});

test('cross-page duplicate reservations and commits consume exactly one effect and ledger entry', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/tests/e2e/durable-action-fixture.html');
  await other.waitForFunction(() => !!window.durable);
  const reservations = await Promise.all([page, other].map(tab => tab.evaluate(async () => {
    const h = window.durable;
    return h.actions.beginExpeditionAction(h.slot, h.request());
  })));
  expect(reservations.map(value => value.status).sort()).toEqual(['existing', 'reserved']);
  const commits = await Promise.all([page, other].map(tab => tab.evaluate(async () => {
    const h = window.durable;
    return h.actions.settleExpeditionAction(h.slot, h.request(), h.outcome(h.fixture(), h.request()));
  })));
  expect(commits[0]).toEqual(commits[1]);
  const state = await page.evaluate(async () => {
    const h = window.durable;
    return { record: await h.repository.loadExpedition(h.slot), session: await h.actions.loadExpeditionSession(h.slot) };
  });
  expect(state.record!.checkpoint.revision).toBe(1);
  expect(state.session).toMatchObject({ receiptCount: 1, pendingActionId: null });
});

test('competing distinct actions and epoch claims admit exactly one winner', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/tests/e2e/durable-action-fixture.html');
  await other.waitForFunction(() => !!window.durable);
  const attempts = await Promise.all([page, other].map((tab, index) => tab.evaluate(async actionId => {
    const h = window.durable;
    try { await h.actions.beginExpeditionAction(h.slot, h.request({ actionId })); return 'reserved'; }
    catch { return 'rejected'; }
  }, `move-${index}`)));
  expect(attempts.sort()).toEqual(['rejected', 'reserved']);
  const claims = await Promise.all([page, other].map((tab, index) => tab.evaluate(async sessionId => {
    const h = window.durable;
    try { await h.actions.claimExpeditionSession(h.slot, sessionId, 0); return 'claimed'; }
    catch { return 'rejected'; }
  }, `owner-${index}`)));
  expect(claims.sort()).toEqual(['claimed', 'rejected']);
  const session = await page.evaluate(() => window.durable.actions.loadExpeditionSession(window.durable.slot));
  expect(session).toMatchObject({ epoch: 1, receiptCount: 1 });
  expect(session!.pendingActionId).not.toBeNull();
});

test('takeover racing settlement either follows the original commit or fences it, never partially applies', async ({ page, context }) => {
  await page.evaluate(() => window.durable.actions.beginExpeditionAction(window.durable.slot, window.durable.request()));
  const other = await context.newPage();
  await other.goto('/tests/e2e/durable-action-fixture.html');
  await other.waitForFunction(() => !!window.durable);
  const [settlement] = await Promise.all([
    page.evaluate(async () => {
      const h = window.durable;
      try { return await h.actions.settleExpeditionAction(h.slot, h.request(), h.outcome(h.fixture(), h.request())); }
      catch { return undefined; }
    }),
    other.evaluate(() => window.durable.actions.claimExpeditionSession(window.durable.slot, 'new-owner', 0)),
  ]);
  const state = await page.evaluate(async () => {
    const h = window.durable;
    return { record: await h.repository.loadExpedition(h.slot), receipt: await h.actions.loadExpeditionAction(h.slot, h.request()),
      session: await h.actions.loadExpeditionSession(h.slot) };
  });
  expect(state.session!.epoch).toBe(1);
  expect(state.record!.checkpoint.revision).toBe(settlement ? 1 : 0);
  expect(state.receipt!.result.disposition).toBe(settlement ? 'applied' : 'unresolved');
  expect(state.session!.pendingActionId).toBe(settlement ? null : 'move-1');
});
