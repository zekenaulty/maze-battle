import { test, expect, seed, fixture } from './rpg-command-browser';

test('clock rollback cannot prevent a causally later move or knowledge projection', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-11T12:00:00Z') });
  const request = await seed(page);
  await page.clock.setSystemTime(new Date('2026-10-11T11:00:00Z'));
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, moved = await h.commands.executeOwnedGameCommand(request);
    const history = await h.history.readRpgHistory();
    const old = h.projectRpgKnowledge(undefined, history.records[1].observation);
    if (old.status !== 'known') throw new Error('Initial source not projected');
    const next = h.projectRpgKnowledge(old, history.records[0].observation);
    return { moved, history, next };
  }, request);
  expect(result.moved.receipt.outcome).toEqual({ status: 'applied', reason: 'moved' });
  expect(result.moved.current!.game.maze.active.column).toBe(2);
  expect(result.next.status).toBe('known');
  expect(result.history.records[0].observation.observedAt).toMatch(/^2026-10-11T11:00:/);
  expect(result.history.records[1].observation.observedAt).toMatch(/^2026-10-11T12:00:/);
});

test('a single wrong skip pointer cannot borrow a legitimate source from another save branch', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase(), game = h.game();
    game.maze.visibility = { radius: 0, explored: [] };
    await h.repository.saveGame('auto', 'Branch', 'auto', game);
    let state = await h.custody.claimGame('owner');
    state.control = await h.custody.changeOwnedSave(state.control, { type: 'create', label: 'Root' });
    const manual = (await h.repository.listSaves()).find(s => s.kind === 'manual')!;
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 4 } } }));
    const discarded = (await h.history.readRpgHistory()).records[0];
    state = await h.custody.loadOwnedGame(state.control, manual.slotId);
    for (const column of [2, 3, 2]) {
      state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column } } }));
    }
    const before = await h.history.readRpgHistory(), head = (await db.get('observations', before.snapshotId!))!;
    head.ancestors[1] = discarded.id;
    await db.put('observations', head);
    let error = '';
    try { await h.history.readRpgHistory('auto', { snapshotId: before.snapshotId, cursor: { id: discarded.id, depth: discarded.depth }, limit: 1 }); }
    catch (e) { error = String(e); }
    return { error, absentBeforeCorruption: !before.records.some(n => n.id === discarded.id) };
  });
  expect(result.absentBeforeCorruption).toBe(true);
  expect(result.error).toContain('Invalid or unavailable observation history');
});

test('loading a missing-parent snapshot fails before replacing a valid current game and history', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    await h.repository.saveGame('auto', 'Root', 'auto', h.game());
    let state = await h.custody.claimGame('owner');
    const root = (await h.history.readRpgHistory()).snapshotId!;
    state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 2 } } }));
    state.control = await h.custody.changeOwnedSave(state.control, { type: 'create', label: 'Broken later' });
    const manual = (await h.repository.listSaves()).find(s => s.kind === 'manual')!;
    state = await h.custody.replaceOwnedGame(state.control, h.game());
    const before = await h.history.readRpgHistory();
    await db.delete('observations', root);
    let error = '';
    try { await h.custody.loadOwnedGame(state.control, manual.slotId); } catch (e) { error = String(e); }
    return { state, before, error, after: await h.custody.readGameControl(), history: await h.history.readRpgHistory() };
  });
  expect(result.error).toContain('Invalid or unavailable observation history');
  expect(result.after).toEqual(result.state);
  expect(result.history).toEqual(result.before);
});
