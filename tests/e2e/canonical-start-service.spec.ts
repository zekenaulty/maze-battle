import { test, expect, type Page } from '@playwright/test';
import { ServiceProcess, serviceOrigin, type ServiceProof } from '../agentica-start-service/service.mjs';
import type { HostStartKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type {} from './canonical-start-service.fixture';

const browserOrigin = 'http://127.0.0.1:5258';
const service = new ServiceProcess(process.env.MAZE_START_SERVICE_DLL, process.env.MAZE_START_SERVICE_STORAGE, process.env.MAZE_START_SERVICE_LOG);
let starts: unknown[], actions: unknown[], results: unknown[], errors: string[], network: { method: string; url: string; body?: unknown }[];
let scripted: boolean;
let proofBefore: ServiceProof;
let incoming: unknown[];
let incomingBytes: { type: string; bytes: number }[];
test.beforeAll(async () => { await service.start(); });
test.afterAll(async () => { await service.stop(); });
test.beforeEach(async ({ page, context }) => {
  starts = []; actions = []; results = []; errors = []; network = []; scripted = false;
  incoming = []; incomingBytes = [];
  proofBefore = await serviceProof();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (![browserOrigin, serviceOrigin].includes(url.origin)) throw Error('Unexpected external request: ' + url.origin);
    if (url.origin === serviceOrigin && !['GET /api/starts', 'POST /api/starts/stop', 'GET /api/operations',
      'POST /api/operations/events', 'GET /api/recovery'].includes(request.method() + ' ' + url.pathname))
      throw Error('Unexpected service request: ' + request.method() + ' ' + url.pathname);
    if (url.origin === serviceOrigin) network.push({ method: request.method(), url: request.url(),
      ...(request.postData() ? { body: request.postDataJSON() } : {}) });
    return route.continue();
  });
  page.on('websocket', socket => {
    const url = new URL(socket.url());
    if (url.origin === 'ws://127.0.0.1:5258') { expect(url.pathname).toBe('/'); return; }
    expect(socket.url()).toBe('ws://127.0.0.1:5259/api/host');
    socket.on('framesent', event => {
      const frame = JSON.parse(String(event.payload));
      if (frame.type === 'start.durable') starts.push(frame.payload);
      else if (scripted && frame.type === 'action.result') results.push(frame);
      else throw Error('Unexpected SDK message: ' + frame.type);
    });
    socket.on('framereceived', event => {
      const frame = JSON.parse(String(event.payload));
      if (incoming.length >= 256) throw Error('Native frame bound exceeded');
      incoming.push(frame);
      incomingBytes.push({ type: frame.type, bytes: Buffer.byteLength(event.payload) });
      if (frame.type === 'action.request' || frame.type === 'action.reconcile') actions.push(frame);
    });
  });
  await page.goto('/tests/e2e/canonical-start-service.html');
  await page.waitForFunction(() => !!window.canonicalStartService);
  await page.evaluate(() => window.canonicalStartService.boot());
});
test.afterEach(async ({ page }, info) => {
  if (scripted) {
    const state = await page.evaluate(() => window.canonicalStartService.readScript()).catch(error => ({ error: String(error) }));
    await info.attach('native-observation-sequence.json', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  }
  await page.evaluate(() => window.canonicalStartService.stop()).catch(() => {});
  const proof = await serviceProof();
  await info.attach('real-service-requests.json', { body: JSON.stringify({ starts, actions, results, incoming, incomingBytes, network, errors, proofBefore, proof }, null, 2), contentType: 'application/json' });
  if (!scripted) { expect(actions).toEqual([]); expect(results).toEqual([]); }
  expect(errors).toEqual([]);
  expect(incomingBytes.filter(frame => frame.bytes > 64 * 1024)).toEqual([]);
  expect(proof).toMatchObject({ source: '27cb2ce9717438edfe19487e3920faa183112c97', paidProviderCalls: 0 });
  expect(proof.cancelled).toBe(proof.entered);
});
async function serviceProof(): Promise<ServiceProof> {
  const response = await fetch(serviceOrigin + '/fixture/proof');
  expect(response.ok).toBe(true);
  return response.json();
}
async function reload(page: Page) {
  await page.reload(); await page.waitForFunction(() => !!window.canonicalStartService);
  await page.evaluate(() => window.canonicalStartService.boot());
}
async function lookup(page: Page, key: HostStartKey) {
  return page.evaluate(async ({ origin, key }) => {
    const response = await fetch(origin + '/api/starts?' + new URLSearchParams({ ...key }));
    return { status: response.status, entry: await response.json() };
  }, { origin: serviceOrigin, key });
}
async function settle(page: Page) {
  let result: unknown;
  await expect.poll(async () => {
    result = await page.evaluate(() => window.canonicalStartService.recover('stop'));
    return (result as { status: string }).status;
  }, { timeout: 15_000 }).toBe('settled');
  return result;
}
async function lost(page: Page) {
  const before = await serviceProof();
  const result = await page.evaluate(() => window.canonicalStartService.loseStart());
  expect(result.error).toContain('discarded the real correlated');
  expect(result.receivedReply).toHaveProperty('startAdmission');
  expect(result.launch!.dispatch).not.toBeNull();
  expect(result.launch!.run).toBeNull(); expect(result.launch!.grant).toBeNull();
  expect(starts).toHaveLength(1);
  const remote = await lookup(page, result.key);
  expect(remote.status).toBe(200); expect(remote.entry.attemptId).toBe(result.key.attemptId);
  await expect.poll(async () => (await serviceProof()).entered).toBe(before.entered + 1);
  return result;
}

test('lost real SDK reply survives browser reload; exact service Stop and verified ACK allow fresh admission', async ({ page }) => {
  const original = await lost(page);
  await reload(page);
  const before = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(await page.evaluate(() => window.canonicalStartService.recover('inspect'))).toMatchObject({
    status: 'identified', fullStartEquivalence: 'verified', settled: false,
  });
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(before);
  await settle(page);
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(stopped.launch!.guard.state).toBe('acknowledged');
  expect(stopped.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(stopped.launch!.run).toBeNull(); expect(stopped.launch!.grant).toBeNull();
  expect(stopped.head.checkpoint).toEqual(before.head.checkpoint);
  expect(stopped.cleanupKinds).toContain('verified-ack');
  const remote = (await lookup(page, original.key)).entry;
  expect(remote).toMatchObject({ stopRequested: true, terminal: { reason: 'stopped', usageUnknown: false } });
  const posts = network.filter(x => x.method === 'POST');
  expect(posts.length).toBeGreaterThan(0);
  for (const post of posts) expect(post).toEqual({ method: 'POST', url: serviceOrigin + '/api/starts/stop',
    body: { ...original.key, runId: remote.runId, acceptedRequestHash: remote.acceptedRequestHash } });
  const fresh = await page.evaluate(() => window.canonicalStartService.freshAdmission());
  expect(fresh.launchId).not.toBe(original.launch!.binding.launchId);
  expect(starts).toHaveLength(1);
});

test('normal quota refusal preserves funded local Stop and verified service settlement', async ({ page }) => {
  const original = await lost(page);
  const quota = await page.evaluate(() => window.canonicalStartService.fillQuota());
  expect(quota.refusal).toMatch(/quota/i); expect(quota.view.controlled).toBe(false);
  await settle(page);
  const after = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(after.launch!.guard.state).toBe('acknowledged');
  expect(after.launch!.run).toBeNull(); expect(after.launch!.grant).toBeNull();
  expect(after.cleanupKinds).toContain('verified-ack');
  expect(after.head.checkpoint).toEqual(original.head.checkpoint);
  expect((await lookup(page, original.key)).entry.terminal).not.toBeNull();
  expect(starts).toHaveLength(1);
});

test('service process restart retains original admission and settles with unknown interrupted usage', async ({ page }) => {
  const original = await lost(page);
  const prior = await (await fetch(serviceOrigin + '/fixture/proof')).json();
  const restarted = await service.restart(); expect(restarted.processId).not.toBe(prior.processId);
  expect(restarted.created).toBe(0);
  await reload(page); await settle(page);
  const remote = (await lookup(page, original.key)).entry;
  expect(remote).toMatchObject({ stopRequested: true, terminal: { reason: 'interrupted', usageUnknown: true, usage: null } });
  expect((await page.evaluate(() => window.canonicalStartService.snapshot())).launch!.guard.state).toBe('acknowledged');
  expect((await (await fetch(serviceOrigin + '/fixture/proof')).json()).created).toBe(0);
  expect(starts).toHaveLength(1);
});

test('a dispatched but never-sent attempt remains UNKNOWN after reload and local Stop cannot ACK it', async ({ page }) => {
  const original = await page.evaluate(() => window.canonicalStartService.loseStart(true));
  expect(original.launch!.dispatch).not.toBeNull(); expect(starts).toHaveLength(0);
  await reload(page);
  expect((await lookup(page, original.key)).status).toBe(404);
  expect(await page.evaluate(() => window.canonicalStartService.recover('inspect'))).toMatchObject({ status: 'unknown' });
  expect(await page.evaluate(() => window.canonicalStartService.recover('stop'))).toMatchObject({ status: 'unknown', localStopped: true, settled: false });
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(stopped.launch!.guard.state).not.toBe('acknowledged'); expect(stopped.launch!.grant).toBeNull();
  expect(stopped.cleanupKinds).not.toContain('verified-ack');
  expect(network.filter(x => x.method === 'POST')).toEqual([]);
  expect(await page.evaluate(() => window.canonicalStartService.replacementRefusal())).toBeTruthy();
});

test('real start lookup rejects missing/invalid keys; a foreign Stop reference cannot mutate admission', async ({ page }) => {
  const original = await lost(page), before = await lookup(page, original.key);
  const responses = await page.evaluate(async ({ origin, key, entry }) => {
    const base = { hostId: key.hostId, sessionId: key.sessionId };
    const missing = await fetch(origin + '/api/starts?' + new URLSearchParams(base));
    const invalid = await fetch(origin + '/api/starts?' + new URLSearchParams({ ...base, attemptId: '\n' }));
    const foreign = await fetch(origin + '/api/starts/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...key, runId: entry.runId, acceptedRequestHash: 'sha256:' + '0'.repeat(64) }) });
    return { missing: missing.status, invalid: invalid.status, foreign: foreign.status };
  }, { origin: serviceOrigin, key: original.key, entry: before.entry });
  expect(responses).toEqual({ missing: 400, invalid: 409, foreign: 409 });
  expect(await lookup(page, original.key)).toEqual(before);
  await settle(page); expect(starts).toHaveLength(1);
});

test('native inspect/observe results have unique identities, exact retry, and bounded navigation custody without paid calls', async ({ page }) => {
  scripted = true;
  await page.evaluate(() => window.canonicalStartService.startScript());
  // Include native errors in a bounded wait so the old-code failure records the real collision, not just a timeout.
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.canonicalStartService.readScript());
    const error = state.messages.find(m => m.type === 'error');
    return error ? { error: error.payload } : state.messages.some(m => m.type === 'operation.parked') ? 'parked' : 'pending';
  }, { timeout: 15_000 }).toBe('parked');
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readScript()))
    .messages.some(message => message.type === 'outcome')).toBe(true);
  const state = await page.evaluate(() => window.canonicalStartService.readScript());
  expect(state.messages.filter(m => m.type === 'error')).toEqual([]);
  expect(incomingBytes.filter(frame => frame.bytes > 64 * 1024)).toEqual([]);
  expect(state.statuses.filter(s => s.state.endsWith('.error'))).toEqual([]);
  expect(starts).toHaveLength(1); expect(actions).toHaveLength(4); expect(results).toHaveLength(5);
  expect(state.actions.map(a => a.capabilityId)).toEqual(['maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate']);
  expect(state.actions[0].arguments).toEqual({ scope: 'map' });
  const actor = state.initial.data.actor as { level: number; spaceId: string; row: number; column: number };
  const here = { level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column };
  const target = state.actions[3].arguments;
  expect(state.actions[1].arguments).toEqual({ scope: 'room', ...here });
  expect(target).not.toEqual(here);
  expect(state.results.map(r => r.disposition)).toEqual(['applied', 'applied', 'applied', 'applied']);
  expect(state.results.map(r => r.observation!.data.scope)).toEqual(['map', 'room', 'actor', 'actor']);
  const cells = state.results[1].observation!.data.cells as { at: typeof here; edges: Record<string, { target: typeof here }> }[];
  expect(cells).toEqual(expect.arrayContaining([expect.objectContaining({ at: target })]));
  const actorCell = cells.find(cell => JSON.stringify(cell.at) === JSON.stringify(here))!;
  expect(actorCell).toBeTruthy();
  expect(Object.values(actorCell.edges)).toEqual(expect.arrayContaining([expect.objectContaining({ target })]));
  expect(state.results[2].observation!.data).toEqual(state.initial.data);
  expect(new Set([state.initial.observationId, ...state.results.map(r => r.observation!.observationId)]).size).toBe(5);
  for (const [index, result] of state.results.entries()) {
    expect(result.observation!.observationId).toBe('observation-' + state.originals[index]!.reference.key.slice(-64));
    expect(result.observation!.observedAt).toBe(state.initial.observedAt);
    expect(state.originals[index]!.result).toEqual(result);
    expect(state.actions[index].expectedRevision).toBe(state.initial.revision);
    if (index < 3) expect([result.beforeRevision, result.afterRevision, result.observation!.revision])
      .toEqual([state.initial.revision, state.initial.revision, state.initial.revision]);
  }
  expect(state.results[3].afterRevision).toBeGreaterThan(state.initial.revision);
  expect(state.results[3].observation!.revision).toBe(state.results[3].afterRevision);
  expect(state.results[3].observation!.data.source).toEqual(state.initial.data.source);
  expect(state.retry).toMatchObject({ response: { type: 'action.accepted', payload: { duplicate: true } },
    original: state.results[0], reconciled: state.results[0], after: { status: 'completed', result: state.results[0] } });
  const retryFrames = (results as { payload: { actionId: string } }[]).filter(r => r.payload.actionId === state.actions[0].actionId);
  expect(retryFrames).toHaveLength(2); expect(retryFrames[0].payload).toEqual(retryFrames[1].payload);
  const beforePulse = await serviceProof();
  expect(beforePulse.scriptedCreated - proofBefore.scriptedCreated).toBe(1);
  expect(beforePulse.scriptedCreateCalls - proofBefore.scriptedCreateCalls).toBe(1);
  expect(beforePulse.scriptedRefineCalls - proofBefore.scriptedRefineCalls).toBe(3);
  expect(beforePulse.scriptedStepsPlanned - proofBefore.scriptedStepsPlanned).toBe(4);
  const confirmation = await page.evaluate(() => window.canonicalStartService.pulseScript());
  expect(confirmation.result.status).toBe('confirmed');
  expect(confirmation.state!.confirmation.data.entry).toMatchObject({ state: 'parked',
    usage: { providerCalls: 0, steps: 4, refinements: 3, continuations: 0 } });
  const custody = await page.evaluate(() => window.canonicalStartService.pulseScript());
  expect(custody.result.status).toBe('custody-confirmed'); expect(custody.state!.custodyAck).toBeTruthy();
  expect(custody.state!.progress.sequence).toBe(0);
  const advanced = await page.evaluate(() => window.canonicalStartService.pulseScript());
  expect(advanced.result.status).toBe('advanced'); expect(advanced.state!.progress.status).toBe('arrived');
  expect(await serviceProof()).toEqual(beforePulse);
  const unresolved = await page.evaluate(async ({ origin, sessionId }) => {
    const response = await fetch(origin + '/api/recovery?' + new URLSearchParams({ hostId: 'maze-battle', sessionId }));
    if (!response.ok) throw Error('Recovery lookup failed'); return response.json();
  }, { origin: serviceOrigin, sessionId: state.started.sessionId });
  expect(unresolved).toEqual([]);
  await page.evaluate(() => window.canonicalStartService.cancelScript());
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.pulseScript())).result.status)
    .toBe('terminal-acknowledged');
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.stopScriptStart())).settled).toBe(true);
  expect((await page.evaluate(() => window.canonicalStartService.snapshot())).launch!.guard.state).toBe('acknowledged');
  expect(await serviceProof()).toEqual(beforePulse);
});
