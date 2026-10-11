import { test, expect, open, state, geometry, move, ordinaryDirection, stop, snapshot, pixels, reload, manualSave } from './d1-rpg-browser';

test('fresh v3 paints, manual and Auto share effects, immediate takeover and native reload preserve identity', async ({ page }, info) => {
  await open(page, 'fresh');
  const initial = await state(page), identity = geometry(initial.maze);
  expect(initial.maze.layout?.version).toBe('structured-v3');
  expect(initial.maze.layout?.rooms).toHaveLength(8);
  expect(initial.maze.layout?.connections?.length).toBeGreaterThan(0);
  expect(initial.randomBattles).toBe(false);
  await pixels(page, info, 'fresh-camera');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await pixels(page, info, 'fresh-overview');
  await page.getByRole('button', { name: 'Map', exact: true }).click();

  await move(page, ordinaryDirection(initial));
  const manual = await state(page);
  expect(manual.maze.visited).toContainEqual(manual.maze.active);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await state(page)).maze.active).not.toEqual(manual.maze.active);
  await stop(page);
  const stopped = await state(page);
  await page.waitForTimeout(2200); // Exceeds this fixture's real Auto interval.
  expect((await state(page)).maze.active).toEqual(stopped.maze.active);

  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('auto-play');
  await move(page, ordinaryDirection(await state(page)));
  const takenOver = await state(page);
  expect(takenOver.mode).toBe('manual');
  expect(takenOver.automationPaused).toBe(true);
  await page.waitForTimeout(2200);
  expect((await state(page)).maze.active).toEqual(takenOver.maze.active);
  expect(geometry(takenOver.maze)).toEqual(identity);
  expect(takenOver.battle).toBeUndefined();
  const saved = await manualSave(page);
  await reload(page);
  expect(await state(page)).toEqual(saved.game);
  await move(page, ordinaryDirection(await state(page)));
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.locator('.save-row').filter({ hasText: 'manual' }).getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Load save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await state(page)).toEqual(saved.game);
  await pixels(page, info, 'restored-camera');
  const stored = await snapshot(page), trace = stored.telemetry.find(t => t.gameId === initial.id)!;
  expect(trace.sources.manual).toBeGreaterThan(0);
  expect(trace.sources.auto).toBeGreaterThan(0);
  expect(trace.events.some(e => e.source === 'auto' && (e.changes.moves ?? 0) > 0)).toBe(true);
  await info.attach('fresh-identity', { contentType: 'application/json', body: JSON.stringify({
    id: saved.game.id, assembly: saved.game.maze.layout!.assembly,
    rooms: saved.game.maze.layout!.rooms.map(r => r.id), connections: saved.game.maze.layout!.connections!.map(c => c.id),
    sources: trace.sources,
  }, null, 2) });
});
