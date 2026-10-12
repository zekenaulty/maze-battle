import { test, expect } from '@playwright/test';
import { fixture } from './rpg-command-browser';
import type {} from './rpg-agentica-events-fixture';

test.beforeEach(async ({ page, context, baseURL }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin
    ? route.continue() : route.abort());
  await fixture(page);
  await page.evaluate(async () => { window.rpgAgenticaEvents = await import('/tests/e2e/rpg-agentica-events-fixture.ts'); });
  expect(errors).toEqual([]);
});

test('unchanged SDK action dispatch publishes the real GameSession; local steps signal without model activations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, published: number[] = [];
    const session = new h.GameSession(view => { if (view.game) published.push(view.game.maze.active.column); });
    const { binding, action } = await f.bound(5, session), sent: object[] = [];
    let invocations = 0;
    const sdk = new f.AgenticaHost({ url: 'ws://127.0.0.1:5207/unused', loadAction: f.records.loadRpgAction, saveAction: f.records.saveRpgAction,
      onAction: input => { invocations++; return session.executeAgenticaAction(input); },
      reconcileAction: input => session.executeAgenticaAction(input, true) }) as any;
    sdk.runs.set(action.runId, { ...binding, capabilities: f.rpgCapabilities() });
    sdk.socket = { readyState: 1, send: (text: string) => sent.push(JSON.parse(text)) };
    await sdk._action({ type: 'action.request', runId: action.runId, payload: action });
    await sdk._action({ type: 'action.request', runId: action.runId, payload: action });
    const admission = (sent[0] as any).payload, id = admission.operation.operationId, signals: object[] = [];
    for (let i = 0; i < 4; i++) {
      await session.prepareTravelMemory(); const travel = await session.readTravel();
      const outcome = await session.advanceAgenticaOperation(session.travelRequest(id, { type: 'step', sequence: travel!.travel.operation.nextStep }));
      await sdk.signalOperation(outcome.event!, { fetchImpl: async (_url: string, options: RequestInit) => {
        signals.push(JSON.parse(options.body as string)); return new Response('{}', { status: 200 });
      } });
      await f.events.acknowledgeRpgHostEvent(outcome.event!);
    }
    const game = session.view.game; session.stop();
    return { sent, signals, invocations, published, game };
  });
  expect(result.sent).toHaveLength(2); expect(result.sent[0]).toEqual(result.sent[1]); expect(result.invocations).toBe(1);
  expect(result.signals.map((event: any) => event.kind)).toEqual(['progress', 'progress', 'progress', 'completed']);
  expect(result.published).toEqual(expect.arrayContaining([1, 2, 3, 4, 5])); expect(result.game!.maze.active.column).toBe(5);
  expect(result.game!.chests[0].opened).toBe(false);
});

test('unreserved original reconciliation settles without execution and produces a replayable SDK-valid reply', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, { binding, action } = await f.bound();
    const first = await f.executeRpgAction(action, true), late = await f.executeRpgAction(action);
    const sdk = new f.AgenticaHost({ url: 'ws://127.0.0.1:5207/unused', onAction: async () => late.result }) as any;
    sdk._validateResult(action, first.result, { ...binding, capabilities: f.rpgCapabilities() });
    return { first, late, travel: await window.rpgCommandTest.travel.readRpgTravel() };
  });
  expect(result.first.result.disposition).toBe('unavailable'); expect(result.late.result).toEqual(result.first.result);
  expect(result.travel).toBeUndefined(); expect(result.first.current!.game.maze.active.column).toBe(1);
});

