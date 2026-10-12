import { test, expect, fixture } from './rpg-command-browser';
import type * as Discovery from './rpg-discovery-fixture';

async function setup(page: Parameters<typeof fixture>[0], variant: 'A' | 'B' = 'A', early = false) {
  await fixture(page);
  return page.evaluate(async ({ variant, early }) => {
    const path = '/tests/e2e/rpg-discovery-fixture.ts';
    return (await import(/* @vite-ignore */ path) as typeof Discovery).setupDiscovery(variant, true,
      early ? { row: 6, column: 3 } : undefined);
  }, { variant, early });
}
async function admit(page: Parameters<typeof fixture>[0], continuation = true) {
  return page.evaluate(async continuation => {
    const h = window.rpgDiscovery, query = await h.invoke('maze.frontiers', { limit: 12 });
    const frontier = (query.result.observation!.data.context as any).frontiers[0];
    return h.invoke('maze.explore', { row: frontier.anchor.row, column: frontier.anchor.column,
      direction: frontier.direction, sourceId: frontier.source.id, ...(continuation ? { continuation: 'corridor-v1' } : {}) });
  }, continuation);
}

for (const variant of ['A', 'B'] as const) test(`corridor ${variant} continues beyond its original anchor, yields at a real fork, then at an unlooted chest`, async ({ page }, info) => {
  const initial = await setup(page, variant), admission = await admit(page);
  const first = await page.evaluate(async id => {
    const h = window.rpgDiscovery, events = await h.walk(id);
    return { events, travel: (await h.session.readTravel())!.travel, game: h.session.view.game };
  }, admission.result.operation!.operationId);
  expect(first.events.map(e => e.kind)).toEqual(['progress', 'progress', 'progress', 'progress', 'progress', 'decision']);
  expect(first.travel.position).toEqual({ floor: 1, row: 6, column: 6 });
  expect(first.travel.frontier!.anchor).toEqual({ floor: 1, row: 6, column: 2 });
  expect(first.travel.operation).toMatchObject({ status: 'interrupted', steps: 6, replans: 0 });
  expect(first.travel.exploration).toMatchObject({ policy: 'corridor-v1', phase: 'corridor', decision: { kind: 'junction', at: { floor: 1, row: 6, column: 8 } } });
  expect(first.travel.exploration!.trail).toHaveLength(7);
  expect(first.events.at(-1)!.observation.data.notice).toEqual(first.travel.exploration!.decision);
  expect(first.events.at(-1)!.completion).toBeUndefined();
  expect(first.game!.chests).toEqual(initial.game!.chests); expect(first.game!.inventory).toEqual(initial.game!.inventory);
  const next = await page.evaluate(async event => {
    const h = window.rpgDiscovery; await h.continueDecision(event);
    const query = await h.invoke('maze.frontiers', { limit: 12 }), f = (query.result.observation!.data.context as any).frontiers[0];
    const chosen = { row: f.anchor.row, column: f.anchor.column, direction: f.direction, sourceId: f.source.id, continuation: 'corridor-v1' };
    const admission = await h.invoke('maze.explore', chosen), events = await h.walk(admission.result.operation!.operationId);
    return { chosen, events, travel: (await h.session.readTravel())!.travel, game: h.session.view.game, checks: h.checks };
  }, first.events.at(-1)!);
  expect(next.chosen).toMatchObject({ row: 6, column: 8, direction: variant === 'A' ? 'east' : 'north' });
  expect(next.events.map(e => e.kind)).toEqual(['progress', 'progress', 'decision']);
  expect(next.travel.exploration!.decision!.kind).toBe('object');
  expect(next.events.at(-1)!.observation.data.notice).toEqual(next.travel.exploration!.decision);
  expect(next.game!.maze.active).toEqual(variant === 'A' ? { row: 6, column: 9 } : { row: 5, column: 8 });
  expect(next.game!.chests).toEqual(initial.game!.chests); expect(next.game!.inventory).toEqual(initial.game!.inventory);
  expect(next.checks).toEqual([]);
  await info.attach('corridor-proof', { contentType: 'application/json', body: JSON.stringify({ initial: initial.initial, admission, first, next }) });
});

