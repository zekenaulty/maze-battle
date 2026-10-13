import { expect, test } from '@playwright/test';
import type {} from './paged-topology-fixture';

const fixture = '/tests/e2e/paged-topology-fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.paged)); });

test('new namespace leaves ordinary and v1 databases byte-for-byte and version intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { openDB, setup, api } = window.paged;
    const legacy = [
      { name: 'maze-battle', store: 'saves', value: { untouched: 'ordinary', bytes: [0, 255, 17] } },
      { name: 'maze-battle-expeditions', store: 'expeditions', value: { untouched: 'expedition', bytes: [42, 0, 255] } },
    ];
    // Sentinels exist only in this fresh Playwright profile, never the active user's origin.
    for (const { name, store, value } of legacy) {
      const db = await openDB(name, 1, { upgrade(db) { db.createObjectStore(store); } });
      await db.put(store, value, 'old'); db.close();
    }
    const missing = await api.loadTopologyHeader('absent');
    const root = await setup();
    const duplicate = await setup();
    const entry = await api.loadTopologySpace('floor', 'entry');
    let conflict = '';
    try { await api.createTopologySlot('floor', { ...window.paged.recipe, seed: 1 }); } catch (error) { conflict = String(error); }
    const old = [];
    for (const { name, store } of legacy) {
      const db = await openDB(name); old.push({ name, version: db.version, value: await db.get(store, 'old'), stores: [...db.objectStoreNames] }); db.close();
    }
    const snapshot = await window.paged.snapshot();
    return { missing, root, duplicate, entry, conflict, old, legacy, bytes: snapshot.bytes };
  });
  expect(result.missing).toBeUndefined();
  expect(result.root).toEqual(result.duplicate);
  expect(result.root.serializedBytes).toBe(result.bytes);
  expect(result.entry?.space.spec.id).toBe('entry');
  expect(result.entry?.connections).toEqual([]);
  expect(result.conflict).toContain('identity');
  for (const [index, old] of result.old.entries()) expect(old).toEqual({ name: result.legacy[index].name, version: 1, value: result.legacy[index].value, stores: [result.legacy[index].store] });
});

test('reload preserves original receipts, immutable chest specs and reciprocal connection pages', async ({ page }) => {
  const original = await page.evaluate(async () => {
    await window.paged.setup();
    const receipt = await window.paged.next('first');
    if (receipt.status !== 'committed') throw new Error('Expected commit');
    const space = (await window.paged.api.loadTopologySpace('floor', receipt.delta!.spaces[0].spec.id))!;
    const geometry = window.paged.materializeTopologySpace(space.space);
    for (let index = 0; index < 10; index++) await window.paged.next(`later-${index}`);
    return { receipt, space, geometry };
  });
  await page.reload(); await page.waitForFunction(() => Boolean(window.paged));
  const loaded = await page.evaluate(async original => {
    const { api } = window.paged;
    const retry = await api.expandTopologyNext('floor', original.receipt.request);
    const query = await api.loadTopologyExpansionReceipt('floor', 'first');
    const page = (await api.loadTopologySpace('floor', original.space.space.spec.id))!;
    const geometry = window.paged.materializeTopologySpace(page.space);
    const reciprocal = [];
    for (const connection of original.receipt.delta!.connections) {
      for (const id of [connection.from.spaceId, connection.to.spaceId]) {
        const endpoint = (await api.loadTopologySpace('floor', id))!;
        reciprocal.push(endpoint.connections.some(link => JSON.stringify(link) === JSON.stringify(connection)));
      }
    }
    let reuse = '', scope = '';
    try { await api.expandTopologyNext('floor', { ...original.receipt.request, expectedRevision: 11 }); } catch (error) { reuse = String(error); }
    try { await api.expandTopologyNext('floor', { ...original.receipt.request, scopeId: 'wrong' }); } catch (error) { scope = String(error); }
    page.space.spec.chests.length = 0;
    const fresh = (await api.loadTopologySpace('floor', original.space.space.spec.id))!;
    return { retry, query, geometry, reciprocal, reuse, scope, fresh, socket: await api.loadTopologySocket('floor', 0), root: await api.loadTopologyHeader('floor') };
  }, original);
  expect(loaded.retry).toEqual(original.receipt);
  expect(loaded.query).toEqual(original.receipt);
  expect(loaded.fresh.space).toEqual(original.space.space);
  expect(loaded.fresh.space.spec.chests).toHaveLength(1);
  expect(loaded.geometry).toEqual(original.geometry);
  expect(loaded.reciprocal).toEqual([true, true, true, true]);
  expect(loaded.socket?.status).toBe('linked');
  expect(loaded.root?.header.revision).toBe(11);
  expect(loaded.reuse).toContain('reuse');
  expect(loaded.scope).toContain('scope');
});

test('cross-tab CAS races have one winner; identical concurrent requests reconcile', async ({ page, context }) => {
  const root = await page.evaluate(() => window.paged.setup());
  const second = await context.newPage(); await second.goto(fixture); await second.waitForFunction(() => Boolean(window.paged));
  const request = { scopeId: root.header.scopeId, expectedRevision: 0, requestId: 'race-a' };
  const results = await Promise.all([
    page.evaluate(request => window.paged.api.expandTopologyNext('floor', request), request),
    second.evaluate(request => window.paged.api.expandTopologyNext('floor', { ...request, requestId: 'race-b' }), request),
  ]);
  expect(results.map(value => value.status).sort()).toEqual(['committed', 'conflict']);
  const duplicate = { ...request, expectedRevision: 1, requestId: 'same' };
  const retries = await Promise.all([
    page.evaluate(request => window.paged.api.expandTopologyNext('floor', request), duplicate),
    second.evaluate(request => window.paged.api.expandTopologyNext('floor', request), duplicate),
  ]);
  expect(retries[0]).toEqual(retries[1]);
  expect(retries[0].status).toBe('committed');
  expect((await second.evaluate(() => window.paged.api.loadTopologyHeader('floor')))?.header.revision).toBe(2);
  const loser = results[0].status === 'conflict' ? 'race-a' : 'race-b';
  expect(await page.evaluate(id => window.paged.api.loadTopologyExpansionReceipt('floor', id), loser)).toBeUndefined();
  const retriedLoser = await page.evaluate(id => window.paged.next(id), loser);
  expect(retriedLoser.status).toBe('committed');
  if (retriedLoser.status === 'committed') expect(retriedLoser.header.revision).toBe(3);
});

test('sealed results are durable receipts without checkpoint revision changes', async ({ page }) => {
  const original = await page.evaluate(async () => {
    await window.paged.api.createTopologySlot('floor', { ...window.paged.recipe, level: 1 });
    let root = (await window.paged.api.loadTopologyHeader('floor'))!;
    while (!root.header.seal) { await window.paged.next(`step-${root.header.revision}`); root = (await window.paged.api.loadTopologyHeader('floor'))!; }
    return window.paged.next('sealed');
  });
  expect(original.status).toBe('sealed');
  await page.reload(); await page.waitForFunction(() => Boolean(window.paged));
  expect(await page.evaluate(() => window.paged.next('sealed'))).toEqual(original);
  expect(await page.evaluate(() => window.paged.api.loadTopologyExpansionReceipt('floor', 'sealed'))).toEqual(original);
});