test('schema-six upgrade retains the ordinary save and history stores without inventing agent operations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game(), slot = { slotId: 'auto', label: 'Old save', kind: 'auto',
      createdAt: game.createdAt, updatedAt: game.updatedAt, game };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('maze-battle', 6);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, keyPath] of [['meta', 'key'], ['saves', 'slotId'], ['gameCommands', 'attemptId'], ['observations', 'id'],
          ['rpgMemoryNodes', 'id'], ['rpgMemoryHeads', 'id'], ['rpgTravels', 'id'], ['rpgTravelActions', 'attemptId'], ['telemetry', 'gameId']])
          db.createObjectStore(name, { keyPath });
        request.transaction!.objectStore('saves').put(slot);
        request.transaction!.objectStore('meta').put({ key: 'old-setting', value: 'keep' });
        request.transaction!.objectStore('rpgTravelActions').put({ attemptId: 'old-original', oldFixture: true });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const db = await h.repository.getDatabase();
    return { version: db.version, slot, after: await db.get('saves', 'auto'), meta: await db.get('meta', 'old-setting'),
      oldReceipt: await db.get('rpgTravelActions', 'old-original'), runs: await db.count('rpgAgenticaRuns'),
      events: await db.count('rpgAgenticaEvents'), operations: await db.count('rpgAgenticaOperations') };
  });
  expect(result.version).toBe(7); expect(result.after).toEqual(result.slot); expect(result.meta?.value).toBe('keep');
  expect(result.oldReceipt).toEqual({ attemptId: 'old-original', oldFixture: true });
  expect([result.runs, result.events, result.operations]).toEqual([0, 0, 0]);
});

test('real movement and exact progress are atomic; original replay survives acknowledgement and takeover', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, { id, admission } = await f.admitted();
    const request = await f.next(id), first = await f.advance(request);
    const waiting = await f.advance(await f.next(id));
    await f.events.acknowledgeRpgHostEvent(first.event!);
    const replay = await f.advance(request);
    await h.custody.claimGame('new-owner', true);
    const afterTakeover = await f.advance(request);
    return { admission, first, waiting, replay, afterTakeover, latest: await h.custody.readGameControl() };
  });
  expect(result.admission.result.operation).toBeDefined(); expect(result.admission.result.completion).toBeUndefined();
  expect(result.first.event).toMatchObject({ sequence: 1, kind: 'progress', usage: { steps: 1 } });
  expect(result.first.event!.observation.data.cells).toBeUndefined();
  expect(result.waiting.event).toEqual(result.first.event); expect(result.waiting.waitingForAck).toBe(true);
  expect(result.replay.event).toEqual(result.first.event); expect(result.afterTakeover.event).toEqual(result.first.event);
  expect(result.latest.game!.maze.active.column).toBe(2); expect(result.latest.game!.chests[0].opened).toBe(false);
});

test('known completion is host-proven only at target; another earned destination requests a decision', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, { id } = await f.admitted(3);
    const first = await f.advance(await f.next(id)); await f.events.acknowledgeRpgHostEvent(first.event!);
    const second = await f.advance(await f.next(id));
    return { second, after: await h.custody.readGameControl() };
  });
  expect(result.second.event?.kind).toBe('decision'); expect(result.second.event?.completion).toBeUndefined();
  expect(result.after.game!.maze.active.column).toBe(3); expect(result.after.game!.chests[0].opened).toBe(false);
});

test('arrival reports target proof without looting or an invented inspection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, { id } = await f.admitted();
    let last;
    for (let i = 0; i < 4; i++) { last = await f.advance(await f.next(id)); await f.events.acknowledgeRpgHostEvent(last.event!); }
    return { last, game: (await h.custody.readGameControl()).game };
  });
  expect(result.last!.event).toMatchObject({ kind: 'completed', usage: { steps: 4 }, completion: { objectiveId: 'known-destination' } });
  expect(result.game!.maze.active.column).toBe(5); expect(result.game!.chests[0].opened).toBe(false);
});

test('cancel fences local movement even while a progress acknowledgement is missing', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, { id } = await f.admitted();
    const first = await f.advance(await f.next(id)), request = await f.next(id, { type: 'cancel' });
    const cancelled = await f.advance(request), beforeAck = await h.travel.readRpgTravel(id);
    await f.events.acknowledgeRpgHostEvent(first.event!);
    const terminal = await f.events.stageRpgHostEvent(id, (await h.custody.readGameControl()).control!);
    const duplicate = await f.advance(request);
    return { first, cancelled, beforeAck, terminal, duplicate };
  });
  expect(result.cancelled.event).toEqual(result.first.event); expect(result.beforeAck?.travel.operation.status).toBe('cancelled');
  expect(result.terminal).toMatchObject({ sequence: 2, kind: 'cancelled' });
  expect(result.duplicate.event).toEqual(result.first.event);
});

