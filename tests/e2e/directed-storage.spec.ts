import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

test('create and same-owner claims are durable and idempotent; only directed DB is opened', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage;
    const missing = await db.readDirectedSave('missing');
    const initial = await db.createDirectedSave('slot');
    const duplicate = await db.createDirectedSave('slot');
    const claimed = await db.claimDirectedSave('slot', 'owner');
    const again = await db.claimDirectedSave('slot', 'owner');
    return { missing, initial, duplicate, claimed, again, opens: window.directedOpens };
  });
  expect(result.missing).toBeUndefined(); expect(result.duplicate).toEqual(result.initial);
  expect(result.again).toEqual(result.claimed); expect(result.claimed.epoch).toBe(result.initial.epoch + 1);
  expect(new Set(result.opens)).toEqual(new Set(['maze-battle-directed-v1']));
  await page.reload();
  const stored = await page.evaluate(() => window.directedStorage.readDirectedSave('slot'));
  expect(stored).toEqual(result.claimed);
});

test('atomic receipt replay and reconciliation survive reload and takeover', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'look-1', { type: 'look' });
    const receipt = await db.executeDirectedRequest('fixture', request, 100);
    const audit = await db.auditDirectedSave('fixture');
    const replay = await db.executeDirectedRequest('fixture', request, 999);
    const same = await db.auditDirectedSave('fixture');
    await db.claimDirectedSave('fixture', 'owner-b');
    return { request, receipt, replay, audit, same };
  });
  expect(result.receipt.result.status).toBe('applied'); expect(result.replay).toEqual(result.receipt);
  expect(result.same).toEqual(result.audit);
  await page.reload();
  const recovery = await page.evaluate(async request => {
    const db = window.directedStorage;
    return [await db.reconcileDirectedRequest('fixture', request), await db.executeDirectedRequest('fixture', request, 300)];
  }, result.request);
  expect(recovery).toEqual([result.receipt, result.receipt]);
});

test('attempt collisions, runtime nulls, and stale fences never write', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'attempt', { type: 'look' });
    await db.executeDirectedRequest('fixture', request, 100);
    const before = await db.auditDirectedSave('fixture');
    const errors: string[] = [];
    for (const malformed of [null, { ...request, command: { type: 'interact', featureId: 'V' } }, { ...request, epoch: NaN }]) {
      try { await db.executeDirectedRequest('fixture', malformed as typeof request, 100); }
      catch (error) { errors.push(String(error)); }
    }
    const current = await db.request('fixture', 'fresh', { type: 'look' });
    const stale = [];
    for (const fields of [{ owner: 'other' }, { epoch: current.epoch - 1 }, { expectedRevision: current.expectedRevision - 1 }]) {
      stale.push(await db.executeDirectedRequest('fixture', { ...current, ...fields }, 100));
    }
    const unknown = await db.reconcileDirectedRequest('fixture', current);
    return { errors, stale, unknown, before, after: await db.auditDirectedSave('fixture') };
  });
  expect(result.errors).toHaveLength(3); expect(result.unknown).toBeUndefined();
  expect(result.stale.map(value => value.result.reason)).toEqual(['stale-owner', 'stale-epoch', 'stale-revision']);
  expect(result.after).toEqual(result.before);
});

test('context ID replays originally presented bytes; purpose collision never rewrites', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const original = await db.captureDirectedContext('fixture', 'context-1', 'human-view');
    const prior = await db.auditDirectedSave('fixture');
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'look', { type: 'look' }), 100);
    const replay = await db.captureDirectedContext('fixture', 'context-1', 'human-view');
    let error = '';
    try { await db.captureDirectedContext('fixture', 'context-1', 'decision-fixture'); } catch (caught) { error = String(caught); }
    const fresh = await db.captureDirectedContext('fixture', 'context-2', 'human-view');
    const audit = await db.auditDirectedSave('fixture');
    const independent = audit.world !== audit.session.world;
    return { original, replay, fresh, error, independent, prior, audit };
  });
  expect(result.replay).toEqual(result.original); expect(result.error).toContain('context ID payload conflict');
  expect(result.fresh.knowledgeRevision).toBeGreaterThan(result.original.knowledgeRevision);
  expect(result.original.json).not.toContain('Hidden Trap'); expect(result.independent).toBe(true);
  expect(result.audit.observations.slice(0, result.prior.observations.length)).toEqual(result.prior.observations);
  expect(result.audit.projections.slice(0, result.prior.projections.length)).toEqual(result.prior.projections);
});
