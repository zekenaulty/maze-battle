import { test, expect, fixture, seed } from './rpg-command-browser';
import type { RpgTravelRequest } from '../../src/persistence/rpgTravel/types';

async function start(page: Parameters<typeof seed>[0]) {
  const base = await seed(page);
  return page.evaluate(async base => {
    const h = window.rpgCommandTest;
    await h.memory.prepareRpgMemory();
    const request: RpgTravelRequest = { attemptId: 'start', operationId: 'journey', gameId: base.gameId,
      control: base.control, deadlineAt: Date.now() + 120_000,
      action: { type: 'start', target: { floor: 1, row: 0, column: 5 }, limits: { steps: 64, replans: 4, durationMs: 120_000 } } };
    const result = await h.travel.executeRpgTravel(request);
    return { request, result };
  }, base);
}

test('real GameSession locally traverses several remembered rooms across windows without looting or stairs', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze = h.lineMaze(18, [h.roomAt('entry', 'hub', 0), h.roomAt('hall', 'junction', 5), h.roomAt('vault', 'treasure', 12)], 1);
    game.maze.visibility = { radius: 3, explored: [] };
    await h.repository.saveGame('auto', 'Travel', 'auto', game);
    let owned = await h.custody.claimGame('setup');
    // Earn all route facts beforehand; the executor below sees only those receipts.
    for (const column of [4, 7, 10, 13, 16, 13, 10, 7, 4, 1]) owned = await h.custody.updateOwnedGame(owned.control,
      state => ({ ...state, maze: { ...state.maze, active: { row: 0, column } } }));
    const published: number[] = [], session = new h.GameSession(view => { if (view.game) published.push(view.game.maze.active.column); });
    await session.start();
    while ((await session.prepareTravelMemory()).status === 'partial') { /* Bounded batches, no provider. */ }
    const before = session.view.game!;
    const admission = await session.executeTravel(session.travelRequest('actual-game-journey', { type: 'start',
      target: { floor: 1, row: 0, column: 17 }, limits: { steps: 64, replans: 4, durationMs: 120_000 } }));
    const first = await h.travel.runTravelWindow(session, 'actual-game-journey', { maxSteps: 5 });
    const second = await h.travel.runTravelWindow(session, 'actual-game-journey', { maxSteps: 16 });
    const after = session.view.game!, travel = await session.readTravel(); session.stop();
    return { admission, first, second, travel, published, after: { position: after.maze.active, floor: after.dungeonLevel,
      chests: after.chests, inventory: after.inventory }, before: { chests: before.chests, inventory: before.inventory } };
  });
  expect(result.admission.travel?.operation.status).toBe('running');
  expect(result.first).toMatchObject({ reason: 'window-ended', steps: 5 });
  expect(result.second).toMatchObject({ reason: 'checkpoint', steps: 11 });
  expect(result.travel?.travel.operation).toMatchObject({ status: 'arrived', steps: 16, replans: 0, nextStep: 16 });
  expect(result.after.position).toEqual({ row: 0, column: 17 }); expect(result.after.floor).toBe(1);
  expect(result.after.inventory).toEqual(result.before.inventory); expect(result.after.chests).toEqual(result.before.chests);
  expect(result.published).toContain(6); expect(result.published).toContain(17);
});

test('reload requires explicit adoption and preserves target, grant, elapsed deadline and cumulative usage', async ({ page }) => {
  const { request } = await start(page);
  const first = await page.evaluate(async request => {
    const h = window.rpgCommandTest, state = (await h.travel.readRpgTravel())!;
    return h.travel.executeRpgTravel({ ...request, attemptId: 'step-0', control: state.travel.control, action: { type: 'step', sequence: 0 } });
  }, request);
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, session = new h.GameSession(() => {}); await session.start();
    const checkpoint = await session.readTravel();
    const stopped = await h.travel.runTravelWindow(session, request.operationId);
    await session.prepareTravelMemory();
    const adoption = await session.executeTravel(session.travelRequest(request.operationId, { type: 'adopt' }));
    const finished = await h.travel.runTravelWindow(session, request.operationId);
    const after = session.view.game; session.stop();
    return { checkpoint, stopped, adoption, finished, after };
  }, request);
  expect(result.checkpoint?.adoptionRequired).toBe(true); expect(result.stopped.steps).toBe(0);
  expect(result.adoption.travel?.operation).toMatchObject({ target: first.receipt.travel!.operation.target,
    steps: 1, nextStep: 1, limits: first.receipt.travel!.operation.limits, deadline: first.receipt.travel!.operation.deadline });
  expect(result.finished.state?.travel.operation).toMatchObject({ status: 'arrived', steps: 4, replans: 1 });
  expect(result.after!.chests[0].opened).toBe(false);
});

