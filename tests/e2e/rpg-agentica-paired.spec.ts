import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test, provider, operations, calls, open, snapshot } from './rpg-paired-test';
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

for (const delivered of [false, true]) {
  test(`final-step restart reconciles ${delivered ? 'lost completion acknowledgement' : 'undelivered completion'} without another move or plan`, async ({ page, request }) => {
    const { binding, admission } = await start(page, request), before = await calls(request, binding.scopeId);
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.rpgPaired.tick());
    const requests: unknown[] = [];
    await page.route('**/api/operations/events', async route => {
      if (route.request().postDataJSON().kind !== 'completed') return route.continue();
      requests.push(route.request().postDataJSON());
      if (delivered) expect((await route.fetch()).ok()).toBe(true);
      await route.abort();
    });
    await expect(page.evaluate(() => window.rpgPaired.tick())).rejects.toThrow();
    expect(requests).toHaveLength(1);
    const arrived = await snapshot(page), prior = (await operations(request, binding.sessionId))[0];
    expect(arrived.game!.maze.active.column).toBe(5); expect(arrived.view.steps).toBe(4);
    expect(arrived.operation!.event).toEqual(requests[0]);
    expect(arrived.operation!.link.sequence).toBe(arrived.operation!.link.acknowledged + 1);
    expect(prior.state).toBe(delivered ? 'completed' : 'parked');
    await page.unroute('**/api/operations/events');
    await page.route('**/api/operations/events', async route => { requests.push(route.request().postDataJSON()); await route.continue(); });
    await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
    expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
    const recovered = await page.evaluate(() => window.rpgPaired.recover());
    expect(recovered.owner).not.toBe(arrived.owner); expect(recovered.view).toMatchObject({ state: 'completed', steps: 4 });
    expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
    expect(recovered.game).toEqual(arrived.game); expect(recovered.operation!.event).toEqual(arrived.operation!.event);
    expect(recovered.operation!.link.acknowledged).toBe(arrived.operation!.link.sequence);
    const final = (await operations(request, binding.sessionId))[0];
    expect(final.state).toBe('completed'); expect(final.admission).toEqual(admission);
    if (delivered) expect(final.latestEvent).toEqual(prior.latestEvent);
    await page.evaluate(() => window.rpgPaired.tick()); expect((await snapshot(page)).game).toEqual(arrived.game);
    expect(await calls(request, binding.scopeId)).toEqual(before);
  });
}

