import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import type {} from './directed-host-fixture';
const service = 'http://127.0.0.1:5085', provider = 'http://127.0.0.1:5086', socket = 'ws://127.0.0.1:5085/api/host';
const open = async (page: Page) => { await page.goto('/tests/e2e/directed-host-fixture.html'); await page.waitForFunction(() => !!window.directedHost); };
const inventory = async (request: APIRequestContext, sessionId: string) => (await request.get(`${service}/api/operations?hostId=maze-battle&sessionId=${sessionId}`)).json();
const calls = async (request: APIRequestContext, scope: string) => (await (await request.get(`${provider}/evidence`)).json()).filter((call: any) => call.scope === scope);
const parked = async (request: APIRequestContext, sessionId: string) => expect.poll(async () => (await inventory(request, sessionId))[0]?.state, { timeout: 30000 }).toBe('parked');
const finish = (page: Page) => page.evaluate(async () => {
  const h = window.directedHost;
  for (let i = 0; i < 256 && h.client!.status !== 'completed'; i++) await h.client!.tick();
  return { status: h.client!.status, session: await window.directedStream.durable.loadDirectedStreamSession('directed') };
});

test('one service admission crosses three known rooms with no per-step model calls or arrival interaction', async ({ page, request }, info) => {
  await open(page);
  const { binding, scenario } = await page.evaluate(socket => window.directedHost.start(socket, true), socket);
  await parked(request, binding.sessionId);
  const before = await calls(request, binding.scopeId), original = (await inventory(request, binding.sessionId))[0].admission;
  const result = await finish(page);
  expect(result.status).toBe('completed');
  expect(result.session.checkpoint.position).toEqual(binding.destination);
  expect(result.session.record!.state.operation.steps).toBeGreaterThan(10);
  expect(result.session.checkpoint.collectedChests).toBe(scenario.checkpoint.collectedChests);
  expect(await calls(request, binding.scopeId)).toEqual(before);
  const final = (await inventory(request, binding.sessionId))[0];
  expect(final.state).toBe('completed'); expect(final.admission).toEqual(original);
  expect(final.latestEvent.completion.evidenceId).not.toBe(original.evidenceId);
  await info.attach('paired-proof', { body: JSON.stringify({ binding, localSteps: result.session.record!.state.operation.steps,
    providerCalls: before.length, service: final.state, admissionUnchanged: true, noArrivalInteraction: true }), contentType: 'application/json' });
});

test('browser and service restart require explicit adoption, preserve original admission, and finish same intention', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket, true), socket);
  await parked(request, binding.sessionId);
  await page.evaluate(() => window.directedHost.client!.tick());
  const original = (await inventory(request, binding.sessionId))[0], beforeCalls = await calls(request, binding.scopeId);
  const before = await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'));
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  expect((await request.post(`${provider}/restart`)).ok()).toBe(true);
  await page.evaluate(({ socket, binding }) => window.directedHost.recover(socket, binding), { socket, binding });
  await page.evaluate(() => window.directedHost.client!.tick());
  expect((await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'))).checkpoint).toEqual(before.checkpoint);
  await page.evaluate(() => window.directedHost.client!.adopt());
  const stale = await page.evaluate(async ({ control, id }) => {
    const h = window.directedStream, session = await h.durable.loadDirectedStreamSession('directed');
    const before = session.checkpoint; let error = '';
    try { await h.durable.prepareDurableDirectedStreamMove('directed', control,
      { operationId: id, revision: session.record!.revision, actionId: 'stale-owner-move' }); }
    catch (cause) { error = String(cause); }
    return { before, after: (await h.durable.loadDirectedStreamSession('directed')).checkpoint, error };
  }, { control: before.control, id: before.record!.state.operation.id });
  expect(stale.error).toContain('custody changed'); expect(stale.after).toEqual(stale.before);
  const result = await finish(page), final = (await inventory(request, binding.sessionId))[0];
  expect(result.status).toBe('completed');
  expect(final.admission).toEqual(original.admission);
  expect(result.session.record!.state.operation.id).toBe(before.record!.state.operation.id);
  expect(result.session.record!.state.operation.steps).toBeGreaterThan(before.record!.state.operation.steps);
  expect(final.activeEpoch).not.toBe(original.activeEpoch);
  expect(await calls(request, binding.scopeId)).toEqual(beforeCalls);
});

test('travel outlives its admission action deadline without re-admission or repeated model calls', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket), socket);
  await parked(request, binding.sessionId);
  const original = (await inventory(request, binding.sessionId))[0], beforeCalls = await calls(request, binding.scopeId);
  await page.evaluate(deadline => new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(deadline) - Date.now() + 100))), original.action.deadlineAt);
  const result = await finish(page);
  expect(result.status).toBe('completed');
  expect((await inventory(request, binding.sessionId))[0].admission).toEqual(original.admission);
  expect(await calls(request, binding.scopeId)).toEqual(beforeCalls);
});

