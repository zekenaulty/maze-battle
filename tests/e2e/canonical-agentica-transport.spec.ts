import { test, expect, type WebSocketRoute } from '@playwright/test';
import type {} from './canonical-agentica-transport.fixture';
import type { AgenticaStart, AgenticaAction } from '../../src/services/agentica/contracts';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';

const origin = 'http://127.0.0.1:5244';
let socket: WebSocketRoute, incoming: AgenticaMessage[], external: string[], errors: string[];
test.beforeEach(async ({ page, context }) => {
  incoming = []; external = []; errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (route.request().url() === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', route => {
    if (route.url() !== 'ws://127.0.0.1:5244/api/host') { external.push(route.url()); route.close(); return; }
    socket = route; route.onMessage(text => incoming.push(JSON.parse(String(text))));
  });
  await page.goto('/tests/e2e/canonical-agentica-transport.html');
  await page.waitForFunction(() => !!window.canonicalTransport);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.canonicalTransport.stop());
  expect(external, 'No real service or provider requests').toEqual([]); expect(errors).toEqual([]);
});
function announce(start: AgenticaMessage, changes: Record<string, unknown> = {}) {
  const input = start.payload as AgenticaStart;
  return { protocolVersion: 1, type: 'started', requestId: start.requestId, runId: 'offline-run',
    payload: { hostId: input.hostId, sessionId: input.sessionId, sessionEpoch: input.sessionEpoch,
      scopeId: input.scopeId, perspectiveId: input.perspectiveId, objectiveId: input.objectiveId,
      manifestHash: `sha256:${'a'.repeat(64)}`, runId: 'offline-run' }, ...changes };
}
function action(start: AgenticaMessage, capabilityId = 'maze.observe', args = {}): AgenticaAction {
  const input = start.payload as AgenticaStart;
  return { actionId: 'action-one', runId: 'offline-run', runnerRunId: 'runner-one', stepId: 'step-one',
    sessionId: input.sessionId, sessionEpoch: input.sessionEpoch, capabilityId, arguments: args,
    manifestHash: `sha256:${'a'.repeat(64)}`, expectedRevision: input.observation.revision,
    deadlineAt: new Date(Date.now() + 60_000).toISOString() };
}
const send = (message: unknown) => socket.send(JSON.stringify(message));
async function waitStart() { await expect.poll(() => incoming.filter(m => m.type === 'start').length).toBe(1); return incoming.find(m => m.type === 'start')!; }

test('preparation has no network; correlated start holds early action until durable grant', async ({ page }) => {
  const boot = await page.evaluate(() => window.canonicalTransport.boot());
  expect(incoming).toEqual([]);
  await page.evaluate(async () => { await window.canonicalTransport.attach(); window.canonicalTransport.hold('agentica.launch.grant'); window.canonicalTransport.begin(); });
  const start = await waitStart(); expect(start.payload).toEqual(boot.start);
  expect(Buffer.byteLength(JSON.stringify(start.payload))).toBeLessThanOrEqual(3072);
  send(announce(start)); const request = action(start);
  send({ protocolVersion: 1, type: 'action.request', runId: request.runId, payload: request });
  await page.waitForFunction(() => window.canonicalTransport.status().held);
  expect(incoming.filter(m => m.type === 'action.result')).toHaveLength(0);
  expect(await page.evaluate(a => window.canonicalTransport.original(a), request)).toBeNull();
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.grant).toBeNull();
  await page.evaluate(() => window.canonicalTransport.release());
  await expect.poll(() => incoming.filter(m => m.type === 'action.result').length).toBe(1);
  const result = incoming.find(m => m.type === 'action.result')!.payload;
  expect(result.disposition).toBe('applied');
  expect(await page.evaluate(a => window.canonicalTransport.original(a), request)).toEqual(result);
  expect((await page.evaluate(() => window.canonicalTransport.head())).checkpoint).toEqual(boot.head.checkpoint);
  expect(await page.evaluate(() => window.canonicalTransport.secondStart())).toContain('single-use');
  expect(incoming.filter(m => m.type === 'start')).toHaveLength(1);
});

