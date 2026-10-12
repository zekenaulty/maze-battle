import { test, expect, fixture } from './rpg-command-browser';
import type * as Discovery from './rpg-discovery-fixture';

async function setup(page: Parameters<typeof fixture>[0], variant: 'A' | 'B' = 'A') {
  await fixture(page);
  return page.evaluate(async variant => {
    const path = '/tests/e2e/rpg-discovery-fixture.ts';
    return (await import(/* @vite-ignore */ path) as typeof Discovery).setupDiscovery(variant);
  }, variant);
}
const argsFor = (frontier: any) => ({ row: frontier.anchor.row, column: frontier.anchor.column,
  direction: frontier.direction, sourceId: frontier.source.id });

test('cold context and first local progress are equivalent before the opposite junction is observed', async ({ browser }, info) => {
  const traces = [];
  for (const variant of ['A', 'B'] as const) {
    const context = await browser.newContext(), page = await context.newPage();
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5204') return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await page.clock.setFixedTime(new Date('2026-10-12T12:00:00.000Z'));
    try {
      const initial = await setup(page, variant);
      const trace = await page.evaluate(async () => {
        const h = window.rpgDiscovery, before = await h.invoke('maze.frontiers', { limit: 12 });
        const f = (before.result.observation!.data.context as any).frontiers[0];
        const admission = await h.invoke('maze.explore', { row: f.anchor.row, column: f.anchor.column,
          direction: f.direction, sourceId: f.source.id });
        const progress = await h.walk(admission.result.operation!.operationId, 1);
        const observed = await h.invoke('maze.observe', {}), frontiers = await h.invoke('maze.frontiers', { limit: 12 });
        h.session.stop();
        return { before: before.result.observation, progress: progress[0].observation,
          observed: observed.result.observation, frontiers: frontiers.result.observation, usage: progress[0].usage };
      });
      traces.push({ initial: initial.initial, capabilities: initial.capabilities, ...trace });
      expect(errors).toEqual([]); expect(external).toEqual([]);
    } finally { await context.close(); }
  }
  await info.attach('unnormalized-prefix-traces', { contentType: 'application/json', body: JSON.stringify(traces) });
  const normalize = (trace: unknown) => {
    const aliases = new Map<string, string>();
    const id = (value: string) => { if (!aliases.has(value)) aliases.set(value, `identity-${aliases.size}`); return aliases.get(value); };
    return JSON.parse(JSON.stringify(trace, function(key, value) {
      if (['scopeId', 'observationId', 'snapshotId'].includes(key)
        || key === 'id' && this.gameId && this.revision) return id(value);
      return value;
    }));
  };
  expect(normalize(traces[0])).toEqual(normalize(traces[1]));
});

for (const variant of ['A', 'B'] as const) test(`cold ${variant} frontier choice earns opposite junction evidence without hidden setup or loot`, async ({ page }) => {
  const initial = await setup(page, variant);
  expect(initial.game!.maze.active).toEqual({ row: 6, column: 0 });
  expect(initial.initial.data.cells).toHaveLength(3);
  expect(JSON.stringify(initial.initial)).not.toContain('survey-chest');
  const chosen = await page.evaluate(async () => {
    const h = window.rpgDiscovery, query = await h.invoke('maze.frontiers', { limit: 12 });
    return query.result.observation!.data.context as any;
  });
  expect(chosen.frontiers).toHaveLength(1);
  expect(chosen.frontiers[0]).toMatchObject({ anchor: { floor: 1, row: 6, column: 2 }, direction: 'east' });
  const first = await page.evaluate(async args => {
    const h = window.rpgDiscovery, admitted = await h.invoke('maze.explore', args);
    const events = await h.walk(admitted.result.operation!.operationId);
    return { admitted, events, travel: await h.session.readTravel(), game: h.session.view.game, checks: h.checks };
  }, argsFor(chosen.frontiers[0]));
  expect(first.events.map(e => e.kind)).toEqual(['progress', 'decision']);
  expect(first.events.at(-1)!.completion).toBeUndefined();
  expect(first.travel!.travel.operation).toMatchObject({ steps: 2, status: 'arrived' });
  expect(first.travel!.travel.frontier).toMatchObject({ anchor: chosen.frontiers[0].anchor, direction: 'east' });
  const view = first.events.at(-1)!.observation.data;
  const junction = (view.cells as any[]).find(cell => cell.address.column === 4);
  expect(junction.blocked).toContain(variant === 'A' ? 'north' : 'east');
  expect(junction.blocked).not.toContain(variant === 'A' ? 'east' : 'north');
  expect(first.game!.chests[0].opened).toBe(false);
  expect(first.game!.inventory).toEqual(initial.game!.inventory);
  const next = await page.evaluate(async () => {
    const h = window.rpgDiscovery, query = await h.invoke('maze.frontiers', { limit: 12 });
    return { context: query.result.observation!.data.context as any, checks: h.checks };
  });
  expect(next.context.frontiers).toHaveLength(1);
  expect(next.context.frontiers[0]).toMatchObject({ anchor: { floor: 1, row: 6, column: 4 }, direction: variant === 'A' ? 'east' : 'north' });
  expect(first.checks).toEqual([]); expect(next.checks).toEqual([]);
  const continued = await page.evaluate(async ({ event, args }) => {
    const h = window.rpgDiscovery, binding = await h.continueDecision(event);
    const admission = await h.invoke('maze.explore', args), events = await h.walk(admission.result.operation!.operationId);
    return { binding, events, game: h.session.view.game, checks: h.checks };
  }, { event: first.events.at(-1)!, args: argsFor(next.context.frontiers[0]) });
  expect(continued.binding.mode).toBe('exploration');
  expect(continued.events.map(e => e.kind)).toEqual(['progress', 'decision']);
  expect(continued.events.at(-1)!.completion).toBeUndefined();
  expect(JSON.stringify(continued.events.at(-1)!.observation.data)).toContain('survey-chest');
  expect(continued.game!.chests[0].opened).toBe(false); expect(continued.game!.inventory).toEqual(initial.game!.inventory);
  expect(continued.checks).toEqual([]);
  await page.evaluate(() => window.rpgDiscovery.session.stop());
});

