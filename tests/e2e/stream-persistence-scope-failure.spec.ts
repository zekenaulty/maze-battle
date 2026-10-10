import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-fixture';

test('UUID allocation respects root byte quota and a failed write can be retried without publishing an identity', async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-fixture.html'); await page.waitForFunction(() => Boolean(window.stream));
  const result = await page.evaluate(async () => {
    const { api, setup, raw, openDB, topology, recordBytes } = window.stream;
    await setup();
    const db = await openDB(topology.TOPOLOGY_DATABASE);
    const root = await db.get('roots', 'stream');
    const original = structuredClone(root);
    const otherBytes = (await raw()).bytes - recordBytes('roots', 'stream', root);
    root.quotaBytes = root.serializedBytes + 8;
    for (let index = 0; index < 8; index++) root.serializedBytes = otherBytes + recordBytes('roots', 'stream', root);
    await db.put('roots', root, 'stream');
    const before = await raw();
    let quotaError = '';
    try { await api.ensureStreamPublicScope('stream'); } catch (error) { quotaError = String(error); }
    const quotaUnchanged = JSON.stringify(before) === JSON.stringify(await raw());
    const absent = await api.getStreamPublicScope('stream');
    await db.put('roots', original, 'stream'); db.close();
    const beforeFailure = await raw(), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'roots') throw new DOMException('Injected public scope write failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let writeError = '';
    try { await api.ensureStreamPublicScope('stream'); } catch (error) { writeError = String(error); }
    finally { IDBObjectStore.prototype.put = put; }
    const writeUnchanged = JSON.stringify(beforeFailure) === JSON.stringify(await raw());
    const retry = await api.ensureStreamPublicScope('stream');
    const after = await raw();
    return { quotaError, quotaUnchanged, absent, writeError, writeUnchanged, retry,
      accounted: after.bytes === after.records.find(record => record.store === 'roots')!.value.serializedBytes };
  });
  expect(result.quotaError).toContain('quota'); expect(result.quotaUnchanged).toBe(true); expect(result.absent).toBeUndefined();
  expect(result.writeError).toContain('QuotaExceededError'); expect(result.writeUnchanged).toBe(true);
  expect(result.retry).toHaveLength(36); expect(result.accounted).toBe(true);
});
