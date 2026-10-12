import { expect } from '@playwright/test';
import { test, provider, operations, calls, open, snapshot } from './rpg-paired-test';

for (const variant of ['A', 'B'] as const) test(`real-service corridor ${variant} runs locally until new fork evidence requires a second choice`, async ({ page, request }, info) => {
  expect((await request.post(`${provider}/next-corridor`)).ok()).toBe(true);
  await open(page); const started = await page.evaluate(v => window.rpgPaired.seedDiscovery(v, true), variant), binding = started.binding!;
  await expect.poll(async () => (await operations(request, binding.sessionId))[0]?.state).toBe('parked');
  const first = await calls(request, binding.scopeId), initial = await snapshot(page);
  expect(first).toHaveLength(2); expect(first[1].input).toMatchObject({ row: 6, column: 2, direction: 'east', continuation: 'corridor-v1' });
  for (let step = 1; step <= 5; step++) {
    const advanced = await page.evaluate(() => window.rpgPaired.tick());
    expect(advanced.game!.maze.active).toEqual({ row: 6, column: step });
    expect(advanced.operation!.event!.kind).toBe('progress');
    expect(advanced.travel!.travel.frontier).toEqual(initial.travel!.travel.frontier);
    expect(advanced.travel!.travel.operation.deadline).toBe(initial.travel!.travel.operation.deadline);
    expect(await calls(request, binding.scopeId)).toEqual(first);
  }
  await page.evaluate(() => window.rpgPaired.tick());
  await expect.poll(async () => (await operations(request, binding.sessionId))
    .find((entry: any) => entry.action.runId !== binding.runId)?.state).toBe('parked');
  const plans = await calls(request, binding.scopeId), entries = await operations(request, binding.sessionId);
  expect(plans).toHaveLength(4); expect(plans[2].actor).toEqual({ floor: 1, row: 6, column: 6 });
  expect(plans[2].publicContext.currentObservation.Data.notice).toMatchObject({ kind: 'junction', at: { floor: 1, row: 6, column: 8 } });
  expect(plans[3].input).toMatchObject({ row: 6, column: 8, direction: variant === 'A' ? 'east' : 'north', continuation: 'corridor-v1' });
  const parent = entries.find((entry: any) => entry.action.runId === binding.runId);
  expect(parent.latestEvent).toMatchObject({ kind: 'decision', usage: { steps: 6, replans: 0 }, completion: null });
  expect(parent.admission).toMatchObject({ operation: { operationId: initial.travel!.travel.id } });
  const current = await snapshot(page);
  expect(current.game!.chests).toEqual(initial.game!.chests); expect(current.game!.inventory).toEqual(initial.game!.inventory);
  await page.evaluate(() => window.rpgPaired.cancel());
  expect((await snapshot(page)).view.state).toBe('cancelled'); expect(await calls(request, binding.scopeId)).toEqual(plans);
  await info.attach('corridor-service-proof', { contentType: 'application/json', body: JSON.stringify({ variant, plans, entries, initial, current }) });
});

test('active corridor survives browser/service restart without renewing its intention or authority', async ({ page, request }, info) => {
  expect((await request.post(`${provider}/next-corridor`)).ok()).toBe(true);
  await open(page); const started = await page.evaluate(() => window.rpgPaired.seedDiscovery('B', true)), binding = started.binding!;
  await expect.poll(async () => (await operations(request, binding.sessionId))[0]?.state).toBe('parked');
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.rpgPaired.tick());
  const moved = await snapshot(page), first = await calls(request, binding.scopeId), original = moved.travel!.travel;
  expect(original).toMatchObject({ position: { floor: 1, row: 6, column: 4 }, exploration: { phase: 'corridor' },
    frontier: { anchor: { floor: 1, row: 6, column: 2 } }, operation: { steps: 4, target: { floor: 1, row: 6, column: 5 } } });
  await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
  expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
  const recovered = await page.evaluate(() => window.rpgPaired.recover());
  expect(recovered.view).toMatchObject({ state: 'awaiting-adoption', mode: 'exploration', steps: 4 });
  expect(recovered.travel!.travel).toEqual(original);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.rpgPaired.tick());
  expect((await snapshot(page)).game).toEqual(moved.game); expect(await calls(request, binding.scopeId)).toEqual(first);
  await page.evaluate(() => window.rpgPaired.adopt());
  const adopted = await snapshot(page);
  expect(adopted.travel!.travel).toMatchObject({ id: original.id, frontier: original.frontier, exploration: original.exploration,
    operation: { steps: 4, nextStep: 4, target: original.operation.target, startedAt: original.operation.startedAt,
      deadline: original.operation.deadline, limits: original.operation.limits } });
  expect(adopted.travel!.travel.control.epoch).toBeGreaterThan(original.control.epoch);
  await page.evaluate(() => window.rpgPaired.tick());
  expect(await calls(request, binding.scopeId)).toEqual(first);
  await page.evaluate(() => window.rpgPaired.tick());
  await expect.poll(async () => (await operations(request, binding.sessionId))
    .find((entry: any) => entry.action.runId !== binding.runId)?.state).toBe('parked');
  const plans = await calls(request, binding.scopeId), entries = await operations(request, binding.sessionId);
  expect(plans).toHaveLength(4); expect(plans[2].epoch).not.toBe(plans[0].epoch);
  expect(plans[3].input).toMatchObject({ row: 6, column: 8, direction: 'north', continuation: 'corridor-v1' });
  const parent = entries.find((entry: any) => entry.action.runId === binding.runId);
  expect(parent.latestEvent).toMatchObject({ kind: 'decision', usage: { steps: 6, replans: 1 }, completion: null });
  expect((await snapshot(page)).game!.maze.active).toEqual({ row: 6, column: 6 });
  await page.evaluate(() => window.rpgPaired.cancel());
  expect((await snapshot(page)).view.state).toBe('cancelled'); expect(await calls(request, binding.scopeId)).toEqual(plans);
  await info.attach('corridor-restart-proof', { contentType: 'application/json', body: JSON.stringify({ moved, recovered, adopted, plans, entries }) });
});
