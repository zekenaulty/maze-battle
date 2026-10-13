import { test, expect } from './canonical-test';

for (const storeName of ['records', 'heads', 'receipts']) test(`module expansion aborts reciprocal publication on native ${storeName} failure`, async ({ page }) => {
  const result = await page.evaluate(async storeName => {
    const c = window.canonical, w = c.world; const { head } = await w.seedWorld();
    const before = await c.dump(), request = w.worldRequest(head, 'fixture.expand');
    const method = storeName === 'heads' ? 'put' : 'add', original = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: function(this: IDBObjectStore, ...args: unknown[]) {
      if (this.transaction.db.name === 'maze-battle' && this.name === storeName) throw new DOMException('Injected quota', 'QuotaExceededError');
      return Reflect.apply(original, this, args);
    } });
    let failure;
    try { await c.executeCanonical(request, async tx => w.json(await w.expandWorldFloor(tx.pages, 1, request.attemptId))); }
    catch (error) { failure = String(error); }
    finally { Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: original }); }
    const unchanged = (await c.dump()).content === before.content;
    const retry = await c.executeCanonical(request, async tx => w.json(await w.expandWorldFloor(tx.pages, 1, request.attemptId)));
    const replay = await c.executeCanonical(request, async () => { throw Error('Replay must not regenerate'); });
    return { failure, unchanged, retry: retry.receipt, replay: replay.receipt };
  }, storeName);
  expect(result.failure).toContain('Injected quota'); expect(result.unchanged).toBe(true); expect(result.replay).toEqual(result.retry);
});

for (const damaged of ['space', 'ports', 'connection', 'floor']) test(`missing established ${damaged} refuses navigation without regeneration`, async ({ page }) => {
  const result = await page.evaluate(async damaged => {
    const c = window.canonical, w = c.world; await w.seedWorld(1, 8, 'direct');
    await w.finishFloor();
    const room = (await c.readCanonical(p => w.loadWorldRoom(p, 1, 'entry'))).value;
    const link = room.connections[0], from = { level: 1, cell: link.from }, { head } = await c.readCanonicalHead();
    const key = damaged === 'floor' ? 'dungeon/1' : damaged === 'connection' ? `dungeon/1/connection/${link.id}` : `dungeon/1/${damaged}/${link.to.spaceId}`;
    await c.executeCanonical(w.worldRequest(head, 'fixture.damage'), async tx => { await tx.pages.delete('world', key); return null; });
    const current = (await c.readCanonicalHead()).head, before = await c.dump();
    const failure = await c.executeCanonical(w.worldRequest(current, 'fixture.move'), async tx => {
      const next = await w.resolveWorldStep(tx.pages, from, link.direction); tx.setCheckpoint({ position: w.json(next.position) }); return w.json(next);
    }).catch(String);
    return { failure, unchanged: (await c.dump()).content === before.content };
  }, damaged);
  expect(result.failure).toContain('missing established world record'); expect(result.unchanged).toBe(true);
});

test('missing reciprocal membership refuses a doorway even when both spaces exist', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; await w.seedWorld(1, 8, 'direct'); await w.finishFloor();
    const room = (await c.readCanonical(p => w.loadWorldRoom(p, 1, 'entry'))).value, link = room.connections[0];
    const { head } = await c.readCanonicalHead();
    await c.executeCanonical(w.worldRequest(head, 'fixture.damage'), async tx => {
      const ports = await w.loadPorts(tx.pages, 1, link.to.spaceId); ports.connections = ports.connections.filter(id => id !== link.id);
      await tx.pages.set('world', `dungeon/1/ports/${link.to.spaceId}`, w.json(ports)); return null;
    });
    return c.readCanonical(p => w.resolveWorldStep(p, { level: 1, cell: link.from }, link.direction)).catch(String);
  });
  expect(result).toContain('reciprocal');
});

test('existing floor and missing stairs cannot be mistaken for an ungenerated destination', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; await w.seedWorld(); const { floor } = await w.finishFloor();
    const from = { level: 1, cell: floor.exit! }, before = (await c.readCanonical(p => w.resolveFloorTravel(p, from, 'down'))).value;
    await w.nextFloor(2);
    let { head } = await c.readCanonicalHead();
    await c.executeCanonical(w.worldRequest(head, 'fixture.damage'), async tx => { await tx.pages.delete('world', 'dungeon/1/stairs'); return null; });
    head = (await c.readCanonicalHead()).head;
    const after = await c.readCanonical(p => w.resolveFloorTravel(p, from, 'down')).catch(String);
    const recreate = await c.executeCanonical(w.worldRequest(head, 'fixture.floor'), async tx => w.json(await w.createWorldFloor(tx.pages, w.createModuleRecipe('fixture-world', 2, 2)))).catch(String);
    return { before, after, recreate };
  });
  expect(result.before).toEqual({ kind: 'prepare', level: 2 }); expect(result.after).toContain('missing established');
  expect(result.recreate).toContain('not the next established frontier');
});

test('large floor preparation retains bounded expansion work without a full grid projection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; await w.seedWorld(781, 2006);
    const costs = [];
    for (let step = 0; step < 32; step++) {
      const { head } = await c.readCanonicalHead(), request = w.worldRequest(head, 'fixture.expand');
      const next = await c.executeCanonical(request, async tx => w.json(await w.expandWorldFloor(tx.pages, 1, request.attemptId)));
      costs.push(next.stats);
    }
    const floor = (await c.readCanonical(p => w.loadFloor(p, 1))).value;
    return { costs, floorBytes: new TextEncoder().encode(JSON.stringify(floor)).length, floor };
  });
  expect(result.floor.generation.rooms).toBe(33); expect(result.floor.exit).toBeNull(); expect(result.floorBytes).toBeLessThan(1600);
  for (const cost of result.costs) { expect(cost.reads).toBeLessThanOrEqual(2048); expect(cost.writes).toBeLessThanOrEqual(512); }
});
