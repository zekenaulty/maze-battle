import { expect, type Browser, type WebSocketRoute } from '@playwright/test';
import type {} from './canonical-agentica-transport.review.fixture';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { durableStarted, durableSubmission } from './canonical-agentica-transport.wire';

export type ConsumerFrame = Omit<AgenticaMessage, 'requestId'> & { requestId?: string | null };
export async function commutationConsumer(browser: Browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
  const origin = 'http://127.0.0.1:5243', incoming: AgenticaMessage[] = [], external: string[] = [], errors: string[] = [];
  let socket: WebSocketRoute;
  await context.addInitScript(() => {
    if (location.href !== 'http://127.0.0.1:5243/tests/e2e/canonical-agentica-transport.html') return;
    let counter = 0, state = 0x71c0ffee, seeded = false;
    Object.defineProperty(crypto, 'randomUUID', { value: () => {
      if (++counter > 50_000) throw Error('Commutation fixture identity bound');
      return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
    } });
    Object.defineProperty(crypto, 'getRandomValues', { value: <T extends ArrayBufferView>(array: T): T => {
      if (!seeded && array instanceof Uint32Array && array.length === 1) { seeded = true; array[0] = 42; return array; }
      if (!ArrayBuffer.isView(array) || array.byteLength > 65_536) throw Error('Invalid commutation RNG request');
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; bytes[i] = state & 255; }
      return array;
    } });
  });
  await page.clock.setFixedTime('2026-10-23T12:00:00.000Z');
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url === `${origin}/tests/e2e/canonical-agentica-transport.html`) return route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><script type="module" src="./canonical-agentica-transport.review.fixture.ts"></script>' });
    if (new URL(url).origin === origin) return route.continue();
    external.push(url); return route.abort();
  });
  await context.routeWebSocket('**/*', route => {
    if (route.url() !== `${origin.replace('http:', 'ws:')}/api/host`) { external.push(route.url()); route.close(); return; }
    socket = route;
    route.onMessage(async text => {
      const frame = JSON.parse(String(text)) as AgenticaMessage; incoming.push(frame);
      if (frame.type === 'start.durable') route.send(JSON.stringify(await durableStarted(frame, 'review-run')));
    });
  });
  await page.goto('/tests/e2e/canonical-agentica-transport.html');
  await page.waitForFunction(() => !!window.transportReview);
  await page.evaluate(async () => { await window.transportReview.boot(); await window.transportReview.attach(); window.transportReview.begin(); });
  await page.waitForFunction(() => ['attached', 'failed'].includes(window.transportReview.status().starts[0]?.status));
  const attachment = await page.evaluate(() => window.transportReview.status());
  expect(attachment.starts, JSON.stringify({ attachment, sent: incoming.map(frame => frame.type), errors, external }))
    .toEqual([{ status: 'attached' }]);
  const start = incoming.find(frame => frame.type === 'start.durable')!, request = durableSubmission(start).request;
  const started = await durableStarted(start, 'review-run');
  const now = await page.evaluate(() => Date.now());
  const action = (id: string): AgenticaAction => ({ actionId: id, runId: 'review-run', runnerRunId: 'commutation-runner', stepId: id,
    sessionId: request.sessionId, sessionEpoch: request.sessionEpoch, manifestHash: started.payload.manifestHash,
    capabilityId: 'maze.observe', arguments: {}, expectedRevision: request.observation.revision,
    deadlineAt: new Date(now + 120_000).toISOString() });
  const send = (frame: ConsumerFrame) => socket.send(JSON.stringify(frame));
  async function invoke(value: AgenticaAction, order?: 'waiting-first' | 'request-first' | 'queued-first') {
    const request: ConsumerFrame = { protocolVersion: 1, type: 'action.request', runId: value.runId, payload: value };
    if (!order) send(request);
    else {
      const waiting: ConsumerFrame = { ...request, requestId: null, type: 'status', payload: { status: 'awaiting_host' } };
      const pending: ConsumerFrame = { ...request, requestId: null, type: 'action.pending' };
      request.requestId = null;
      const rows = order === 'waiting-first' ? [waiting, request, pending]
        : order === 'request-first' ? [request, waiting, pending] : [waiting, pending, request];
      rows.forEach(send);
    }
    await expect.poll(() => incoming.filter(frame => frame.type === 'action.result' && frame.payload.actionId === value.actionId).length).toBe(1);
    await page.evaluate(() => window.transportReview.drain());
    return incoming.find(frame => frame.type === 'action.result' && frame.payload.actionId === value.actionId)!.payload;
  }
  return { page, incoming, action, invoke, send,
    snapshot: () => page.evaluate(() => window.transportReview.consumerSnapshot()),
    async close() {
      try { await page.evaluate(() => window.transportReview.stop()); expect(errors).toEqual([]); expect(external).toEqual([]); }
      finally { await context.close(); }
    } };
}
