import { test, expect, type WebSocketRoute, type Page } from '@playwright/test';
import type {} from './canonical-agentica-transport.fixture';
import type { AgenticaStart } from '../../src/services/agentica/contracts';

const origin = 'http://127.0.0.1:5244';
let socket: WebSocketRoute, starts: AgenticaStart[], posts: string[], inventory: unknown[], failCancel: boolean;
test.beforeEach(async ({ page, context }) => {
  starts = []; posts = []; inventory = []; failCancel = false;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(`${origin}/`)) throw Error(`Unexpected external request ${url}`);
    if (url === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url === `${origin}/api/runs`) return route.fulfill({ json: inventory });
    if (url.startsWith(`${origin}/api/runs/`)) {
      posts.push(url); expect(route.request().method()).toBe('POST');
      if (failCancel) return route.abort();
      return route.fulfill({ json: { runId: 'original-run', status: 'cancel_requested' } });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', route => {
    expect(route.url()).toBe('ws://127.0.0.1:5244/api/host'); socket = route;
    route.onMessage(data => { const m = JSON.parse(String(data)); expect(m.type).toBe('start'); starts.push(m.payload); });
  });
  await page.goto('/tests/e2e/canonical-agentica-transport.html');
  await page.waitForFunction(() => !!window.canonicalTransport);
});
test.afterEach(async ({ page }) => { await page.evaluate(() => window.canonicalTransport.stop()); });

async function loseStart(page: Page) {
  const boot = await page.evaluate(async () => {
    const b = await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.begin(); return b;
  });
  await expect.poll(() => starts.length).toBe(1); socket.close();
  await page.waitForFunction(() => window.canonicalTransport.status().status === 'failed');
  return boot;
}
async function original(page: Page) {
  const s = starts[0];
  return { runId: 'original-run', hostId: s.hostId, sessionId: s.sessionId, sessionEpoch: s.sessionEpoch,
    scopeId: s.scopeId, perspectiveId: s.perspectiveId, objectiveId: s.objectiveId, objective: s.objective,
    manifestHash: await page.evaluate(() => window.canonicalTransport.expectedManifest()), continuation: null, status: 'awaiting_host' };
}
async function recover(page: Page, mode: 'inspect' | 'stop') {
  return page.evaluate(async m => {
    try { return await window.canonicalTransport.recover(m); } catch (error) { return { error: String(error) }; }
  }, mode);
}

test('empty inventory remains unknown after reload; it neither mutates nor resends', async ({ page }) => {
  await loseStart(page); await page.reload(); await page.waitForFunction(() => !!window.canonicalTransport);
  await page.evaluate(() => window.canonicalTransport.reloadSession());
  const before = await page.evaluate(() => window.canonicalTransport.head());
  expect(await recover(page, 'inspect')).toMatchObject({ status: 'unknown' });
  expect(await page.evaluate(() => window.canonicalTransport.head())).toEqual(before);
  expect(posts).toEqual([]); expect(starts).toHaveLength(1);
  await page.evaluate(() => window.canonicalTransport.closeRecovery());
  const error = await page.evaluate(async () => { try { await window.canonicalTransport.attach(); return ''; } catch (e) { return String(e); } });
  expect(error).toContain('requires reconciliation');
});

test('positive inventory identifies only a cancellation target, never grants or announces', async ({ page }) => {
  const boot = await loseStart(page); inventory = [await original(page)];
  const head = await page.evaluate(() => window.canonicalTransport.head());
  expect(await recover(page, 'inspect')).toMatchObject({ status: 'identified', fullStartEquivalence: 'unverified' });
  expect(await page.evaluate(() => window.canonicalTransport.head())).toEqual(head);
  expect(await recover(page, 'stop')).toMatchObject({ status: 'cancel-requested', localStopped: true, settled: false });
  expect(posts).toEqual([`${origin}/api/runs/original-run/cancel`]);
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!;
  expect(launch.guard.terminal?.disposition).toBe('cancelled'); expect(launch.guard.state).not.toBe('acknowledged');
  expect(launch.run).toBeNull(); expect(launch.grant).toBeNull();
  expect((await page.evaluate(() => window.canonicalTransport.head())).checkpoint).toEqual(boot.head.checkpoint);
  expect(starts).toHaveLength(1);
});

