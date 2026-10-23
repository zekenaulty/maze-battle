import { expect, test } from './canonical-private-capacity.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

for (const seed of [42, 781]) test(`actual game preparation consumes its allocation once through reload: seed ${seed}`, async ({ page }, info) => {
  const start = await page.evaluate(async seed => {
    const c = window.privateCapacityFixture, random = crypto.getRandomValues;
    crypto.getRandomValues = function <T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; return array; }
      throw Error('Unexpected initializer RNG request');
    };
    try {
      const born = await c.createCanonicalGame('game-owner'), original = c.command(born.head, 'game.prepare', { level: 1 });
      const step = await c.prepareGameFloor(original);
      return { born, original, step, dump: await c.dump() };
    } finally { crypto.getRandomValues = random; }
  }, seed);
  await page.reload(); await page.waitForFunction(() => !!window.privateCapacityFixture);
  const result = await page.evaluate(async wire => {
    const original = JSON.parse(wire) as CanonicalRequest;
    const c = window.privateCapacityFixture, beforeReplay = await c.dump(), replay = await c.prepareGameFloor(original);
    const afterReplay = await c.dump(), steps = [];
    let phase = '';
    for (let n = 0; phase !== 'ready' && n < 32; n++) {
      const before = await c.current(), value = await c.prepareGameFloor(c.command(before, 'game.prepare', { level: 1 }));
      phase = (value.receipt.result as { phase: string }).phase;
      const head = value.head!;
      steps.push({ phase, quota: head.quota, headBytes: c.storedBytes('heads', head.gameId, head),
        beforeBytes: before.quota.usedBytes - c.storedBytes('heads', before.gameId, before),
        beforeConsumed: before.quota.privateCapacity!.consumedBytes });
    }
    const ready = await c.current(), dump = await c.dump();
    const noop = await c.prepareGameFloor(c.command(ready, 'game.prepare', { level: 1 }));
    return { beforeReplay, replay, afterReplay, steps, ready, dump, noop };
  }, JSON.stringify(start.original));
  await info.attach('preparation.json', { body: JSON.stringify({ seed, start, result }), contentType: 'application/json' });
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(start.step.receipt);
  expect(result.afterReplay).toEqual(result.beforeReplay); expect(result.beforeReplay).toEqual(start.dump);
  const capacity = start.born.head.quota.privateCapacity!;
  expect(capacity.allocatedBytes).toBe(5_163_857); expect(capacity.active?.id).toBe('floor-1');
  for (const step of result.steps) {
    const policy = step.quota.privateCapacity!;
    expect(policy.allocatedBytes).toBe(capacity.allocatedBytes);
    expect(policy.consumedBytes - step.beforeConsumed).toBe(step.quota.usedBytes - step.headBytes - step.beforeBytes);
    expect(step.quota.usedBytes - step.headBytes + policy.allocatedBytes - policy.consumedBytes + 12 * 1024)
      .toBe(capacity.allocatedBytes + 12 * 1024);
  }
  expect(result.steps.at(-1)?.phase).toBe('ready'); expect(result.ready.quota.privateCapacity?.active).toBeNull();
  expect(result.ready.quota.usedBytes).toBe(result.dump.bytes);
  expect(result.noop.head!.quota.privateCapacity).toEqual(result.ready.quota.privateCapacity);
  expect(result.noop.head!.quota.usedBytes).toBeGreaterThan(result.ready.quota.usedBytes);
});

test('retained preparation replay survives a missing allocation source; fresh work rolls back', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.privateCapacityFixture, born = await c.createCanonicalGame('game-owner');
    const original = c.command(born.head, 'game.prepare', { level: 1 }), committed = await c.prepareGameFloor(original);
    const source = await c.readCanonical(p => p.get('execution', 'private-capacity/floor-1'));
    const value = source.value!.value as { sourceAttemptId: string }, db = await c.openCanonicalDatabase();
    try { await db.delete('receipts', [born.head.gameId, value.sourceAttemptId]); } finally { db.close(); }
    const before = await c.dump(), replay = await c.prepareGameFloor(original), after = await c.dump();
    const refusal = await c.refusal(async () => c.prepareGameFloor(c.command(await c.current(), 'game.prepare', { level: 1 })));
    return { original, committed, replay, before, after, refusal };
  });
  await info.attach('source-refusal.json', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.replay.receipt).toEqual(result.committed.receipt); expect(result.replay.replayed).toBe(true);
  expect(result.after).toEqual(result.before); expect(result.refusal.error).toContain('missing source receipt');
  expect(result.refusal.after).toEqual(result.refusal.before);
});

test('private preparation rejects caught gameplay/index writes and checkpoint mixing atomically', async ({ page }, info) => {
  const cases = await page.evaluate(async () => {
    const c = window.privateCapacityFixture; await c.createCanonicalGame('game-owner');
    const recipe = (await c.readCanonical(p => c.loadFloor(p, 1))).value.generation.recipe;
    const cases = [];
    for (const kind of ['roster', 'index', 'checkpoint', 'restore'] as const) cases.push({ kind, ...await c.refusal(async () =>
      c.executeCanonical(c.command(await c.current(), 'fixture.mixed'), async tx => {
        const batch = await tx.privatePreparation(c.floorPreparationSpec(recipe), c.preparationWorldWrite(1));
        try {
          if (kind === 'roster') await tx.pages.set('world', 'roster/pack', {});
          if (kind === 'index') await tx.pages.set('world', 'dungeon/1/forbidden', {}, ['roster/items/pack/rogue']);
          if (kind === 'checkpoint') tx.setCheckpoint({ ...tx.head.checkpoint, unrelated: true });
          if (kind === 'restore') await tx.restoreSnapshot('missing-snapshot');
        } catch { /* The transaction must remain poisoned even if a callback catches the refusal. */ }
        batch.close(); return { phase: 'ready' };
      })) });
    return cases;
  });
  await info.attach('mixing-refusals.json', { body: JSON.stringify(cases), contentType: 'application/json' });
  for (const value of cases) { expect(value.error, value.kind).not.toBe(''); expect(value.after, value.kind).toEqual(value.before); }
});

test('private initialization reserves before its writer and leaves the empty game intact on refusal', async ({ page }) => {
  const value = await page.evaluate(async () => {
    const c = window.privateCapacityFixture;
    return c.refusal(async called => c.initializeCanonical('game-owner', {}, async () => { called(); }, {
      quota: { limitBytes: 80_000, reserveBytes: 65_536 },
      privatePreparation: { id: 'floor-1', budgetBytes: 1_000_000, policy: { version: 'fixture' } },
    }));
  });
  expect(value.error).toContain('storage quota exhausted'); expect(value.called).toBe(0); expect(value.after).toEqual(value.before);
});
