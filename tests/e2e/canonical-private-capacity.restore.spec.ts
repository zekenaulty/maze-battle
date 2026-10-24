import { expect, test } from './canonical-private-capacity.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('two fresh restores keep separate funding through a reload during preparation', async ({ page }, info) => {
  const start = await page.evaluate(async () => {
    const c = window.privateCapacityFixture, setup = await c.capacityNextFloorSetup();
    const create = c.command(await c.current(), 'save.command', { kind: 'create', label: 'repeatable camp' });
    await c.executeSaveCommand(create); await c.readyCapacityFloor(2);
    const before = await c.current(), load = c.command(before, 'save.command', { kind: 'load', id: create.attemptId });
    const restored = await c.executeSaveCommand(load), begin = c.command(restored.head!, 'game.prepare', { level: 2 });
    const committed = await c.prepareGameFloor(begin);
    return { setup, create, before, load, restored, begin, committed };
  });
  await page.reload(); await page.waitForFunction(() => !!window.privateCapacityFixture);
  const result = await page.evaluate(async wire => {
    const original = JSON.parse(wire) as { create: CanonicalRequest; load: CanonicalRequest; begin: CanonicalRequest };
    const c = window.privateCapacityFixture, beforeReplay = await c.dump(), replay = await c.prepareGameFloor(original.begin);
    const afterReplay = await c.dump(); await c.readyCapacityFloor(2);
    const finishedFirst = await c.current(), secondLoad = c.command(finishedFirst, 'save.command', { kind: 'load', id: original.create.attemptId });
    const second = await c.executeSaveCommand(secondLoad), begunAgain = await c.prepareGameFloor(c.command(second.head!, 'game.prepare', { level: 2 }));
    await c.readyCapacityFloor(2);
    const finished = await c.current(), beforeOldReplay = await c.dump(), oldReplay = await c.executeSaveCommand(original.load);
    return { beforeReplay, replay, afterReplay, finishedFirst, second, begunAgain, finished, beforeOldReplay, oldReplay, afterOldReplay: await c.dump() };
  }, JSON.stringify({ create: start.create, load: start.load, begin: start.begin }));
  await info.attach('repeated-restore-reload.json', { body: JSON.stringify({ start, result }), contentType: 'application/json' });
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(start.committed.receipt);
  expect(result.afterReplay).toEqual(result.beforeReplay);
  const initial = start.before.quota.privateCapacity!, budget = start.setup.specification.budgetBytes;
  expect(result.finishedFirst.quota.privateCapacity!.allocatedBytes).toBe(initial.allocatedBytes + budget);
  expect(result.second.head!.quota.privateCapacity).toEqual(result.finishedFirst.quota.privateCapacity);
  expect(result.begunAgain.head!.quota.privateCapacity!.active!.id).toBe(`floor-2:restore-${result.second.head!.revision}`);
  expect(result.begunAgain.head!.quota.privateCapacity!.active!.id).not.toBe(start.committed.head!.quota.privateCapacity!.active!.id);
  expect(result.finished.quota.privateCapacity!.allocatedBytes).toBe(initial.allocatedBytes + 2 * budget);
  expect(result.finished.quota.privateCapacity!.active).toBeNull(); expect(result.finished.quota.usedBytes).toBe(result.beforeOldReplay.bytes);
  expect(result.oldReplay.replayed).toBe(true); expect(result.oldReplay.receipt).toEqual(start.restored.receipt);
  expect(result.afterOldReplay).toEqual(result.beforeOldReplay);
});

for (const store of ['records', 'nodes', 'receipts', 'heads'] as const) test(`restore ${store} failure rolls back roots, lineage, receipt and accounting together`, async ({ page }, info) => {
  const result = await page.evaluate(async store => {
    const c = window.privateCapacityFixture; await c.createCanonicalGame('game-owner'); await c.readyCapacityFloor(1);
    const create = c.command(await c.current(), 'save.command', { kind: 'create', label: 'atomic restore' });
    await c.executeSaveCommand(create);
    await c.executeCanonical(c.command(await c.current(), 'fixture.change-wave'), async tx => {
      tx.setCheckpoint({ ...tx.head.checkpoint, wave: 9 }); return { changed: true };
    });
    const beforeHead = await c.current(), original = c.command(beforeHead, 'save.command', { kind: 'load', id: create.attemptId });
    const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    let hit = 0, error = '';
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.name === store) { hit++; throw new DOMException('Injected restore write failure', 'QuotaExceededError'); }
      return add.call(this, value, key);
    };
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === store) { hit++; throw new DOMException('Injected restore write failure', 'QuotaExceededError'); }
      return put.call(this, value, key);
    };
    try { await c.executeSaveCommand(original); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    const after = await c.dump(), retried = await c.executeSaveCommand(original), once = await c.dump(), replay = await c.executeSaveCommand(original);
    return { beforeHead, before, hit, error, after, retried, once, replay, afterReplay: await c.dump() };
  }, store);
  await info.attach('restore-rollback.json', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.hit).toBe(1); expect(result.error).toContain('Injected restore write failure'); expect(result.after).toEqual(result.before);
  expect(result.retried.head!.checkpoint.wave).toBe(1); expect(result.retried.head!.quota.privateCapacity).toEqual(result.beforeHead.quota.privateCapacity);
  expect(result.retried.head!.quota.usedBytes).toBe(result.once.bytes);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.retried.receipt);
  expect(result.afterReplay).toEqual(result.once);
});
