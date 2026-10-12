import { test, expect, fixture, seed } from './rpg-command-browser';

test('legacy fog does not become history; only current lawful sight is captured at claim', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.visibility = { radius: 1, explored: game.maze.cells.map(({ row, column }) => ({ row, column })) };
    await h.repository.saveGame('auto', 'Legacy', 'auto', game);
    const before = await h.history.readRpgHistory();
    const owner = await h.custody.claimGame('owner');
    const first = await h.history.readRpgHistory();
    const after = await h.custody.claimGame('observer');
    return { before, owner, first, after, final: await h.history.readRpgHistory() };
  });
  expect(result.before.records).toEqual([]);
  expect(result.first.records).toHaveLength(1);
  expect(result.first.records[0].observation.cells.map(c => c.address.column)).toEqual([0, 1, 2]);
  expect(result.first.records[0].observation.revision).toEqual(result.owner.control);
  expect(result.first.records[0].observation.cells.at(-1)!.links).not.toContain('east');
  expect(result.first.records[0].observation.cells.at(-1)!.blocked).not.toContain('east');
  expect(result.after).toEqual(result.owner);
  expect(result.final).toEqual(result.first);
});

test('manual snapshot restores its own history, branches without borrowing future observations, and survives reload', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    const game = h.game(); game.maze.visibility = { radius: 0, explored: [] };
    await h.repository.saveGame('auto', 'Before sight', 'auto', game);
    let state = await h.custody.claimGame('owner');
    const saved = await h.history.readRpgHistory();
    const control = await h.custody.changeOwnedSave(state.control!, { type: 'create', label: 'Before exploring' });
    const slot = (await h.repository.listSaves()).find(s => s.kind === 'manual')!;
    state = await h.custody.updateOwnedGame(control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 4 } } }));
    const future = await h.history.readRpgHistory();
    state = await h.custody.loadOwnedGame(state.control!, slot.slotId);
    const restored = await h.history.readRpgHistory();
    const restoredKnowledge = h.projectRpgKnowledge(undefined, restored.records[0].observation);
    const branch = await h.custody.updateOwnedGame(state.control!, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 2 } } }));
    const branched = await h.history.readRpgHistory();
    let unrelated = '';
    try { await h.history.readRpgHistory('auto', { snapshotId: branched.snapshotId,
      cursor: { id: future.records[0].id, depth: future.records[0].depth } }); }
    catch (e) { unrelated = String(e); }
    return { slot, saved, future, restored, restoredKnowledge, branched, branch, unrelated,
      manual: await h.history.readRpgHistory(slot.slotId), retainedFuture: await db.get('observations', future.snapshotId!) };
  });
  expect(result.restored).toEqual(result.saved);
  expect(result.manual).toEqual(result.saved);
  expect(result.restoredKnowledge.status).toBe('known');
  if (result.restoredKnowledge.status === 'known') {
    expect(Object.keys(result.restoredKnowledge.floors[1].cells)).toEqual(['0:1']);
  }
  expect(result.branched.records[0].ancestors[0]).toBe(result.saved.snapshotId);
  expect(result.branched.records.some(n => n.id === result.future.snapshotId)).toBe(false);
  expect(result.retainedFuture).toEqual(result.future.records[0]);
  expect(result.unrelated).toContain('Invalid or unavailable observation history');
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  expect(await page.evaluate(() => window.rpgCommandTest.history.readRpgHistory())).toEqual(result.branched);
});

test('unchanged ticks and hidden changes do not refresh sources; visible changes append without erasing history', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.visibility = { radius: 0, explored: [] };
    await h.repository.saveGame('auto', 'Limited sight', 'auto', game);
    let state = await h.custody.claimGame('owner');
    const initial = await h.history.readRpgHistory();
    for (let i = 0; i < 5; i++) state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, facing: i % 2 ? 'north' : 'south' }));
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, chests: g.chests.map(c => ({ ...c, opened: true })) }));
    const hidden = await h.history.readRpgHistory();
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 2 } } }));
    const seen = await h.history.readRpgHistory();
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, mode: 'town' }));
    const town = await h.history.readRpgHistory();
    await h.custody.updateOwnedGame(state.control, g => ({ ...g, mode: 'maze' }));
    return { initial, hidden, seen, town, returned: await h.history.readRpgHistory() };
  });
  expect(result.hidden).toEqual(result.initial);
  expect(result.seen.records[0].observation.cells[0].chests[0].opened).toBe(true);
  expect(result.seen.records[1]).toEqual(result.initial.records[0]);
  expect(result.town).toEqual(result.seen);
  expect(result.returned).toEqual(result.seen);
});

test('replacement resets even a reused game ID; GameSession loads the saved lineage, not the current one', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest;
    await h.repository.saveGame('auto', 'Session', 'auto', h.game());
    const session = new h.GameSession(() => {}); await session.start();
    const old = await h.history.readRpgHistory();
    await session.createManualSave();
    const manual = session.view.saves.find(s => s.kind === 'manual')!;
    await session.replaceGame(h.game());
    const replacement = await h.history.readRpgHistory();
    await session.loadSave(manual.slotId);
    const loaded = await h.history.readRpgHistory();
    session.stop();
    return { old, replacement, loaded };
  });
  expect(result.replacement.snapshotId).not.toBe(result.old.snapshotId);
  expect(result.replacement.records[0].depth).toBe(1);
  expect(result.loaded).toEqual(result.old);
});

test('effect receipts retain their original observation head after later mutations and duplicate delivery', async ({ page }) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    const moved = await h.commands.executeOwnedGameCommand(request);
    const open = { ...request, attemptId: 'loot', position: moved.current!.game.maze.active,
      control: moved.current!.control, command: { type: 'open-chest' as const, chestId: 'chest-2' } };
    const opened = await h.commands.executeOwnedGameCommand(open), history = await h.history.readRpgHistory();
    const repeated = await h.commands.executeOwnedGameCommand(open);
    return { moved, opened, history, repeated, final: await h.history.readRpgHistory(),
      movedSource: await db.get('observations', moved.receipt.observationHead!) };
  }, request);
  expect(result.opened.receipt.observationHead).toBe(result.history.snapshotId);
  expect(result.movedSource!.observation.cells.flatMap(c => c.chests).find(c => c.id === 'chest-2')!.opened).toBe(false);
  expect(result.history.records[0].observation.cells.flatMap(c => c.chests).find(c => c.id === 'chest-2')!.opened).toBe(true);
  expect(result.repeated.receipt).toEqual(result.opened.receipt);
  expect(result.final).toEqual(result.history);
});
