import { test as base, expect } from '@playwright/test';
import { ServiceProcess, serviceOrigin, type ServiceProof } from '../agentica-start-service/service.mjs';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type {} from './canonical-start-service.fixture';

const browserOrigin = 'http://127.0.0.1:5258';
const service = new ServiceProcess(process.env.MAZE_START_SERVICE_DLL, process.env.MAZE_START_SERVICE_STORAGE, process.env.MAZE_START_SERVICE_LOG);
export async function serviceProof(): Promise<ServiceProof> {
  const response = await fetch(serviceOrigin + '/fixture/proof');
  expect(response.ok).toBe(true); return response.json();
}
interface WireEvidence {
  sent: AgenticaMessage[]; received: { frame: AgenticaMessage; bytes: number }[];
  http: { method: string; url: string; body?: unknown }[];
  responses: { status: number; url: string; body: unknown }[]; errors: string[]; console: string[];
}
export const test = base.extend<{ wire: WireEvidence }>({ wire: [async ({ page, context }, use, info) => {
  const wire: WireEvidence = { sent: [], received: [], http: [], responses: [], errors: [], console: [] };
  const pending: Promise<void>[] = [];
  page.on('pageerror', e => wire.errors.push(e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) wire.console.push(m.text()); });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (![browserOrigin, serviceOrigin].includes(url.origin)) throw Error('Unexpected external request: ' + url.origin);
    if (url.origin === serviceOrigin) {
      if (!['GET /api/operations', 'POST /api/operations/events', 'GET /api/starts', 'POST /api/starts/stop'].includes(request.method() + ' ' + url.pathname))
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
    const url = new URL(socket.url());
    if (url.origin === 'ws://127.0.0.1:5258') { expect(url.pathname).toBe('/'); return; }
    expect(socket.url()).toBe('ws://127.0.0.1:5259/api/host');
    socket.on('framesent', e => {
      const frame = JSON.parse(String(e.payload));
      expect(['start.durable', 'action.result']).toContain(frame.type); wire.sent.push(frame);
    });
    socket.on('framereceived', e => {
      expect(wire.received.length).toBeLessThan(256);
      wire.received.push({ frame: JSON.parse(String(e.payload)), bytes: Buffer.byteLength(e.payload) });
    });
  });
  await page.goto('/tests/e2e/canonical-start-service.html'); await page.waitForFunction(() => !!window.canonicalStartService);
  await page.evaluate(() => window.canonicalStartService.boot());
  try { await use(wire); } finally {
    const state = await page.evaluate(() => window.canonicalStartService.readTransfer()).catch(String);
    await page.evaluate(() => window.canonicalStartService.stop()).catch(() => {});
    await Promise.all(pending);
    await info.attach('native-transfer-service-proof.json', { body: JSON.stringify({ wire, state, proof: await serviceProof() }, null, 2), contentType: 'application/json' });
  }
  expect(wire.errors).toEqual([]); expect(wire.console).toEqual([]);
  expect(wire.responses.filter(r => r.status >= 400), 'Exact real protocol refusals').toEqual([]);
  expect(wire.received.filter(r => r.bytes > 64 * 1024), 'No oversized-outcome exemption').toEqual([]);
}, { auto: true }] });
test.beforeAll(async () => { await service.start(); });
test.afterAll(async () => { await service.stop(); });
export { expect, serviceOrigin };