test('uncertain progress acknowledgement replays exactly before cancellation', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket, true), socket);
  await parked(request, binding.sessionId);
  let dropped = false;
  await page.route('**/api/operations/events', async route => {
    if (!dropped) { dropped = true; await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await expect(page.evaluate(() => window.directedHost.client!.tick())).rejects.toThrow();
  const original = (await inventory(request, binding.sessionId))[0].latestEvent;
  const checkpoint = await page.evaluate(() => window.directedStream.api.loadStreamSnapshot('directed'));
  await page.evaluate(() => window.directedHost.client!.tick());
  expect((await inventory(request, binding.sessionId))[0].latestEvent).toEqual(original);
  expect(await page.evaluate(() => window.directedStream.api.loadStreamSnapshot('directed'))).toEqual(checkpoint);
  await page.evaluate(() => window.directedHost.client!.cancel());
  const stopped = await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'));
  expect(stopped.record!.state.operation.status).toBe('cancelled');
  await page.evaluate(() => window.directedHost.client!.tick());
  expect((await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'))).checkpoint).toEqual(stopped.checkpoint);
});

test('arrival requiring inspection wakes one successor and does not claim premature completion', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket, false, true), socket);
  await parked(request, binding.sessionId);
  const beforeCalls = await calls(request, binding.scopeId);
  await page.evaluate(async () => {
    for (let i = 0; i < 20 && window.directedHost.client!.status !== 'awaiting-inspection'; i++) await window.directedHost.client!.tick();
  });
  await expect.poll(async () => (await inventory(request, binding.sessionId))[0].state, { timeout: 30000 }).toBe('completed');
  const parent = (await inventory(request, binding.sessionId))[0];
  expect(parent.latestEvent.kind).toBe('decision');
  expect(parent.latestEvent.completion).toBeNull();
  expect(parent.wakeRunId).not.toBe(binding.runId);
  const successor = await page.evaluate(() => window.directedHost.client!.currentRun);
  expect(successor!.runId).toBe(parent.wakeRunId);
  expect(successor!.objectiveId).toBe(binding.objectiveId);
  const afterCalls = await calls(request, binding.scopeId);
  expect(afterCalls.filter((call: any) => call.tool === 'maze.inspect')).toHaveLength(1);
  expect(afterCalls.length - beforeCalls.length).toBeLessThanOrEqual(2);
});

test('lost completion acknowledgement survives both restarts and terminal tick is a no-op', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket), socket);
  await parked(request, binding.sessionId);
  let dropped = false;
  await page.route('**/api/operations/events', async route => {
    if (!dropped && route.request().postDataJSON().kind === 'completed') {
      dropped = true; await route.fetch(); await route.abort();
    } else await route.continue();
  });
  await expect(finish(page)).rejects.toThrow();
  const original = (await inventory(request, binding.sessionId))[0], before = await page.evaluate(() => window.directedStream.api.loadStreamSnapshot('directed'));
  await page.unroute('**/api/operations/events');
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  await request.post(`${provider}/restart`);
  await page.evaluate(({ socket, binding }) => window.directedHost.recover(socket, binding), { socket, binding });
  await page.evaluate(() => window.directedHost.client!.tick());
  expect((await inventory(request, binding.sessionId))[0].latestEvent).toEqual(original.latestEvent);
  expect(await page.evaluate(() => window.directedStream.api.loadStreamSnapshot('directed'))).toEqual(before);
});

test('recovered journey can be cancelled without adopting or moving it', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket), socket);
  await parked(request, binding.sessionId);
  const before = await page.evaluate(() => window.directedStream.api.loadStreamSnapshot('directed'));
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  await page.evaluate(({ socket, binding }) => window.directedHost.recover(socket, binding), { socket, binding });
  await page.evaluate(() => window.directedHost.client!.cancel());
  expect((await inventory(request, binding.sessionId))[0].state).toBe('cancelled');
  expect(await page.evaluate(() => window.directedStream.api.loadStreamSnapshot('directed'))).toEqual(before);
});

test('cancellation commits its local fence while progress delivery is hung', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket, true), socket);
  await parked(request, binding.sessionId);
  let release: (() => void) | undefined;
  await page.route('**/api/operations/events', async route => {
    if (!release) { await new Promise<void>(resolve => { release = resolve; }); }
    await route.continue();
  });
  await page.evaluate(() => { void window.directedHost.client!.tick().catch(() => undefined); });
  await expect.poll(() => !!release).toBe(true);
  await page.evaluate(() => window.directedHost.client!.cancel());
  const stopped = await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'));
  expect(stopped.record!.state.operation.status).toBe('cancelled');
  release!();
  await expect.poll(async () => (await inventory(request, binding.sessionId))[0].latestEvent?.kind).toBe('progress');
  await expect.poll(() => page.evaluate(async () => {
    try { await window.directedHost.client!.tick(); return window.directedHost.client!.status; } catch { return 'busy'; }
  })).toBe('cancelled');
  expect((await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'))).checkpoint).toEqual(stopped.checkpoint);
});

