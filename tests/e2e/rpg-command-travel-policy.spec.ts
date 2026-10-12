import { test, expect, fixture, seed } from './rpg-command-browser';
import type { RpgTravelRequest } from '../../src/persistence/rpgTravel/types';

for (const limit of ['steps', 'durationMs', 'unlimited'] as const) test(`${limit} travel grants are enforced without extending them`, async ({ page }) => {
  const base = await seed(page);
  const result = await page.evaluate(async ({ base, limit }) => {
    const h = window.rpgCommandTest; await h.memory.prepareRpgMemory();
    const limits = limit === 'unlimited' ? { steps: null, replans: null, durationMs: null }
      : { steps: limit === 'steps' ? 0 : 64, replans: 4, durationMs: limit === 'durationMs' ? 0 : 120_000 };
    const request: RpgTravelRequest = { attemptId: 'start', operationId: 'limits', gameId: base.gameId, control: base.control,
      deadlineAt: Date.now() + 120_000, action: { type: 'start', limits, target: { floor: 1, row: 0, column: 4 } } };
    const start = await h.travel.executeRpgTravel(request);
    const step = await h.travel.executeRpgTravel({ ...request, attemptId: 'step', control: start.receipt.travel!.control,
      action: { type: 'step', sequence: 0 } });
    return { start, step, after: await h.custody.readGameControl() };
  }, { base, limit });
  if (limit === 'unlimited') {
    expect(result.step.receipt.travel?.operation).toMatchObject({ status: 'running', steps: 1, deadline: null,
      limits: { steps: null, replans: null, durationMs: null } });
  } else {
    expect((result.step.receipt.travel ?? result.start.receipt.travel)?.operation.status).toBe('interrupted');
    expect(result.after.game!.maze.active.column).toBe(1);
  }
});

test('unobserved destinations remain unknown despite a complete legacy map', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game(); game.maze.visibility = { radius: 0, explored: ['0,0', '0,1', '0,2', '0,3', '0,4', '0,5'] };
    await h.repository.saveGame('auto', 'Unknown', 'auto', game); const owned = await h.custody.claimGame('owner');
    await h.memory.prepareRpgMemory();
    const route = await h.memory.readRpgRoute('auto', { floor: 1, row: 0, column: 1 }, { floor: 1, row: 0, column: 5 }, { maxVisits: 512, maxSteps: 256 });
    const start = await h.travel.executeRpgTravel({ attemptId: 'unknown', operationId: 'journey', gameId: game.id, control: owned.control,
      deadlineAt: Date.now() + 120_000, action: { type: 'start', target: { floor: 1, row: 0, column: 5 }, limits: { steps: 64, replans: 4, durationMs: 120_000 } } });
    return { route, start, after: await h.custody.readGameControl() };
  });
  expect(result.route).toMatchObject({ status: 'ready', data: { status: 'unknown', reason: 'target_unknown' } });
  expect(result.start.receipt.travel?.operation).toMatchObject({ status: 'interrupted', route: [], steps: 0, reason: 'Destination is not known.' });
  expect(result.after.game!.maze.active.column).toBe(1);
});

test('unseen physics changes do not guide the route; an attempted collision yields evidence and stops stale looping', async ({ page }) => {
  const base = await seed(page);
  const result = await page.evaluate(async base => {
    const h = window.rpgCommandTest; await h.memory.prepareRpgMemory();
    const request: RpgTravelRequest = { attemptId: 'start', operationId: 'collision', gameId: base.gameId, control: base.control,
      deadlineAt: Date.now() + 120_000, action: { type: 'start', target: { floor: 1, row: 0, column: 5 }, limits: { steps: 64, replans: 4, durationMs: 120_000 } } };
    const admitted = await h.travel.executeRpgTravel(request), db = await h.repository.getDatabase();
    const slot = (await db.get('saves', 'auto'))!;
    // Fixture-only external physical change, deliberately absent from retained observations.
    slot.game.maze.cells[1].links = ['west']; slot.game.maze.cells[2].links = ['east'];
    await db.put('saves', slot);
    const routeBeforeCollision = await h.memory.readRpgRoute('auto', { floor: 1, row: 0, column: 1 }, { floor: 1, row: 0, column: 5 }, { maxVisits: 512, maxSteps: 256 });
    const blocked = await h.travel.executeRpgTravel({ ...request, attemptId: 'collision', control: admitted.receipt.travel!.control,
      action: { type: 'step', sequence: 0 } });
    await h.memory.prepareRpgMemory();
    const resolved = await h.travel.executeRpgTravel({ ...request, attemptId: 'replan', control: blocked.receipt.travel!.control,
      action: { type: 'step', sequence: 1 } });
    return { routeBeforeCollision, admitted, blocked, resolved, after: await h.custody.readGameControl() };
  }, base);
  expect(result.routeBeforeCollision).toMatchObject({ status: 'ready', data: { status: 'ready', distance: 4 } });
  expect(result.blocked.receipt.command?.outcome).toEqual({ status: 'refused', reason: 'blocked' });
  expect(result.blocked.receipt.travel?.operation).toMatchObject({ route: [], steps: 0, nextStep: 1 });
  expect(result.resolved.receipt.travel?.operation).toMatchObject({ status: 'interrupted', reason: 'No known route.', steps: 0, replans: 1 });
  expect(result.after.game!.maze.active.column).toBe(1);
});

