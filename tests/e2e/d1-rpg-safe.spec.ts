import { test, expect, open, state, move, reload, stop, snapshot, pixels } from './d1-rpg-browser';
import { opposite } from '../../src/domain/maze/movement';
import { inside, safeRoom } from './d1-rpg-fixtures';

for (const control of ['manual', 'auto']) {
  test(`forced encounters respect generated v3 safe boundary in ${control} and native reload`, async ({ page }, info) => {
    await open(page, `safe-${control}`);
    const edge = (await page.evaluate(() => window.d1Rpg.edge))!, initial = await state(page);
    expect(initial.randomBattles).toBe(true);
    expect(initial.maze.layout?.version).toBe('structured-v3');
    const room = initial.maze.layout!.rooms.find(r => r.id === edge.roomId)!;
    expect(safeRoom(room)).toBe(true);
    expect(inside(edge.door, room)).toBe(true);
    expect(inside(edge.inner, room)).toBe(true);
    expect(initial.maze.layout!.rooms.some(r => inside(edge.outside, r))).toBe(false);
    expect(await page.evaluate(() => Math.random())).toBe(0);

    if (control === 'manual') {
      // Entering from a hostile passage is safe on the destination doorway cell.
      await move(page, opposite(edge.direction));
      expect((await state(page)).battle).toBeUndefined();
      await move(page, opposite(edge.direction));
      expect((await state(page)).battle).toBeUndefined();
      await move(page, edge.direction);
    } else {
      await page.getByRole('button', { name: 'Auto', exact: true }).click();
      await expect.poll(async () => (await state(page)).maze.active).toEqual(edge.door);
      expect((await state(page)).battle).toBeUndefined();
      await stop(page);
    }
    const atDoor = await state(page);
    expect(atDoor.maze.active).toEqual(edge.door);
    expect(atDoor.battle).toBeUndefined();
    await pixels(page, info, `safe-${control}-door`);
    await reload(page);
    expect(await state(page)).toEqual(atDoor);
    expect((await state(page)).randomBattles).toBe(true);
    expect(await page.evaluate(() => Math.random())).toBe(0);
    if (control === 'manual') {
      await move(page, opposite(edge.direction));
      expect((await state(page)).battle).toBeUndefined();
      await move(page, edge.direction);
      expect((await state(page)).battle).toBeUndefined();
      await move(page, edge.direction);
    } else {
      await move(page, opposite(edge.direction));
      await page.getByRole('button', { name: 'Auto', exact: true }).click();
      await expect.poll(async () => (await state(page)).maze.active).toEqual(edge.door);
      expect((await state(page)).battle).toBeUndefined();
    }
    await expect.poll(async () => (await state(page)).battle?.status).toBe('active');
    if (control === 'auto') await stop(page);
    const outside = await state(page);
    expect(outside.maze.active).toEqual(edge.outside);
    expect(outside.battle?.origin).toMatchObject({ floor: 1, position: edge.outside });
    expect(outside.battle?.origin?.roomId).toBeUndefined();
    expect(outside.randomBattles).toBe(true);
    expect(outside.chests.find(c => c.id === 'd1-boundary-target')?.opened).toBe(control === 'auto');
    await page.screenshot({ path: info.outputPath(`safe-${control}-outside-battle.png`) });
    const trace = (await snapshot(page)).telemetry.find(t => t.gameId === initial.id)!;
    expect(trace.events.some(e => e.source === control && (e.changes.moves ?? 0) > 0)).toBe(true);
    await info.attach('safe-boundary', { contentType: 'application/json', body: JSON.stringify({
      control, room, edge, randomBattles: outside.randomBattles, rng: 0, origin: outside.battle!.origin,
      sources: trace.sources,
    }, null, 2) });
  });
}