test('inspection wake after explicit adoption uses current custody and retains the original objective', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket, true, true), socket);
  await parked(request, binding.sessionId);
  await page.evaluate(() => window.directedHost.client!.tick());
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  await page.evaluate(({ socket, binding }) => window.directedHost.recover(socket, binding), { socket, binding });
  await page.evaluate(() => window.directedHost.client!.adopt());
  await page.evaluate(async () => {
    for (let i = 0; i < 256 && window.directedHost.client!.status !== 'awaiting-inspection'; i++) await window.directedHost.client!.tick();
  });
  await expect.poll(async () => (await inventory(request, binding.sessionId))[0].state, { timeout: 30000 }).toBe('completed');
  const successor = await page.evaluate(() => window.directedHost.client!.currentRun);
  expect(successor!.objectiveId).toBe(binding.objectiveId);
  expect(Number(successor!.sessionEpoch)).toBeGreaterThan(Number(binding.sessionEpoch));
  expect(successor!.control.epoch).toBe(Number(successor!.sessionEpoch));
  await page.evaluate(() => window.directedHost.client!.tick());
  expect(await page.evaluate(() => window.directedHost.client!.status)).toBe('completed');
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  await page.evaluate(({ socket, binding }) => window.directedHost.recover(socket, binding), { socket, binding });
  expect(await page.evaluate(() => window.directedHost.client!.currentRun!.runId)).toBe(successor!.runId);
  expect(await page.evaluate(() => window.directedHost.client!.status)).toBe('completed');
});

test('crash between final move and event publication recovers completion without moving again', async ({ page, request }) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket), socket);
  await parked(request, binding.sessionId);
  const beforeCalls = await calls(request, binding.scopeId);
  const arrived = await page.evaluate(async () => {
    const h = window.directedStream;
    let session = await h.durable.loadDirectedStreamSession('directed'), record = session.record!;
    while (record.state.operation.status === 'running') {
      record = await h.durable.prepareDurableDirectedStreamMove('directed', session.control,
        { operationId: record.state.operation.id, revision: record.revision, actionId: crypto.randomUUID() });
      if (record.state.pending) record = await h.durable.executeDurableDirectedStreamMove('directed', session.control,
        { operationId: record.state.operation.id, actionId: record.state.pending.request.actionId });
    }
    return h.durable.loadDirectedStreamSession('directed');
  });
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  await page.evaluate(({ socket, binding }) => window.directedHost.recover(socket, binding), { socket, binding });
  await page.evaluate(() => window.directedHost.client!.tick());
  expect((await inventory(request, binding.sessionId))[0].state).toBe('completed');
  expect(await page.evaluate(() => window.directedStream.durable.loadDirectedStreamSession('directed'))).toEqual(arrived);
  expect(await calls(request, binding.scopeId)).toEqual(beforeCalls);
});

test('cancelling during early startup cannot later admit or enable travel', async ({ page, request }) => {
  await open(page);
  const beforeCalls = await (await request.get(`${provider}/evidence`)).json();
  const proof = await page.evaluate(async socket => {
    const h = window.directedHost, s = window.directedStream, scenario = await s.setup();
    const client = new h.DirectedAgenticaClient({ slot: 'directed', url: socket, destination: scenario.target.address });
    const starting = client.start().then(() => 'started', error => String(error));
    await client.cancel();
    const start = await starting;
    const session = await s.durable.loadDirectedStreamSession('directed');
    return { start, status: client.status, session };
  }, socket);
  expect(proof.start).toContain('cancelled'); expect(proof.status).toBe('cancelled');
  expect(proof.session.record).toBeUndefined(); expect(proof.session.checkpoint.moves).toBe(0);
  expect(await (await request.get(`${provider}/evidence`)).json()).toEqual(beforeCalls);
});

test('planner requests map and room scopes explicitly before one destination admission', async ({ page, request }, info) => {
  await open(page);
  const { binding } = await page.evaluate(socket => window.directedHost.start(socket, true, false,
    'Read the bounded map and room before travel.'), socket);
  await parked(request, binding.sessionId);
  const before = await calls(request, binding.scopeId);
  expect(before.map((call: any) => call.tool)).toEqual(['maze.map', 'maze.room', 'maze.navigate']);
  const result = await finish(page);
  expect(result.status).toBe('completed');
  expect(await calls(request, binding.scopeId)).toEqual(before);
  const entry = (await inventory(request, binding.sessionId))[0];
  expect(entry.latestEvent.observation.data.view).toEqual({ kind: 'operation' });
  expect(entry.latestEvent.observation.data).not.toHaveProperty('knowledge');
  expect(entry.latestEvent.observation.data).not.toHaveProperty('context');
  await info.attach('scoped-query-proof', { body: JSON.stringify({ calls: before,
    localSteps: result.session.record!.state.operation.steps, progressView: entry.latestEvent.observation.data.view }), contentType: 'application/json' });
});
