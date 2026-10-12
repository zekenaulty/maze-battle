import { test, expect, fixture } from './rpg-command-browser';

test('bounded indexed retrieval outgrows the resident 2048-cell cap without a full map or history scan', async ({ page }, info) => {
  test.setTimeout(120_000);
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    const rooms = Array.from({ length: 128 }, (_, i) => ({ ...h.roomAt(`room-${String(i).padStart(3, '0')}`, 'junction', i * 24), columns: 24 }));
    game.maze = { ...h.lineMaze(3072, rooms, 0), visibility: { radius: 16, explored: [] } };
    await h.repository.saveGame('auto', 'Scale', 'auto', game);
    let state = await h.custody.claimGame('owner');
    const columns = Array.from({ length: 97 }, (_, i) => Math.min((i + 1) * 32, 3071));
    for (const column of columns) state = await h.custody.updateOwnedGame(state.control,
      g => ({ ...g, maze: { ...g.maze, active: { row: 0, column } } }));
    const before = await h.custody.readGameControl(), db = await h.repository.getDatabase();
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function() { throw new Error('No full-store scans allowed'); };
    const prepared: unknown[] = [], started = performance.now();
    try {
      for (let i = 0; i < 128; i++) {
        const step = await h.memory.prepareRpgMemory('auto', { maxSources: 4 }); prepared.push(step);
        if (step.status === 'ready') break;
        if (step.status !== 'partial') throw new Error('Unexpected preparation state');
        if (i === 127) throw new Error('No bounded preparation progress');
      }
      const prepareMs = performance.now() - started, queried = performance.now();
      const selected = await h.memory.readRpgCells('auto', [0, 1024, 3071].map(column => ({ floor: 1, row: 0, column })));
      const firstRooms = await h.memory.readRpgRooms('auto', 1, { limit: 16 });
      if (firstRooms.status !== 'ready') throw new Error('No room index');
      const secondRooms = await h.memory.readRpgRooms('auto', 1, { snapshotId: firstRooms.snapshotId, after: firstRooms.data.next, limit: 16 });
      const farRoom = await h.memory.readRpgRoom('auto', 1, 'room-000', { limit: 8 });
      if (farRoom.status !== 'ready') throw new Error('No far room');
      const nextCells = await h.memory.readRpgRoom('auto', 1, 'room-000', { snapshotId: farRoom.snapshotId, after: farRoom.data.next, limit: 8 });
      return { prepared, prepareMs, queryMs: performance.now() - queried, selected, firstRooms, secondRooms, farRoom, nextCells,
        payloadBytes: new TextEncoder().encode(JSON.stringify({ selected, firstRooms, secondRooms, farRoom, nextCells })).length,
        storedNodes: await db.count('rpgMemoryNodes'), storedHeads: await db.count('rpgMemoryHeads'),
        sources: await db.count('observations'), unchangedGame: JSON.stringify(before) === JSON.stringify(await h.custody.readGameControl()) };
    } finally { IDBObjectStore.prototype.getAll = getAll; }
  });
  expect(result.unchangedGame).toBe(true);
  expect(result.storedHeads).toBe(result.sources);
  expect(result.selected).toMatchObject({ status: 'ready', data: { cells: [{ address: { column: 0 } }, { address: { column: 1024 } }, { address: { column: 3071 } }], unknown: [] } });
  expect(result.firstRooms.data.rooms).toHaveLength(16);
  expect(result.secondRooms.status).toBe('ready');
  if (result.secondRooms.status === 'ready') expect(result.secondRooms.data.rooms[0].id).toBe('room-016');
  expect(result.farRoom.data.rememberedCellCount).toBe(24);
  expect(result.farRoom.data.cells).toHaveLength(8);
  expect(result.nextCells.status).toBe('ready');
  if (result.nextCells.status === 'ready') expect(result.nextCells.data.cells[0].address.column).toBe(8);
  if (result.selected.status === 'ready') expect(result.selected.work.reads).toBeLessThan(200);
  expect(result.payloadBytes).toBeLessThan(65536);
  await info.attach('scoped-memory-scale', { contentType: 'application/json', body: JSON.stringify(result) });
});
