import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-fixture.html'); await page.waitForFunction(() => Boolean(window.stream));
});

test('prepare quota abort preserves topology promises, checkpoint, knowledge and both receipt stores', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, topology, setup, request, raw } = window.stream;
    await setup(undefined, 'probe0');
    const quota = (await topology.loadTopologyHeader('probe0'))!.serializedBytes + 512;
    const initial = await setup(quota);
    const input = await request({ type: 'prepare', frontierId: initial.snapshot.room.sockets[0].id }, 'quota');
    const before = await raw();
    let error = '';
    try { await api.executeStreamAction('stream', input); } catch (value) { error = String(value); }
    return { error, unchanged: JSON.stringify(before) === JSON.stringify(await raw()),
      action: await api.loadStreamAction('stream', input), expansion: await topology.loadTopologyExpansionReceipt('stream', input.actionId),
      snapshot: await api.loadStreamSnapshot('stream') };
  });
  expect(result.error).toContain('quota'); expect(result.unchanged).toBe(true);
  expect(result.action).toBeUndefined(); expect(result.expansion).toBeUndefined();
  expect(result.snapshot.checkpoint.revision).toBe(0); expect(result.snapshot.checkpoint.topologyRevision).toBe(0);
  expect(result.snapshot.room.sockets.every(socket => socket.status === 'pending')).toBe(true);
});

for (const failedStore of ['streamActions', 'roots']) test(`${failedStore} write failure rolls back an entire prepared command`, async ({ page }) => {
  const result = await page.evaluate(async failedStore => {
    const { api, setup, request, raw, topology } = window.stream;
    const initial = await setup();
    const input = await request({ type: 'prepare', frontierId: initial.snapshot.room.sockets[0].id }, 'abort');
    const before = await raw();
    const put = IDBObjectStore.prototype.put;
    const writes: string[] = [];
    IDBObjectStore.prototype.put = function (...args) {
      writes.push(this.name);
      if (this.name === failedStore) throw new DOMException('Injected stream storage failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let error = '';
    try { await api.executeStreamAction('stream', input); } catch (value) { error = String(value); }
    finally { IDBObjectStore.prototype.put = put; }
    const unchanged = JSON.stringify(before) === JSON.stringify(await raw());
    const absent = await api.loadStreamAction('stream', input);
    const noExpansion = await topology.loadTopologyExpansionReceipt('stream', input.actionId);
    return { error, writes, unchanged, absent, noExpansion, retry: await api.executeStreamAction('stream', input) };
  }, failedStore);
  expect(result.error).toContain('QuotaExceededError'); expect(result.unchanged).toBe(true);
  expect(result.writes).toEqual(expect.arrayContaining(['spaces', 'sockets', 'buckets', 'receipts', 'streamCheckpoints', 'streamKnowledge']));
  expect(result.absent).toBeUndefined(); expect(result.noExpansion).toBeUndefined(); expect(result.retry.disposition).toBe('applied');
});

test('geometry failure and corrupt gameplay records fail closed without inventing pages or outcomes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, request, raw, openDB, topology } = window.stream;
    await setup();
    const input = await request({ type: 'move', direction: 'north' }, 'geometry');
    const before = await raw();
    let geometry = '';
    try { await api.executeStreamAction('stream', input, () => { throw new Error('Geometry unavailable'); }); } catch (error) { geometry = String(error); }
    const geometryUnchanged = JSON.stringify(before) === JSON.stringify(await raw());
    const errors = [];
    for (const [store, key] of [
      ['streamActions', ['stream', 'geometry']], ['streamControls', ['stream']], ['streamCheckpoints', ['stream']], ['streamKnowledge', ['stream', 'entry']],
    ] as const) {
      const db = await openDB(topology.TOPOLOGY_DATABASE);
      const old = await db.getAll(store, [...key], 1);
      await db.put(store, undefined, [...key]); db.close();
      const corrupt = await raw();
      let message = '';
      try { await api.executeStreamAction('stream', input); } catch (error) { message = String(error); }
      errors.push({ message, unchanged: JSON.stringify(corrupt) === JSON.stringify(await raw()) });
      const restore = await openDB(topology.TOPOLOGY_DATABASE);
      if (old.length) await restore.put(store, old[0], [...key]); else await restore.delete(store, [...key]);
      restore.close();
    }
    return { geometry, geometryUnchanged, errors, absent: await api.loadStreamAction('stream', input) };
  });
  expect(result.geometry).toContain('Geometry unavailable'); expect(result.geometryUnchanged).toBe(true);
  for (const value of result.errors) { expect(value.message).toContain('Invalid stored topology'); expect(value.unchanged).toBe(true); }
  expect(result.absent).toBeUndefined();
});