for (const action of ['adopt', 'cancel', 'cancel-ack-lost'] as const) {
  test(action === 'adopt' ? 'explicit pending-decision adoption retains original evidence and wakes once in the new epoch'
    : `pending decision restart can be explicitly stopped without movement (${action})`, async ({ page, request }) => {
    let decision: unknown;
    await page.routeWebSocket('ws://127.0.0.1:5092/api/host', ws => {
      const server = ws.connectToServer();
      ws.onMessage(message => {
        const envelope = JSON.parse(message.toString());
        if (envelope.type === 'operation.wake' && !decision) {
          decision = envelope.payload; ws.close(); server.close();
        } else server.send(message);
      });
    });
    expect((await request.post(`${provider}/next-intermediate`)).ok()).toBe(true);
    const { binding } = await start(page, request);
    await expect(page.evaluate(() => window.rpgPaired.tick())).rejects.toThrow();
    expect(decision).toBeDefined();
    const pending = await snapshot(page), before = await calls(request, binding.scopeId);
    expect(pending.game!.maze.active.column).toBe(2); expect(pending.operation!.event).toEqual(decision);
    expect(pending.operation!.link.sequence).toBe(pending.operation!.link.acknowledged + 1);
    expect(before).toHaveLength(1);
    // Only the original wake is dropped; reconnection forwards the retained decision unchanged.
    await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
    expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
    const recovered = await page.evaluate(() => window.rpgPaired.recover());
    expect(recovered.view.state).toBe('awaiting-adoption'); expect(recovered.game).toEqual(pending.game);
    expect(recovered.operation!.event).toEqual(pending.operation!.event);
    await page.evaluate(() => window.rpgPaired.tick());
    expect((await snapshot(page)).game).toEqual(pending.game); expect(await calls(request, binding.scopeId)).toEqual(before);
    if (action !== 'adopt') {
      const requests: unknown[] = [];
      if (action === 'cancel-ack-lost') {
        await page.route('**/api/operations/stop-decision', async route => {
          requests.push(route.request().postDataJSON());
          expect((await route.fetch()).ok()).toBe(true); await route.abort();
        });
        await expect(page.evaluate(() => window.rpgPaired.cancel())).rejects.toThrow();
        const uncertain = await snapshot(page), accepted = (await operations(request, binding.sessionId))[0];
        expect(uncertain.launch).toMatchObject({ stopped: true, stopAcknowledged: false });
        expect(uncertain.operation!.link.acknowledged).toBe(pending.operation!.link.acknowledged);
        expect(accepted.state).toBe('cancelled'); expect(accepted.stopDecision).toEqual(accepted.latestEvent);
        expect(accepted.wakeRunId).toBeNull(); expect(uncertain.game).toEqual(pending.game);
        await page.unroute('**/api/operations/stop-decision');
        await page.route('**/api/operations/stop-decision', async route => {
          requests.push(route.request().postDataJSON()); await route.continue();
        });
        await page.evaluate(() => window.rpgPaired.close()); await page.reload(); await page.waitForFunction(() => !!window.rpgPaired);
        expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
        await page.evaluate(() => window.rpgPaired.recover());
        expect((await snapshot(page)).game).toEqual(pending.game);
      }
      await page.evaluate(() => window.rpgPaired.cancel());
      const final = await snapshot(page); expect(final.view.state).toBe('cancelled'); expect(final.game).toEqual(pending.game);
      expect(final.launch).toMatchObject({ stopped: true, stopAcknowledged: true });
      expect(final.operation!.event).toEqual(decision);
      expect(final.operation!.link.acknowledged).toBe(final.operation!.link.sequence);
      const stopped = (await operations(request, binding.sessionId))[0];
      expect(stopped.state).toBe('cancelled'); expect(stopped.stopDecision).toEqual(stopped.latestEvent);
      expect(stopped.wakeRunId).toBeNull(); expect(stopped.stopDecision.eventId).toBe(final.operation!.event!.eventId);
      await page.evaluate(() => window.rpgPaired.cancel()); await page.evaluate(() => window.rpgPaired.tick());
      expect((await snapshot(page)).game).toEqual(pending.game);
      expect((await operations(request, binding.sessionId))[0]).toEqual(stopped);
      if (action === 'cancel-ack-lost') { expect(requests).toHaveLength(2); expect(requests[0]).toEqual(decision); expect(requests[1]).toEqual(decision); }
      expect(await calls(request, binding.scopeId)).toEqual(before);
    } else {
      const [original] = await operations(request, binding.sessionId);
      await page.evaluate(() => window.rpgPaired.adopt());
      await expect.poll(async () => (await operations(request, binding.sessionId))
        .find((entry: any) => entry.action.runId !== binding.runId)?.state).toBe('parked');
      const adopted = await snapshot(page), entries = await operations(request, binding.sessionId);
      const parent = entries.find((entry: any) => entry.action.runId === binding.runId);
      expect(adopted.game).toEqual(recovered.game); expect(adopted.binding!.sessionEpoch).not.toBe(binding.sessionEpoch);
      expect(adopted.binding!.objectiveId).toBe(binding.objectiveId);
      expect(adopted.binding!.travelLimits).toEqual(binding.travelLimits);
      expect(parent.request).toEqual(original.request); expect(parent.admission).toEqual(original.admission);
      expect(parent.latestEvent.eventId).toBe(pending.operation!.event!.eventId);
      expect(parent.latestEvent.sessionEpoch).toBe(binding.sessionEpoch);
      expect(parent.latestEvent.observation.observationId).toBe(pending.operation!.event!.observation.observationId);
      expect(parent.latestEvent.usage.steps).toBe(1);
      expect(parent.wakeAdoption.nextSessionEpoch).toBe(adopted.binding!.sessionEpoch);
      expect(parent.wakeAdoption.observation.revision).toBe(adopted.binding!.control.revision);
      expect(parent.wakeAdoption.observation.revision).toBeGreaterThan(parent.latestEvent.observation.revision);
      expect(parent.wakeAdoption.observation.data).toMatchObject({ kind: 'local', actor: { floor: 1, row: 0, column: 2 } });
      expect(parent.wakeAdoption.observation.data.cells.length).toBeLessThanOrEqual(32);
      expect(parent.wakeAdoption.observation.data.cells.map((cell: any) => cell.address)).not.toContainEqual(binding.completionTarget);
      const plans = await calls(request, binding.scopeId);
      expect(plans).toHaveLength(2); expect(plans[1]).toMatchObject({ epoch: adopted.binding!.sessionEpoch,
        observationId: parent.wakeAdoption.observation.observationId, observationKind: 'local' });
      const final = await finish(page), child = (await operations(request, binding.sessionId))
        .find((entry: any) => entry.action.runId === final.view.runId);
      expect(final.view.state).toBe('completed'); expect(final.game!.maze.active.column).toBe(5);
      expect(final.game!.chests).toEqual(pending.game!.chests); expect(final.game!.inventory).toEqual(pending.game!.inventory);
      expect(parent.latestEvent.usage.steps + child.latestEvent.usage.steps).toBe(4);
      expect(child.latestEvent.completion.objectiveId).toBe(binding.objectiveId);
      expect(await calls(request, binding.scopeId)).toEqual(plans);
    }
  });
}
