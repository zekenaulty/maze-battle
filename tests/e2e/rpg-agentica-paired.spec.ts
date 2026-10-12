import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import type {} from './rpg-agentica-paired-fixture';

const service = 'http://127.0.0.1:5092', provider = 'http://127.0.0.1:5093';
const test = base.extend<{ audit: void }>({ audit: [async ({ page, context }, use, info) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (['http://127.0.0.1:5212', service].includes(new URL(route.request().url()).origin)) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket(/.*/, ws => {
    if (['ws://127.0.0.1:5212', 'ws://127.0.0.1:5092'].includes(new URL(ws.url()).origin)) ws.connectToServer();
    else { external.push(ws.url()); ws.close(); }
  });
  try { await use(); } finally {
    await page.evaluate(() => window.rpgPaired?.close()).catch(() => {});
    await info.attach('environment', { contentType: 'application/json', body: JSON.stringify({ errors, external, browser: context.browser()!.version() }) });
    expect(errors).toEqual([]); expect(external).toEqual([]);
  }
}, { auto: true }] });
const open = async (page: Page) => {
  await page.goto('/tests/e2e/rpg-agentica-paired-fixture.html'); await page.waitForFunction(() => !!window.rpgPaired);
};
const snapshot = (page: Page) => page.evaluate(() => window.rpgPaired.snapshot());
async function operations(request: APIRequestContext, sessionId: string) {
  const response = await request.get(`${service}/api/operations?hostId=maze-battle&sessionId=${encodeURIComponent(sessionId)}`);
  expect(response.ok()).toBe(true); return response.json();
}
async function calls(request: APIRequestContext, scope: string) {
  const response = await request.get(`${provider}/evidence`); expect(response.ok()).toBe(true);
  const evidence = await response.json(); expect(evidence.errors).toEqual([]);
  return evidence.calls.filter((call: { scope: string }) => call.scope === scope);
}
async function start(page: Page, request: APIRequestContext) {
  await open(page); const initial = await page.evaluate(() => window.rpgPaired.seed());
  const binding = initial.binding!; expect(binding).toBeDefined();
  await expect.poll(async () => (await operations(request, binding.sessionId))[0]?.state).toBe('parked');
  return { initial: await snapshot(page), binding, admission: (await operations(request, binding.sessionId))[0].admission };
}
async function finish(page: Page) {
  for (let tick = 0; tick < 12; tick++) {
    const result = await page.evaluate(() => window.rpgPaired.tick());
    if (result.view.state === 'completed') return result;
  }
  throw new Error(`Controller did not complete within 12 ticks: ${JSON.stringify((await snapshot(page)).view)}`);
}

test('one real RPG admission completes four host steps without per-cell planning, looting, or stairs', async ({ page, request }, info) => {
  const { initial, binding, admission } = await start(page, request), before = await calls(request, binding.scopeId);
  expect(before).toHaveLength(1); expect(before[0]).toMatchObject({ tool: 'maze.navigate', target: binding.completionTarget, actor: { floor: 1, row: 0, column: 1 } });
  expect(before[0].observedCells).not.toContainEqual(binding.completionTarget);
  expect(initial.game!.maze.active).toEqual({ row: 0, column: 1 });
  expect(initial.view.steps).toBe(0); expect(initial.game!.chests.every(chest => !chest.opened)).toBe(true);
  const final = await finish(page), entry = (await operations(request, binding.sessionId))[0];
  expect(final.view).toMatchObject({ state: 'completed', steps: 4, replans: 0, target: binding.completionTarget });
  expect(final.game!.maze.active).toEqual({ row: 0, column: 5 }); expect(final.game!.dungeonLevel).toBe(1);
  expect(final.sessionGame).toEqual(final.game); expect(final.positions).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  expect(final.game!.chests).toEqual(initial.game!.chests); expect(final.game!.inventory).toEqual(initial.game!.inventory);
  expect(final.travel!.travel.operation).toMatchObject({ status: 'arrived', steps: 4 });
  expect(entry.state).toBe('completed'); expect(entry.admission).toEqual(admission);
  expect(entry.latestEvent).toMatchObject({ kind: 'completed', usage: { steps: 4 }, completion: { objectiveId: binding.objectiveId } });
  expect(entry.latestEvent.completion.evidenceId).not.toBe(admission.evidenceId);
  expect(entry.latestEvent.observation.data).not.toHaveProperty('cells');
  await page.evaluate(() => window.rpgPaired.tick()); expect((await snapshot(page)).game).toEqual(final.game);
  expect(await calls(request, binding.scopeId)).toEqual(before);
  await info.attach('paired-proof', { contentType: 'application/json', body: JSON.stringify({ binding, view: final.view, providerCalls: before, service: entry }) });
});

