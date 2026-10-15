import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ServiceProcess, serviceOrigin, type ServiceProof } from '../agentica-start-service/service.mjs';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type {} from './canonical-start-service.fixture';

const browserOrigin = 'http://127.0.0.1:5258';
export const service = new ServiceProcess(process.env.MAZE_START_SERVICE_DLL, process.env.MAZE_START_SERVICE_STORAGE, process.env.MAZE_START_SERVICE_LOG);
export async function serviceProof(): Promise<ServiceProof> {
  const response = await fetch(serviceOrigin + '/fixture/proof');
  expect(response.ok).toBe(true); return response.json();
}
interface DecisionWire {
  sent: AgenticaMessage[]; received: { frame: AgenticaMessage; bytes: number }[];
  http: { method: string; url: string; body?: unknown }[];
  responses: { status: number; url: string; body: unknown }[]; errors: string[]; console: string[];
  before: ServiceProof;
}
export const test = base.extend<{ wire: DecisionWire }, { decisionService: void }>({
  decisionService: [async ({}, use) => {
    await service.start(); try { await use(); } finally { await service.stop(); }
  }, { scope: 'worker', auto: true }],
  wire: [async ({ page, context }, use, info) => {
  const wire: DecisionWire = { sent: [], received: [], http: [], responses: [], errors: [], console: [], before: await serviceProof() };
  const pending: Promise<void>[] = [];
  page.on('pageerror', error => wire.errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) wire.console.push(message.text()); });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (![browserOrigin, serviceOrigin].includes(url.origin)) throw Error('Unexpected external request: ' + url.origin);
    if (url.origin === browserOrigin && url.pathname === '/@vite/client')
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === serviceOrigin) {
      if (!['GET /api/operations', 'POST /api/operations/events', 'POST /api/operations/stop-decision',
        'GET /api/starts', 'POST /api/starts/stop', 'GET /api/recovery'].includes(request.method() + ' ' + url.pathname))
        throw Error('Unexpected service request: ' + request.method() + ' ' + url.pathname);
      wire.http.push({ method: request.method(), url: request.url(), ...(request.postData() ? { body: request.postDataJSON() } : {}) });
    }
    return route.continue();
  });
  page.on('response', response => {
    if (new URL(response.url()).origin === serviceOrigin) pending.push((async () => {
      wire.responses.push({ status: response.status(), url: response.url(), body: await response.json().catch(String) });
    })());
  });
  page.on('websocket', socket => {
    expect(socket.url()).toBe('ws://127.0.0.1:5259/api/host');
    socket.on('framesent', event => {
      const frame = JSON.parse(String(event.payload));
      expect(['start.durable', 'action.result', 'operation.wake', 'operation.adopt', 'resume', 'cancel']).toContain(frame.type);
      wire.sent.push(frame);
    });
    socket.on('framereceived', event => {
      expect(wire.received.length).toBeLessThan(512);
      wire.received.push({ frame: JSON.parse(String(event.payload)), bytes: Buffer.byteLength(event.payload) });
    });
  });
  await page.goto('/tests/e2e/canonical-start-service.html'); await page.waitForFunction(() => !!window.canonicalStartService);
  await page.evaluate(() => window.canonicalStartService.boot());
  try { await use(wire); } finally {
    const state = await page.evaluate(() => window.canonicalStartService.readDecision()).catch(String);
    await page.evaluate(() => window.canonicalStartService.stop()).catch(() => {});
    await Promise.all(pending);
    await info.attach('native-decision-service-proof.json', { body: JSON.stringify({ wire, state, proof: await serviceProof() }, null, 2), contentType: 'application/json' });
    const names = ['decisionController', 'decisionChannel', 'decisionState', 'decisionCommit', 'decisionCleanup',
      'decisionRemote', 'operationPrefix', 'operationTerminal', 'launchRecovery', 'launchRecovery.shared'];
    const hashes = Object.fromEntries(names.map(name => [name, createHash('sha256')
      .update(readFileSync(`src/services/agentica/game/${name}.ts`)).digest('hex')]));
    for (const name of ['decision.entry', 'decision.claim', 'terminal.decision', 'terminal.root-stop', 'terminal.ack', 'terminal']) {
      const file = `src/persistence/canonical/agentica/${name}.ts`;
      hashes[file] = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
    await info.attach('runtime-source-sha256.json', { body: JSON.stringify(hashes, null, 2), contentType: 'application/json' });
  }
  expect(wire.errors).toEqual([]); expect(wire.console).toEqual([]);
  expect(wire.responses.filter(response => response.status >= 400), 'No unexpected HTTP refusal').toEqual([]);
  expect(wire.received.filter(frame => frame.bytes > 64 * 1024), 'Unchanged receive bound').toEqual([]);
}, { auto: true }] });
export { expect };
