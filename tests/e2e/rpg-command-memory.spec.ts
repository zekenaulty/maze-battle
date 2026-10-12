import { test, expect, fixture } from './rpg-command-browser';

test('memory queries expose only indexed earned evidence and separate room details from the room list', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    const room = { ...h.roomAt('entrance', 'start', 0), columns: 3 };
    game.maze = { ...h.lineMaze(20, [room, h.roomAt('secret', 'treasure', 19)], 1), visibility: { radius: 1, explored: [] } };
    await h.repository.saveGame('auto', 'Memory', 'auto', game);
    await h.custody.claimGame('owner');
    const before = await h.custody.readGameControl(), source = await h.history.readRpgHistory();
    const unprepared = await h.memory.readRpgCells('auto', [{ floor: 1, row: 0, column: 1 }]);
    const prepared = await h.memory.prepareRpgMemory();
    const cells = await h.memory.readRpgCells('auto', [1, 19].map(column => ({ floor: 1, row: 0, column })));
    return { before, source, unprepared, prepared, cells, room: await h.memory.readRpgRoom('auto', 1, 'entrance'),
      unknown: await h.memory.readRpgRoom('auto', 1, 'secret'), rooms: await h.memory.readRpgRooms('auto', 1),
      after: await h.custody.readGameControl(), finalSources: await h.history.readRpgHistory() };
  });
  expect(result.unprepared.status).toBe('unprepared');
  expect(result.prepared.status).toBe('ready');
  expect(result.cells).toMatchObject({ status: 'ready', data: { cells: [{ address: { column: 1 } }], unknown: [{ floor: 1, row: 0, column: 19 }] } });
  expect(result.room).toMatchObject({ status: 'ready', data: { rememberedCellCount: 3, cells: [{ address: { column: 0 } }, { address: { column: 1 } }, { address: { column: 2 } }] } });
  expect(result.rooms).toMatchObject({ status: 'ready', data: { rooms: [{ id: 'entrance', rememberedCellCount: 3 }] } });
  expect(result.unknown).toMatchObject({ status: 'ready', data: { rememberedCellCount: 0, cells: [] } });
  expect(result.after).toEqual(result.before);
  expect(result.finalSources).toEqual(result.source);
});

test('indexed cells match the shared reducer including cropped-edge provenance and hidden changes', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.visibility = { radius: 2, explored: [] };
    await h.repository.saveGame('auto', 'Compare', 'auto', game);
    let state = await h.custody.claimGame('owner');
    const first = (await h.history.readRpgHistory()).records[0].observation;
    const a = h.projectRpgKnowledge(undefined, first); if (a.status !== 'known') throw new Error('Missing initial projection');
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, visibility: { radius: 0, explored: [] } }, chests: g.chests.map(c => ({ ...c, opened: true })) }));
    const second = (await h.history.readRpgHistory()).records[0].observation;
    const expected = h.projectRpgKnowledge(a, second); if (expected.status !== 'known') throw new Error('Missing projection');
    const partial = await h.memory.prepareRpgMemory('auto', { maxSources: 1 });
    const stillUnprepared = await h.memory.readRpgCells('auto', [{ floor: 1, row: 0, column: 1 }]);
    const complete = await h.memory.prepareRpgMemory('auto', { maxSources: 1 });
    const actual = await h.memory.readRpgCells('auto', [0, 1, 2, 3].map(column => ({ floor: 1, row: 0, column })));
    return { partial, stillUnprepared, complete, expected: Object.values(expected.floors[1].cells), actual };
  });
  expect(result.partial.status).toBe('partial');
  expect(result.stillUnprepared.status).toBe('unprepared');
  expect(result.complete.status).toBe('ready');
  expect(result.actual).toMatchObject({ status: 'ready', data: { cells: result.expected, unknown: [] } });
});

test('manual load and branch queries retain old knowledge without admitting a later root or pagination cursor', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.visibility = { radius: 0, explored: [] };
    game.maze.layout = { version: 'structured-v1', rooms: [h.roomAt('A', 'start', 1), h.roomAt('B', 'treasure', 4)], mainPath: [], zones: [] };
    await h.repository.saveGame('auto', 'Branches', 'auto', game);
    let state = await h.custody.claimGame('owner');
    await h.memory.prepareRpgMemory();
    state.control = await h.custody.changeOwnedSave(state.control, { type: 'create', label: 'Old' });
    const oldId = (await h.repository.listSaves()).find(s => s.kind === 'manual')!.slotId;
    const old = await h.memory.readRpgRooms(oldId, 1);
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 4 } } }));
    await h.memory.prepareRpgMemory();
    const future = await h.memory.readRpgRooms('auto', 1, { limit: 1 });
    if (future.status !== 'ready') throw new Error('No future memory');
    state = await h.custody.loadOwnedGame(state.control, oldId);
    let error = '';
    try { await h.memory.readRpgRooms('auto', 1, { snapshotId: future.snapshotId, after: future.data.next }); } catch (e) { error = String(e); }
    return { old, future, error, restored: await h.memory.readRpgRooms('auto', 1),
      hidden: await h.memory.readRpgCells('auto', [{ floor: 1, row: 0, column: 4 }]), state };
  });
  expect(result.restored).toEqual(result.old);
  expect(result.error).toContain('Invalid or unavailable RPG memory');
  expect(result.hidden).toMatchObject({ status: 'ready', data: { cells: [], unknown: [{ column: 4 }] } });
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  expect(await page.evaluate(() => window.rpgCommandTest.memory.readRpgRooms('auto', 1))).toEqual(result.restored);
});

test('observed room membership changes update derived indexes without changing old saved indexes', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.layout = { version: 'structured-v1', rooms: [h.roomAt('old', 'start', 1)], mainPath: [], zones: [] };
    game.maze.visibility = { radius: 0, explored: [] };
    await h.repository.saveGame('auto', 'Membership', 'auto', game);
    let state = await h.custody.claimGame('owner'); await h.memory.prepareRpgMemory();
    state.control = await h.custody.changeOwnedSave(state.control, { type: 'create', label: 'Before' });
    const oldId = (await h.repository.listSaves()).find(s => s.kind === 'manual')!.slotId;
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze,
      layout: { ...g.maze.layout!, rooms: [h.roomAt('new', 'start', 1)] } } }));
    await h.memory.prepareRpgMemory();
    return { current: await h.memory.readRpgRooms('auto', 1), old: await h.memory.readRpgRooms(oldId, 1),
      removed: await h.memory.readRpgRoom('auto', 1, 'old') };
  });
  expect(result.current).toMatchObject({ status: 'ready', data: { rooms: [{ id: 'new', rememberedCellCount: 1 }] } });
  expect(result.old).toMatchObject({ status: 'ready', data: { rooms: [{ id: 'old', rememberedCellCount: 1 }] } });
  expect(result.removed).toMatchObject({ status: 'ready', data: { cells: [], rememberedCellCount: 0 } });
});
