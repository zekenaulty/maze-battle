import { expect, test } from '@playwright/test';
import type {} from './launch-scenario-fixture';

const fixture = '/tests/e2e/launch-scenario-fixture.html';
test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
  await page.waitForFunction(() => !!window.launchScenario);
});

test('prepares deterministic known arrival cells and crosses three rooms without collecting the destination chest', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(page.url()).origin) { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  const result = await page.evaluate(async () => {
    const h = window.launchScenario, progress: string[] = [];
    const scenario = await h.prepareLaunchScenario('launch', message => progress.push(message));
    const repeat = await h.prepareLaunchScenario('launch-repeat');
    const before = await h.api.loadStreamSnapshot(scenario.slot);
    const control = (await h.api.loadStreamControl(scenario.slot))!;
    const known = await Promise.all(scenario.destinations.map(item => h.api.readStreamKnowledge(scenario.slot, item.address.spaceId)));
    const target = { kind: 'cell' as const, address: scenario.destinations[0].address, arrival: 'occupy' as const };
    const plan = await h.loadDirectedStreamKnowledge({ checkpoint: before.checkpoint, control }, target,
      id => h.api.readStreamKnowledge(scenario.slot, id));
    if (plan.plan.status !== 'ready') throw new Error(plan.plan.reason);
    const routeSpaces = new Set([before.checkpoint.position.spaceId, ...plan.plan.route.map(cell => cell.spaceId)]);
    const db = await h.openTopologyDatabase();
    let preparationCommands: number, paidRecords: number;
    try {
      const keys = await db.getAllKeys('streamActions');
      preparationCommands = keys.filter(key => key[0] === scenario.slot).length;
      paidRecords = (await db.count('agenticaRuns')) + (await db.count('directedAgenticaRuns'));
    } finally { db.close(); }
    const executor = await h.DirectedStreamExecutor.open(scenario.slot);
    const initialLoads = executor.residency.loads;
    let record = await executor.navigate(target, 'arrival-only');
    const visited = new Set([before.checkpoint.position.spaceId]);
    for (let step = 0; step < 100 && record.state.operation.status === 'running'; step++) {
      record = (await executor.step())!;
      visited.add(record.state.frame.checkpoint.position.spaceId);
    }
    const after = await h.api.loadStreamSnapshot(scenario.slot);
    const root = (await h.topology.loadTopologyHeader(scenario.slot))!;
    return { scenario, repeat, before: before.checkpoint, after: after.checkpoint, progress, preparationCommands,
      limit: h.LAUNCH_SCENARIO_COMMAND_LIMIT, known, root, paidRecords, initialLoads, record,
      routeRooms: scenario.destinations.filter(item => routeSpaces.has(item.address.spaceId)).length,
      visitedRooms: scenario.destinations.filter(item => visited.has(item.address.spaceId)).length,
      chestAfter: Object.values(after.room.knowledge!.chests).find(chest => chest.row === target.address.row && chest.column === target.address.column),
    };
  });
  expect(result.scenario.destinations).toEqual(result.repeat.destinations);
  expect(new Set(result.scenario.destinations.map(item => item.address.spaceId)).size).toBe(3);
  for (const [index, item] of result.scenario.destinations.entries()) {
    expect(Object.values(result.known[index]!.cells)).toEqual(expect.arrayContaining([expect.objectContaining(item.address)]));
  }
  expect(result.root.header.recipe).toMatchObject({ seed: 55, level: 1 });
  expect(result.scenario.destinations[0].address.spaceId).not.toBe(result.before.position.spaceId);
  expect(result.routeRooms).toBe(3);
  expect(result.visitedRooms).toBe(3);
  expect(result.initialLoads).toBe(0);
  expect(result.preparationCommands).toBeGreaterThan(0);
  expect(result.preparationCommands).toBeLessThanOrEqual(result.limit);
  expect(result.record.state.operation.status).toBe('arrived');
  expect(result.after.position).toEqual(result.scenario.destinations[0].address);
  expect(result.after.collectedChests).toBe(result.before.collectedChests);
  expect(result.after.topologyRevision).toBe(result.before.topologyRevision);
  expect(result.after.visitedSpaces).toBe(result.before.visitedSpaces);
  expect(result.chestAfter?.opened).toBe(false);
  expect(result.paidRecords).toBe(0);
  expect(result.progress.at(-1)).toContain('Scenario ready');
  expect(external).toEqual([]);
});

