import { test, expect, open, state, geometry, walk, move, reload, pixels } from './d1-rpg-browser';
import { opposite } from '../../src/domain/maze/movement';
import { samePosition } from '../../src/domain/maze/key';
import { findPath } from '../../src/domain/maze/solver';
import { inside } from './d1-rpg-fixtures';

for (const scenario of ['original', 'classic', 'v1', 'v2']) {
  test(`${scenario} archived floor retains chest and quest progress through stairs, portal and native reload`, async ({ page }, info) => {
    await open(page, scenario);
    const initial = await state(page), level = initial.dungeonLevel, topology = geometry(initial.maze);
    expect(initial.randomBattles).toBe(false);
    expect(initial.maze.layout?.version).toBe(scenario === 'v1' ? 'structured-v1' : scenario === 'v2' ? 'structured-v2' : undefined);
    const fetch = initial.quests.find(q => q.floor === level && q.task.objective === 'fetch' && q.status === 'active');
    const room = initial.maze.layout?.rooms.find(r => r.id === fetch?.targetRoomId);
    const chest = initial.chests.find(c => c.level === level && !c.opened && !samePosition(c.position, initial.maze.active)
      && (!room || inside(c.position, room)))!;
    expect(chest).toBeDefined();
    await walk(page, chest.position);
    expect((await state(page)).chests.find(c => c.id === chest.id)?.opened).toBe(false);
    await page.getByRole('button', { name: 'Open chest', exact: true }).click();
    await expect.poll(async () => (await state(page)).chests.find(c => c.id === chest.id)?.opened).toBe(true);
    const progressed = await state(page), opened = progressed.chests.find(c => c.id === chest.id)!;
    expect(opened.opened).toBe(true);
    expect(opened.loot?.length).toBeGreaterThan(0);
    if (scenario === 'v1' || scenario === 'v2') {
      expect(fetch).toBeDefined();
      expect(progressed.quests.find(q => q.id === fetch!.id)).toMatchObject({ status: 'complete', task: { progress: fetch!.task.required } });
    }
    await reload(page);
    expect(await state(page)).toEqual(progressed);
    const down = findPath(progressed.maze, progressed.maze.end)!.directions;
    await walk(page, progressed.maze.end, level + 1);
    const next = await state(page), newTopology = geometry(next.maze);
    expect(next.maze.layout?.version).toBe('structured-v3');
    expect(geometry(next.floors.find(f => f.level === level)!.maze)).toEqual(topology);
    await pixels(page, info, `${scenario}-new-v3`);
    const scrolls = (game: typeof next) => game.inventory.items.filter(i => i.consumableEffect === 'townPortal').reduce((n, i) => n + (i.quantity ?? 1), 0);
    expect(scrolls(next)).toBeGreaterThan(0);
    await page.getByRole('button', { name: /^Portal \(/ }).click();
    await expect.poll(async () => (await state(page)).mode).toBe('town');
    const town = await state(page);
    expect(scrolls(town)).toBe(scrolls(next) - 1);
    expect(town.quests).toEqual(next.quests);
    await reload(page);
    expect(await state(page)).toEqual(town);
    if (fetch) {
      await page.getByRole('tab', { name: 'Guild', exact: true }).click();
      await page.locator('.guild-contract').filter({ has: page.getByText(fetch.title, { exact: true }) })
        .getByRole('button', { name: 'Claim', exact: true }).click();
      await expect.poll(async () => (await state(page)).quests.find(q => q.id === fetch.id)?.status).toBe('claimed');
      expect((await state(page)).inventory.gold).toBe(town.inventory.gold + fetch.reward.gold);
      const claimed = await state(page);
      await reload(page);
      expect(await state(page)).toEqual(claimed);
    }
    await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
    await expect.poll(async () => (await state(page)).mode).toBe('manual');
    expect((await state(page)).maze).toEqual(next.maze);
    const off = next.maze.cells.find(c => samePosition(c, next.maze.start))!.links[0];
    await move(page, off);
    await move(page, opposite(off), level);
    const returned = await state(page);
    expect(geometry(returned.maze)).toEqual(topology);
    expect(returned.maze.active).toEqual(initial.maze.end);
    expect(returned.maze.visited).toEqual(expect.arrayContaining(progressed.maze.visited));
    expect(returned.maze.visibility!.explored).toEqual(expect.arrayContaining(progressed.maze.visibility!.explored));
    expect(returned.chests.find(c => c.id === chest.id)).toEqual(opened);
    for (const q of progressed.quests.filter(q => q.status === 'claimed')) expect(returned.quests.find(r => r.id === q.id)).toEqual(q);
    if (fetch) expect(returned.quests.find(q => q.id === fetch.id)?.status).toBe('claimed');
    // Leave/re-enter the saved exit through UI movement; never regenerate the new floor.
    await move(page, opposite(down.at(-1)!));
    await move(page, down.at(-1)!, level + 1);
    expect(geometry((await state(page)).maze)).toEqual(newTopology);
    const final = await state(page);
    await reload(page);
    expect(await state(page)).toEqual(final);
    expect(final.battle).toBeUndefined();
    await info.attach('retained-progress', { contentType: 'application/json', body: JSON.stringify({
      scenario, level, versions: final.floors.map(f => f.maze.layout?.version ?? 'layout-free'),
      chest: opened, claimed: progressed.quests.filter(q => q.status === 'claimed'),
      oldCells: topology.cells.length, newCells: newTopology.cells.length,
    }, null, 2) });
  });
}
