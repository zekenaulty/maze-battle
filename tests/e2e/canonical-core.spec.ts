import { expect, test } from './canonical-test';
import type { CanonicalSnapshot } from '../../src/persistence/canonical/types';
import type { RecordCursor } from '../../src/persistence/canonical/read';

test('one native transaction commits records, evidence, head and exact receipt, including lost-reply replay', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, start = await c.initializeCanonical('owner', { floorId: 'floor-1', x: 1 });
    const request = c.command(start.head, 'chest.open', { chest: 'chest-1' });
    const first = await c.executeCanonical(request, async tx => {
      await tx.pages.set('world', 'chest-1', { opened: true }, ['space/room-1/chest-1']);
      await tx.pages.set('world', 'item-1', { owner: 'pack', count: 1 }, ['items/pack/item-1']);
      await tx.pages.set('knowledge', 'observation-1', { chest: 'chest-1', opened: true }, ['evidence/player/000001']);
      tx.setCheckpoint({ floorId: 'floor-1', x: 2 });
      return { chest: 'chest-1', observation: 'observation-1' };
    });
    const before = await c.dump();
    const replay = await c.executeCanonical(request, async () => { throw new Error('must not execute twice'); });
    const conflict = await c.executeCanonical({ ...request, input: { chest: 'other' } }, async () => null).catch(String);
    const read = await c.readCanonical(async pages => ({ chest: await pages.get('world', 'chest-1'), item: await pages.get('world', 'item-1'),
      observation: await pages.get('knowledge', 'observation-1') }));
    return { first, replay, conflict, read, before, after: await c.dump() };
  });
  expect(result.first.replayed).toBe(false); expect(result.replay.replayed).toBe(true);
  expect(result.replay.receipt).toEqual(result.first.receipt);
  expect(result.conflict).toContain('invalid original receipt');
  expect(result.before).toEqual(result.after);
  expect(result.read.head.checkpoint).toEqual({ floorId: 'floor-1', x: 2 });
  expect(result.read.value.chest?.value).toEqual({ opened: true });
  expect(result.read.value.item?.value).toEqual({ owner: 'pack', count: 1 });
  expect(result.read.head.quota.usedBytes).toBe(result.after.bytes);
});

test('current roots advance while old pages and bounded cursors survive writes and reload', async ({ page }) => {
  const prepared = await page.evaluate(async () => {
    const c = window.canonical;
    const start = await c.initializeCanonical('owner', { floorId: 'floor-1' }, async pages => {
      for (let i = 0; i < 4; i++) await pages.set('world', `room-${i}`, { visited: false }, [`floor/1/room-${i}`]);
    });
    const first = await c.listCanonical('world', 'floor/1/', 2);
    const request = c.command(start.head);
    await c.executeCanonical(request, async tx => {
      await tx.pages.set('world', 'room-2', { visited: true }, ['floor/2/room-2']);
      await tx.pages.delete('world', 'room-3');
      return null;
    });
    return { snapshot: c.snapshotOf(start.head), cursor: first.value.next, first: first.value.rows.map(r => r.key) };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async serialized => {
    const prepared = JSON.parse(serialized) as { snapshot: CanonicalSnapshot; cursor: RecordCursor };
    const c = window.canonical;
    return { old: await c.readCanonical(pages => pages.get('world', 'room-2'), { snapshot: prepared.snapshot }),
      live: await c.readCanonical(pages => pages.get('world', 'room-2')), rest: await c.listCanonical('world', 'floor/1/', 2, prepared.cursor),
      currentList: await c.listCanonical('world', 'floor/1/', 2) };
  }, JSON.stringify(prepared));
  expect(prepared.first).toEqual(['room-0', 'room-1']);
  expect(result.old.value?.value).toEqual({ visited: false }); expect(result.live.value?.value).toEqual({ visited: true });
  expect(result.rest.value.rows.map(r => r.key)).toEqual(['room-2', 'room-3']);
  expect(result.currentList.value.rows.map(r => r.key)).toEqual(['room-0', 'room-1']);
  expect(result.currentList.value.next).toBeUndefined();
});

test('takeover fences old writers but preserves original receipt reconciliation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, start = await c.initializeCanonical('owner', {}), command = c.command(start.head);
    const effect = await c.executeCanonical(command, async tx => { tx.setCheckpoint({ count: 1 }); return 1; });
    const current = (await c.readCanonicalHead()).head;
    const takeover = c.command(current, 'control.takeover', { owner: 'other' });
    const stopped = await c.controlCanonical(takeover, 'takeover');
    const stale = await c.executeCanonical(c.command(current), async () => 2).catch(String);
    const replay = await c.executeCanonical(command, async () => { throw Error('duplicate'); });
    const stopReplay = await c.controlCanonical(takeover, 'takeover');
    const resume = await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'other' }), 'resume');
    return { effect, stopped, stale, replay, stopReplay, resume, current: (await c.readCanonicalHead()).head };
  });
  expect(result.stale).toContain('stale owner'); expect(result.replay.receipt).toEqual(result.effect.receipt);
  expect(result.stopReplay.receipt).toEqual(result.stopped.receipt);
  expect(result.current).toMatchObject({ owner: 'other', epoch: 3, status: 'ready', checkpoint: { count: 1 } });
});