test('original receipts replay exactly after later movement and changed requests cannot reuse identity', async ({ page }) => {
  const { request, result: admission } = await start(page);
  const result = await page.evaluate(async ({ request, admission }) => {
    const h = window.rpgCommandTest, step: RpgTravelRequest = { ...request, attemptId: 'step', control: admission.receipt.travel!.control,
      action: { type: 'step', sequence: 0 } };
    const first = await h.travel.executeRpgTravel(step), twice = await h.travel.executeRpgTravel(step);
    await h.custody.claimGame('other', true);
    const replay = await h.travel.executeRpgTravel(step), settled = await h.travel.executeRpgTravel(step, true);
    const oldStart = await h.travel.executeRpgTravel(request);
    let changed = ''; try { await h.travel.executeRpgTravel({ ...step, action: { type: 'step', sequence: 1 } }); } catch (e) { changed = String(e); }
    return { first, twice, replay, settled, oldStart, changed, latest: await h.custody.readGameControl() };
  }, { request, admission });
  expect(result.twice.receipt).toEqual(result.first.receipt); expect(result.replay.receipt).toEqual(result.first.receipt);
  expect(result.settled.receipt).toEqual(result.first.receipt); expect(result.oldStart.receipt).toEqual(admission.receipt);
  expect(result.changed).toContain('Invalid or unavailable RPG travel'); expect(result.latest.game!.maze.active.column).toBe(2);
});

test('manual input fences continuation and explicit cancellation prevents late work', async ({ page }) => {
  const { request, result: admission } = await start(page);
  const result = await page.evaluate(async ({ request, admission }) => {
    const h = window.rpgCommandTest;
    const moved = await h.custody.updateOwnedGame(admission.receipt.travel!.control,
      game => ({ ...game, maze: { ...game.maze, active: { row: 0, column: 0 } } }));
    const refusal = await h.travel.executeRpgTravel({ ...request, attemptId: 'not-adopted', control: moved.control, action: { type: 'step', sequence: 0 } });
    const cancelled = await h.travel.executeRpgTravel({ ...request, attemptId: 'cancel', control: moved.control, action: { type: 'cancel' } });
    const late = await h.travel.executeRpgTravel({ ...request, attemptId: 'late', control: cancelled.receipt.travel!.control, action: { type: 'step', sequence: 0 } });
    return { refusal, cancelled, late, after: await h.custody.readGameControl() };
  }, { request, admission });
  expect(result.refusal.receipt.disposition).toBe('refused');
  expect(result.cancelled.receipt.travel?.operation.status).toBe('cancelled'); expect(result.late.receipt.disposition).toBe('refused');
  expect(result.after.game!.maze.active.column).toBe(0);
});

test('a missing original settles without execution and remains terminal on late delivery', async ({ page }) => {
  const { request, result: admission } = await start(page);
  const result = await page.evaluate(async ({ request, admission }) => {
    const h = window.rpgCommandTest, step: RpgTravelRequest = { ...request, attemptId: 'missing', control: admission.receipt.travel!.control, action: { type: 'step', sequence: 0 } };
    const settled = await h.travel.executeRpgTravel(step, true), late = await h.travel.executeRpgTravel(step);
    return { settled, late, after: await h.custody.readGameControl() };
  }, { request, admission });
  expect(result.settled.receipt.disposition).toBe('settled'); expect(result.late.receipt).toEqual(result.settled.receipt);
  expect(result.after.game!.maze.active.column).toBe(1);
});

for (const store of ['saves', 'meta', 'observations', 'gameCommands', 'rpgTravels', 'rpgTravelActions'] as const) {
  test(`travel ${store} failure leaves no partial move, observation, command or progress`, async ({ page }) => {
    const { request, result: admission } = await start(page);
    const result = await page.evaluate(async ({ request, admission, store }) => {
      const h = window.rpgCommandTest, db = await h.repository.getDatabase(), before = await h.custody.readGameControl();
      const travel = await h.travel.readRpgTravel(), head = (await db.get('saves', 'auto'))!.observationHead;
      const method = ['observations', 'gameCommands', 'rpgTravelActions'].includes(store) ? 'add' : 'put';
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return original.apply(this, args); };
      let error = '';
      try { await h.travel.executeRpgTravel({ ...request, attemptId: 'failed-step', control: admission.receipt.travel!.control, action: { type: 'step', sequence: 0 } }); }
      catch (e) { error = String(e); } finally { IDBObjectStore.prototype[method] = original; }
      return { error, before, travel, head, after: await h.custody.readGameControl(), afterTravel: await h.travel.readRpgTravel(),
        afterHead: (await db.get('saves', 'auto'))!.observationHead, receipt: await db.get('rpgTravelActions', 'failed-step'), command: await db.get('gameCommands', 'failed-step') };
    }, { request, admission, store });
    expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
    expect(result.afterTravel).toEqual(result.travel); expect(result.afterHead).toEqual(result.head);
    expect(result.receipt).toBeUndefined(); expect(result.command).toBeUndefined();
  });
}
