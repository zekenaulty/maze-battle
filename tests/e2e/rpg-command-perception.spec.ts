import { test, expect, fixture } from './rpg-command-browser';

test('perception regions and tool cell recall use the same source facts in native IndexedDB', async ({ page }, info) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze = { ...game.maze, active: { row: 0, column: 0 }, visibility: { radius: 2, explored: [] } };
    await h.repository.saveGame('auto', 'Perception', 'auto', game);
    const state = await h.custody.claimGame('owner');
    await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, visibility: { radius: 0, explored: [] } } }));
    await h.memory.prepareRpgMemory();
    const region = await h.memory.readRpgPerceptionRegion('auto', { floor: 1, row: 0, column: 0, rows: 1, columns: 5 });
    if (region.status !== 'ready') throw new Error('Unprepared fixture');
    const tools = await h.memory.readRpgCells('auto', Array.from({ length: 5 }, (_, column) => ({ floor: 1, row: 0, column })), region.snapshotId);
    const source = (await h.history.readRpgHistory()).records[0].observation;
    return { region, tools, source };
  });
  expect(result.tools).toMatchObject({ status: 'ready', data: { cells: result.region.data.cells.map(c => c.fact) } });
  expect(result.region.data.cells.map(c => c.state)).toEqual(['visible', 'remembered', 'remembered']);
  expect(result.region.data.cells[0]).toMatchObject({ observation: result.source.cells[0] });
  expect(result.region.data.cells[2].fact.chests[0]).toMatchObject({ opened: false });
  expect(result.region.work.writes).toBe(0);
  await info.attach('perception-source-parity', { contentType: 'application/json', body: JSON.stringify(result) });
});

test('unseen world changes, legacy explored flags and whole-world extent do not refresh a perception region', async ({ page }, info) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game(), scope = { floor: 1, row: 0, column: 0, rows: 1, columns: 6 };
    game.maze = { ...game.maze, active: { row: 0, column: 0 }, visibility: { radius: 2, explored: [] } };
    await h.repository.saveGame('auto', 'Unseen', 'auto', game);
    let state = await h.custody.claimGame('owner');
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, visibility: { radius: 0, explored: [] } } }));
    await h.memory.prepareRpgMemory();
    const before = await h.memory.readRpgPerceptionRegion('auto', scope), sources = await h.history.readRpgHistory();
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g,
      chests: g.chests.map(c => ({ ...c, opened: true })),
      maze: { ...g.maze, rows: 999, columns: 999, end: { row: 500, column: 500 },
        visibility: { radius: 0, explored: Array.from({ length: 6 }, (_, column) => ({ row: 0, column })) },
        cells: g.maze.cells.map(cell => cell.column === 2 ? { ...cell, links: [] } : cell),
        layout: { version: 'structured-v1', rooms: [h.roomAt('hidden-role', 'boss', 5)], mainPath: [{ row: 0, column: 5 }], zones: [] },
      } }));
    const after = await h.memory.readRpgPerceptionRegion('auto', scope), laterSources = await h.history.readRpgHistory();
    return { before, after, sources, laterSources, state };
  });
  expect(result.state.game.chests[0].opened).toBe(true);
  expect(result.state.game.maze.columns).toBe(999);
  expect(result.after).toEqual(result.before);
  expect(result.laterSources).toEqual(result.sources);
  expect(result.before).toMatchObject({ status: 'ready', data: { cells: [
    { fact: { address: { column: 0 } } }, { fact: { address: { column: 1 } } },
    { fact: { address: { column: 2 }, chests: [{ opened: false }] } },
  ] } });
  await info.attach('unseen-mutation-proof', { contentType: 'application/json', body: JSON.stringify(result) });
});

test('fresh observation changes display facts; saved older perception and receipts survive reload', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game(), scope = { floor: 1, row: 0, column: 0, rows: 1, columns: 4 };
    game.maze.visibility = { radius: 2, explored: [] };
    await h.repository.saveGame('auto', 'Observe again', 'auto', game);
    let state = await h.custody.claimGame('owner');
    await h.memory.prepareRpgMemory();
    state.control = await h.custody.changeOwnedSave(state.control, { type: 'create', label: 'Before' });
    const oldId = (await h.repository.listSaves()).find(s => s.kind === 'manual')!.slotId;
    const old = await h.memory.readRpgPerceptionRegion(oldId, scope);
    if (old.status !== 'ready') throw new Error('Missing old source');
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, chests: g.chests.map(c => ({ ...c, opened: true })),
      maze: { ...g.maze, active: { row: 0, column: 2 }, visibility: { radius: 0, explored: [] } } }));
    await h.memory.prepareRpgMemory();
    const latest = await h.memory.readRpgPerceptionRegion('auto', scope);
    let stale = '';
    try { await h.memory.readRpgPerceptionRegion('auto', scope, old.snapshotId); } catch (e) { stale = String(e); }
    return { oldId, old, latest, stale, again: await h.memory.readRpgPerceptionRegion(oldId, scope, old.snapshotId),
      receipts: await h.history.readRpgHistory(oldId), scope };
  });
  expect(result.latest).toMatchObject({ status: 'ready', data: { cells: [
    { state: 'remembered' }, { state: 'remembered' }, { state: 'visible', fact: { chests: [{ opened: true }] } }, { state: 'remembered' },
  ] } });
  expect(result.again).toEqual(result.old);
  expect(result.stale).toContain('Invalid or unavailable RPG memory');
  expect(result.receipts.records[0].observation.cells.find(c => c.address.column === 2)!.chests[0].opened).toBe(false);
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  expect(await page.evaluate(({ scope }) => window.rpgCommandTest.memory.readRpgPerceptionRegion('auto', scope), result)).toEqual(result.latest);
  expect(await page.evaluate(({ scope, oldId }) => window.rpgCommandTest.memory.readRpgPerceptionRegion(oldId, scope), result)).toEqual(result.old);
});

test('unprepared, invalid, cancelled and read-exhausted display requests do not mutate saves or history', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, scope = { floor: 1, row: 0, column: 0, rows: 1, columns: 5 };
    await h.repository.saveGame('auto', 'Failures', 'auto', h.game());
    await h.custody.claimGame('owner');
    const before = await h.custody.readGameControl(), sources = await h.history.readRpgHistory();
    const unprepared = await h.memory.readRpgPerceptionRegion('auto', scope);
    await h.memory.prepareRpgMemory();
    const controller = new AbortController(); controller.abort();
    const errors: string[] = [];
    for (const work of [{ maxReads: 1 }, { signal: controller.signal }]) {
      try { await h.memory.readRpgPerceptionRegion('auto', scope, undefined, work); } catch (e) { errors.push(String(e)); }
    }
    try { await h.memory.readRpgPerceptionRegion('auto', { ...scope, rows: 64, columns: 64 }); } catch (e) { errors.push(String(e)); }
    return { unprepared, errors, before, sources, after: await h.custody.readGameControl(), final: await h.history.readRpgHistory() };
  });
  expect(result.unprepared).toMatchObject({ status: 'unprepared', reason: 'index-incomplete' });
  expect(result.errors[0]).toContain('read budget exhausted');
  expect(result.errors[1]).toContain('AbortError');
  expect(result.errors[2]).toContain('Invalid or unavailable RPG memory');
  expect(result.after).toEqual(result.before);
  expect(result.final).toEqual(result.sources);
});