test('approach-only requests keep their old two-step boundary without acquiring continuation authority', async ({ page }) => {
  await setup(page); const admission = await admit(page, false);
  const outcome = await page.evaluate(async id => ({ events: await window.rpgDiscovery.walk(id), travel: await window.rpgDiscovery.session.readTravel() }), admission.result.operation!.operationId);
  expect(outcome.events.map(e => e.kind)).toEqual(['progress', 'decision']);
  expect(outcome.travel!.travel.operation).toMatchObject({ status: 'arrived', steps: 2 });
  expect(outcome.travel!.travel.exploration).toBeUndefined();
});

for (const optedIn of [false, true]) test(`retained journey cannot ${optedIn ? 'drop' : 'invent'} the original corridor authority`, async ({ page }) => {
  await setup(page); const admission = await admit(page, optedIn);
  const outcome = await page.evaluate(async ({ id, optedIn }) => {
    const h = window.rpgDiscovery, db = await window.rpgCommandTest.repository.getDatabase();
    const before = h.session.view.game, stored = (await db.get('rpgTravels', id))!;
    const { witness: _witness, ...body } = stored;
    if (optedIn) delete body.exploration;
    else body.exploration = { policy: 'corridor-v1', phase: 'approach', trail: [body.position] };
    const path = '/src/services/agentica/sdk/agentica-host.mjs', { canonicalJson } = await import(/* @vite-ignore */ path);
    await db.put('rpgTravels', { ...body, witness: canonicalJson(body) });
    let error = ''; try { await h.walk(id, 1); } catch (e) { error = String(e); }
    return { before, error, after: (await window.rpgCommandTest.repository.getGame('auto'))!.game };
  }, { id: admission.result.operation!.operationId, optedIn });
  expect(outcome.error).toContain('journey continuation authority changed'); expect(outcome.after).toEqual(outcome.before);
});

test('new object evidence interrupts the approach before reaching its selected anchor', async ({ page }) => {
  const initial = await setup(page, 'A', true), admission = await admit(page);
  const outcome = await page.evaluate(async id => ({ events: await window.rpgDiscovery.walk(id), travel: await window.rpgDiscovery.session.readTravel(), game: window.rpgDiscovery.session.view.game }), admission.result.operation!.operationId);
  expect(outcome.events.map(e => e.kind)).toEqual(['decision']);
  expect(outcome.travel!.travel).toMatchObject({ position: { floor: 1, row: 6, column: 1 },
    operation: { status: 'interrupted', steps: 1, target: { floor: 1, row: 6, column: 2 } },
    exploration: { phase: 'approach', decision: { kind: 'object', at: { floor: 1, row: 6, column: 3 } } } });
  expect(outcome.game!.inventory).toEqual(initial.game!.inventory); expect(outcome.game!.chests).toEqual(initial.game!.chests);
});

test('continuation does not renew the original elapsed-time grant', async ({ page }) => {
  await setup(page); const admission = await admit(page);
  const moved = await page.evaluate(async id => {
    const h = window.rpgDiscovery; await h.walk(id, 3); return (await h.session.readTravel())!.travel;
  }, admission.result.operation!.operationId);
  expect(moved.operation.status).toBe('running'); expect(moved.operation.steps).toBe(3);
  await page.clock.setFixedTime(new Date(moved.operation.deadline! + 1));
  const stopped = await page.evaluate(async id => {
    const h = window.rpgDiscovery, events = await h.walk(id); return { events, travel: (await h.session.readTravel())!.travel };
  }, admission.result.operation!.operationId);
  expect(stopped.events.map(e => e.kind)).toEqual(['blocked']); expect(stopped.travel.position).toEqual(moved.position);
  expect(stopped.travel.operation.steps).toBe(3); expect(stopped.travel.operation.deadline).toBe(moved.operation.deadline);
});

