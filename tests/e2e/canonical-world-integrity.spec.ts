import { test, expect } from './canonical-test';

test('foreign completed floor cannot publish a new reciprocal stair connection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; await w.seedWorld(); await w.finishFloor();
    const { head } = await c.readCanonicalHead();
    await c.executeCanonical(w.worldRequest(head, 'fixture.damage'), async tx => {
      const floor = await w.loadFloor(tx.pages, 1);
      floor.generation.recipe.worldId = 'foreign'; floor.generation.scopeId = JSON.stringify(floor.generation.recipe);
      await tx.pages.set('world', 'dungeon/1', w.json(floor)); return null;
    });
    const before = await c.dump(), failure = await w.nextFloor(2).catch(String);
    return { failure, unchanged: (await c.dump()).content === before.content };
  });
  expect(result.failure).toContain('not the next established frontier'); expect(result.unchanged).toBe(true);
});

for (const action of ['prepare', 'descend', 'town', 'create']) test(`missing source geometry cannot ${action}`, async ({ page }) => {
  const result = await page.evaluate(async action => {
    const c = window.canonical, w = c.world; await w.seedWorld(); const { floor } = await w.finishFloor();
    if (action === 'descend') await w.nextFloor(2);
    const anchor = action === 'town' ? floor.entry : floor.exit!, { head } = await c.readCanonicalHead();
    await c.executeCanonical(w.worldRequest(head, 'fixture.damage'), async tx => {
      for (const kind of ['space', 'ports']) await tx.pages.delete('world', `dungeon/1/${kind}/${anchor.spaceId}`);
      return null;
    });
    const before = await c.dump();
    const failure = action === 'create' ? await w.nextFloor(2).catch(String)
      : await c.readCanonical(p => w.resolveFloorTravel(p, { level: 1, cell: anchor }, action === 'town' ? 'up' : 'down')).catch(String);
    return { failure, unchanged: (await c.dump()).content === before.content };
  }, action);
  expect(result.failure).toContain('missing established world record'); expect(result.unchanged).toBe(true);
});

test('stored null occupancy cannot become an empty collision page', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, w = c.world; const { head } = await w.seedWorld();
    await c.executeCanonical(w.worldRequest(head, 'fixture.damage'), async tx => {
      await tx.pages.set('world', 'dungeon/1/bucket/0,0', null); return null;
    });
    const before = await c.dump(), current = (await c.readCanonicalHead()).head, request = w.worldRequest(current, 'fixture.expand');
    const failure = await c.executeCanonical(request, async tx => w.json(await w.expandWorldFloor(tx.pages, 1, request.attemptId))).catch(String);
    return { failure, unchanged: (await c.dump()).content === before.content };
  });
  expect(result.failure).toContain('Invalid occupancy bucket capacity'); expect(result.unchanged).toBe(true);
});
