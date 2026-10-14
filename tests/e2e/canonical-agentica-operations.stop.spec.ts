import { test, expect } from './canonical-agentica-operations.test';
import { bootDriver, cancel, peer, pulse } from './canonical-agentica-operations.terminal-support';

test('Stop aborts an in-flight custody request and preserves zero movement', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await pulse(page);
  let reached!: () => void, release!: () => void;
  const waiting = new Promise<void>(r => { reached = r; }), held = new Promise<void>(r => { release = r; });
  await page.route('**/api/operations/events', async route => { reached(); await held; await route.fallback(); }, { times: 1 });
  const pending = page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().then(() => 'accepted', String));
  await waiting;
  try { await cancel(page); expect(await pending).not.toBe('accepted'); }
  finally { release(); }
  const stopped = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(stopped!.bound.progress).toMatchObject({ steps: 0, sequence: 0 });
  expect(stopped!.bound.operation.terminal!.disposition).toBe('cancelled');
  for (let i = 0; i < 3; i++) { const result = await pulse(page); if (result.status === 'terminal-acknowledged') break; }
  expect(service.entry().state).toBe('cancelled');
  expect(service.deliveries.filter(e => e.kind === 'progress').every(e => e.usage?.steps === 0)).toBe(true);
});

test('corrupt world and navigation progress cannot prevent the attached driver from cancelling locally', async ({ page }) => {
  const s = await bootDriver(page);
  const r = await page.evaluate(async s => {
    const f = window.canonicalAgenticaOperations, { head } = await f.readCanonicalHead(), db = await f.openCanonicalDatabase();
    try {
      for (const area of ['world', 'knowledge', 'execution'] as const) if (head.roots[area]) await db.delete('nodes', [head.gameId, head.roots[area]!]);
    } finally { db.close(); }
    await f.cancelDriver();
    return (await f.readCanonical(async p => ({ operation: await p.liveOperation(s.operationId), guard: await p.liveOperation(s.launchGuard) }))).value;
  }, s);
  expect(r.operation!.terminal!.disposition).toBe('cancelled'); expect(r.guard!.terminal!.disposition).toBe('cancelled');
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().then(() => 'accepted', String))).not.toBe('accepted');
});

test('physical terminal ACK failure retains its reserve and reconciles without resending the terminal', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await cancel(page);
  const error = await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'operations') throw new DOMException('Injected ACK failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { return await window.canonicalAgenticaOperations.pulseDriver().then(() => ({ message: 'accepted', request: undefined }),
      error => ({ message: String(error), request: error.request })); }
    finally { IDBObjectStore.prototype.put = put; }
  });
  expect(error.message).not.toBe('accepted'); expect(error.request).toBeTruthy(); expect(service.entry().state).toBe('cancelled');
  const before = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(before!.bound.operation.state).toBe('settled');
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  expect(service.deliveries).toHaveLength(1);
  const after = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(after!.bound.operation.acknowledgementAttemptId).toBe(error.request.attemptId);
});

test('expired travel settles as blocked, not completed or a cognitive wake', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await pulse(page); await pulse(page);
  const state = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), s.action)).value!;
  await page.clock.setFixedTime(state.progress.deadline! + 1);
  expect(await pulse(page)).toMatchObject({ status: 'advanced' });
  expect(await pulse(page)).toEqual({ status: 'locally-settled', progress: 'blocked' });
  expect(await pulse(page)).toEqual({ status: 'terminal-prefix-delivered', sequence: 2 });
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'blocked' });
  expect(service.entry()).toMatchObject({ state: 'blocked', latestEvent: { kind: 'blocked', usage: { steps: 0 } } });
  expect(service.entry().latestEvent).not.toHaveProperty('completion'); expect(service.stops).toHaveLength(0);
});
