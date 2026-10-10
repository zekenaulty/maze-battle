import { expect, test } from '@playwright/test';
import type {} from './paged-topology-fixture';

test('deep floor matches canonical oracle past 24 spaces using constant bounded IDB point reads', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/tests/e2e/paged-topology-fixture.html'); await page.waitForFunction(() => Boolean(window.paged));
  const result = await page.evaluate(async () => {
    const { api, recipe, MemoryTopology, expandTopology, trace } = window.paged;
    const deep = { ...recipe, level: 1000, seed: 0xffffffff };
    const oracle = new MemoryTopology(deep);
    await api.createTopologySlot('floor', deep);
    const samples = [];
    let maximumReads = 0, maximumBucketEntries = 0;
    for (let revision = 0; revision < 160; revision++) {
      const request = { scopeId: oracle.header().scopeId, expectedRevision: revision, requestId: `deep-${revision}` };
      const proposed = expandTopology(oracle, revision, request.requestId);
      if (proposed.status !== 'ready') throw new Error('Premature oracle seal');
      const measured = await trace(() => api.expandTopologyNext('floor', request));
      const receipt = measured.result;
      if (receipt.status !== 'committed' || JSON.stringify(receipt.delta) !== JSON.stringify(proposed.delta)) throw new Error(`Paged canonical divergence at ${revision}`);
      if (measured.reads.buckets !== 25 || measured.total > 34) throw new Error(`Unbounded reads: ${JSON.stringify(measured)}`);
      if (measured.methods.getAll !== measured.total || Object.keys(measured.methods).length !== 1) throw new Error('Unexpected point-read method');
      maximumReads = Math.max(maximumReads, measured.total);
      if (revision === 0 || revision === 12 || revision === 159) samples.push({ revision, reads: measured.reads, methods: measured.methods, total: measured.total });
      oracle.commit(proposed.delta);
    }
    // The oracle and full DB inspection below are test-only; traced host calls forbid scans.
    const snapshot = await window.paged.snapshot();
    const ids = oracle.spaceIds();
    let chestCount = 0, reciprocal = 0, unalignedRooms = 0;
    for (const id of ids) {
      const measured = await trace(() => api.loadTopologySpace('floor', id));
      if (measured.total !== 2 || measured.reads.spaces !== 1 || measured.methods.getAll !== 2) throw new Error('Space load was not bounded');
      const value = measured.result!;
      if (JSON.stringify(value.space) !== JSON.stringify(oracle.space(id)) || JSON.stringify(value.connections) !== JSON.stringify(oracle.connections(id))) throw new Error('Space/reciprocal link mismatch');
      chestCount += value.space.spec.chests.length;
      reciprocal += value.connections.length;
      const spec = value.space.spec;
      if (spec.kind === 'room' && (spec.origin.row % 16 !== 0 || spec.origin.column % 16 !== 0)) unalignedRooms++;
    }
    for (const record of snapshot.records) if (record.store === 'buckets') maximumBucketEntries = Math.max(maximumBucketEntries, record.value.length);
    const root = (await api.loadTopologyHeader('floor'))!;
    const early = await api.loadTopologyExpansionReceipt('floor', 'deep-0');
    const retry = early && await trace(() => api.expandTopologyNext('floor', early.request));
    return { samples, maximumReads, maximumBucketEntries, spaceCount: ids.length, chestCount, reciprocal, unalignedRooms,
      root, bytes: snapshot.bytes, retryReads: retry?.reads, retryMethods: retry?.methods, retrySame: JSON.stringify(retry?.result) === JSON.stringify(early) };
  });
  expect(result.spaceCount).toBe(321);
  expect(result.chestCount).toBe(160);
  expect(result.reciprocal).toBe(640);
  expect(result.unalignedRooms).toBeGreaterThan(100);
  expect(result.maximumBucketEntries).toBeLessThanOrEqual(256);
  expect(result.maximumReads).toBeLessThanOrEqual(34);
  for (const sample of result.samples) {
    expect(sample.reads.buckets).toBe(25);
    expect(sample.methods).toEqual({ getAll: sample.total });
  }
  expect(result.root.serializedBytes).toBe(result.bytes);
  expect(result.root.header.revision).toBe(160);
  expect(result.root.header.rooms).toBe(161);
  expect(result.root.header.socketCount).toBeGreaterThan(result.root.header.nextSocket);
  expect(result.retryReads).toEqual({ roots: 1, receipts: 1 });
  expect(result.retryMethods).toEqual({ getAll: 2 });
  expect(result.retrySame).toBe(true);
  await page.reload(); await page.waitForFunction(() => Boolean(window.paged));
  expect(await page.evaluate(() => window.paged.api.loadTopologyHeader('floor'))).toEqual(result.root);
  console.log(JSON.stringify({ evidence: 'paged topology', spaces: result.spaceCount, bytes: result.bytes, samples: result.samples, maximumReads: result.maximumReads }));
});
