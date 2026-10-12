import { test, expect } from '@playwright/test';
import { fixture } from './rpg-command-browser';
import type {} from './rpg-agentica-client-fixture';

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  await fixture(page);
  await page.evaluate(async () => { window.rpgClientTest = await import('/tests/e2e/rpg-agentica-client-fixture.ts'); await window.rpgClientTest.setup(); });
});
test.afterEach(async ({ page }) => { await page.evaluate(() => { window.rpgClientTest.client.close(); window.rpgClientTest.session.stop(); }); });

test('real SDK and IDB controller walk once, preserve chest agency, and require host completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); f.modelOutcome();
    const before = f.client.view.state;
    for (let i = 0; i < 6; i++) await f.client.tick();
    return { before, ...await f.snapshot() };
  });
  expect(result.before).not.toBe('completed'); expect(result.view).toMatchObject({ state: 'completed', steps: 4 });
  expect(result.events.map(e => e.kind)).toEqual(['progress', 'progress', 'progress', 'completed']);
  expect(result.game!.chests[0].opened).toBe(false); expect(result.launch!.stopAcknowledged).toBe(true);
});

test('pause during memory preparation prevents the queued step without losing game ownership', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit();
    const original = f.session.prepareTravelMemory;
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
    f.session.prepareTravelMemory = async () => { entered(); await gate; return original(); };
    const tick = f.client.tick(); await ready; f.client.pause(); release(); await tick;
    return { ...await f.snapshot(), controlled: f.session.view.controlled };
  });
  expect(result.game!.maze.active.column).toBe(1); expect(result.travel!.travel.operation.steps).toBe(0);
  expect(result.view.state).toBe('paused'); expect(result.controlled).toBe(true); expect(result.events).toEqual([]);
});

test('a paused result acknowledgement cannot reenable walking', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); f.settings({ holdEvent: true });
    const tick = f.client.tick();
    while (!f.events.length) await new Promise(r => setTimeout(r, 5));
    f.client.pause(); f.releaseEvent(); await tick; await f.client.tick(); return f.snapshot();
  });
  expect(result.view.state).toBe('paused'); expect(result.game!.maze.active.column).toBe(2); expect(result.events).toHaveLength(1);
});

test('Stop before the start response cancels the announced original run and grants no effect', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; f.settings({ deferStart: true }); const start = f.client.start();
    while (!f.messages.some(m => m.type === 'start')) await new Promise(r => setTimeout(r, 5));
    const stop = f.client.cancel(); f.announce(); await start; await stop; await f.client.tick(); return f.snapshot();
  });
  expect(result.view.state).toBe('cancelled'); expect(result.game!.maze.active.column).toBe(1);
  expect(result.messages.filter(m => m.type === 'start')).toHaveLength(1);
  expect(result.messages.some(m => m.type === 'cancel' && m.runId === 'run-1')).toBe(true);
  expect(result.launch).toMatchObject({ stopped: true, stopAcknowledged: true });
});

test('offline Stop retains the original progress receipt and cancels locally before network reconciliation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); f.settings({ failEvents: true });
    await f.client.tick().catch(() => {}); const original = structuredClone(f.events[0]);
    await f.client.cancel().catch(() => {}); const local = await f.snapshot();
    f.settings({ failEvents: false }); await f.reopen(); await f.client.recover(); await f.client.cancel();
    return { local, original, ...await f.snapshot() };
  });
  expect(result.local.travel!.travel.operation.status).toBe('cancelled'); expect(result.local.launch!.stopped).toBe(true);
  expect(result.game).toEqual(result.local.game); expect(result.view.state).toBe('cancelled');
  expect(result.events.slice(0, 3)).toEqual([result.original, result.original, result.original]);
  expect(result.events.at(-1).kind).toBe('cancelled');
});

test('a changed service admission cannot move the real party', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); f.entries[0].admission!.summary = 'Not the original';
    const error = await f.client.tick().then(() => '', e => String(e)); return { error, ...await f.snapshot() };
  });
  expect(result.error).toContain('differs'); expect(result.game!.maze.active.column).toBe(1); expect(result.events).toEqual([]);
});

test('an announced start that lost custody before binding remains stoppable after reload', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; f.settings({ deferStart: true }); const start = f.client.start().catch(e => String(e));
    while (!f.messages.some(m => m.type === 'start')) await new Promise(r => setTimeout(r, 5));
    await f.session.executeCommand(f.session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false }));
    f.announce(); const error = await start;
    await f.reopen(); await f.client.recover(); await f.client.cancel(); return { error, ...await f.snapshot() };
  });
  expect(result.error).toContain('custody'); expect(result.view.state).toBe('cancelled');
  expect(result.game!.maze.active.column).toBe(2); expect(result.travel).toBeUndefined();
  expect(result.launch).toMatchObject({ stopped: true, stopAcknowledged: true });
  expect(result.messages.filter(m => m.type === 'start')).toHaveLength(1);
});

test('delayed cancellation retains its old position evidence after a later manual move and takeover', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); f.settings({ failEvents: true });
    await f.client.tick().catch(() => {}); await f.client.cancel().catch(() => {});
    const cancelled = (await f.snapshot()).travel!.travel;
    await f.session.executeCommand(f.session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false }));
    f.settings({ failEvents: false }); await f.reopen(); await f.client.recover(); await f.client.cancel();
    return { cancelled, ...await f.snapshot() };
  });
  expect(result.game!.maze.active.column).toBe(3); expect(result.events.at(-1).kind).toBe('cancelled');
  expect(result.events.at(-1).observation.data.actor.column).toBe(2);
  expect(result.events.at(-1).observation.data.sourceHead.id).toBe(result.cancelled.sourceHead);
});

