import { expect, test } from '@playwright/test';
import type {} from './paged-topology-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/paged-topology-fixture.html'); await page.waitForFunction(() => Boolean(window.paged));
});

const cases = ['root-empty', 'root-promised', 'receipt', 'source-space', 'new-space', 'socket', 'bucket'] as const;
for (const kind of cases) test(`stored undefined/null/primitives in ${kind} reject without overwriting any record`, async ({ page }) => {
  const results = await page.evaluate(async kind => {
    const { api, setup, next, snapshot, openDB, trace } = window.paged;
    const values = [undefined, null, false, 0, '', true, 'corrupt'];
    const results = [];
    for (const [index, value] of values.entries()) {
      const slot = `corrupt-${index}`;
      let root = kind === 'root-empty' ? await api.loadTopologyHeader(slot) : await setup(slot);
      const original = kind === 'receipt' ? await next('original', slot) : undefined;
      if (original) root = await api.loadTopologyHeader(slot);
      const request = root && { scopeId: root.header.scopeId, expectedRevision: root.header.revision, requestId: 'original' };
      const store = kind.startsWith('root') ? 'roots' : kind === 'receipt' ? 'receipts'
        : kind.endsWith('space') ? 'spaces' : kind === 'socket' ? 'sockets' : 'buckets';
      const spaceId = kind === 'new-space' ? 'socket-0:room' : 'entry';
      const key: IDBValidKey = store === 'roots' ? slot : store === 'receipts' ? [slot, 'original']
        : store === 'spaces' ? [slot, spaceId] : store === 'sockets' ? [slot, 0]
          : (await snapshot()).records.find(record => record.store === 'buckets' && Array.isArray(record.key) && record.key[0] === slot)!.key;
      const db = await openDB(api.TOPOLOGY_DATABASE);
      await db.put(store, value, key); db.close();
      const before = await snapshot();
      const operations: (() => Promise<unknown>)[] = store === 'roots'
        ? [() => api.loadTopologyHeader(slot), () => setup(slot)]
        : store === 'receipts'
          ? [() => api.loadTopologyExpansionReceipt(slot, 'original'),
            () => api.expandTopologyNext(slot, original!.status === 'committed' ? original!.request : request!),
            () => api.expandTopologyNext(slot, request!)]
          : [() => store === 'spaces' ? api.loadTopologySpace(slot, spaceId) : store === 'sockets' ? api.loadTopologySocket(slot, 0)
            : api.topologyTransaction(tx => tx.get('buckets', key as [string, number, number])),
          () => api.expandTopologyNext(slot, request!)];
      const attempts = [];
      for (const operation of operations) attempts.push(await trace(async () => {
        try { await operation(); return 'accepted'; } catch (error) { return String(error); }
      }));
      const after = await snapshot();
      const verify = await openDB(api.TOPOLOGY_DATABASE);
      const stored = await verify.getAll(store, key, 1); verify.close();
      results.push({ value: String(value), store, attempts, unchanged: JSON.stringify(before) === JSON.stringify(after),
        present: stored.length === 1, same: Object.is(stored[0], value) });
    }
    return results;
  }, kind);
  expect(results).toHaveLength(7);
  for (const result of results) {
    expect(result.unchanged, result.value).toBe(true);
    expect(result.present, result.value).toBe(true);
    expect(result.same, result.value).toBe(true);
    for (const attempt of result.attempts) {
      expect(attempt.result, result.value).toContain(`Invalid stored topology ${result.store} record`);
      expect(attempt.methods).toEqual({ getAll: attempt.total });
      expect(attempt.total).toBeLessThanOrEqual(34);
      if (result.store === 'roots') expect(attempt.total).toBe(1);
    }
  }
});

test('read instrumentation counts exact-key getAll and get, and rejects range or unbounded scans', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, trace, openDB } = window.paged;
    await setup();
    const db = await openDB(api.TOPOLOGY_DATABASE);
    try {
      const measured = await trace(async () => {
        await db.get('roots', 'floor');
        await db.getAll('roots', 'floor', 1);
      });
      const rejected = [];
      for (const [key, count] of [[undefined, 1], ['floor', undefined], ['floor', 2], [IDBKeyRange.only('floor'), 1]] as const) {
        try { await trace(() => db.getAll('roots', key, count)); rejected.push(false); }
        catch (error) { rejected.push(String(error).includes('Unbounded host read: getAll')); }
      }
      return { measured, rejected };
    } finally { db.close(); }
  });
  expect(result.measured.reads).toEqual({ roots: 2 });
  expect(result.measured.methods).toEqual({ get: 1, getAll: 1 });
  expect(result.measured.total).toBe(2);
  expect(result.rejected).toEqual([true, true, true, true]);
});
