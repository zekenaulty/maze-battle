import { test, expect, type Page } from '@playwright/test';
import { ServiceProcess, serviceOrigin, type ServiceProof } from '../agentica-start-service/service.mjs';
import type { HostStartKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type {} from './canonical-start-service.fixture';

const browserOrigin = 'http://127.0.0.1:5258';
const service = new ServiceProcess(process.env.MAZE_START_SERVICE_DLL, process.env.MAZE_START_SERVICE_STORAGE, process.env.MAZE_START_SERVICE_LOG);
let starts: unknown[], actions: unknown[], errors: string[], network: { method: string; url: string; body?: unknown }[];
test.beforeAll(async () => { await service.start(); });
test.afterAll(async () => { await service.stop(); });
test.beforeEach(async ({ page, context }) => {
  starts = []; actions = []; errors = []; network = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (![browserOrigin, serviceOrigin].includes(url.origin)) throw Error('Unexpected external request: ' + url.origin);
    if (url.origin === browserOrigin && url.pathname === '/@vite/client')
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === serviceOrigin) network.push({ method: request.method(), url: request.url(),
      ...(request.postData() ? { body: request.postDataJSON() } : {}) });
    return route.continue();
  });
  page.on('websocket', socket => {
    expect(socket.url()).toBe('ws://127.0.0.1:5259/api/host');
    socket.on('framesent', event => {
      const frame = JSON.parse(String(event.payload));
      if (frame.type === 'start.durable') starts.push(frame.payload);
      else throw Error('Unexpected SDK message: ' + frame.type);
    });
    socket.on('framereceived', event => {
      const frame = JSON.parse(String(event.payload));
      if (frame.type === 'action.request' || frame.type === 'action.reconcile') actions.push(frame);
    });
  });
  await page.goto('/tests/e2e/canonical-start-service.html');
  await page.waitForFunction(() => !!window.canonicalStartService);
  await page.evaluate(() => window.canonicalStartService.boot());
});
test.afterEach(async ({ page }, info) => {
  await page.evaluate(() => window.canonicalStartService.stop()).catch(() => {});
  const proof = await serviceProof();
  await info.attach('real-service-requests.json', { body: JSON.stringify({ starts, actions, network, errors, proof }, null, 2), contentType: 'application/json' });
  expect(actions).toEqual([]); expect(errors).toEqual([]);
  expect(proof).toMatchObject({ source: '602f15ac24a60faee8665cb165cb2d7c761c9eed', paidProviderCalls: 0, emittedActions: 0 });
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
