import { test, expect } from './canonical-test';

for (const joins of ['direct', 'mixed', 'passage'] as const) test(`persistent ${joins} generation matches existing module assembly exactly`, async ({ page }) => {
  const result = await page.evaluate(async joins => {
    const { world: w } = window.canonical;
    await w.seedWorld(781, 24, joins);
    const grown = await w.finishFloor(), persisted = (await w.floorTranscript()).value;
    const compiled = new w.ModuleAssembly(persisted.floor.generation.recipe).finish();
    return { actual: { spaces: persisted.spaces, joins: persisted.joins, connections: persisted.connections },
      expected: { spaces: compiled.spaces, joins: compiled.joins, connections: compiled.connections },
      exit: persisted.floor.exit, largest: Math.max(...grown.costs.map(cost => cost.writes)) };
  }, joins);
  expect(result.actual).toEqual(result.expected); expect(result.exit).not.toBeNull(); expect(result.largest).toBeLessThanOrEqual(512);
});

test('restart resumes only the pending frontier and never rewrites established room geometry', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; const { head } = await w.seedWorld();
    const request = w.worldRequest(head, 'fixture.expand');
    await c.executeCanonical(request, async ({ pages }) => w.json(await w.expandWorldFloor(pages, 1, request.attemptId)));
    const geometry = await c.readCanonical(pages => pages.get('world', 'dungeon/1/space/entry'));
    return geometry.value;
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const after = await page.evaluate(async () => {
    const c = window.canonical; const finished = await c.world.finishFloor();
    return { finished: finished.floor, geometry: (await c.readCanonical(pages => pages.get('world', 'dungeon/1/space/entry'))).value };
  });
  expect(after.geometry).toEqual(before); expect(after.finished.generation.rooms).toBe(8);
});

test('unprepared doorway blocks, prepared reciprocal doorway traverses both ways without interaction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; let { head } = await w.seedWorld(1, 8, 'direct');
    const stored = await c.readCanonical(pages => w.required<{ socket: { direction: 'north' | 'south' | 'east' | 'west' } }>(pages, 'dungeon/1/frontier/0'));
    const direction = stored.value.socket.direction, opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
    const cell = { spaceId: 'entry', row: direction === 'north' ? 0 : direction === 'south' ? 8 : 4,
      column: direction === 'west' ? 0 : direction === 'east' ? 8 : 4 };
    const blocked = (await c.readCanonical(pages => w.resolveWorldStep(pages, { level: 1, cell }, direction))).value;
    const input = w.worldRequest(head, 'fixture.expand');
    await c.executeCanonical(input, async tx => w.json(await w.expandWorldFloor(tx.pages, 1, input.attemptId)));
    const before = await c.dump();
    const forward = (await c.readCanonical(pages => w.resolveWorldStep(pages, { level: 1, cell }, direction))).value;
    const back = (await c.readCanonical(pages => w.resolveWorldStep(pages, forward.position, opposite[direction]))).value;
    return { blocked, forward, back, cell, unchanged: (await c.dump()).content === before.content };
  });
  expect(result.blocked.moved).toBe(false); expect(result.forward.crossed).toBe(true);
  expect(result.back.position).toEqual({ level: 1, cell: result.cell }); expect(result.unchanged).toBe(true);
});

test('historical snapshot retains its closed doorway after later generation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; const { head } = await w.seedWorld();
    const snapshot = c.snapshotOf(head), request = w.worldRequest(head, 'fixture.expand');
    await c.executeCanonical(request, async tx => w.json(await w.expandWorldFloor(tx.pages, 1, request.attemptId)));
    return { old: (await c.readCanonical(pages => w.loadWorldRoom(pages, 1, 'entry'), { snapshot })).value.connections,
      current: (await c.readCanonical(pages => w.loadWorldRoom(pages, 1, 'entry'))).value.connections };
  });
  expect(result.old).toHaveLength(0); expect(result.current).toHaveLength(1);
});
