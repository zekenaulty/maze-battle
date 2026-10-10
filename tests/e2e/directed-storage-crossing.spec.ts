import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

test('new local opening recovers navigation and preserves collision history and exact contexts after reload', async ({ page }) => {
  const source = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setupRecovery();
    const context = await db.captureDirectedContext('fixture', 'blocked-view', 'human-view');
    const before = await db.auditDirectedSave('fixture');
    await db.setRecoveryGate('fixture', 'open', false);
    const request = await db.request('fixture', 'opening-look', { type: 'look' });
    const receipt = await db.executeDirectedRequest('fixture', request, 300);
    return { before, context, request, receipt };
  });
  await page.reload();
  const result = await page.evaluate(async source => {
    const db = window.directedStorage;
    const recovered = await db.auditDirectedSave('fixture');
    const replay = await db.executeDirectedRequest('fixture', source.request, 999);
    const replayAudit = await db.auditDirectedSave('fixture');
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'new-trip', { type: 'navigate', operationId: 'new-trip',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), 1000);
    for (let index = 0; index < 64; index++) {
      const current = (await db.readDirectedSave('fixture'))!;
      if (current.operation?.status !== 'running') break;
      await db.executeDirectedRequest('fixture', await db.request('fixture', `new-step-${index}`, {
        type: 'step', operationId: 'new-trip', sequence: current.operation.nextStep }), 1001 + index);
    }
    return { recovered, replay, replayAudit, final: await db.auditDirectedSave('fixture'),
      context: await db.captureDirectedContext('fixture', 'blocked-view', 'human-view') };
  }, source);
  expect(result.recovered.session.knowledge.blockedEdges).toEqual({});
  expect(result.recovered.observations.at(-1)?.scene.crossingRecovery?.edges).toHaveLength(1);
  expect(result.replay).toEqual(source.receipt); expect(result.replayAudit).toEqual(result.recovered);
  expect(result.context).toEqual(source.context);
  expect(result.final.observations.slice(0, source.before.observations.length)).toEqual(source.before.observations);
  expect(result.final.projections.slice(0, source.before.projections.length)).toEqual(source.before.projections);
  expect(result.final.session.operation?.status).toBe('arrived');
  expect(result.final.world!.features.V.state).toBe('idle');
});

test('physical retry reconciles a lost acknowledgment after reload and takeover without a second move', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setupRecovery();
    await db.setRecoveryGate('fixture', 'open');
    const request = await db.request('fixture', 'retry', { type: 'retry-crossing', to: { spaceId: 'W', row: 0, column: 1 } });
    const before = await db.auditDirectedSave('fixture');
    await db.executeDirectedRequest('fixture', request, 300).then(() => { throw new Error('Lost acknowledgment'); }).catch(() => {});
    const pending = await db.request('fixture', 'revoked', { type: 'look' });
    await db.claimDirectedSave('fixture', 'owner-b');
    return { request, pending, before };
  });
  await page.reload();
  const result = await page.evaluate(async original => {
    const db = window.directedStorage;
    const before = await db.auditDirectedSave('fixture');
    const reconciled = await db.reconcileDirectedRequest('fixture', original.request);
    const replay = await db.executeDirectedRequest('fixture', original.request, 999);
    const stale = await db.executeDirectedRequest('fixture', original.pending, 1000);
    return { before, reconciled, replay, stale, after: await db.auditDirectedSave('fixture') };
  }, original);
  expect(result.reconciled?.eventIds).toHaveLength(1);
  expect(result.replay).toEqual(result.reconciled); expect(result.after).toEqual(result.before);
  expect(result.before.events).toHaveLength(original.before.events.length + 1);
  expect(result.before.session.actor.position).toEqual({ spaceId: 'W', row: 0, column: 1 });
  expect(result.before.session.operation?.status).toBe('interrupted');
  expect(result.stale.result.reason).toBe('stale-owner');
  expect(JSON.stringify(result.before.observations.at(-1)?.scene)).not.toContain('recoveryGate');
});

test('unchanged collision survives retry and reload; a fresh attempt after cancellation cannot restart travel', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setupRecovery();
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'retreat', { type: 'navigate', operationId: 'retreat',
      target: { kind: 'cell', address: { spaceId: 'H', row: 2, column: 2 }, arrival: 'occupy' } }), 250);
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'cancel-retreat', { type: 'cancel', operationId: 'retreat' }), 251);
    const retry = await db.request('fixture', 'still-blocked', { type: 'retry-crossing', to: { spaceId: 'W', row: 0, column: 1 } });
    const result = await db.executeDirectedRequest('fixture', retry, 300);
    return { result, audit: await db.auditDirectedSave('fixture') };
  });
  expect(before.result.eventIds).toEqual([]);
  expect(before.result.result.operation?.status).toBe('cancelled');
  await page.reload();
  expect(await page.evaluate(() => window.directedStorage.auditDirectedSave('fixture'))).toEqual(before.audit);
  expect(Object.keys(before.audit.session.knowledge.blockedEdges!)).toHaveLength(1);
});