test('unearned, blocked, stale and no-progress frontier requests refuse without world effects', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgDiscovery, before = h.session.view.game;
    const sourceId = (h.launch.request.observation.data.sourceHead as { id: string }).id;
    const outputs = [];
    for (const args of [
      { row: 6, column: 2, direction: 'north', sourceId },
      { row: 6, column: 7, direction: 'east', sourceId },
      { row: 6, column: 2, direction: 'east', sourceId: 'stale-source' },
      { row: 6, column: 0, direction: 'east', sourceId },
    ]) outputs.push(await h.invoke('maze.explore', args));
    return { before, after: h.session.view.game, outputs, travel: await h.session.readTravel(), checks: h.checks };
  });
  expect(result.outputs.every(value => value.result.disposition === 'refused' && !value.result.operation)).toBe(true);
  expect(result.after).toEqual(result.before); expect(result.travel).toBeUndefined(); expect(result.checks).toEqual([]);
});

test('frontier admission replays exactly and retained selection survives takeover adoption without a renewed grant', async ({ page }) => {
  await setup(page);
  const first = await page.evaluate(async () => {
    const h = window.rpgDiscovery, sourceId = (h.launch.request.observation.data.sourceHead as { id: string }).id;
    const admitted = await h.invoke('maze.explore', { row: 6, column: 2, direction: 'east', sourceId });
    const events = await h.walk(admitted.result.operation!.operationId, 1);
    return { admitted, events, travel: (await h.session.readTravel())!.travel };
  });
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  const result = await page.evaluate(async first => {
    const h = window.rpgCommandTest, session = new h.GameSession(() => {}); await session.start();
    const paused = await h.travel.runTravelWindow(session, first.travel.id);
    await session.prepareTravelMemory();
    const adopted = await session.executeTravel(session.travelRequest(first.travel.id, { type: 'adopt' }));
    const replay = await session.executeAgenticaAction(first.admitted.action, true);
    const finished = await h.travel.runTravelWindow(session, first.travel.id);
    session.stop(); return { paused, adopted, replay, finished };
  }, first);
  expect(result.paused.steps).toBe(0);
  expect(result.adopted.travel!.frontier).toEqual(first.travel.frontier);
  expect(result.adopted.travel!.operation).toMatchObject({ steps: 1, deadline: first.travel.operation.deadline, limits: first.travel.operation.limits });
  expect(result.replay).toEqual(first.admitted.result);
  expect(result.finished.state!.travel.operation).toMatchObject({ status: 'arrived', steps: 2 });
});

test('failed frontier decision persistence rolls back the arrival and its receipt together', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgDiscovery, sourceId = (h.launch.request.observation.data.sourceHead as { id: string }).id;
    const admission = await h.invoke('maze.explore', { row: 6, column: 2, direction: 'east', sourceId });
    const id = admission.result.operation!.operationId; await h.walk(id, 1); await h.session.prepareTravelMemory();
    const before = structuredClone(h.session.view.game), travel = (await h.session.readTravel())!.travel;
    const request = h.session.travelRequest(id, { type: 'step', sequence: travel.operation.nextStep });
    const original = IDBObjectStore.prototype.add;
    let error = '';
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'rpgAgenticaEvents') throw new DOMException('Injected decision failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try { await h.session.advanceAgenticaOperation(request); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.add = original; }
    const db = await window.rpgCommandTest.repository.getDatabase();
    return { error, before, travel, after: (await window.rpgCommandTest.custody.readGameControl()).game,
      afterTravel: (await h.session.readTravel())!.travel,
      receipt: await db.get('rpgTravelActions', request.attemptId), command: await db.get('gameCommands', request.attemptId) };
  });
  expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
  expect(result.afterTravel).toEqual(result.travel); expect(result.receipt).toBeUndefined(); expect(result.command).toBeUndefined();
});
