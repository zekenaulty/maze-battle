import { expect, test } from './canonical-private-capacity.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('next-floor bootstrap reserves once and completes after reload with truthful accounting', async ({ page }, info) => {
  const start = await page.evaluate(async () => {
    const c = window.privateCapacityFixture, setup = await c.capacityNextFloorSetup();
    const original = c.command(setup.head, 'game.prepare', { level: 2 });
    const committed = await c.prepareGameFloor(original);
    return { setup, original, committed, dump: await c.dump() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.privateCapacityFixture);
  const end = await page.evaluate(async wire => {
    const c = window.privateCapacityFixture, original = JSON.parse(wire) as CanonicalRequest;
    const replay = await c.prepareGameFloor(original), replayDump = await c.dump();
    const steps = await c.readyCapacityFloor(2), head = await c.current(), dump = await c.dump();
    const anchor = (await c.readCanonical(p => p.get('execution', 'private-capacity/floor-2'))).value!;
    const floor = (await c.readCanonical(p => c.loadFloor(p, 2))).value;
    return { replay, replayDump, steps, head, dump, anchor, floor };
  }, JSON.stringify(start.original));
  await info.attach('next-floor.json', { body: JSON.stringify({ start, end }), contentType: 'application/json' });
  const before = start.setup.head.quota.privateCapacity!, opened = start.committed.head!.quota.privateCapacity!;
  expect(opened.allocatedBytes).toBe(before.allocatedBytes + start.setup.specification.budgetBytes);
  expect(opened.active?.id).toBe('floor-2');
  expect(end.anchor.value).toEqual({ ...start.setup.specification, sourceAttemptId: start.original.attemptId });
  expect(end.replay.replayed).toBe(true); expect(end.replay.receipt).toEqual(start.committed.receipt);
  expect(end.replayDump).toEqual(start.dump);
  let previous = start.committed.head!;
  for (const step of end.steps) {
    const next = step.head!, policy = next.quota.privateCapacity!;
    const added = next.quota.usedBytes - cHead(next) - previous.quota.usedBytes + cHead(previous);
    expect(policy.allocatedBytes).toBe(opened.allocatedBytes);
    expect(policy.consumedBytes - previous.quota.privateCapacity!.consumedBytes).toBe(added);
    previous = next;
  }
  expect(end.head.quota.privateCapacity?.active).toBeNull(); expect(end.floor.exit).not.toBeNull();
  expect(end.head.quota.usedBytes).toBe(end.dump.bytes);
});

// Independent JSON accounting matches the canonical store envelope without consulting admission.
function cHead(head: { gameId: string }) {
  return new TextEncoder().encode(JSON.stringify(['heads', head.gameId, head])).byteLength;
}

for (const margin of [-1, 0]) test(`next-floor allocation respects the exact public reservation boundary: ${margin}`, async ({ page }, info) => {
  const result = await page.evaluate(async margin => {
    const c = window.privateCapacityFixture, setup = await c.capacityNextFloorSetup();
    const head = await c.nextCapacityLimit(setup.specification.budgetBytes, margin), before = await c.dump();
    const request = c.command(head, 'game.prepare', { level: 2 });
    let error = '', committed;
    try { committed = await c.prepareGameFloor(request); } catch (cause) { error = String(cause); }
    return { setup, head, before, after: await c.dump(), error, committed };
  }, margin);
  await info.attach('reservation-boundary.json', { body: JSON.stringify(result), contentType: 'application/json' });
  if (margin < 0) {
    expect(result.error).toContain('storage quota exhausted'); expect(result.after).toEqual(result.before);
  } else {
    expect(result.error).toBe(''); expect(result.committed!.head!.quota.privateCapacity?.active?.id).toBe('floor-2');
    expect(result.committed!.head!.quota.usedBytes).toBe(result.after.bytes);
  }
});

test('an aborted next-floor write leaves allocation and world unchanged; the original retry succeeds once', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.privateCapacityFixture, setup = await c.capacityNextFloorSetup();
    const original = c.command(setup.head, 'game.prepare', { level: 2 }), before = await c.dump();
    const add = IDBObjectStore.prototype.add; let hit = 0, error = '';
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'records' && ++hit === 2) throw new DOMException('Injected second record write failure', 'QuotaExceededError');
      return add.call(this, value, key);
    };
    try { await c.prepareGameFloor(original); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; }
    const after = await c.dump(), committed = await c.prepareGameFloor(original), once = await c.dump();
    const replay = await c.prepareGameFloor(original);
    return { setup, original, before, hit, error, after, committed, once, replay, afterReplay: await c.dump() };
  });
  await info.attach('aborted-bootstrap.json', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.hit).toBe(2); expect(result.error).toContain('Injected second record write failure');
  expect(result.after).toEqual(result.before); expect(result.replay.replayed).toBe(true);
  expect(result.replay.receipt).toEqual(result.committed.receipt); expect(result.afterReplay).toEqual(result.once);
  expect(result.committed.head!.quota.privateCapacity!.allocatedBytes)
    .toBe(result.setup.head.quota.privateCapacity!.allocatedBytes + result.setup.specification.budgetBytes);
});

test('restoring an unfinished named save after its allocation closes refuses before changing the game', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.privateCapacityFixture, born = await c.createCanonicalGame('game-owner');
    const create = c.command(born.head, 'save.command', { kind: 'create', label: 'unfinished floor' });
    await c.executeSaveCommand(create); await c.readyCapacityFloor(1);
    return c.refusal(async () => c.executeSaveCommand(c.command(await c.current(), 'save.command', { kind: 'load', id: create.attemptId })));
  });
  await info.attach('unfinished-restore.json', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.error).toContain('unfinished floor'); expect(result.after).toEqual(result.before);
});

test('a completed-floor save restores without rewinding allocation accounting and replays exactly', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.privateCapacityFixture; await c.createCanonicalGame('game-owner'); await c.readyCapacityFloor(1);
    const savedHead = await c.current(), create = c.command(savedHead, 'save.command', { kind: 'create', label: 'prepared floor' });
    await c.executeSaveCommand(create);
    await c.executeCanonical(c.command(await c.current(), 'fixture.changed-wave'), async tx => {
      tx.setCheckpoint({ ...tx.head.checkpoint, wave: 9 }); return { changed: true };
    });
    const before = await c.current(), load = c.command(before, 'save.command', { kind: 'load', id: create.attemptId });
    const restored = await c.executeSaveCommand(load), once = await c.dump(), replay = await c.executeSaveCommand(load);
    return { savedHead, before, restored, once, replay, afterReplay: await c.dump() };
  });
  await info.attach('prepared-restore.json', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.restored.head!.checkpoint).toEqual(result.savedHead.checkpoint);
  expect(result.restored.head!.quota.privateCapacity).toEqual(result.before.quota.privateCapacity);
  expect(result.restored.head!.quota.usedBytes).toBe(result.once.bytes);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.restored.receipt);
  expect(result.afterReplay).toEqual(result.once);
});
