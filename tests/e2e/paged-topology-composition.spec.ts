import { expect, test } from '@playwright/test';
import type {} from './paged-topology-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/paged-topology-fixture.html'); await page.waitForFunction(() => Boolean(window.paged));
});

test('a later prepare-command phase can abort staged topology and its receipt in the same transaction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, snapshot } = window.paged;
    const root = await setup();
    const request = { scopeId: root.header.scopeId, expectedRevision: 0, requestId: 'prepare' };
    const before = await snapshot();
    let error = '', stagedRevision = -1, stagedReceipt = false;
    try {
      await api.topologyTransaction(async tx => {
        const receipt = await api.expandTopologyInTransaction(tx, 'floor', request);
        if (receipt.status !== 'committed') throw new Error('Expected prepared expansion');
        stagedRevision = (await tx.get('roots', 'floor'))!.header.revision;
        stagedReceipt = Boolean(await tx.get('receipts', ['floor', request.requestId]));
        // A future checkpoint/knowledge/command participant validates and stages here.
        throw new Error('Later prepare phase rejected');
      });
    } catch (value) { error = String(value); }
    const after = await snapshot();
    const missingReceipt = await api.loadTopologyExpansionReceipt('floor', request.requestId);
    const retry = await api.expandTopologyNext('floor', request);
    return { error, stagedRevision, stagedReceipt, equal: JSON.stringify(before) === JSON.stringify(after), missingReceipt, retry };
  });
  expect(result.error).toContain('Later prepare phase rejected');
  expect(result.stagedRevision).toBe(1);
  expect(result.stagedReceipt).toBe(true);
  expect(result.equal).toBe(true);
  expect(result.missingReceipt).toBeUndefined();
  expect(result.retry.status).toBe('committed');
});

test('composed callers cannot mutate staged snapshots or invalidate byte accounting through returned values', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, snapshot } = window.paged;
    const root = await setup();
    const request = { scopeId: root.header.scopeId, expectedRevision: 0, requestId: 'prepare' };
    await api.topologyTransaction(async tx => {
      const receipt = await api.expandTopologyInTransaction(tx, 'floor', request);
      if (receipt.status !== 'committed') throw new Error('Expected commit');
      receipt.header.rooms = -999;
      const space = (await tx.get('spaces', ['floor', 'socket-0:room']))!;
      space.space.spec.chests.length = 0;
      const pending = (await tx.get('receipts', ['floor', 'prepare']))!;
      pending.request.requestId = 'mutated';
    });
    return { root: await api.loadTopologyHeader('floor'), receipt: await api.loadTopologyExpansionReceipt('floor', 'prepare'),
      room: await api.loadTopologySpace('floor', 'socket-0:room'), bytes: (await snapshot()).bytes };
  });
  expect(result.root?.header.rooms).toBe(2);
  expect(result.root?.serializedBytes).toBe(result.bytes);
  expect(result.room?.space.spec.chests).toHaveLength(1);
  expect(result.receipt?.request.requestId).toBe('prepare');
  expect(result.receipt?.header.rooms).toBe(2);
});
