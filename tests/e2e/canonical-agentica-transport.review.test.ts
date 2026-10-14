import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import type {} from './canonical-agentica-transport.review.fixture';
import type { AgenticaAction, AgenticaStart } from '../../src/services/agentica/contracts';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';

const origin = 'http://127.0.0.1:5243', path = '/tests/e2e/canonical-agentica-transport.html';
let sockets: WebSocketRoute[], incoming: { socket: WebSocketRoute; message: AgenticaMessage }[], external: string[], errors: string[];
let autoAnnounce = false;
test.beforeEach(async ({ page, context }) => {
  sockets = []; incoming = []; external = []; errors = []; autoAnnounce = false;
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url === `${origin}${path}`) return route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><title>Transport review</title><script type="module" src="./canonical-agentica-transport.review.fixture.ts"></script>' });
    if (new URL(url).origin === origin) return route.continue();
    external.push(url); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => {
    if (socket.url() !== 'ws://127.0.0.1:5243/api/host') { external.push(socket.url()); socket.close(); return; }
    sockets.push(socket);
    socket.onMessage(text => {
      const message = JSON.parse(String(text)) as AgenticaMessage;
      incoming.push({ socket, message });
      if (autoAnnounce && message.type === 'start') socket.send(JSON.stringify(announcement(message)));
    });
  });
  await open(page);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.transportReview?.stop());
  expect(external, 'No service or provider traffic is allowed').toEqual([]); expect(errors).toEqual([]);
});
async function open(page: Page) { await page.goto(path); await page.waitForFunction(() => !!window.transportReview); }
function announcement(message: AgenticaMessage) {
  const input = message.payload as AgenticaStart;
  return { protocolVersion: 1, type: 'started', requestId: message.requestId, runId: 'review-run', payload: {
    hostId: input.hostId, sessionId: input.sessionId, sessionEpoch: input.sessionEpoch, scopeId: input.scopeId,
    perspectiveId: input.perspectiveId, objectiveId: input.objectiveId, runId: 'review-run', manifestHash: `sha256:${'a'.repeat(64)}` } };
}
function navigate(start: AgenticaMessage, args: AgenticaAction['arguments']): AgenticaAction {
  const input = start.payload as AgenticaStart;
  return { actionId: 'review-action', runId: 'review-run', runnerRunId: 'review-runner', stepId: 'review-step',
    sessionId: input.sessionId, sessionEpoch: input.sessionEpoch, manifestHash: `sha256:${'a'.repeat(64)}`,
    capabilityId: 'maze.navigate', arguments: args, expectedRevision: input.observation.revision,
    deadlineAt: new Date(Date.now() + 120_000).toISOString() };
}
const starts = () => incoming.filter(row => row.message.type === 'start');
async function attached(page: Page) {
  autoAnnounce = true;
  const boot = await page.evaluate(async () => {
    const b = await window.transportReview.boot(); await window.transportReview.attach(); window.transportReview.begin(); return b;
  });
  await page.waitForFunction(() => window.transportReview.status().starts[0]?.status === 'attached');
  expect(starts()).toHaveLength(1);
  return navigate(starts()[0].message, { ...boot.target });
}
function sendAction(action: AgenticaAction) {
  sockets[0].send(JSON.stringify({ protocolVersion: 1, type: 'action.request', runId: action.runId, payload: action }));
}
async function heldAction(page: Page, stage: 'before-execute' | 'after-commit') {
  const action = await attached(page);
  await page.evaluate(s => window.transportReview.hold('operation.admit', s), stage);
  sendAction(action); await page.waitForFunction(() => window.transportReview.status().held);
  return { action, before: await page.evaluate(a => window.transportReview.audit(a), action) };
}

for (const terminal of ['cancel.requested', 'cancelled', 'run.terminated', 'outcome']) {
  test(`terminal ${terminal} fences an already queued effect`, async ({ page }) => {
    const { action, before } = await heldAction(page, 'before-execute');
    expect(before.original).not.toBeNull(); expect(before.original!.result ?? null).toBeNull(); expect(before.operation).toBeNull();
    sockets[0].send(JSON.stringify({ protocolVersion: 1, type: terminal, runId: action.runId, payload: {} }));
    await page.waitForFunction(t => window.transportReview.status().notices.some(n => n.type === t), terminal);
    await page.evaluate(async () => { window.transportReview.release(); await window.transportReview.drain(); });
    expect(await page.evaluate(a => window.transportReview.audit(a), action)).toEqual(before);
    expect((await page.evaluate(() => window.transportReview.status())).phases).toEqual(['closed']);
    expect(incoming.filter(row => row.message.type === 'action.result')).toHaveLength(0);
  });
}