test('rejects both existing stream and topology-only saves without changing them', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.launchScenario;
    const recipe = { version: 'spaces-v2' as const, worldId: 'existing', floorId: 'floor', seed: 55, level: 1 };
    await h.api.createStreamSlot('saved-stream', recipe);
    await h.api.claimStreamControl('saved-stream', 'user', null);
    await h.topology.createTopologySlot('saved-topology', recipe);
    const raw = async () => {
      const db = await h.openTopologyDatabase();
      try {
        const tx = db.transaction(db.objectStoreNames, 'readonly');
        const records = [];
        for (const store of db.objectStoreNames) records.push({ store, keys: await tx.objectStore(store).getAllKeys(), values: await tx.objectStore(store).getAll() });
        await tx.done; return records;
      } finally { db.close(); }
    };
    const before = await raw(), errors: string[] = [];
    for (const slot of ['saved-stream', 'saved-topology']) {
      try { await h.prepareLaunchScenario(slot); } catch (error) { errors.push(String(error)); }
    }
    return { before, after: await raw(), errors };
  });
  expect(result.errors).toHaveLength(2);
  expect(result.errors.every(error => error.includes('fresh slot'))).toBe(true);
  expect(result.after).toEqual(result.before);
});

test('cancelled partial preparation stays inert on reload and cannot be resumed by prepare', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const h = window.launchScenario, abort = new AbortController();
    let error = '';
    try {
      await h.prepareLaunchScenario('cancelled', message => {
        if (message.startsWith('Prepared 50/')) abort.abort();
      }, abort.signal);
    } catch (failure) { error = (failure as Error).name; }
    const db = await h.openTopologyDatabase();
    let commands: number;
    try { commands = await db.count('streamActions'); } finally { db.close(); }
    return { error, commands, checkpoint: (await h.api.loadStreamSnapshot('cancelled')).checkpoint,
      control: await h.api.loadStreamControl('cancelled') };
  });
  expect(before.error).toBe('AbortError');
  expect(before.commands).toBe(50);
  await page.reload(); await page.waitForFunction(() => !!window.launchScenario);
  const after = await page.evaluate(async () => {
    const h = window.launchScenario;
    const checkpoint = (await h.api.loadStreamSnapshot('cancelled')).checkpoint;
    const control = await h.api.loadStreamControl('cancelled');
    let error = '';
    try { await h.prepareLaunchScenario('cancelled'); } catch (failure) { error = String(failure); }
    return { checkpoint, control, error, final: (await h.api.loadStreamSnapshot('cancelled')).checkpoint };
  });
  expect(after.checkpoint).toEqual(before.checkpoint);
  expect(after.control).toEqual(before.control);
  expect(after.final).toEqual(before.checkpoint);
  expect(after.error).toContain('fresh slot');
});

test('concurrent prepare attempts cannot adopt the same fresh slot', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto(fixture); await other.waitForFunction(() => !!window.launchScenario);
  const start = async (target: typeof page) => target.evaluate(async () => {
    const h = window.launchScenario, abort = new AbortController();
    try {
      await h.prepareLaunchScenario('racing', message => {
        if (message.startsWith('Observed room 1/')) abort.abort();
      }, abort.signal);
      return 'unexpected success';
    } catch (failure) { return (failure as Error).name + ': ' + String(failure); }
  });
  const outcomes = await Promise.all([start(page), start(other)]);
  expect(outcomes.filter(outcome => outcome.startsWith('AbortError'))).toHaveLength(1);
  expect(outcomes.filter(outcome => /fresh slot|identity or quota conflict/.test(outcome))).toHaveLength(1);
  const control = await page.evaluate(() => window.launchScenario.api.loadStreamControl('racing'));
  expect(control?.epoch).toBe(0);
});