for (const defect of ['duplicate', 'manifest', 'objective', 'continuation', 'missing-continuation', 'oversized'] as const)
  test(`rejects ${defect} inventory without a remote effect; explicit Stop still withdraws locally`, async ({ page }) => {
    await loseStart(page); const row = await original(page); inventory = [row];
    if (defect === 'duplicate') inventory.push({ ...row, runId: 'other-run' });
    if (defect === 'manifest') row.manifestHash = `sha256:${'a'.repeat(64)}`;
    if (defect === 'objective') row.objective = 'Something else';
    if (defect === 'continuation') Object.assign(row, { continuation: { parentRunId: 'other-run' } });
    if (defect === 'missing-continuation') Reflect.deleteProperty(row, 'continuation');
    if (defect === 'oversized') inventory = Array.from({ length: 65 }, () => row);
    expect(await recover(page, 'stop')).toHaveProperty('error');
    expect(posts).toEqual([]); expect(starts).toHaveLength(1);
    expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
  });

test('lost cancellation reply and reload preserve the original local Stop, not a fabricated settlement', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)]; failCancel = true;
  expect(await recover(page, 'stop')).toHaveProperty('error');
  const terminal = (await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal;
  await page.reload(); await page.waitForFunction(() => !!window.canonicalTransport);
  await page.evaluate(() => window.canonicalTransport.reloadSession()); failCancel = false;
  expect(await recover(page, 'stop')).toMatchObject({ status: 'cancel-requested', settled: false });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal).toEqual(terminal);
  expect(posts).toHaveLength(2); expect(starts).toHaveLength(1);
});

test('terminal-looking status cannot release the unresolved launch', async ({ page }) => {
  await loseStart(page); inventory = [{ ...await original(page), status: 'completed' }];
  expect(await recover(page, 'stop')).toMatchObject({ status: 'cancel-requested', settled: false });
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!;
  expect(launch.guard.state).not.toBe('acknowledged'); expect(launch.run).toBeNull();
});

test('Stop remains durable when service inventory is absent', async ({ page }) => {
  await loseStart(page);
  expect(await recover(page, 'stop')).toMatchObject({ status: 'unknown', localStopped: true });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
  expect(posts).toEqual([]);
});

test('session replacement during discovery prevents a subsequent remote cancellation', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  let respond!: () => void;
  const held = new Promise<void>(resolve => { respond = resolve; });
  let entered = false;
  await page.route(`${origin}/api/runs`, async route => {
    entered = true; await held; await route.fulfill({ json: inventory });
  });
  const pending = recover(page, 'stop'); await expect.poll(() => entered).toBe(true);
  await page.evaluate(() => window.canonicalTransport.reloadSession()); respond();
  expect(await pending).toHaveProperty('error'); expect(posts).toEqual([]);
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
});

test('overlapping recovery calls cannot dispatch duplicate cancellations', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  let respond!: () => void, entered = false;
  const held = new Promise<void>(resolve => { respond = resolve; });
  await page.route(`${origin}/api/runs`, async route => { entered = true; await held; await route.fulfill({ json: inventory }); });
  const pending = recover(page, 'stop'); await expect.poll(() => entered).toBe(true);
  expect(await recover(page, 'stop')).toMatchObject({ error: expect.stringContaining('already in flight') });
  respond(); expect(await pending).toMatchObject({ status: 'cancel-requested' }); expect(posts).toHaveLength(1);
});

test('mismatched cancellation acknowledgement cannot settle the original', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  await page.route(`${origin}/api/runs/original-run/cancel`, route => route.fulfill({ json: { runId: 'foreign', status: 'cancel_requested' } }));
  expect(await recover(page, 'stop')).toMatchObject({ error: expect.stringContaining('invalid run cancellation acknowledgement') });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.state).not.toBe('acknowledged');
});

