import { expect } from '@playwright/test';
import { test, provider, operations, calls, open, snapshot } from './rpg-paired-test';

for (const variant of ['A', 'B'] as const) {
  test(`cold discovery ${variant}: real query/refinement and durable wake choose from opposite earned junctions`, async ({ page, request }, info) => {
    await open(page); const started = await page.evaluate(v => window.rpgPaired.seedDiscovery(v), variant), binding = started.binding!;
    await expect.poll(async () => (await operations(request, binding.sessionId))[0]?.state).toBe('parked');
    const initial = await snapshot(page), first = await calls(request, binding.scopeId);
    expect(first.map((call: any) => call.tool)).toEqual(['maze.frontiers', 'maze.explore']);
    expect(first[0].publicContext.currentObservation.Data.cells).toHaveLength(3);
    expect(first[0].publicContext.currentObservation.Data.cells.every((cell: any) => !cell.chests.length)).toBe(true);
    expect(first[1].input).toMatchObject({ row: 6, column: 2, direction: 'east' });
    expect(initial.game!.maze.active).toEqual({ row: 6, column: 0 });
    expect(initial.travel!.travel.operation.steps).toBe(0);
    const progress = await page.evaluate(() => window.rpgPaired.tick());
    expect(progress.game!.maze.active).toEqual({ row: 6, column: 1 });
    expect(await calls(request, binding.scopeId)).toEqual(first);
    await page.evaluate(() => window.rpgPaired.tick());
    await expect.poll(async () => (await operations(request, binding.sessionId))
      .filter((entry: any) => entry.action.runId !== binding.runId && entry.state === 'parked').length).toBe(1);
    await expect.poll(async () => (await calls(request, binding.scopeId)).length).toBe(4);
    const plans = await calls(request, binding.scopeId), entries = await operations(request, binding.sessionId);
    expect(plans.map((call: any) => call.tool)).toEqual(['maze.frontiers', 'maze.explore', 'maze.frontiers', 'maze.explore']);
    const local = plans[2].publicContext.currentObservation.Data;
    expect(local.actor).toEqual({ floor: 1, row: 6, column: 2 });
    const junction = local.cells.find((cell: any) => cell.address.row === 6 && cell.address.column === 4);
    expect(junction.blocked).toContain(variant === 'A' ? 'north' : 'east');
    expect(junction.blocked).not.toContain(variant === 'A' ? 'east' : 'north');
    expect(plans[3].input).toMatchObject({ row: 6, column: 4, direction: variant === 'A' ? 'east' : 'north' });
    expect(plans[3].input.sourceId).not.toBe(plans[1].input.sourceId);
    const parent = entries.find((entry: any) => entry.action.runId === binding.runId);
    expect(entries).toHaveLength(2); expect(parent.state).toBe('continued');
    expect(parent.usage).toMatchObject({ providerCalls: 2, refinements: 1 });
    expect(entries.find((entry: any) => entry.state === 'parked').usage).toMatchObject({ providerCalls: 4, refinements: 2, continuations: 1 });
    expect(parent.latestEvent).toMatchObject({ kind: 'decision', usage: { steps: 2 }, completion: null });
    const current = await snapshot(page);
    expect(current.binding!.objectiveId).toBe(binding.objectiveId); expect(current.binding!.runId).toBe(parent.wakeRunId);
    expect(current.game!.maze.active).toEqual({ row: 6, column: 2 });
    expect(current.game!.chests).toEqual(initial.game!.chests); expect(current.game!.inventory).toEqual(initial.game!.inventory);
    expect(current.game!.quests).toEqual(initial.game!.quests);
    // Stop after the second selected intention, not a fake exploration/quest completion.
    await page.evaluate(() => window.rpgPaired.cancel()); await page.evaluate(() => window.rpgPaired.tick());
    expect((await snapshot(page)).view.state).toBe('cancelled'); expect((await snapshot(page)).game).toEqual(current.game);
    expect(await calls(request, binding.scopeId)).toEqual(plans);
    await info.attach('discovery-service-proof', { contentType: 'application/json', body: JSON.stringify({ variant, binding, plans, entries,
      initialObservation: initial.launch!.request.observation, final: await snapshot(page) }) });
  });
}

test('cold discovery restart preserves selected frontier and grant; only adoption permits the decision successor', async ({ page, request }, info) => {
  await open(page); const started = await page.evaluate(() => window.rpgPaired.seedDiscovery('B')), binding = started.binding!;
  await expect.poll(async () => (await operations(request, binding.sessionId))[0]?.state).toBe('parked');
  const moved = await page.evaluate(() => window.rpgPaired.tick()), before = await calls(request, binding.scopeId);
  expect(moved.game!.maze.active.column).toBe(1);
  await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
  expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
  const recovered = await page.evaluate(() => window.rpgPaired.recover());
  expect(recovered.view).toMatchObject({ state: 'awaiting-adoption', mode: 'exploration', steps: 1 });
  expect(recovered.travel!.travel.frontier).toEqual(moved.travel!.travel.frontier);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.rpgPaired.tick());
  expect((await snapshot(page)).game).toEqual(moved.game); expect(await calls(request, binding.scopeId)).toEqual(before);
  await page.evaluate(() => window.rpgPaired.adopt());
  const adopted = await snapshot(page);
  expect(adopted.travel!.travel.operation.deadline).toBe(moved.travel!.travel.operation.deadline);
  expect(adopted.travel!.travel.operation.limits).toEqual(moved.travel!.travel.operation.limits);
  await page.evaluate(() => window.rpgPaired.tick());
  await expect.poll(async () => (await calls(request, binding.scopeId)).length).toBe(4);
  await expect.poll(async () => (await operations(request, binding.sessionId))
    .filter((entry: any) => entry.action.runId !== binding.runId && entry.state === 'parked').length).toBe(1);
  const entries = await operations(request, binding.sessionId), plans = await calls(request, binding.scopeId);
  expect(entries).toHaveLength(2); expect(plans[3].input).toMatchObject({ row: 6, column: 4, direction: 'north' });
  expect(plans[2].epoch).not.toBe(plans[0].epoch);
  expect((await snapshot(page)).game!.maze.active).toEqual({ row: 6, column: 2 });
  await page.evaluate(() => window.rpgPaired.cancel());
  await info.attach('discovery-restart-proof', { contentType: 'application/json', body: JSON.stringify({ moved, recovered, adopted, plans, entries }) });
});