test('concurrent new attempts admit only one expected revision', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {});
    const requests = [c.command(head), c.command(head)];
    const outcomes = await Promise.allSettled(requests.map(request => c.executeCanonical(request, async tx => {
      await tx.pages.set('world', request.attemptId, 1); return request.attemptId;
    })));
    return { statuses: outcomes.map(o => o.status), head: (await c.readCanonicalHead()).head };
  });
  expect(result.statuses.sort()).toEqual(['fulfilled', 'rejected']); expect(result.head.revision).toBe(2);
});

test('reset replaces corrupt referenced data, isolates unrelated databases and rejects old fences and cursors', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical;
    const unrelated = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('unrelated-app', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('data'); open.onerror = () => reject(open.error); open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>(resolve => { const tx = unrelated.transaction('data', 'readwrite'); tx.objectStore('data').put('keep', 'sentinel'); tx.oncomplete = () => resolve(); });
    const old = await c.initializeCanonical('owner', {}, async pages => { await pages.set('world', 'a', 1, ['rooms/a']); await pages.set('world', 'b', 2, ['rooms/b']); });
    const cursor = (await c.listCanonical('world', 'rooms/', 1)).value.next!;
    const db = await c.openCanonicalDatabase(); await db.clear('records'); db.close();
    const failed = await c.readCanonical(pages => pages.get('world', 'a')).catch(String);
    const fresh = await c.resetCanonical('new-owner', { fresh: true });
    const stale = await c.executeCanonical(c.command(old.head), async () => null).catch(String);
    const staleCursor = await c.listCanonical('world', 'rooms/', 1, cursor).catch(String);
    const sentinel = await new Promise(resolve => { const r = unrelated.transaction('data').objectStore('data').get('sentinel'); r.onsuccess = () => resolve(r.result); });
    unrelated.close();
    return { old: old.head, fresh: fresh.head, failed, stale, staleCursor, sentinel, dump: await c.dump() };
  });
  expect(result.failed).toContain('missing referenced record'); expect(result.stale).toContain('generation changed');
  expect(result.staleCursor).toContain('foreign game identity'); expect(result.sentinel).toBe('keep');
  expect(result.fresh.generation).not.toBe(result.old.generation); expect(result.fresh.gameId).not.toBe(result.old.gameId);
  expect(result.dump.content).not.toContain('rooms/a'); expect(result.fresh.quota.usedBytes).toBe(result.dump.bytes);
});

test('destructive schema upgrade never reads or converts the old SaveSlot', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('maze-battle', 7);
      open.onupgradeneeded = () => open.result.createObjectStore('saves'); open.onerror = () => reject(open.error); open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>(resolve => { const tx = old.transaction('saves', 'readwrite'); tx.objectStore('saves').put({ observationHead: 'invalid' }, 'auto'); tx.oncomplete = () => resolve(); });
    old.close();
    const c = window.canonical, initialized = await c.initializeCanonical('owner', { fresh: true }), db = await c.openCanonicalDatabase();
    const stores = [...db.objectStoreNames]; db.close();
    return { initialized, stores, dump: await c.dump() };
  });
  expect(result.stores).toEqual(['heads', 'meta', 'nodes', 'operations', 'receipts', 'records']);
  expect(result.dump.content).not.toContain('observationHead'); expect(result.initialized.head.checkpoint).toEqual({ fresh: true });
});