test('normal quota exhaustion does not prevent uncertain-start local Stop', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  await page.evaluate(() => window.canonicalTransport.fillQuota());
  expect(await recover(page, 'stop')).toMatchObject({ status: 'cancel-requested', localStopped: true });
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!;
  expect(launch.guard.terminal?.disposition).toBe('cancelled'); expect(launch.grant).toBeNull();
});

test('physical Stop write failure retries its exact original attempt before remote cancellation', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  await page.evaluate(() => window.canonicalTransport.failCleanupOnce());
  expect(await recover(page, 'stop')).toHaveProperty('error'); expect(posts).toEqual([]);
  const attempt = await page.evaluate(() => window.canonicalTransport.failedCleanup()); expect(attempt).toBeTruthy();
  expect(await recover(page, 'stop')).toMatchObject({ status: 'cancel-requested' });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.attemptId).toBe(attempt);
  expect(posts).toHaveLength(1);
});

test('an already-stopped launch cannot be remotely cancelled by a read-only second tab', async ({ page, context }) => {
  await loseStart(page); expect(await recover(page, 'stop')).toMatchObject({ status: 'unknown' });
  inventory = [await original(page)];
  const follower = await context.newPage();
  try {
    await follower.goto('/tests/e2e/canonical-agentica-transport.html');
    await follower.waitForFunction(() => !!window.canonicalTransport);
    await follower.evaluate(() => window.canonicalTransport.reloadSession());
    expect(await recover(follower, 'stop')).toHaveProperty('error'); expect(posts).toEqual([]);
    expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.state).not.toBe('acknowledged');
  } finally { await follower.evaluate(() => window.canonicalTransport.stop()); await follower.close(); }
});

test('late announcement of a different run blocks the selected cancellation target', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  let respond!: () => void, entered = false;
  const held = new Promise<void>(resolve => { respond = resolve; });
  await page.route(`${origin}/api/runs`, async route => { entered = true; await held; await route.fulfill({ json: inventory }); });
  const pending = recover(page, 'stop'); await expect.poll(() => entered).toBe(true);
  await page.evaluate(() => window.canonicalTransport.retainAnnouncement('different-run')); respond();
  expect(await pending).toMatchObject({ error: expect.stringContaining('late announcement') }); expect(posts).toEqual([]);
});

test('a lost cancellation reply cannot redirect an in-memory retry to a different run', async ({ page }) => {
  await loseStart(page); const row = await original(page); inventory = [row]; failCancel = true;
  expect(await recover(page, 'stop')).toHaveProperty('error');
  expect(posts).toEqual([`${origin}/api/runs/original-run/cancel`]);
  inventory = [{ ...row, runId: 'replacement-run' }]; failCancel = false;
  expect(await recover(page, 'stop')).toMatchObject({ error: expect.stringContaining('retained announcement') });
  expect(posts).toHaveLength(1);
});

test('a conflict discovered after inspect cannot disable local Stop', async ({ page }) => {
  await loseStart(page); inventory = [await original(page)];
  expect(await recover(page, 'inspect')).toMatchObject({ status: 'identified' });
  await page.evaluate(() => window.canonicalTransport.retainAnnouncement('different-run'));
  expect(await recover(page, 'stop')).toMatchObject({ error: expect.stringContaining('late announcement') });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
  expect(posts).toEqual([]);
});

test('mutating returned discovery metadata cannot retarget cancellation', async ({ page }) => {
  await loseStart(page); const row = await original(page); inventory = [row];
  await page.evaluate(() => window.canonicalTransport.mutateDiscovery('replacement-run'));
  inventory = [{ ...row, runId: 'replacement-run' }];
  expect(await recover(page, 'stop')).toMatchObject({ error: expect.stringContaining('retained announcement') });
  expect(posts).toEqual([]);
});
