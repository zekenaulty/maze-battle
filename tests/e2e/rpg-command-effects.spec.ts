import { test, expect, seed, fixture } from './rpg-command-browser';

test('atomic move, explicit chest effect, exact replay after reload and ownership change', async ({ page }, info) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, before = await h.custody.readGameControl();
    const moved = await h.commands.executeOwnedGameCommand(request);
    const open = { ...request, attemptId: 'open-original', control: moved.current!.control,
      position: moved.current!.game.maze.active, command: { type: 'open-chest' as const, chestId: moved.current!.game.chests[0].id } };
    const opened = await h.commands.executeOwnedGameCommand(open);
    const replay = await h.commands.executeOwnedGameCommand(open);
    const now = Date.now;
    let expiredReplay;
    try {
      Date.now = () => open.deadlineAt + 1;
      expiredReplay = await h.commands.executeOwnedGameCommand(open);
    } finally { Date.now = now; }
    return { before, moved, opened, replay, expiredReplay, open };
  }, request);
  expect(result.moved.current!.game.maze.active).toEqual({ row: 0, column: 2 });
  expect(result.moved.current!.game.chests).toEqual(result.before.game!.chests);
  expect(result.moved.current!.game.inventory).toEqual(result.before.game!.inventory);
  expect(result.opened.receipt.outcome).toEqual({ status: 'applied', reason: 'opened' });
  expect(result.opened.current!.game.chests[0].loot!.length).toBeGreaterThan(0);
  expect(result.replay.receipt).toEqual(result.opened.receipt);
  expect(result.replay.current).toEqual(result.opened.current);
  expect(result.replay.replayed).toBe(true);
  expect(result.expiredReplay!.receipt).toEqual(result.opened.receipt);
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  const recovered = await page.evaluate(async open => {
    const h = window.rpgCommandTest;
    const adopted = await h.custody.claimGame('new-owner', true);
    const restored = await h.commands.settleGameCommand(open);
    const duplicate = await h.commands.executeOwnedGameCommand(open);
    return { adopted, restored, duplicate, final: await h.custody.readGameControl() };
  }, result.open);
  expect(recovered.restored.receipt).toEqual(result.opened.receipt);
  expect(recovered.duplicate.receipt).toEqual(result.opened.receipt);
  expect(recovered.final).toEqual(recovered.adopted);
  expect(recovered.final.game!.inventory).toEqual(result.opened.current!.game.inventory);
  await info.attach('effect-and-recovery', { contentType: 'application/json', body: JSON.stringify({ result, recovered }) });
});

test('same attempt with changed input never executes or replaces its receipt', async ({ page }) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, first = await h.commands.executeOwnedGameCommand(request);
    let error = '';
    try { await h.commands.executeOwnedGameCommand({ ...request, command: { ...request.command, direction: 'west' } as typeof request.command }); }
    catch (failure) { error = String(failure); }
    return { first, error, current: await h.custody.readGameControl(), stored: await h.commands.readGameCommand(request) };
  }, request);
  expect(result.error).toContain('Invalid game command or receipt');
  expect(result.current).toEqual(result.first.current);
  expect(result.stored).toEqual(result.first.receipt);
});

test('settling a missing original permanently prevents its late execution', async ({ page }) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, before = await h.custody.readGameControl();
    const settled = await h.commands.settleGameCommand(request);
    const late = await h.commands.executeOwnedGameCommand(request);
    return { before, settled, late, after: await h.custody.readGameControl() };
  }, request);
  expect(result.settled.receipt.outcome).toEqual({ status: 'not-applied', reason: 'settled' });
  expect(result.late.receipt).toEqual(result.settled.receipt);
  expect(result.after).toEqual(result.before);
});

test('concurrent duplicate execution serializes to one actual effect', async ({ page }) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest;
    const first = h.commands.executeOwnedGameCommand(request), second = h.commands.executeOwnedGameCommand(request);
    return { first: await first, second: await second, after: await h.custody.readGameControl() };
  }, request);
  expect(result.second.receipt).toEqual(result.first.receipt);
  expect(result.second.replayed).toBe(true);
  expect(result.after.control!.revision).toBe(request.control.revision + 1);
  expect(result.after.game!.maze.active.column).toBe(2);
});

test('GameSession awaits the receipt and does not refresh a stale request after manual input', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest;
    await h.repository.saveGame('auto', 'Session', 'auto', h.game());
    const session = new h.GameSession(() => {}); await session.start();
    const request = session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false });
    const receipt = await session.executeCommand(request);
    const stale = session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false });
    session.transition(g => ({ ...g, facing: 'north' }), { source: 'manual', action: 'takeover' });
    const rejected = await session.executeCommand(stale);
    session.stop();
    const replay = await session.reconcileCommand(request);
    return { receipt, rejected, replay, state: await h.custody.readGameControl() };
  });
  expect(result.receipt.outcome.status).toBe('applied');
  expect(result.rejected.outcome).toEqual({ status: 'not-applied', reason: 'conflict' });
  expect(result.replay).toEqual(result.receipt);
  expect(result.state.game!.maze.active.column).toBe(2);
  expect(result.state.game!.facing).toBe('north');
});