test('local pause fences movement; Stop cancels the same operation without another plan', async ({ page, request }) => {
  const { binding } = await start(page, request);
  await page.evaluate(() => window.rpgPaired.tick()); await page.evaluate(() => window.rpgPaired.pause());
  const paused = await snapshot(page), before = await calls(request, binding.scopeId);
  expect(paused.view.state).toBe('paused'); expect(paused.view.steps).toBe(1);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.rpgPaired.tick());
  expect((await snapshot(page)).game).toEqual(paused.game);
  expect((await operations(request, binding.sessionId))[0].state).toBe('parked');
  await page.evaluate(() => window.rpgPaired.cancel());
  const stopped = await snapshot(page); expect(stopped.view.state).toBe('cancelled');
  expect(stopped.travel!.travel.operation.status).toBe('cancelled');
  await expect.poll(async () => (await operations(request, binding.sessionId))[0].state).toBe('cancelled');
  await page.evaluate(() => window.rpgPaired.tick()); expect((await snapshot(page)).game).toEqual(paused.game);
  expect(await calls(request, binding.scopeId)).toEqual(before);
});

test('new GameSession and service restart recover paused; only explicit adoption resumes the original route', async ({ page, request }) => {
  const { binding, admission } = await start(page, request);
  const moved = await page.evaluate(() => window.rpgPaired.tick()), before = await calls(request, binding.scopeId);
  expect(moved.view.steps).toBe(1);
  await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
  expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
  const recovered = await page.evaluate(() => window.rpgPaired.recover());
  expect(recovered.owner).not.toBe(moved.owner);
  expect(recovered.view).toMatchObject({ state: 'awaiting-adoption', runId: moved.view.runId, operationId: moved.view.operationId, steps: 1, target: binding.completionTarget });
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.rpgPaired.tick());
  expect((await snapshot(page)).game).toEqual(moved.game);
  await page.evaluate(() => window.rpgPaired.adopt());
  const adopted = await snapshot(page);
  expect(adopted.travel!.travel.operation.deadline).toBe(moved.travel!.travel.operation.deadline);
  expect(adopted.travel!.travel.operation.limits).toEqual(moved.travel!.travel.operation.limits);
  const final = await finish(page), entry = (await operations(request, binding.sessionId))[0];
  expect(final.view.steps).toBe(4); expect(final.game!.maze.active.column).toBe(5);
  expect(final.game!.chests).toEqual(moved.game!.chests); expect(final.game!.inventory).toEqual(moved.game!.inventory);
  expect(entry.state).toBe('completed'); expect(entry.admission).toEqual(admission); expect(entry.activeEpoch).not.toBe(binding.sessionEpoch);
  expect(await calls(request, binding.scopeId)).toEqual(before);
});

test('a recovered paused journey can be stopped without adoption or movement', async ({ page, request }) => {
  const { binding } = await start(page, request), before = await snapshot(page), plans = await calls(request, binding.scopeId);
  await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
  const recovered = await page.evaluate(() => window.rpgPaired.recover()); expect(recovered.view.state).toBe('awaiting-adoption');
  await page.evaluate(() => window.rpgPaired.cancel()); await page.evaluate(() => window.rpgPaired.tick());
  const final = await snapshot(page); expect(final.view.state).toBe('cancelled'); expect(final.game).toEqual(before.game);
  expect((await operations(request, binding.sessionId))[0].state).toBe('cancelled'); expect(await calls(request, binding.scopeId)).toEqual(plans);
});

test('an observed intermediate destination wakes one successor without completing the owner objective early', async ({ page, request }) => {
  expect((await request.post(`${provider}/next-intermediate`)).ok()).toBe(true);
  const { initial, binding, admission } = await start(page, request);
  const first = await calls(request, binding.scopeId);
  expect(first).toHaveLength(1); expect(first[0].destination).toEqual({ floor: 1, row: 0, column: 2 });
  expect(first[0].observedCells).toContainEqual(first[0].destination);
  await page.evaluate(() => window.rpgPaired.tick());
  await expect.poll(async () => (await operations(request, binding.sessionId))
    .find((entry: any) => entry.action.runId !== binding.runId)?.state).toBe('parked');
  const entries = await operations(request, binding.sessionId), parent = entries.find((entry: any) => entry.action.runId === binding.runId);
  expect(entries).toHaveLength(2); expect(parent.state).toBe('continued'); expect(parent.admission).toEqual(admission);
  expect(parent.latestEvent.kind).toBe('decision'); expect(parent.latestEvent.completion).toBeNull();
  expect((await snapshot(page)).game!.maze.active.column).toBe(2);
  const plans = await calls(request, binding.scopeId);
  expect(plans).toHaveLength(2); expect(plans[1]).toMatchObject({ target: binding.completionTarget, destination: binding.completionTarget });
  const final = await finish(page), successor = (await operations(request, binding.sessionId)).find((entry: any) => entry.action.runId === final.view.runId);
  expect(final.view.runId).toBe(parent.wakeRunId); expect(final.binding!.objectiveId).toBe(binding.objectiveId);
  expect(final.game!.maze.active.column).toBe(5); expect(final.game!.dungeonLevel).toBe(1);
  expect(final.game!.chests).toEqual(initial.game!.chests); expect(final.game!.inventory).toEqual(initial.game!.inventory);
  expect(successor.state).toBe('completed'); expect(successor.latestEvent.completion.objectiveId).toBe(binding.objectiveId);
  expect(parent.latestEvent.usage.steps + successor.latestEvent.usage.steps).toBe(4);
  expect(await calls(request, binding.scopeId)).toEqual(plans);
});
