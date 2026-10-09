import { expect, test } from '@playwright/test';
import { TOPOLOGY_DATABASE_VERSION, TOPOLOGY_STORES } from '../../src/persistence/topology/database';
import type {} from './stream-persistence-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-fixture.html'); await page.waitForFunction(() => Boolean(window.stream));
});

test('additive database upgrade preserves old topology records and refuses legacy gameplay adoption', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, topology, createTopology, recipe, boundsBuckets, recordBytes, openDB, raw } = window.stream;
    const delta = createTopology(recipe), slot = 'legacy';
    const records: { store: string; key: IDBValidKey; value: any }[] = [
      { store: 'roots', key: slot, value: { header: delta.header, quotaBytes: 1024 * 1024, serializedBytes: 0 } },
      ...delta.spaces.map(space => ({ store: 'spaces', key: [slot, space.spec.id], value: { space, connections: [] } })),
      ...delta.sockets.map(socket => ({ store: 'sockets', key: [slot, socket.sequence], value: socket })),
    ];
    const buckets = new Map<string, any[]>();
    for (const entry of delta.addOccupancy) for (const bucket of boundsBuckets(entry.bounds)) {
      const id = JSON.stringify(bucket); buckets.set(id, [...(buckets.get(id) ?? []), entry]);
    }
    for (const [id, values] of buckets) records.push({ store: 'buckets', key: [slot, ...JSON.parse(id)], value: values });
    for (let attempt = 0; attempt < 16; attempt++) records[0].value.serializedBytes = records.reduce((sum, value) => sum + recordBytes(value.store, value.key, value.value), 0);
    const db = await openDB(topology.TOPOLOGY_DATABASE, 1, { upgrade(db) {
      for (const store of ['roots', 'spaces', 'sockets', 'buckets', 'receipts']) db.createObjectStore(store);
    } });
    for (const record of records) await db.put(record.store, record.value, record.key);
    db.close();
    let adoption = '', snapshot = '';
    try { await api.createStreamSlot(slot, recipe, 1024 * 1024); } catch (error) { adoption = String(error); }
    try { await api.loadStreamSnapshot(slot); } catch (error) { snapshot = String(error); }
    const upgraded = await openDB(topology.TOPOLOGY_DATABASE);
    const version = upgraded.version, stores = [...upgraded.objectStoreNames]; upgraded.close();
    const after = await raw();
    return { adoption, snapshot, version, stores, same: after.records.length === records.length && records.every(old =>
      after.records.some(value => value.store === old.store && JSON.stringify(value.key) === JSON.stringify(old.key) && JSON.stringify(value.value) === JSON.stringify(old.value))),
      root: await topology.loadTopologyHeader(slot) };
  });
  expect(result.version).toBe(TOPOLOGY_DATABASE_VERSION);
  expect(result.stores).toEqual(expect.arrayContaining([...TOPOLOGY_STORES]));
  expect(result.same).toBe(true); expect(result.root?.streamVersion).toBeUndefined();
  expect(result.adoption).toContain('legacy/topology-only'); expect(result.snapshot).toContain('not gameplay managed');
});

test('one-room point-read budget is independent of topology growth and never invents knowledge pages', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { topology, recipe, trace, loadStreamRoom, raw } = window.stream;
    let root = await topology.createTopologySlot('large', { ...recipe, level: 1000, seed: 0xffffffff });
    const samples = [];
    for (let revision = 0; revision <= 160; revision++) {
      if (revision === 0 || revision === 12 || revision === 160) {
        const measured = await trace(() => topology.topologyTransaction(async tx => {
          const record = (await tx.get('roots', 'large'))!;
          return loadStreamRoom(tx, 'large', 'entry', record.header, 0);
        }));
        samples.push({ revision, total: measured.total, reads: measured.reads, methods: measured.methods,
          sockets: measured.result.sockets.length, knowledge: measured.result.knowledge });
      }
      if (revision < 160) {
        await topology.expandTopologyNext('large', { scopeId: root.header.scopeId, expectedRevision: revision, requestId: `expand-${revision}` });
        root = (await topology.loadTopologyHeader('large'))!;
      }
    }
    const records = await raw();
    return { samples, spaces: records.records.filter(value => value.store === 'spaces').length,
      knowledgePages: records.records.filter(value => value.store === 'streamKnowledge').length };
  });
  expect(result.spaces).toBe(321); expect(result.knowledgePages).toBe(0);
  for (const sample of result.samples) {
    expect(sample.total).toBe(7); expect(sample.methods).toEqual({ getAll: 7 }); expect(sample.sockets).toBe(4);
    expect(sample.reads).toEqual({ roots: 1, spaces: 1, sockets: 4, streamKnowledge: 1 }); expect(sample.knowledge).toBeUndefined();
  }
  console.log(JSON.stringify({ evidence: 'indexed room reads', ...result }));
});

test('missing room socket metadata in a managed slot rejects rather than claiming no ports', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, openDB, topology, raw } = window.stream;
    await setup();
    const db = await openDB(topology.TOPOLOGY_DATABASE);
    const room = await db.get('spaces', ['stream', 'entry']); delete room.socketSequences;
    await db.put('spaces', room, ['stream', 'entry']); db.close();
    const before = await raw();
    let error = '';
    try { await api.loadStreamSnapshot('stream'); } catch (value) { error = String(value); }
    return { error, unchanged: JSON.stringify(before) === JSON.stringify(await raw()) };
  });
  expect(result.error).toContain('lacks socket index'); expect(result.unchanged).toBe(true);
});
