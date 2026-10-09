import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';

const fixture = '/src/persistence/agenticaTest.fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.agenticaStorage)); });

test('late native write failure rolls back topology/checkpoint/pages/domain receipt; pending survives', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, StreamPlanner } = window.agenticaStorage; await setup();
    const planner = new StreamPlanner();
    let input;
    for (let step = 0; step < 200; step++) {
      const snapshot = await window.stream.api.loadStreamSnapshot('stream');
      const command = planner.choose(snapshot.checkpoint, snapshot.room.knowledge!, (await window.stream.api.loadStreamControl('stream'))!).command;
      if (!command) throw new Error('Planner blocked');
      if (command.type === 'prepare') { input = await action('maze.prepare', { frontierId: command.frontierId }); break; }
      await window.stream.act(command);
    }
    if (!input) throw new Error('No pending prepare');
    await reserve(input);
    const before = await window.stream.raw(), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'agenticaActions' && value.record.status === 'completed') throw new Error('Injected final envelope failure');
      return put.call(this, value, key!);
    };
    let failure = '';
    try { await api.executeAgenticaAction('stream', input); } catch (error) { failure = String(error); }
    finally { IDBObjectStore.prototype.put = put; }
    const after = await window.stream.raw();
    const query = await api.reconcileAgenticaAction('stream', input);
    const committed = await window.stream.trace(() => api.executeAgenticaAction('stream', input));
    return { before, after, failure, query, committed, final: await window.stream.raw() };
  });
  expect(result.failure).toContain('Injected final envelope failure'); expect(result.after).toEqual(result.before); expect(result.query).toBeUndefined();
  expect(result.committed.result.disposition).toBe('applied'); expect(result.committed.total).toBeLessThanOrEqual(46);
  expect(result.final.records.find(record => record.store === 'roots')!.value.serializedBytes).toBe(result.final.bytes);
});

test('byte quota separately aborts reservations and atomic effects, retaining all promises', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, topologyTransaction, sdk } = window.agenticaStorage; await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    await topologyTransaction(async tx => {
      const root = (await tx.get('roots', 'stream'))!; await tx.stageRoot('stream', { ...root, quotaBytes: root.serializedBytes + 1400 });
    });
    const before = await window.stream.raw(); let effect = '';
    try { await api.executeAgenticaAction('stream', input); } catch (error) { effect = String(error); }
    const after = await window.stream.raw();
    await topologyTransaction(async tx => {
      const root = (await tx.get('roots', 'stream'))!; await tx.stageRoot('stream', { ...root, quotaBytes: root.serializedBytes + 50 });
    });
    const beforeReserve = await window.stream.raw(); let pending = '';
    try { await reserve(await action()); } catch (error) { pending = String(error); }
    return { effect, before, after, pending, beforeReserve, afterReserve: await window.stream.raw(), retained: await api.loadAgenticaAction('stream', sdk.actionKey(input)) };
  });
  expect(result.effect).toContain('quota'); expect(result.after).toEqual(result.before);
  expect(result.pending).toContain('quota'); expect(result.afterReserve).toEqual(result.beforeReserve); expect(result.retained?.status).toBe('pending');
});

test('version-2 migration preserves existing records, identity, byte totals and an unrelated database', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { openTopologyDatabase, api } = window.agenticaStorage;
    await window.stream.setup(); await window.stream.act({ type: 'move', direction: 'north' });
    const original = await window.stream.raw();
    const { openDB, topology } = window.stream;
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(topology.TOPOLOGY_DATABASE); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    const legacy = await openDB(topology.TOPOLOGY_DATABASE, 2, { upgrade(db) {
      for (const store of ['roots', 'spaces', 'sockets', 'buckets', 'receipts', 'streamCheckpoints', 'streamKnowledge', 'streamControls', 'streamActions']) db.createObjectStore(store);
    } });
    for (const record of original.records) await legacy.put(record.store, record.value, record.key);
    legacy.close();
    const unrelated = await openDB('agentica-test-ordinary-sentinel', 1, { upgrade(db) { db.createObjectStore('saves'); } });
    await unrelated.put('saves', { sentinel: true }, 'user'); unrelated.close();
    const upgraded = await openTopologyDatabase(), version = upgraded.version, stores = [...upgraded.objectStoreNames]; upgraded.close();
    const after = await window.stream.raw();
    const db = await openDB('agentica-test-ordinary-sentinel'); const sentinel = await db.get('saves', 'user'); db.close();
    // Existing saves may acquire opaque scope/run metadata after, not during, migration.
    const scope = await window.stream.api.ensureStreamPublicScope('stream');
    const beforeBinding = await window.stream.api.loadStreamSnapshot('stream');
    const missing = await api.loadAgenticaRun('stream', 'absent');
    return { original, after, version, stores, sentinel, scope, beforeBinding, missing };
  });
  expect(result.version).toBe(3); expect(result.stores).toContain('agenticaActions'); expect(result.stores).toContain('agenticaRuns');
  expect(result.after).toEqual(result.original); expect(result.sentinel).toEqual({ sentinel: true }); expect(result.missing).toBeUndefined();
  expect(result.beforeBinding.checkpoint.revision).toBe(1);
});