for (const stage of ['admission', 'step']) test(`pause at the final ${stage} write aborts all uncommitted effects`, async ({ page }) => {
  const result = await page.evaluate(async stage => {
    const f = window.rpgClientTest; await f.client.start(); if (stage === 'step') await f.admit();
    const before = await f.h.custody.readGameControl(), oldTravel = await f.session.readTravel();
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      const request = add.apply(this, args);
      if (this.name === (stage === 'admission' ? 'rpgAgenticaOperations' : 'rpgAgenticaAdvances'))
        request.addEventListener('success', () => f.client.pause(), { once: true });
      return request;
    };
    try { if (stage === 'admission') await f.admit(); else await f.client.tick().catch(() => {}); }
    finally { IDBObjectStore.prototype.add = add; }
    const db = await f.h.repository.getDatabase();
    return { before, oldTravel, after: await f.h.custody.readGameControl(), newTravel: await f.session.readTravel(),
      events: await db.count('rpgAgenticaEvents'), advances: await db.count('rpgAgenticaAdvances'), controlled: f.session.view.controlled };
  }, stage);
  expect(result.after).toEqual(result.before); expect(result.newTravel).toEqual(result.oldTravel);
  expect(result.events).toBe(0); expect(result.advances).toBe(0); expect(result.controlled).toBe(true);
});

test('a late admission lookup cannot override a manual pause during Adopt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); f.client.pause();
    const before = await f.snapshot(), fetch = globalThis.fetch;
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/operations?')) { entered(); await gate; }
      return fetch(input, init);
    };
    let error: string;
    try { const adopt = f.client.adopt().then(() => '', e => String(e)); await ready; f.client.pause(); release(); error = await adopt; }
    finally { globalThis.fetch = fetch; }
    await f.client.tick(); return { before, error, ...await f.snapshot() };
  });
  expect(result.error).toContain('paused'); expect(result.view.state).toBe('paused');
  expect(result.travel).toEqual(result.before.travel); expect(result.game).toEqual(result.before.game); expect(result.events).toEqual([]);
});

test('Stop aborts an unresponsive admission inventory read before cancelling the local journey', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(); const fetch = globalThis.fetch;
    let entered!: () => void, aborted = false;
    const ready = new Promise<void>(r => { entered = r; });
    globalThis.fetch = async (input, init) => {
      if (!String(input).includes('/operations?')) return fetch(input, init);
      entered(); return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => {
        aborted = true; reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true }));
    };
    try { const tick = f.client.tick().catch(() => {}); await ready; await f.client.cancel(); await tick; }
    finally { globalThis.fetch = fetch; }
    return { aborted, ...await f.snapshot() };
  });
  expect(result.aborted).toBe(true); expect(result.view.state).toBe('cancelled');
  expect(result.travel!.travel.operation.status).toBe('cancelled'); expect(result.game!.maze.active.column).toBe(1);
});

test('reconnect reconciles an announced successor when final launch publication failed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(2);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      const value = args[0];
      if (this.name === 'meta' && typeof value.value === 'string') {
        let launch; try { launch = JSON.parse(value.value); } catch { /* Other metadata is not JSON. */ }
        if (launch?.binding?.parentOperationId && !launch.wake) throw new DOMException('Finish fault', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
    let error = '';
    try { await f.client.tick(); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.put = put; }
    const before = await f.snapshot(); f.client.close(); f.makeClient(); await f.client.recover();
    return { before, error, ...await f.snapshot() };
  });
  expect(result.error).toContain('Finish fault'); expect(result.before.launch!.wake!.binding!.runId).toBe('run-2');
  expect(result.view).toMatchObject({ runId: 'run-2', state: 'awaiting-adoption' });
  expect(result.launch!.wake).toBeUndefined(); expect(result.launch!.binding!.parentOperationId).toBe(result.before.launch!.operationId);
  expect(result.game).toEqual(result.before.game); expect(result.messages.filter(m => m.type === 'operation.wake')).toHaveLength(1);
  expect(result.messages.filter(m => m.type === 'start')).toHaveLength(1);
});

test('an unbound successor with stale custody is attached only for Stop, never granted fresh authority', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgClientTest; await f.client.start(); await f.admit(2);
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'rpgAgenticaRuns' && args[0].runId === 'run-2') throw new DOMException('Bind fault', 'QuotaExceededError');
      return add.apply(this, args);
    };
    try { await f.client.tick().catch(() => {}); } finally { IDBObjectStore.prototype.add = add; }
    await f.session.executeCommand(f.session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false }));
    f.client.close(); f.makeClient(); const error = await f.client.recover().then(() => '', e => String(e));
    await f.client.cancel(); const db = await f.h.repository.getDatabase();
    return { error, child: await db.get('rpgAgenticaRuns', 'run-2'), ...await f.snapshot() };
  });
  expect(result.error).toContain('custody'); expect(result.child).toBeUndefined(); expect(result.game!.maze.active.column).toBe(3);
  expect(result.view.state).toBe('cancelled');
  expect(result.messages.filter(m => m.type === 'cancel').map(m => m.runId)).toEqual(['run-2']);
});