test('uncorrelated announcement cannot grant; the matching reply can', async ({ page }) => {
  await page.evaluate(async () => { await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.begin(); });
  const start = await waitStart(); send(announce(start, { requestId: 'not-the-request' }));
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.run).toBeNull();
  send(announce(start)); await page.waitForFunction(() => window.canonicalTransport.status().status === 'attached');
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.grant).not.toBeNull();
});

for (const defect of ['wrong-type', 'wrong-session', 'envelope-run'] as const) test(`${defect} reply never grants`, async ({ page }) => {
  await page.evaluate(async () => { await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.begin(); });
  const start = await waitStart(), reply = announce(start);
  if (defect === 'wrong-type') reply.type = 'resumed';
  if (defect === 'wrong-session') reply.payload.sessionId = 'foreign';
  if (defect === 'envelope-run') reply.runId = 'foreign';
  send(reply); await page.waitForFunction(() => window.canonicalTransport.status().status === 'failed');
  const launch = await page.evaluate(() => window.canonicalTransport.launch());
  expect(launch!.dispatch).not.toBeNull(); expect(launch!.run).toBeNull(); expect(launch!.grant).toBeNull();
});

test('lost reply survives reload as uncertain dispatch and cannot send another start', async ({ page }) => {
  await page.evaluate(async () => { await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.begin(); });
  await waitStart(); socket.close(); await page.waitForFunction(() => window.canonicalTransport.status().status === 'failed');
  await page.reload(); await page.waitForFunction(() => !!window.canonicalTransport);
  const error = await page.evaluate(async () => {
    await window.canonicalTransport.reloadSession();
    try { await window.canonicalTransport.attach(); return 'unexpected'; } catch (error) { return String(error); }
  });
  expect(error).toContain('requires reconciliation');
  expect(incoming.filter(m => m.type === 'start')).toHaveLength(1);
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.grant).toBeNull();
});

test('disconnect during grant prevents early action from acquiring permission', async ({ page }) => {
  await page.evaluate(async () => { await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.hold('agentica.launch.grant'); window.canonicalTransport.begin(); });
  const start = await waitStart(); send(announce(start)); const request = action(start);
  send({ protocolVersion: 1, type: 'action.request', runId: request.runId, payload: request });
  await page.waitForFunction(() => window.canonicalTransport.status().held);
  socket.close(); await page.waitForFunction(() => window.canonicalTransport.status().phase === 'closed');
  await page.evaluate(() => window.canonicalTransport.release());
  await page.waitForFunction(() => window.canonicalTransport.status().status === 'failed');
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.grant).toBeNull();
  expect(await page.evaluate(a => window.canonicalTransport.original(a), request)).toBeNull();
});

test('same-owner session restart closes old transport before it can start', async ({ page }) => {
  await page.evaluate(async () => { await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); await window.canonicalTransport.reloadSession(); window.canonicalTransport.begin(); });
  await page.waitForFunction(() => window.canonicalTransport.status().status === 'failed');
  expect(incoming).toEqual([]); expect((await page.evaluate(() => window.canonicalTransport.launch()))!.dispatch).toBeNull();
});

test('navigation admission through actual SDK moves no cells and requires separate service custody', async ({ page }) => {
  const boot = await page.evaluate(async () => { const b = await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.begin(); return b; });
  const start = await waitStart(); send(announce(start)); const request = action(start, 'maze.navigate', boot.target);
  send({ protocolVersion: 1, type: 'action.request', runId: request.runId, payload: request });
  await expect.poll(() => incoming.filter(m => m.type === 'action.result').length).toBe(1);
  expect(incoming.find(m => m.type === 'action.result')!.payload.operation).toHaveProperty('operationId');
  expect((await page.evaluate(() => window.canonicalTransport.head())).checkpoint).toEqual(boot.head.checkpoint);
  await page.evaluate(() => window.canonicalTransport.close());
  expect(await page.evaluate(a => window.canonicalTransport.original(a), request)).toMatchObject({ disposition: 'applied' });
});
