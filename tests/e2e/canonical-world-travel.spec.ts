import { test, expect } from './canonical-test';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';

test('twelve generated floors retain reciprocal stairs, room identity and mutations across reload and takeover', async ({ page }) => {
  test.setTimeout(120_000);
  const before = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; await w.seedWorld(); await w.finishFloor();
    const first = (await c.readCanonical(p => p.get('world', 'dungeon/1/space/entry'))).value;
    const { head } = await c.readCanonicalHead();
    await c.executeCanonical(w.worldRequest(head, 'fixture.mutation'), async ({ pages }) => {
      await w.storeWorldMutation(pages, { schema: 1, level: 1, spaceId: 'entry', entityId: 'chest-1', kind: 'chest', state: { opened: true } });
      await pages.set('knowledge', 'remembered-entry', { source: 'fixture-sight-1', opened: false });
      return null;
    });
    for (let level = 2; level <= 12; level++) await w.nextFloor(level);
    return { first, mutation: (await c.readCanonical(p => p.get('world', 'dungeon/1/mutation/entry/chest-1'))).value };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const after = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; let { head } = await c.readCanonicalHead();
    await c.controlCanonical(c.command(head, 'control.takeover', { owner: 'new-owner' }), 'takeover');
    head = (await c.readCanonicalHead()).head;
    await c.controlCanonical(c.command(head, 'control.resume', { owner: 'new-owner' }), 'resume');
    const travels = [];
    for (let level = 12; level >= 2; level--) {
      const from = { level, cell: (await c.readCanonical(p => w.loadFloor(p, level))).value.entry };
      const up = (await c.readCanonical(p => w.resolveFloorTravel(p, from, 'up'))).value;
      if (up.kind !== 'dungeon') throw Error('Missing return floor');
      const down = (await c.readCanonical(p => w.resolveFloorTravel(p, up.position, 'down'))).value;
      travels.push({ from, up: up.position, down });
    }
    const floor = (await c.readCanonical(p => w.loadFloor(p, 1))).value;
    const town = (await c.readCanonical(p => w.resolveFloorTravel(p, { level: 1, cell: floor.entry }, 'up'))).value;
    return { travels, town, first: (await c.readCanonical(p => p.get('world', 'dungeon/1/space/entry'))).value,
      mutation: (await c.readCanonical(p => p.get('world', 'dungeon/1/mutation/entry/chest-1'))).value,
      memory: (await c.readCanonical(p => p.get('knowledge', 'remembered-entry'))).value?.value };
  });
  expect(after.travels).toHaveLength(11);
  for (const travel of after.travels) { expect(travel.up.level).toBe(travel.from.level - 1); expect(travel.down).toEqual({ kind: 'dungeon', position: travel.from }); }
  expect(after.town.kind).toBe('town'); expect(after.first).toEqual(before.first); expect(after.mutation).toEqual(before.mutation);
  expect(after.memory).toEqual({ source: 'fixture-sight-1', opened: false });
});

for (const depth of [1, 8, 32]) test(`resident local step cost with ${depth} generated floors`, async ({ page }, info) => {
  test.setTimeout(180_000);
  const result = await page.evaluate(async depth => {
    const c = window.canonical, w = c.world; await w.seedWorld(); await w.finishFloor();
    for (let level = 2; level <= depth; level++) await w.nextFloor(level);
    let { head } = await c.readCanonicalHead(); const samples = [], before = await navigator.storage.estimate();
    const getAll = IDBObjectStore.prototype.getAll, cursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.getAll = function () { throw Error('Whole world enumeration forbidden'); };
    IDBObjectStore.prototype.openCursor = function () { throw Error('Whole world cursor forbidden'); };
    try {
      for (let step = 0; step < 6; step++) {
        const meter = c.storageProbe(), started = performance.now();
        const request = w.worldRequest(head, 'fixture.move', { direction: step % 2 ? 'west' : 'east' });
        const moved = await c.executeCanonical(request, async tx => {
          const next = await w.resolveWorldStep(tx.pages, tx.head.checkpoint.position as unknown as WorldPosition, step % 2 ? 'west' : 'east');
          if (!next.moved) throw Error('Expected local step');
          tx.setCheckpoint({ position: w.json(next.position) }); return w.json(next);
        });
        samples.push({ elapsedMs: performance.now() - started, native: meter.finish(), work: moved.stats });
        head = (await c.readCanonicalHead()).head;
      }
    } finally { IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.openCursor = cursor; }
    return { depth, samples, headBytes: new TextEncoder().encode(JSON.stringify(head)).length, quota: head.quota,
      browserStorageEstimate: { before: before.usage, after: (await navigator.storage.estimate()).usage },
      note: 'Canonical world resolver, eight real generated rooms per floor. Not actual App/Agentica movement, observation bookkeeping or physical disk bytes.' };
  }, depth);
  await info.attach(`world-depth-${depth}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.headBytes).toBeLessThan(1024);
  for (const sample of result.samples) {
    expect(sample.work.reads).toBeLessThan(160); expect(sample.work.readBytes).toBeLessThan(96_000);
    expect(sample.work.writeBytes).toBeLessThan(3000);
    expect(sample.native.operations.filter(op => ['put', 'add'].includes(op.method)).map(op => op.store).sort()).toEqual(['heads', 'receipts']);
  }
});
