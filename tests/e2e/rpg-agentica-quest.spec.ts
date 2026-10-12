import { expect } from '@playwright/test';
import { test, calls, open, operations, snapshot, provider } from './rpg-paired-test';
import { equivalentHostWire } from '../../src/services/agentica/directed/wire';

for (const variant of ['A', 'B'] as const) {
  test(`retrieval ${variant}: cold earned exploration, deliberate collection and host-proven return`, async ({ page, request }, info) => {
    await open(page);
    const started = await page.evaluate(v => window.rpgPaired.seedQuest(v), variant), binding = started.binding!;
    await expect.poll(async () => (await operations(request, binding.sessionId))[0]?.state).toBe('parked');
    const first = await calls(request, binding.scopeId), before = await snapshot(page);
    expect(first.map((c: any) => c.tool)).toEqual(['maze.frontiers', 'maze.explore']);
    expect(first[0].publicContext.currentObservation.Data.cells).toHaveLength(3);
    expect(JSON.stringify(started.launch!.request)).not.toMatch(/accepted-survey|survey-room|survey-chest|targetRoom/);
    const positions = [], checkpoints = [];
    for (let step = 0; step < 60; step++) {
      const current = await page.evaluate(() => window.rpgPaired.tick());
      positions.push(current.game!.maze.active); checkpoints.push({ state: current.view.state,
        opened: current.game!.chests[0].opened, count: current.game!.inventory.items.filter(i => i.category === 'quest').length });
      if (current.view.state === 'completed') break;
      if (['failed', 'blocked', 'cancelled'].includes(current.view.state)) throw new Error(JSON.stringify(current.view));
      // Allow actual service responses between local scheduling ticks, bounded to this test.
      await page.waitForTimeout(60);
    }
    const final = await snapshot(page), plans = await calls(request, binding.scopeId), entries = await operations(request, binding.sessionId);
    expect(final.view.state, JSON.stringify(final.view)).toBe('completed');
    expect(plans.map((c: any) => c.tool)).toEqual(['maze.frontiers', 'maze.explore', 'maze.frontiers', 'maze.explore',
      'maze.navigate', 'maze.open-chest', 'maze.navigate']);
    expect(plans[3].input.direction).toBe(variant === 'A' ? 'east' : 'north');
    expect(plans[5].input).toEqual({ chestId: 'survey-chest' });
    expect(plans[6].input).toEqual({ row: 6, column: 0 });
    expect(plans[6].publicContext.currentObservation.Data.quest).toMatchObject({ carried: 1, status: 'complete', complete: false });
    expect(final.game!.maze.active).toEqual(final.game!.maze.start);
    expect(final.game!.chests[0].opened).toBe(true);
    expect(final.game!.quests[0].status).toBe('complete'); expect(final.game!.quests[0].claimedAt).toBeUndefined();
    expect(final.game!.inventory.items.filter(i => i.category === 'quest')).toHaveLength(1);
    const completed = entries.filter((entry: any) => entry.latestEvent?.kind === 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].latestEvent.completion.objectiveId).toBe(binding.objectiveId);
    expect(completed[0].latestEvent.observation.data.quest).toMatchObject({ carried: 1, atReturn: true, complete: true });
    expect(before.game!.chests[0].opened).toBe(false);
    expect(positions.some(position => position.column >= 6)).toBe(true);
    await info.attach('actual-game-retrieval-proof', { contentType: 'application/json',
      body: JSON.stringify({ variant, plans, entries, positions, checkpoints, before, final }) });
  });
}

test('retrieval reload after collection retains item and original return intention under explicit adoption', async ({ page, request }, info) => {
  await open(page);
  const started = await page.evaluate(() => window.rpgPaired.seedQuest('A')), scope = started.binding!.scopeId;
  let before = started;
  for (let tick = 0; tick < 45; tick++) {
    before = await page.evaluate(() => window.rpgPaired.tick());
    if (before.game!.chests[0].opened && before.travel?.travel.operation.status === 'running'
      && before.travel.travel.operation.target.column === 0) break;
    await page.waitForTimeout(60);
  }
  expect(before.game!.chests[0].opened).toBe(true);
  expect(before.travel?.travel.operation).toMatchObject({ status: 'running', target: { floor: 1, row: 6, column: 0 } });
  const priorCalls = await calls(request, scope);
  await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
  expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
  const recovered = await page.evaluate(() => window.rpgPaired.recover());
  expect(recovered.view).toMatchObject({ state: 'awaiting-adoption', mode: 'quest' });
  expect(recovered.game!.inventory).toEqual(before.game!.inventory);
  await page.evaluate(() => window.rpgPaired.tick()); expect((await snapshot(page)).game).toEqual(recovered.game);
  expect(await calls(request, scope)).toEqual(priorCalls);
  await page.evaluate(() => window.rpgPaired.adopt());
  for (let tick = 0; tick < 32; tick++) {
    if ((await page.evaluate(() => window.rpgPaired.tick())).view.state === 'completed') break;
  }
  const final = await snapshot(page);
  expect(final.view.state).toBe('completed'); expect(final.game!.inventory).toEqual(before.game!.inventory);
  expect(final.game!.maze.active).toEqual(final.game!.maze.start); expect(await calls(request, scope)).toEqual(priorCalls);
  expect(final.travel!.travel.operation.deadline).toBe(before.travel!.travel.operation.deadline);
  expect(final.travel!.travel.operation.limits).toEqual(before.travel!.travel.operation.limits);
  await info.attach('retrieval-restart-proof', { contentType: 'application/json', body: JSON.stringify({ before, recovered, final, priorCalls }) });
});