for (const steps of [3, null]) test(`corridor retains the explicitly granted ${steps ?? 'unlimited'} step policy`, async ({ page }) => {
  await setup(page);
  const outcome = await page.evaluate(async steps => {
    const h = window.rpgDiscovery, query = await h.invoke('maze.frontiers', { limit: 12 });
    const frontier = (query.result.observation!.data.context as any).frontiers[0], id = 'explicit-corridor-limits';
    const admission = await h.session.executeTravel(h.session.travelRequest(id, { type: 'explore',
      frontier: { anchor: frontier.anchor, direction: frontier.direction, sourceId: frontier.source.id },
      continuation: 'corridor-v1', limits: { steps, replans: 4, durationMs: null } }));
    for (let i = 0; i < 12; i++) {
      await h.session.prepareTravelMemory(); const state = (await h.session.readTravel())!.travel;
      if (state.operation.status !== 'running') break;
      await h.session.executeTravel(h.session.travelRequest(id, { type: 'step', sequence: state.operation.nextStep }));
    }
    const stopped = (await h.session.readTravel())!.travel;
    const late = await h.session.executeTravel(h.session.travelRequest(id, { type: 'step', sequence: stopped.operation.nextStep }));
    return { admission, stopped, late, final: (await h.session.readTravel())!.travel };
  }, steps);
  expect(outcome.admission.disposition).toBe('applied');
  expect(outcome.stopped.operation).toMatchObject({ status: 'interrupted', steps: steps ?? 6,
    limits: { steps, replans: 4, durationMs: null }, deadline: null });
  expect(outcome.stopped.operation.startedAt).toBe(outcome.admission.travel!.operation.startedAt);
  if (steps === null) expect(outcome.stopped.exploration!.decision!.kind).toBe('junction');
  else {
    expect(outcome.stopped.exploration!.decision).toBeUndefined();
    expect(outcome.stopped.operation.reason).toContain('step budget exhausted');
  }
  expect(outcome.late.disposition).toBe('refused'); expect(outcome.final).toEqual(outcome.stopped);
});

test('failed early-decision persistence rolls back perception, continuation trail and move', async ({ page }) => {
  await setup(page); const admission = await admit(page);
  const outcome = await page.evaluate(async id => {
    const h = window.rpgDiscovery; await h.walk(id, 5); await h.session.prepareTravelMemory();
    const before = structuredClone(h.session.view.game), travel = (await h.session.readTravel())!.travel;
    const request = h.session.travelRequest(id, { type: 'step', sequence: travel.operation.nextStep });
    const add = IDBObjectStore.prototype.add; let error = '';
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'rpgAgenticaEvents') throw new DOMException('Injected yield failure', 'QuotaExceededError');
      return add.apply(this, args);
    };
    try { await h.session.advanceAgenticaOperation(request); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.add = add; }
    const afterFailure = (await h.session.readTravel())!.travel, gameAfterFailure = (await window.rpgCommandTest.custody.readGameControl()).game;
    const db = await window.rpgCommandTest.repository.getDatabase();
    return { before, travel, error, afterFailure, gameAfterFailure, controlled: h.session.view.controlled,
      receipt: await db.get('rpgTravelActions', request.attemptId), command: await db.get('gameCommands', request.attemptId) };
  }, admission.result.operation!.operationId);
  expect(outcome.error).toContain('QuotaExceededError'); expect(outcome.afterFailure).toEqual(outcome.travel);
  expect(outcome.gameAfterFailure).toEqual(outcome.before); expect(outcome.controlled).toBe(false);
  expect(outcome.receipt).toBeUndefined(); expect(outcome.command).toBeUndefined();
});

test('committed discovery decision and its step replay exactly without another move', async ({ page }) => {
  await setup(page); const admission = await admit(page);
  const outcome = await page.evaluate(async id => {
    const h = window.rpgDiscovery; await h.walk(id, 5); await h.session.prepareTravelMemory();
    const travel = (await h.session.readTravel())!.travel;
    const request = h.session.travelRequest(id, { type: 'step', sequence: travel.operation.nextStep });
    const committed = await h.session.advanceAgenticaOperation(request), replay = await h.session.advanceAgenticaOperation(request);
    return { committed, replay };
  }, admission.result.operation!.operationId);
  expect(outcome.committed.event!.kind).toBe('decision');
  expect(outcome.replay.replayed).toBe(true); expect(outcome.replay.event).toEqual(outcome.committed.event);
  expect(outcome.replay.receipt).toEqual(outcome.committed.receipt);
  expect(outcome.replay.current).toEqual(outcome.committed.current);
});
