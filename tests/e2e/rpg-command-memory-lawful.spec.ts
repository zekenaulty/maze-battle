import { test, expect, fixture } from './rpg-command-browser';

test('identical earned sources yield identical memory outputs despite different unseen worlds', async ({ browser }) => {
  const outputs = [], external: string[] = [], errors: string[] = [];
  for (const variant of [false, true]) {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5204') return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    try {
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await fixture(page); await page.clock.setFixedTime(new Date('2026-10-11T12:00:00Z'));
      outputs.push(await page.evaluate(async variant => {
        const h = window.rpgCommandTest, game = h.game();
        game.maze = { ...h.lineMaze(20, [h.roomAt('near', 'start', 1), h.roomAt(variant ? 'secret' : 'different', 'treasure', 19)], 1),
          visibility: { radius: 1, explored: variant ? [{ row: 0, column: 19 }] : [] } };
        if (variant) { game.maze.cells[15].links = []; game.chests.push({ id: 'unseen-chest', level: 1, position: { row: 0, column: 19 }, opened: false }); }
        await h.repository.saveGame('auto', 'Twin', 'auto', game);
        const uuid = crypto.randomUUID;
        crypto.randomUUID = () => '00000000-0000-4000-8000-000000000001';
        try { await h.custody.claimGame('owner'); } finally { crypto.randomUUID = uuid; }
        const prepared = await h.memory.prepareRpgMemory();
        return { prepared, room: await h.memory.readRpgRoom('auto', 1, 'near'), unknown: await h.memory.readRpgRoom('auto', 1, 'secret'),
          rooms: await h.memory.readRpgRooms('auto', 1), cells: await h.memory.readRpgCells('auto', [1, 19].map(column => ({ floor: 1, row: 0, column }))) };
      }, variant));
    } finally { await context.close(); }
  }
  expect(outputs[0]).toEqual(outputs[1]);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('identical coordinates and room IDs on different floors retain separate observed facts', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.layout = { version: 'structured-v1', rooms: [h.roomAt('entry', 'start', 1)], mainPath: [], zones: [] };
    game.maze.visibility = { radius: 0, explored: [] };
    await h.repository.saveGame('auto', 'Floors', 'auto', game);
    let state = await h.custody.claimGame('owner');
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, dungeonLevel: 2,
      maze: { ...g.maze, cells: g.maze.cells.map(c => ({ ...c, links: [] })) } }));
    await h.memory.prepareRpgMemory();
    return { cells: await h.memory.readRpgCells('auto', [1, 2, 3].map(floor => ({ floor, row: 0, column: 1 }))),
      first: await h.memory.readRpgRooms('auto', 1), second: await h.memory.readRpgRooms('auto', 2), third: await h.memory.readRpgRooms('auto', 3) };
  });
  expect(result.cells).toMatchObject({ status: 'ready', data: { cells: [{ address: { floor: 1 } }, { address: { floor: 2 } }], unknown: [{ floor: 3 }] } });
  expect(result.first).toMatchObject({ status: 'ready', data: { rooms: [{ id: 'entry', rememberedCellCount: 1 }] } });
  expect(result.second).toMatchObject({ status: 'ready', data: { rooms: [{ id: 'entry', rememberedCellCount: 1 }] } });
  expect(result.third).toMatchObject({ status: 'ready', data: { rooms: [] } });
});