for (const drop of [false, true]) {
  test(`chest decision restart ${drop ? 'with lost effect reply' : 'before return admission'} reconciles without looting again`, async ({ page, request }, info) => {
    await open(page);
    await page.evaluate(drop => window.rpgPaired.holdChestReply(drop), drop);
    const started = await page.evaluate(() => window.rpgPaired.seedQuest('B')), scope = started.binding!.scopeId;
    let before = started;
    for (let tick = 0; tick < 45; tick++) {
      before = await page.evaluate(() => window.rpgPaired.tick());
      if (before.view.state === 'paused' && before.game!.chests[0].opened) break;
      await page.waitForTimeout(60);
    }
    expect(before.view.state).toBe('paused');
    expect(before.operation?.link.kind).toBe('interaction');
    expect(before.operation?.event?.kind).toBe('decision');
    const original = before.operation!.event, prior = await calls(request, scope);
    expect(prior.map((c: any) => c.tool).at(-1)).toBe('maze.open-chest');
    await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
    expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
    const recovered = await page.evaluate(() => window.rpgPaired.recover());
    expect(recovered.view.state).toBe('awaiting-adoption'); expect(recovered.operation!.event).toEqual(original);
    expect(recovered.game!.inventory).toEqual(before.game!.inventory);
    await page.evaluate(() => window.rpgPaired.tick()); expect(await calls(request, scope)).toEqual(prior);
    if (drop) await page.evaluate(() => window.rpgPaired.rejectNextAdoption());
    await page.evaluate(() => window.rpgPaired.adopt());
    const pending = await snapshot(page);
    if (drop) {
      expect(pending.view.state).toBe('parked');
      expect(pending.launch!.wake!.adoption).toBeDefined();
      expect(pending.game).toEqual(recovered.game); expect(await calls(request, scope)).toEqual(prior);
    }
    await expect.poll(async () => {
      await page.evaluate(() => window.rpgPaired.tick());
      return (await calls(request, scope)).length;
    }).toBe(prior.length + 1);
    for (let tick = 0; tick < 32; tick++) {
      const current = await page.evaluate(() => window.rpgPaired.tick());
      if (current.view.state === 'completed') break;
      await page.waitForTimeout(60);
    }
    const final = await snapshot(page), plans = await calls(request, scope);
    expect(final.view.state).toBe('completed'); expect(final.game!.inventory).toEqual(before.game!.inventory);
    expect(final.game!.maze.active).toEqual(final.game!.maze.start);
    expect(final.binding!.objectiveId).toBe(started.binding!.objectiveId);
    expect(plans.filter((c: any) => c.tool === 'maze.open-chest')).toHaveLength(1);
    const parent = (await operations(request, started.binding!.sessionId))
      .find((entry: any) => entry.admission.operation.operationId === original!.operationId);
    expect(equivalentHostWire(parent.latestEvent, original, 'event')).toBe(true);
    if (drop) expect(equivalentHostWire(parent.wakeAdoption, pending.launch!.wake!.adoption, 'adoption')).toBe(true);
    await info.attach('retained-chest-decision-recovery', { contentType: 'application/json', body: JSON.stringify({ drop, before, recovered, pending, final, plans, parent }) });
  });
}

test('Stop after chest decision survives restart without removing loot or authorizing return', async ({ page, request }, info) => {
  await open(page); await page.evaluate(() => window.rpgPaired.holdChestReply(false));
  const started = await page.evaluate(() => window.rpgPaired.seedQuest('A')), binding = started.binding!;
  let before = started;
  for (let tick = 0; tick < 45; tick++) {
    before = await page.evaluate(() => window.rpgPaired.tick());
    if (before.view.state === 'paused' && before.game!.chests[0].opened) break;
    await page.waitForTimeout(60);
  }
  expect(before.operation!.link.kind).toBe('interaction');
  expect(before.operation!.event!.kind).toBe('decision');
  const prior = await calls(request, binding.scopeId);
  await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
  expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
  await page.evaluate(() => window.rpgPaired.recover());
  await page.evaluate(() => window.rpgPaired.cancel());
  const stopped = await snapshot(page);
  expect(stopped.view.state).toBe('cancelled'); expect(stopped.game).toEqual(before.game);
  expect(stopped.launch).toMatchObject({ stopped: true, stopAcknowledged: true });
  const entries = await operations(request, binding.sessionId), parent = entries
    .find((entry: any) => entry.admission.operation.operationId === before.operation!.link.operationId);
  expect(parent.state).toBe('cancelled');
  expect(equivalentHostWire(parent.latestEvent, before.operation!.event, 'event')).toBe(true);
  expect(equivalentHostWire(parent.stopDecision, before.operation!.event, 'event')).toBe(true); expect(parent.wakeRunId).toBeFalsy();
  await page.evaluate(() => window.rpgPaired.tick());
  await expect(page.evaluate(() => window.rpgPaired.adopt())).rejects.toThrow('Stopped work');
  expect((await snapshot(page)).game).toEqual(before.game); expect(await calls(request, binding.scopeId)).toEqual(prior);
  await info.attach('retained-chest-stop-proof', { contentType: 'application/json', body: JSON.stringify({ before, stopped, entries, prior }) });
});