test('disconnect fences an already queued effect', async ({ page }) => {
  const { action, before } = await heldAction(page, 'before-execute');
  sockets[0].close(); await page.waitForFunction(() => window.transportReview.status().phases[0] === 'closed');
  await page.evaluate(async () => { window.transportReview.release(); await window.transportReview.drain(); });
  expect(await page.evaluate(a => window.transportReview.audit(a), action)).toEqual(before);
});

test('foreign terminal does not withdraw the correlated run grant', async ({ page }) => {
  const { action, before } = await heldAction(page, 'before-execute');
  sockets[0].send(JSON.stringify({ protocolVersion: 1, type: 'run.terminated', runId: 'foreign-run', payload: {} }));
  await page.waitForFunction(() => window.transportReview.status().notices.some(n => n.runId === 'foreign-run'));
  await page.evaluate(async () => { window.transportReview.release(); await window.transportReview.drain(); });
  const after = await page.evaluate(a => window.transportReview.audit(a), action);
  expect(after.operation?.state).toBe('admitted'); expect(after.original!.result).toHaveProperty('operation');
  expect(after.head.checkpoint).toEqual(before.head.checkpoint);
  expect((await page.evaluate(() => window.transportReview.status())).phases).toEqual(['attached']);
});

test('cancelled guard after committed dispatch prevents any start frame', async ({ page }) => {
  autoAnnounce = true;
  await page.evaluate(async () => {
    await window.transportReview.boot(); await window.transportReview.attach();
    window.transportReview.hold('agentica.launch.dispatch', 'after-commit'); window.transportReview.begin();
  });
  await page.waitForFunction(() => window.transportReview.status().held);
  expect((await page.evaluate(() => window.transportReview.launch()))!.dispatch).not.toBeNull(); expect(starts()).toHaveLength(0);
  await page.evaluate(() => window.transportReview.cancelGuard());
  const cancelled = await page.evaluate(() => window.transportReview.head());
  await page.evaluate(() => window.transportReview.release());
  await page.waitForFunction(() => window.transportReview.status().starts[0].status === 'failed');
  expect(starts(), 'A retained dispatch is not permission after cancellation').toHaveLength(0);
  expect(await page.evaluate(() => window.transportReview.head())).toEqual(cancelled);
  const launch = await page.evaluate(() => window.transportReview.launch());
  expect(launch!.guard).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
  expect(launch!.run).toBeNull(); expect(launch!.grant).toBeNull();
});

test('simultaneous transports cannot dispatch the same launch twice', async ({ page }) => {
  autoAnnounce = true;
  await page.evaluate(async () => {
    await window.transportReview.boot(); await Promise.all([window.transportReview.attach(), window.transportReview.attach()]);
    window.transportReview.begin(0); window.transportReview.begin(1);
  });
  await page.waitForFunction(() => window.transportReview.status().starts.every(s => ['attached', 'failed'].includes(s.status)));
  expect(starts()).toHaveLength(1);
  const status = await page.evaluate(() => window.transportReview.status());
  await test.info().attach('simultaneous-outcome', { body: JSON.stringify(status, null, 2), contentType: 'application/json' });
  expect(status.starts.some(s => s.error?.includes('start already dispatched'))).toBe(true);
  expect((await page.evaluate(() => window.transportReview.launch()))!.dispatch).not.toBeNull();
  const error = await page.evaluate(() => window.transportReview.attach().then(() => 'unexpected', String));
  expect(error).toContain('requires reconciliation'); expect(starts()).toHaveLength(1);
});

test('committed result survives close before delivery and cold reconciliation is read only', async ({ page }) => {
  const { action, before } = await heldAction(page, 'after-commit');
  expect(before.operation?.state).toBe('admitted'); expect(before.original!.result).toHaveProperty('operation');
  expect(incoming.filter(row => row.message.type === 'action.result')).toHaveLength(0);
  await page.evaluate(async () => { window.transportReview.close(); window.transportReview.release(); await window.transportReview.drain(); });
  expect(await page.evaluate(a => window.transportReview.audit(a), action)).toEqual(before);
  expect(incoming.filter(row => row.message.type === 'action.result')).toHaveLength(0);
  await page.evaluate(() => window.transportReview.stop()); await open(page);
  const cold = await page.evaluate(a => window.transportReview.coldRead(a), action);
  expect(cold.loaded).toMatchObject({ status: 'completed', result: before.original!.result });
  expect(cold.reconciled).toEqual(before.original!.result);
  expect(await page.evaluate(a => window.transportReview.audit(a), action)).toEqual(before);
  expect(starts()).toHaveLength(1);
});