test('same sequence under another attempt cannot produce another step; corrupt records fail closed', async ({ page }) => {
  const base = await seed(page);
  const result = await page.evaluate(async base => {
    const h = window.rpgCommandTest; await h.memory.prepareRpgMemory();
    const request: RpgTravelRequest = { attemptId: 'start', operationId: 'sequence', gameId: base.gameId, control: base.control,
      deadlineAt: Date.now() + 120_000, action: { type: 'start', target: { floor: 1, row: 0, column: 5 }, limits: { steps: 64, replans: 4, durationMs: 120_000 } } };
    const admitted = await h.travel.executeRpgTravel(request);
    const first = await h.travel.executeRpgTravel({ ...request, attemptId: 'first', control: admitted.receipt.travel!.control, action: { type: 'step', sequence: 0 } });
    const repeat = await h.travel.executeRpgTravel({ ...request, attemptId: 'repeat', control: first.receipt.travel!.control, action: { type: 'step', sequence: 0 } });
    const db = await h.repository.getDatabase(), record = (await db.get('rpgTravels', request.operationId))!;
    await db.put('rpgTravels', { ...record, operation: { ...record.operation, steps: 0 } });
    let error = ''; try { await h.travel.readRpgTravel(); } catch (e) { error = String(e); }
    return { repeat, error, after: await h.custody.readGameControl() };
  }, base);
  expect(result.repeat.receipt).toMatchObject({ disposition: 'refused', reason: 'No matching active step.' });
  expect(result.error).toContain('Invalid or unavailable RPG travel'); expect(result.after.game!.maze.active.column).toBe(2);
});

test('a pre-cancelled local window performs no steps and does not cancel or renew the retained intention', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest; await h.repository.saveGame('auto', 'Abort', 'auto', h.game());
    const session = new h.GameSession(() => {}); await session.start(); await session.prepareTravelMemory();
    const admitted = await session.executeTravel(session.travelRequest('window', { type: 'start', target: { floor: 1, row: 0, column: 5 },
      limits: { steps: 64, replans: 4, durationMs: 120_000 } }));
    const controller = new AbortController(); controller.abort();
    const windowResult = await h.travel.runTravelWindow(session, 'window', { signal: controller.signal });
    const state = await session.readTravel(); session.stop(); return { admitted, window: windowResult, state };
  });
  expect(result.window).toMatchObject({ reason: 'cancelled-window', steps: 0 }); expect(result.state?.travel).toEqual(result.admitted.travel);
});

test('a cumulative deadline expiring during the effect transaction rolls back movement and progress', async ({ page }) => {
  const base = await seed(page);
  const result = await page.evaluate(async base => {
    const h = window.rpgCommandTest; await h.memory.prepareRpgMemory();
    const request: RpgTravelRequest = { attemptId: 'start', operationId: 'deadline', gameId: base.gameId, control: base.control,
      deadlineAt: Date.now() + 120_000, action: { type: 'start', target: { floor: 1, row: 0, column: 5 }, limits: { steps: 64, replans: 4, durationMs: 60_000 } } };
    const admitted = await h.travel.executeRpgTravel(request), before = await h.custody.readGameControl();
    const original = IDBObjectStore.prototype.add, now = Date.now;
    IDBObjectStore.prototype.add = function(...args) {
      const result = original.apply(this, args);
      if (this.name === 'gameCommands') Date.now = () => admitted.receipt.travel!.operation.deadline! + 1;
      return result;
    };
    const step: RpgTravelRequest = { ...request, attemptId: 'expired-step', control: admitted.receipt.travel!.control, action: { type: 'step', sequence: 0 } };
    let error = ''; try { await h.travel.executeRpgTravel(step); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.add = original; Date.now = now; }
    const db = await h.repository.getDatabase();
    return { error, before, after: await h.custody.readGameControl(), travel: await h.travel.readRpgTravel(), admitted,
      command: await db.get('gameCommands', step.attemptId), receipt: await db.get('rpgTravelActions', step.attemptId),
      settled: await h.travel.executeRpgTravel(step, true) };
  }, base);
  expect(result.error).toContain('Invalid or unavailable RPG travel'); expect(result.after).toEqual(result.before);
  expect(result.travel?.travel).toEqual(result.admitted.receipt.travel);
  expect(result.command).toBeUndefined(); expect(result.receipt).toBeUndefined(); expect(result.settled.receipt.disposition).toBe('settled');
});
