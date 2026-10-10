import { expect, test } from '@playwright/test';
import type {} from './paged-topology-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/paged-topology-fixture.html'); await page.waitForFunction(() => Boolean(window.paged));
});

test('byte quota abort retains every reservation, prior receipt and all original records', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, snapshot, next } = window.paged;
    await window.paged.setup('floor', 24_000);
    let first;
    for (let step = 0; step < 20; step++) {
      const before = await snapshot();
      try { const outcome = await next(`step-${step}`); first ??= outcome; }
      catch (error) {
        if (!first || first.status !== 'committed') throw new Error('Quota test never committed an action');
        const after = await snapshot();
        const root = (await api.loadTopologyHeader('floor'))!;
        return { error: String(error), equal: JSON.stringify(before) === JSON.stringify(after), root,
          bytes: after.bytes, first, replay: await api.expandTopologyNext('floor', first.request),
          unresolved: await api.loadTopologySocket('floor', root.header.nextSocket),
          absent: await api.loadTopologyExpansionReceipt('floor', `step-${step}`),
          pendingCount: after.records.filter(record => record.store === 'sockets' && record.value.status === 'pending').length };
      }
    }
    throw new Error('Expected byte quota failure');
  });
  expect(result.error).toContain('serialized-byte quota');
  expect(result.equal).toBe(true);
  expect(result.root.serializedBytes).toBe(result.bytes);
  expect(result.root.serializedBytes).toBeLessThanOrEqual(24_000);
  expect(result.unresolved?.status).toBe('pending');
  expect(result.pendingCount).toBe(result.root.header.socketCount - result.root.header.nextSocket);
  expect(result.absent).toBeUndefined();
  expect(result.replay).toEqual(result.first);
});

for (const failedStore of ['receipts', 'roots']) test(`native ${failedStore} failure rolls back links, occupancy, counters and receipt`, async ({ page }) => {
  const result = await page.evaluate(async failedStore => {
    await window.paged.setup();
    const before = await window.paged.snapshot();
    const prototype = IDBObjectStore.prototype;
    const put = prototype.put;
    let writes = 0, error = '';
    prototype.put = function (...args) {
      writes++;
      if (this.name === failedStore) throw new DOMException('Injected disk quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { await window.paged.next('abort-me'); } catch (value) { error = String(value); }
    finally { prototype.put = put; }
    const after = await window.paged.snapshot();
    const absent = await window.paged.api.loadTopologyExpansionReceipt('floor', 'abort-me');
    const retry = await window.paged.next('abort-me');
    return { error, writes, equal: JSON.stringify(before) === JSON.stringify(after), absent, retry };
  }, failedStore);
  expect(result.error).toContain('QuotaExceededError');
  expect(result.writes).toBeGreaterThan(5);
  expect(result.equal).toBe(true);
  expect(result.absent).toBeUndefined();
  expect(result.retry.status).toBe('committed');
  if (result.retry.status === 'committed') expect(result.retry.header.revision).toBe(1);
});

test('failed creation is atomic; invalid limits and requests cannot change storage', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const errors: string[] = [];
    for (const quota of [1024, 1, Infinity, window.paged.api.MAX_TOPOLOGY_QUOTA + 1]) {
      try { await window.paged.setup('small', quota); } catch (error) { errors.push(String(error)); }
    }
    const absent = await window.paged.api.loadTopologyHeader('small');
    await window.paged.setup();
    const before = await window.paged.snapshot();
    const root = (await window.paged.api.loadTopologyHeader('floor'))!;
    for (const request of [
      { scopeId: root.header.scopeId, expectedRevision: 0, requestId: '' },
      { scopeId: root.header.scopeId, expectedRevision: -1, requestId: 'invalid' },
      { scopeId: 'other', expectedRevision: 0, requestId: 'foreign' },
    ]) { try { await window.paged.api.expandTopologyNext('floor', request); } catch (error) { errors.push(String(error)); } }
    return { errors, absent, equal: JSON.stringify(before) === JSON.stringify(await window.paged.snapshot()) };
  });
  expect(result.errors).toHaveLength(7);
  expect(result.absent).toBeUndefined();
  expect(result.equal).toBe(true);
});

test('corrupt local occupancy fails closed without consuming a promised socket', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.paged.setup();
    const { records } = await window.paged.snapshot();
    const bucket = records.find(record => record.store === 'buckets' && record.value.length)!;
    const db = await window.paged.openDB(window.paged.api.TOPOLOGY_DATABASE);
    await db.put('buckets', [...bucket.value, { ...bucket.value[0], id: 'overlap' }], bucket.key); db.close();
    const before = await window.paged.snapshot();
    let error = '';
    try { await window.paged.next('corrupt'); } catch (value) { error = String(value); }
    return { error, equal: JSON.stringify(before) === JSON.stringify(await window.paged.snapshot()),
      root: await window.paged.api.loadTopologyHeader('floor'), socket: await window.paged.api.loadTopologySocket('floor', 0) };
  });
  expect(result.error).toContain('Overlapping occupancy');
  expect(result.equal).toBe(true);
  expect(result.root?.header.revision).toBe(0);
  expect(result.socket?.status).toBe('pending');
});