test('manual input requires explicit adoption; takeover reports transfer retaining original grant and usage', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, { id } = await f.admitted();
    const first = await f.advance(await f.next(id)); await f.events.acknowledgeRpgHostEvent(first.event!);
    await h.custody.claimGame('new-owner', true);
    let refused = ''; try { await f.advance(await f.next(id)); } catch (e) { refused = String(e); }
    const adopted = await f.advance(await f.next(id, { type: 'adopt' }));
    await f.events.acknowledgeRpgHostEvent(adopted.event!);
    const continued = await f.advance(await f.next(id));
    return { first, refused, adopted, continued };
  });
  expect(result.refused).toContain('adoption'); expect(result.adopted.event?.kind).toBe('transfer');
  expect(result.adopted.event?.sessionEpoch).not.toBe(result.adopted.event?.nextSessionEpoch);
  expect(result.adopted.event?.usage).toEqual(result.first.event?.usage);
  expect(result.continued.event?.usage?.steps).toBe(2); expect(result.continued.event?.sessionEpoch).toBe(result.adopted.event?.nextSessionEpoch);
});

for (const stage of ['rpgAgenticaEvents', 'rpgAgenticaOperations', 'rpgAgenticaAdvances', 'technical-expiry', 'cumulative-expiry']) {
  test(`${stage} at final writes rolls back move, source, travel, receipt and event together`, async ({ page }) => {
    const result = await page.evaluate(async stage => {
      const f = window.rpgAgenticaEvents, h = window.rpgCommandTest, { id } = await f.admitted();
      const request = await f.next(id), before = await h.custody.readGameControl(), beforeTravel = await h.travel.readRpgTravel(id);
      const db = await h.repository.getDatabase(), now = Date.now, add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      const method = stage === 'rpgAgenticaOperations' ? 'put' : 'add', original = method === 'put' ? put : add;
      IDBObjectStore.prototype[method] = function(...args) {
        if (this.name === stage) throw new DOMException('Injected', 'QuotaExceededError');
        const pending = original.apply(this, args);
        if (this.name === 'rpgAgenticaAdvances' && stage.endsWith('expiry')) pending.addEventListener('success', () => {
          Date.now = () => (stage === 'technical-expiry' ? request.deadlineAt : beforeTravel!.travel.operation.deadline!) + 1;
        }, { once: true });
        return pending;
      };
      let error = ''; try { await f.advance(request); } catch (e) { error = String(e); }
      finally { Date.now = now; IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      return { error, before, beforeTravel, after: await h.custody.readGameControl(), afterTravel: await h.travel.readRpgTravel(id),
        receipt: await db.get('rpgTravelActions', request.attemptId), eventCount: await db.count('rpgAgenticaEvents'),
        command: await db.get('gameCommands', request.attemptId), hostReceipt: await db.get('rpgAgenticaAdvances', request.attemptId) };
    }, stage);
    expect(result.error).not.toBe(''); expect(result.after).toEqual(result.before); expect(result.afterTravel).toEqual(result.beforeTravel);
    expect(result.receipt).toBeUndefined(); expect(result.command).toBeUndefined(); expect(result.hostReceipt).toBeUndefined(); expect(result.eventCount).toBe(0);
  });
}

test('changed acknowledgement and reused local action identity do not advance anything', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.rpgAgenticaEvents, { id } = await f.admitted(), request = await f.next(id), first = await f.advance(request);
    let ack = '', reuse = '';
    try { await f.events.acknowledgeRpgHostEvent({ ...first.event!, summary: 'changed' }); } catch (e) { ack = String(e); }
    try { await f.advance({ ...request, action: { type: 'cancel' } }); } catch (e) { reuse = String(e); }
    return { ack, reuse, link: await f.events.readRpgHostOperation(id) };
  });
  expect(result.ack).toContain('acknowledgement'); expect(result.reuse).toContain('identity');
  expect(result.link.link.acknowledged).toBe(0); expect(result.link.link.sequence).toBe(1);
});
